package app.aura.studio.mask

import android.graphics.Bitmap
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.segmentation.subject.SubjectSegmentation
import com.google.mlkit.vision.segmentation.subject.SubjectSegmenterOptions
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlin.coroutines.resume
import kotlin.math.roundToInt

/**
 * Segmentación del sujeto principal en el dispositivo con ML Kit Subject Segmentation.
 *
 * - Gratis, sin clave ni nube: la foto no sale del teléfono.
 * - El modelo lo provee Google Play Services (se descarga una vez, ~200 KB de APK propio).
 * - Si no está disponible (sin Play Services, modelo aún descargándose, error), devuelve null y el
 *   usuario sigue con el pincel manual.
 */
class SubjectSegmenter {

    sealed interface Result {
        data class Mask(val alpha: Bitmap, val coverage: Float) : Result
        data class Unavailable(val reason: String) : Result
    }

    suspend fun segment(photo: Bitmap, threshold: Float): Result {
        // Se procesa reducido (lado mayor 1024) para limitar memoria y tiempo.
        val scale = minOf(1f, MAX_SIDE / maxOf(photo.width, photo.height).toFloat())
        val input = if (scale < 1f) {
            Bitmap.createScaledBitmap(photo, (photo.width * scale).roundToInt(), (photo.height * scale).roundToInt(), true)
        } else {
            photo
        }
        val client = SubjectSegmentation.getClient(
            SubjectSegmenterOptions.Builder().enableForegroundConfidenceMask().build(),
        )
        return try {
            suspendCancellableCoroutine { cont ->
                client.process(InputImage.fromBitmap(input, 0))
                    .addOnSuccessListener { result ->
                        val buffer = result.foregroundConfidenceMask
                        if (buffer == null) {
                            cont.resume(Result.Unavailable("Sin sujeto detectado"))
                            return@addOnSuccessListener
                        }
                        val w = input.width
                        val h = input.height
                        val pixels = IntArray(w * h)
                        var covered = 0
                        buffer.rewind()
                        for (i in 0 until w * h) {
                            val conf = buffer.get()
                            // Rampa suave alrededor del umbral: bordes menos dentados que un corte binario.
                            val a = ((conf - (threshold - 0.15f)) / 0.3f).coerceIn(0f, 1f)
                            if (a > 0.5f) covered++
                            pixels[i] = (a * 255).roundToInt() shl 24
                        }
                        val argb = Bitmap.createBitmap(pixels, w, h, Bitmap.Config.ARGB_8888)
                        val alpha = argb.extractAlpha()
                        argb.recycle()
                        cont.resume(
                            if (covered == 0) Result.Unavailable("Sin sujeto detectado")
                            else Result.Mask(alpha, covered / (w * h).toFloat()),
                        )
                    }
                    .addOnFailureListener { e -> cont.resume(Result.Unavailable(e.message ?: "Segmentación no disponible")) }
            }
        } catch (e: Throwable) {
            Result.Unavailable(e.message ?: "Segmentación no disponible")
        } finally {
            client.close()
            if (input !== photo) input.recycle()
        }
    }

    companion object {
        private const val MAX_SIDE = 1024f
    }
}
