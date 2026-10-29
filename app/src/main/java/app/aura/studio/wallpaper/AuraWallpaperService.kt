package app.aura.studio.wallpaper

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Matrix
import android.os.Handler
import android.os.HandlerThread
import android.os.SystemClock
import android.service.wallpaper.WallpaperService
import android.view.SurfaceHolder
import androidx.core.content.ContextCompat
import app.aura.AppContainer
import app.aura.aura
import app.aura.core.studio.StudioProject
import app.aura.studio.mask.MaskRenderer
import app.aura.studio.render.Backdrop
import app.aura.studio.render.ClockExtrasBuilder
import app.aura.studio.render.ClockPainter
import app.aura.studio.render.StudioCompositor
import app.aura.studio.render.StudioFonts
import kotlinx.coroutines.runBlocking
import java.io.File
import java.time.Instant
import java.time.LocalDateTime
import java.time.ZoneId

/**
 * Fondo animado de Aura Studio: la hora del diseño activo, en sincronía con el reloj del sistema.
 *
 * Consumo mínimo:
 * - Una sola activación por minuto, programada para el instante exacto del cambio de minuto.
 *   Unos segundos antes se compone el fotograma siguiente fuera de pantalla; en el cambio solo se
 *   copia a la superficie (instantáneo, sin destellos).
 * - Nada de trabajo mientras el fondo no se ve (pantalla apagada u otra app delante).
 * - Foto encuadrada y capa del sujeto se componen una vez y se guardan en caché (memoria y disco):
 *   cada minuto solo se pintan los números.
 * - Todo el dibujo ocurre en un hilo propio, nunca en el hilo principal.
 */
class AuraWallpaperService : WallpaperService() {
    override fun onCreateEngine(): Engine = AuraEngine()

    inner class AuraEngine : Engine() {
        private val thread = HandlerThread("aura-wallpaper").apply { start() }
        private val handler = Handler(thread.looper)
        private val compositor = StudioCompositor(ClockPainter(StudioFonts.resolver(this@AuraWallpaperService)))

        private var project: StudioProject? = null
        private var background: Bitmap? = null
        private var subject: Bitmap? = null
        private var frame: Bitmap? = null
        private var frameMinute = -1L
        /** Fotograma del minuto siguiente, preparado de antemano (no se muestra hasta su minuto). */
        private var pending: Bitmap? = null
        private var pendingMinute = -1L
        private var width = 0
        private var height = 0
        private var visible = false
        private var registered = false

        private val app: AppContainer get() = applicationContext.aura

        /** Cambios manuales de hora o de zona horaria: se redibuja ya y se reprograma. */
        private val timeChanged = object : BroadcastReceiver() {
            override fun onReceive(context: Context, intent: Intent) {
                handler.post { frameMinute = -1; pendingMinute = -1; showCurrent(); scheduleNext() }
            }
        }

        /** Prepara el fotograma del minuto siguiente unos segundos antes. */
        private val prepare = Runnable {
            val next = epochMinute(System.currentTimeMillis()) + 1
            pending = compose(next, pending)
            pendingMinute = next
        }

        /** En el cambio de minuto: muestra el fotograma ya preparado. */
        private val tick = object : Runnable {
            override fun run() {
                val now = System.currentTimeMillis()
                val minute = epochMinute(now)
                if (minute < targetMinute) {
                    // Despertó antes de tiempo: se espera el instante exacto en lugar de mostrar la hora vieja.
                    handler.postDelayed(this, (targetMinute * MINUTE - now).coerceAtLeast(1))
                    return
                }
                showCurrent()
                scheduleNext()
            }
        }
        private var targetMinute = 0L

        override fun onSurfaceChanged(holder: SurfaceHolder, format: Int, w: Int, h: Int) {
            super.onSurfaceChanged(holder, format, w, h)
            width = w
            height = h
            // Dibujo síncrono: el sistema espera la imagen en este momento (si no, muestra negro).
            runOnRenderThreadBlocking { loadLayers(); frameMinute = -1; pendingMinute = -1; showCurrent() }
        }

        override fun onSurfaceRedrawNeeded(holder: SurfaceHolder) {
            super.onSurfaceRedrawNeeded(holder)
            runOnRenderThreadBlocking { if (!post(frame)) showCurrent() }
        }

        override fun onVisibilityChanged(visible: Boolean) {
            this.visible = visible
            if (visible) {
                register()
                handler.post {
                    // Al volver a verse: el diseño pudo cambiar en Aura Studio y la hora avanzó.
                    if (loadLayers()) { frameMinute = -1; pendingMinute = -1 }
                    showCurrent()
                    scheduleNext()
                }
            } else {
                handler.removeCallbacks(tick)
                handler.removeCallbacks(prepare)
                unregister()
            }
        }

        override fun onDestroy() {
            handler.removeCallbacksAndMessages(null)
            unregister()
            handler.post { frame?.recycle(); pending?.recycle(); background?.recycle(); subject?.recycle() }
            thread.quitSafely()
            super.onDestroy()
        }

        // ---------------------------------------------------------------- programación

        private fun scheduleNext() {
            handler.removeCallbacks(tick)
            handler.removeCallbacks(prepare)
            if (!visible) return
            val now = System.currentTimeMillis()
            targetMinute = epochMinute(now) + 1
            val untilNext = targetMinute * MINUTE - now
            // Los tiempos de Handler son relativos al reloj monotónico: se calculan desde ahora.
            val base = SystemClock.uptimeMillis()
            if (untilNext > PREPARE_AHEAD + 200) handler.postAtTime(prepare, base + untilNext - PREPARE_AHEAD)
            handler.postAtTime(tick, base + untilNext + 5)
        }

        /** Muestra la hora actual: usa el fotograma preparado si corresponde, si no lo compone. */
        private fun showCurrent() {
            val minute = epochMinute(System.currentTimeMillis())
            if (pendingMinute == minute && pending != null) {
                // Intercambio: el fotograma preparado pasa a ser el actual.
                val old = frame
                frame = pending
                frameMinute = minute
                pending = old
                pendingMinute = -1
            } else if (frameMinute != minute || frame == null) {
                frame = compose(minute, frame)
                frameMinute = minute
            }
            post(frame)
        }

        // ---------------------------------------------------------------- dibujo

        /** Compone el fotograma completo de [minute] fuera de pantalla, reutilizando [reuse] si sirve. */
        private fun compose(minute: Long, reuse: Bitmap?): Bitmap? {
            if (width <= 0 || height <= 0) return reuse
            val out = reuse?.takeIf { it.width == width && it.height == height && !it.isRecycled }
                ?: Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888).also { reuse?.recycle() }
            val c = Canvas(out)
            val p = project
            val bg = background
            if (p == null || bg == null) {
                c.drawColor(EMPTY_COLOR)
            } else {
                c.drawBitmap(bg, 0f, 0f, null)
                val time = LocalDateTime.ofInstant(Instant.ofEpochMilli(minute * MINUTE), ZoneId.systemDefault())
                val extras = runBlocking {
                    ClockExtrasBuilder.build(applicationContext, p.design, app.settings.current(), app.weather.cached(), time)
                }
                compositor.clock.draw(c, width, height, p.design, extras, Backdrop(bg, Matrix()))
                subject?.let { c.drawBitmap(it, 0f, 0f, null) }
            }
            return out
        }

        /** Copia un fotograma ya compuesto a la superficie (operación corta). */
        private fun post(bmp: Bitmap?): Boolean {
            if (bmp == null || bmp.isRecycled) return false
            val holder = surfaceHolder
            val canvas = runCatching { holder.lockCanvas() }.getOrNull() ?: return false
            try {
                canvas.drawBitmap(bmp, 0f, 0f, null)
            } finally {
                runCatching { holder.unlockCanvasAndPost(canvas) }
            }
            return true
        }

        /**
         * Carga el diseño activo y sus capas. Devuelve true si cambió. Las capas se guardan en disco
         * por diseño, versión y resolución: al recrearse el fondo (p. ej. al encender la pantalla) se
         * leen en milisegundos en lugar de volver a componer la foto.
         */
        private fun loadLayers(): Boolean {
            if (width <= 0 || height <= 0) return false
            val repo = app.studio
            val id = repo.activeIdBlocking() ?: return clear()
            val loaded = runBlocking { repo.load(id) } ?: return clear()
            if (loaded == project && background?.width == width && background?.height == height) return false

            val dir = File(cacheDir, "wallpaper").apply { mkdirs() }
            val key = "${loaded.id}_${loaded.updatedAt}_${width}x$height"
            val bgFile = File(dir, "${key}_bg.jpg")
            val subjFile = File(dir, "${key}_subject.png")
            var bg = if (bgFile.exists()) BitmapFactory.decodeFile(bgFile.path) else null
            var subj = if (subjFile.exists()) BitmapFactory.decodeFile(subjFile.path) else null
            if (bg == null) {
                val photo = runBlocking { repo.photo(id) } ?: return clear()
                bg = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
                compositor.drawPhoto(Canvas(bg), width, height, photo, loaded)
                val mask = if (loaded.hasMask) {
                    val (mw, mh) = MaskRenderer.workingSize(photo.width, photo.height)
                    MaskRenderer.render(runBlocking { repo.baseMask(id) }, loaded.strokes, mw, mh)
                } else {
                    null
                }
                subj = compositor.subjectLayer(width, height, photo, mask, loaded)
                photo.recycle()
                mask?.recycle()
                // Caché en disco (se borran las versiones viejas del mismo diseño).
                dir.listFiles()?.filter { it.name.startsWith(loaded.id + "_") }?.forEach { it.delete() }
                runCatching { bgFile.outputStream().use { o -> bg.compress(Bitmap.CompressFormat.JPEG, 94, o) } }
                subj?.let { s -> runCatching { subjFile.outputStream().use { o -> s.compress(Bitmap.CompressFormat.PNG, 100, o) } } }
            }
            background?.recycle()
            subject?.recycle()
            background = bg
            subject = subj
            project = loaded
            return true
        }

        private fun clear(): Boolean {
            val changed = project != null
            project = null
            background?.recycle(); background = null
            subject?.recycle(); subject = null
            return changed
        }

        private fun register() {
            if (registered) return
            val filter = IntentFilter().apply {
                addAction(Intent.ACTION_TIME_CHANGED)
                addAction(Intent.ACTION_TIMEZONE_CHANGED)
            }
            ContextCompat.registerReceiver(this@AuraWallpaperService, timeChanged, filter, ContextCompat.RECEIVER_NOT_EXPORTED)
            registered = true
        }

        private fun unregister() {
            if (!registered) return
            runCatching { unregisterReceiver(timeChanged) }
            registered = false
        }

        /** Ejecuta en el hilo de dibujo y espera (para los momentos en que el sistema pide la imagen ya). */
        private fun runOnRenderThreadBlocking(block: () -> Unit) {
            if (android.os.Looper.myLooper() == thread.looper) {
                block()
                return
            }
            val done = java.util.concurrent.CountDownLatch(1)
            handler.post { try { block() } finally { done.countDown() } }
            done.await(SYNC_TIMEOUT_MS, java.util.concurrent.TimeUnit.MILLISECONDS)
        }
    }

    companion object {
        private val EMPTY_COLOR = Color.rgb(0x10, 0x1D, 0x2B)
        private const val MINUTE = 60_000L
        private const val PREPARE_AHEAD = 2_500L
        private const val SYNC_TIMEOUT_MS = 1_500L

        /** Minutos desde la época Unix en la zona local (cambia exactamente cuando cambia el minuto del reloj). */
        fun epochMinute(nowMillis: Long): Long = Math.floorDiv(nowMillis, MINUTE)
    }
}
