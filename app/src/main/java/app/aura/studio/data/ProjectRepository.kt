package app.aura.studio.data

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.ImageDecoder
import android.graphics.Paint
import android.net.Uri
import android.os.Build
import app.aura.core.studio.StudioProject
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.withContext
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.io.File
import java.util.UUID
import kotlin.math.roundToInt

/**
 * Proyectos de Aura Studio en almacenamiento interno privado (filesDir/studio/<id>/):
 *   project.json · photo.jpg (copia reducida, nunca se modifica el original) · mask.png · thumb.jpg
 * Nada se sube a ningún servidor.
 */
class ProjectRepository(context: Context) {
    private val appContext = context.applicationContext
    private val root = File(appContext.filesDir, "studio").apply { mkdirs() }
    private val activeFile = File(root, "active.txt")
    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true }

    private val _projects = MutableStateFlow<List<StudioProject>>(emptyList())
    val projects: StateFlow<List<StudioProject>> = _projects.asStateFlow()

    private val _activeId = MutableStateFlow<String?>(null)
    val activeId: StateFlow<String?> = _activeId.asStateFlow()

    suspend fun refresh() = withContext(Dispatchers.IO) {
        _projects.value = root.listFiles()?.filter { it.isDirectory }
            ?.mapNotNull { dir -> runCatching { json.decodeFromString<StudioProject>(File(dir, PROJECT).readText()) }.getOrNull() }
            ?.sortedByDescending { it.updatedAt }
            .orEmpty()
        _activeId.value = activeFile.takeIf { it.exists() }?.readText()?.trim()?.ifBlank { null }
    }

    fun dir(id: String) = File(root, id)
    fun thumbFile(id: String) = File(dir(id), THUMB)

    /** Importa la foto elegida con el selector del sistema: la copia reducida es la de trabajo. */
    suspend fun create(uri: Uri, name: String): StudioProject = withContext(Dispatchers.IO) {
        val bitmap = decodeScaled(uri, MAX_PHOTO_SIDE) ?: error("No se pudo leer la imagen")
        val now = System.currentTimeMillis()
        val project = StudioProject(id = UUID.randomUUID().toString(), name = name, createdAt = now, updatedAt = now)
        dir(project.id).mkdirs()
        File(dir(project.id), PHOTO).outputStream().use { bitmap.compress(Bitmap.CompressFormat.JPEG, 92, it) }
        bitmap.recycle()
        save(project)
        project
    }

    suspend fun save(project: StudioProject, thumb: Bitmap? = null) = withContext(Dispatchers.IO) {
        val d = dir(project.id).apply { mkdirs() }
        File(d, PROJECT).writeText(json.encodeToString(project))
        thumb?.let { File(d, THUMB).outputStream().use { o -> it.compress(Bitmap.CompressFormat.JPEG, 85, o) } }
        refresh()
    }

    suspend fun load(id: String): StudioProject? = withContext(Dispatchers.IO) {
        runCatching { json.decodeFromString<StudioProject>(File(dir(id), PROJECT).readText()) }.getOrNull()
    }

    suspend fun photo(id: String): Bitmap? = withContext(Dispatchers.IO) {
        BitmapFactory.decodeFile(File(dir(id), PHOTO).path)
    }

    /** Máscara base (automática) en ALPHA_8, o null si no hay. */
    suspend fun baseMask(id: String): Bitmap? = withContext(Dispatchers.IO) {
        val f = File(dir(id), MASK)
        if (!f.exists()) return@withContext null
        BitmapFactory.decodeFile(f.path)?.let { argb -> argb.extractAlpha().also { argb.recycle() } }
    }

    suspend fun saveBaseMask(id: String, mask: Bitmap?) = withContext(Dispatchers.IO) {
        val f = File(dir(id), MASK)
        if (mask == null) {
            f.delete()
            return@withContext
        }
        // PNG con la máscara en el canal alfa (ALPHA_8 no se puede comprimir directamente).
        val argb = Bitmap.createBitmap(mask.width, mask.height, Bitmap.Config.ARGB_8888)
        Canvas(argb).drawBitmap(mask, 0f, 0f, Paint().apply { color = Color.BLACK })
        f.outputStream().use { argb.compress(Bitmap.CompressFormat.PNG, 100, it) }
        argb.recycle()
    }

    suspend fun duplicate(id: String): StudioProject? = withContext(Dispatchers.IO) {
        val original = load(id) ?: return@withContext null
        val now = System.currentTimeMillis()
        val copy = original.copy(id = UUID.randomUUID().toString(), name = "${original.name} (copia)", createdAt = now, updatedAt = now)
        dir(id).copyRecursively(dir(copy.id), overwrite = true)
        File(dir(copy.id), PROJECT).writeText(json.encodeToString(copy))
        refresh()
        copy
    }

    suspend fun delete(id: String) = withContext(Dispatchers.IO) {
        dir(id).deleteRecursively()
        if (_activeId.value == id) activeFile.delete()
        refresh()
    }

    /** Proyecto que muestra el fondo animado. */
    suspend fun setActive(id: String) = withContext(Dispatchers.IO) {
        activeFile.writeText(id)
        _activeId.value = id
    }

    fun activeIdBlocking(): String? = activeFile.takeIf { it.exists() }?.readText()?.trim()?.ifBlank { null }

    private fun decodeScaled(uri: Uri, maxSide: Int): Bitmap? {
        val resolver = appContext.contentResolver
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            ImageDecoder.decodeBitmap(ImageDecoder.createSource(resolver, uri)) { decoder, info, _ ->
                val s = info.size
                val scale = minOf(1f, maxSide / maxOf(s.width, s.height).toFloat())
                decoder.setTargetSize((s.width * scale).roundToInt().coerceAtLeast(1), (s.height * scale).roundToInt().coerceAtLeast(1))
                decoder.allocator = ImageDecoder.ALLOCATOR_SOFTWARE
                decoder.isMutableRequired = false
            }
        } else {
            val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
            resolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, bounds) }
            var sample = 1
            while (maxOf(bounds.outWidth, bounds.outHeight) / (sample * 2) >= maxSide) sample *= 2
            val decoded = resolver.openInputStream(uri)?.use {
                BitmapFactory.decodeStream(it, null, BitmapFactory.Options().apply { inSampleSize = sample })
            } ?: return null
            val scale = minOf(1f, maxSide / maxOf(decoded.width, decoded.height).toFloat())
            if (scale < 1f) Bitmap.createScaledBitmap(decoded, (decoded.width * scale).roundToInt(), (decoded.height * scale).roundToInt(), true)
            else decoded
        }
    }

    companion object {
        /** Suficiente para un fondo QHD+ (1440×3120) con margen para encuadrar. */
        const val MAX_PHOTO_SIDE = 3200
        private const val PROJECT = "project.json"
        private const val PHOTO = "photo.jpg"
        private const val MASK = "mask.png"
        private const val THUMB = "thumb.jpg"
    }
}
