package app.aura.studio.ui

import android.app.Application
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.PorterDuff
import android.graphics.PorterDuffColorFilter
import android.net.Uri
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import app.aura.aura
import app.aura.core.studio.ClockDesign
import app.aura.core.studio.History
import app.aura.core.studio.MaskStroke
import app.aura.core.studio.PhotoFrame
import app.aura.core.studio.StudioProject
import app.aura.studio.mask.MaskRenderer
import app.aura.studio.mask.SubjectSegmenter
import app.aura.studio.render.ClockExtrasBuilder
import app.aura.studio.render.ClockPainter
import app.aura.studio.render.StudioCompositor
import app.aura.studio.render.StudioFonts
import app.aura.studio.wallpaper.WallpaperApplier
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import java.time.LocalDateTime
import java.time.format.DateTimeFormatter
import kotlin.math.roundToInt

/**
 * Estado de Aura Studio: lista de proyectos y el proyecto abierto en el editor. El proyecto entero
 * (reloj, encuadre, máscara y trazos) vive en un único historial, así deshacer/rehacer cubre todo.
 */
class StudioViewModel(application: Application) : AndroidViewModel(application) {
    private val app = application.aura
    private val repo = app.studio
    private val compositor = StudioCompositor(ClockPainter(StudioFonts.resolver(application)))
    private val segmenter = SubjectSegmenter()
    private val renderLock = Mutex()

    val projects = repo.projects
    val activeId = repo.activeId

    private val _history = MutableStateFlow<History<StudioProject>?>(null)
    val history: StateFlow<History<StudioProject>?> = _history.asStateFlow()

    private val _preview = MutableStateFlow<ImageBitmap?>(null)
    val preview: StateFlow<ImageBitmap?> = _preview.asStateFlow()

    private val _maskOverlay = MutableStateFlow<ImageBitmap?>(null)
    val maskOverlay: StateFlow<ImageBitmap?> = _maskOverlay.asStateFlow()

    private val _busy = MutableStateFlow<String?>(null)
    val busy: StateFlow<String?> = _busy.asStateFlow()

    private val _message = MutableStateFlow<String?>(null)
    val message: StateFlow<String?> = _message.asStateFlow()

    private val _now = MutableStateFlow(LocalDateTime.now())

    /** Relación de aspecto de la pantalla real: la vista previa y la exportación coinciden. */
    val screen = WallpaperApplier.screenSize(application)

    private var photo: Bitmap? = null
    private var previewPhoto: Bitmap? = null
    private var baseMask: Bitmap? = null
    private var mask: Bitmap? = null
    private var maskKey: Any? = null
    private var subjectCache: Bitmap? = null
    private var subjectKey: Any? = null
    private var gestureBase: StudioProject? = null
    @Volatile private var lastExtras: app.aura.studio.render.ClockExtras? = null
    private var savedVersion: StudioProject? = null

    val photoSize: Pair<Int, Int>? get() = photo?.let { it.width to it.height }
    val previewPhotoBitmap: ImageBitmap? get() = previewPhoto?.asImageBitmap()

    init {
        viewModelScope.launch { repo.refresh() }
        viewModelScope.launch {
            while (true) {
                val n = LocalDateTime.now()
                _now.value = n
                delay((60 - n.second) * 1000L + 50)
            }
        }
        viewModelScope.launch {
            combine(_history, _now) { h, _ -> h?.current }.collectLatest { p ->
                if (p != null) renderPreview(p)
            }
        }
    }

    val current: StudioProject? get() = _history.value?.current
    val hasUnsavedChanges: Boolean get() = current != null && current != savedVersion

    // ---------------------------------------------------------------- proyectos

    fun createFromPhoto(uri: Uri, onCreated: (String) -> Unit) {
        viewModelScope.launch {
            _busy.value = "Importando foto…"
            try {
                val name = "Diseño " + LocalDateTime.now().format(DateTimeFormatter.ofPattern("d/M HH:mm"))
                val project = repo.create(uri, name)
                onCreated(project.id)
            } catch (e: Exception) {
                _message.value = "No se pudo abrir la imagen: ${e.message}"
            } finally {
                _busy.value = null
            }
        }
    }

    fun open(id: String) {
        if (current?.id == id) return
        viewModelScope.launch {
            _busy.value = "Abriendo…"
            val project = repo.load(id)
            val ph = repo.photo(id)
            if (project == null || ph == null) {
                _message.value = "No se encontró el diseño"
                _busy.value = null
                return@launch
            }
            renderLock.withLock {
                releaseBitmaps()
                photo = ph
                previewPhoto = scaledCopy(ph, PREVIEW_PHOTO_SIDE)
                baseMask = repo.baseMask(id)
            }
            savedVersion = project
            _history.value = History(project)
            _busy.value = null
            // Primera vez: se intenta separar el sujeto automáticamente, sin intervención.
            if (!project.hasMask && !project.autoMask) detectSubject(silent = true)
        }
    }

    fun duplicate(id: String) = viewModelScope.launch { repo.duplicate(id); _message.value = "Diseño duplicado" }

    fun delete(id: String) = viewModelScope.launch {
        if (current?.id == id) close()
        repo.delete(id)
    }

    fun close() {
        _history.value = null
        _preview.value = null
        _maskOverlay.value = null
        gestureBase = null
        viewModelScope.launch { renderLock.withLock { releaseBitmaps() } }
    }

    fun save(onDone: (() -> Unit)? = null) {
        val p = current ?: return
        viewModelScope.launch {
            val updated = p.copy(updatedAt = System.currentTimeMillis())
            val thumb = renderAt(THUMB_WIDTH, (THUMB_WIDTH * screen.height / screen.width.toFloat()).roundToInt(), updated, preview = true)
            repo.save(updated, thumb)
            thumb.recycle()
            _history.value = _history.value?.replace(updated)
            savedVersion = updated
            _message.value = "Diseño guardado"
            onDone?.invoke()
        }
    }

    // ---------------------------------------------------------------- edición

    /** Cambio en vivo (arrastre, deslizador): no crea un paso de historial hasta [commit]. */
    fun live(transform: (StudioProject) -> StudioProject) {
        val h = _history.value ?: return
        if (gestureBase == null) gestureBase = h.current
        _history.value = h.replace(transform(h.current))
    }

    fun commit() {
        val h = _history.value ?: return
        val base = gestureBase ?: return
        gestureBase = null
        _history.value = h.replace(base).push(h.current)
    }

    fun edit(transform: (StudioProject) -> StudioProject) {
        val h = _history.value ?: return
        gestureBase = null
        _history.value = h.push(transform(h.current))
    }

    fun design(transform: (ClockDesign) -> ClockDesign) = edit { it.copy(design = transform(it.design).normalized()) }
    fun designLive(transform: (ClockDesign) -> ClockDesign) = live { it.copy(design = transform(it.design).normalized()) }
    fun frameLive(transform: (PhotoFrame) -> PhotoFrame) = live { it.copy(frame = transform(it.frame).normalized()) }

    /** Tamaño de la vista previa (px), para convertir gestos en coordenadas del lienzo. */
    val previewSize: Pair<Int, Int> get() = PREVIEW_WIDTH to (PREVIEW_WIDTH * screen.height / screen.width.toFloat()).roundToInt()

    /** Esquinas actuales del reloj en la vista previa (px), para los tiradores de «Deformar». */
    fun clockQuad(): FloatArray? {
        val p = current ?: return null
        val extras = lastExtras ?: return null
        val (w, h) = previewSize
        return compositor.clock.quad(w, h, p.design, extras)
    }

    /**
     * Deformaciones rápidas proporcionales al tamaño del reloj (no de la pantalla):
     * "left"/"right" = perspectiva lateral, "back" = se aleja hacia el fondo, "up" = se inclina hacia arriba.
     */
    fun warpPreset(kind: String) {
        val quad = clockQuadUnwarped() ?: return
        val (w, h) = previewSize
        val boxW = kotlin.math.hypot(quad[2] - quad[0], quad[3] - quad[1])
        val boxH = kotlin.math.hypot(quad[6] - quad[0], quad[7] - quad[1])
        val ay = boxH * 0.22f / h
        val ax = boxW * 0.10f / w
        val warp = when (kind) {
            "left" -> listOf(0f, ay, 0f, 0f, 0f, 0f, 0f, -ay)
            "right" -> listOf(0f, 0f, 0f, ay, 0f, -ay, 0f, 0f)
            "back" -> listOf(ax, 0f, -ax, 0f, 0f, 0f, 0f, 0f)
            else -> listOf(0f, 0f, 0f, 0f, -ax, 0f, ax, 0f)
        }
        design { it.copy(warp = warp) }
    }

    private fun clockQuadUnwarped(): FloatArray? {
        val p = current ?: return null
        val extras = lastExtras ?: return null
        val (w, h) = previewSize
        return compositor.clock.quad(w, h, p.design.copy(warp = emptyList()), extras)
    }

    /** Agranda (o achica) el reloj para que ocupe casi todo el ancho de la pantalla. */
    fun fillWidth() {
        val quad = clockQuad() ?: return
        val (w, _) = previewSize
        val xs = listOf(quad[0], quad[2], quad[4], quad[6])
        val span = (xs.max() - xs.min()).takeIf { it > 1f } ?: return
        val k = (w * 0.94f) / span
        design { it.copy(size = it.size * k, centerX = 0.5f) }
    }

    fun undo() { gestureBase = null; _history.value = _history.value?.undo() }
    fun redo() { gestureBase = null; _history.value = _history.value?.redo() }

    // ---------------------------------------------------------------- máscara

    fun detectSubject(silent: Boolean = false) {
        val ph = photo ?: return
        val p = current ?: return
        viewModelScope.launch {
            _busy.value = "Buscando el sujeto…"
            val result = withContext(Dispatchers.Default) { segmenter.segment(ph, p.mask.threshold) }
            _busy.value = null
            when (result) {
                is SubjectSegmenter.Result.Mask -> {
                    val (w, h) = MaskRenderer.workingSize(ph.width, ph.height)
                    val scaled = Bitmap.createScaledBitmap(result.alpha, w, h, true)
                    if (scaled !== result.alpha) result.alpha.recycle()
                    repo.saveBaseMask(p.id, scaled)
                    renderLock.withLock {
                        baseMask?.recycle()
                        baseMask = scaled
                        maskKey = null
                    }
                    edit { it.copy(autoMask = true, hasMask = true, strokes = emptyList()) }
                    _message.value = "Sujeto detectado (${(result.coverage * 100).roundToInt()} % de la foto). Podés retocarlo con el pincel."
                }
                is SubjectSegmenter.Result.Unavailable -> {
                    // Se marca como intentado para no repetir en cada apertura.
                    _history.value = _history.value?.replace(p.copy(autoMask = true))
                    if (!silent) _message.value = "Detección automática no disponible (${result.reason}). Usá el pincel."
                }
            }
        }
    }

    fun addStroke(stroke: MaskStroke) = edit { it.copy(strokes = it.strokes + stroke, hasMask = true) }

    fun clearMask() {
        val p = current ?: return
        viewModelScope.launch {
            repo.saveBaseMask(p.id, null)
            renderLock.withLock { baseMask?.recycle(); baseMask = null; maskKey = null }
            edit { it.copy(strokes = emptyList(), hasMask = false, autoMask = true) }
        }
    }

    // ---------------------------------------------------------------- exportar / aplicar

    fun applyStatic(target: WallpaperApplier.Target) = withExport("Aplicando fondo…") { bmp ->
        WallpaperApplier.applyStatic(getApplication(), bmp, target)
        _message.value = "Fondo aplicado. La hora queda fija en la imagen; para la hora en tiempo real usá el fondo animado."
    }

    fun saveToGallery() = withExport("Exportando…") { bmp ->
        val ok = WallpaperApplier.saveToGallery(getApplication(), bmp, "Aura-" + System.currentTimeMillis())
        _message.value = if (ok) "Guardado en Imágenes › Aura (${bmp.width}×${bmp.height})" else "No se pudo guardar la imagen"
    }

    /** Guarda, marca el diseño como activo y devuelve el intent del selector de fondos animados. */
    fun prepareLive(onReady: (Intent) -> Unit) {
        val p = current ?: return
        save {
            viewModelScope.launch {
                repo.setActive(p.id)
                onReady(WallpaperApplier.liveWallpaperIntent(getApplication()))
            }
        }
    }

    fun setActive(id: String) = viewModelScope.launch { repo.setActive(id); _message.value = "Diseño activo para el fondo animado" }

    fun consumeMessage() { _message.value = null }

    private fun withExport(label: String, block: suspend (Bitmap) -> Unit) {
        val p = current ?: return
        viewModelScope.launch {
            _busy.value = label
            try {
                val bmp = renderAt(screen.width, screen.height, p, preview = false)
                block(bmp)
                bmp.recycle()
            } catch (e: Exception) {
                _message.value = "Error: ${e.message}"
            } finally {
                _busy.value = null
            }
        }
    }

    // ---------------------------------------------------------------- render

    private suspend fun renderPreview(p: StudioProject) {
        val w = PREVIEW_WIDTH
        val h = (w * screen.height / screen.width.toFloat()).roundToInt()
        val bmp = renderAt(w, h, p, preview = true)
        _preview.value = bmp.asImageBitmap()
        updateMaskOverlay(p)
    }

    private suspend fun renderAt(w: Int, h: Int, p: StudioProject, preview: Boolean): Bitmap = withContext(Dispatchers.Default) {
        renderLock.withLock {
            val src = (if (preview) previewPhoto else photo) ?: photo ?: error("Sin foto")
            val out = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
            val m = currentMask(p)
            val key = listOf(w, h, preview, p.frame, p.mask, p.design.behindSubject, p.hasMask, p.strokes, baseMask)
            val subject = if (preview && key == subjectKey && subjectCache != null) {
                subjectCache
            } else {
                compositor.subjectLayer(w, h, src, m, p).also {
                    if (preview) {
                        subjectCache?.recycle()
                        subjectCache = it
                        subjectKey = key
                    }
                }
            }
            val extras = ClockExtrasBuilder.build(getApplication(), p.design, app.settings.current(), app.weather.cached(), _now.value)
            lastExtras = extras
            compositor.render(out, src, m, p, extras, subject)
            if (!preview) subject?.recycle()
            out
        }
    }

    private fun currentMask(p: StudioProject): Bitmap? {
        if (!p.hasMask) return null
        val ph = photo ?: return null
        val key = p.strokes to baseMask
        if (key != maskKey || mask == null) {
            val (w, h) = MaskRenderer.workingSize(ph.width, ph.height)
            mask?.recycle()
            mask = MaskRenderer.render(baseMask, p.strokes, w, h)
            maskKey = key
        }
        return mask
    }

    /** Sujeto teñido de rojo translúcido para el editor de máscara. */
    private suspend fun updateMaskOverlay(p: StudioProject) = withContext(Dispatchers.Default) {
        renderLock.withLock {
            val m = currentMask(p)
            if (m == null) {
                _maskOverlay.value = null
                return@withLock
            }
            val out = Bitmap.createBitmap(m.width, m.height, Bitmap.Config.ARGB_8888)
            val c = Canvas(out)
            if (p.mask.inverted) {
                c.drawColor(OVERLAY)
                c.drawBitmap(m, 0f, 0f, Paint().apply { xfermode = android.graphics.PorterDuffXfermode(PorterDuff.Mode.DST_OUT) })
            } else {
                c.drawBitmap(m, 0f, 0f, Paint().apply { colorFilter = PorterDuffColorFilter(OVERLAY, PorterDuff.Mode.SRC_IN); color = OVERLAY })
            }
            _maskOverlay.value = out.asImageBitmap()
        }
    }

    private fun scaledCopy(src: Bitmap, maxSide: Int): Bitmap {
        val k = minOf(1f, maxSide / maxOf(src.width, src.height).toFloat())
        return if (k >= 1f) src else Bitmap.createScaledBitmap(src, (src.width * k).roundToInt(), (src.height * k).roundToInt(), true)
    }

    private fun releaseBitmaps() {
        subjectCache?.recycle(); subjectCache = null; subjectKey = null
        mask?.recycle(); mask = null; maskKey = null
        if (previewPhoto !== photo) previewPhoto?.recycle()
        previewPhoto = null
        baseMask?.recycle(); baseMask = null
        photo?.recycle(); photo = null
    }

    override fun onCleared() {
        releaseBitmaps()
    }

    companion object {
        private const val PREVIEW_WIDTH = 720
        private const val PREVIEW_PHOTO_SIDE = 1800
        private const val THUMB_WIDTH = 360
        private val OVERLAY = Color.argb(150, 229, 128, 107)
    }
}
