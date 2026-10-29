package app.aura

import android.app.WallpaperManager
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.Shader
import android.net.Uri
import android.service.wallpaper.WallpaperService
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.uiautomator.UiDevice
import app.aura.core.studio.ClockMaterial
import app.aura.core.studio.MaskStroke
import app.aura.core.studio.StudioProject
import app.aura.studio.mask.MaskRenderer
import app.aura.studio.mask.SubjectSegmenter
import app.aura.studio.render.ClockExtras
import app.aura.studio.render.StudioCompositor
import app.aura.studio.wallpaper.WallpaperApplier
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File

/**
 * Flujo completo de Aura Studio en un dispositivo: importar foto → componer reloj 3D → máscara
 * (manual y automática) → exportar → aplicar fondo estático → selector de fondo animado.
 */
@RunWith(AndroidJUnit4::class)
class StudioFlowTest {
    private val instrumentation = InstrumentationRegistry.getInstrumentation()
    private val context = instrumentation.targetContext
    private val out = File(context.filesDir, "aura-shots").apply { mkdirs() }
    private val screen = WallpaperApplier.screenSize(context)

    /** Foto sintética: atardecer y una silueta oscura en el centro (el «sujeto»). */
    private fun syntheticPhoto(): Uri {
        val w = 1200
        val h = 2400
        val bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
        val c = Canvas(bmp)
        c.drawPaint(Paint().apply { shader = LinearGradient(0f, 0f, 0f, h.toFloat(), intArrayOf(0xFFF6B37A.toInt(), 0xFFE9806C.toInt(), 0xFF3B3357.toInt()), null, Shader.TileMode.CLAMP) })
        val subject = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0xFF0E0B18.toInt() }
        c.drawCircle(w / 2f, 640f, 150f, subject)
        c.drawRoundRect(w / 2f - 300f, 450f, w / 2f + 300f, h.toFloat() + 100f, 220f, 220f, subject)
        val f = File(context.cacheDir, "studio_test_photo.jpg")
        f.outputStream().use { bmp.compress(Bitmap.CompressFormat.JPEG, 95, it) }
        return Uri.fromFile(f)
    }

    private fun save(name: String, bmp: Bitmap) {
        File(out, "$name.png").outputStream().use { bmp.compress(Bitmap.CompressFormat.PNG, 100, it) }
    }

    private val extras = ClockExtras("09", ":50", "Jueves, 29 de octubre · 22° Córdoba")

    @Test
    fun importComposeMaskAndExport() = runBlocking {
        val repo = context.aura.studio
        val created = repo.create(syntheticPhoto(), "Prueba")
        val photo = repo.photo(created.id)
        assertNotNull(photo)
        photo!!
        assertTrue("la foto de trabajo se reduce", maxOf(photo.width, photo.height) <= 3200)

        // Reloj centrado sobre la cabeza del sujeto para comprobar la superposición.
        var project = created.copy(design = created.design.copy(centerY = 0.27f, size = 0.32f))
        val compositor = StudioCompositor()

        // Máscara manual: un trazo grueso sobre la silueta (coordenadas normalizadas de la foto).
        val strokes = listOf(
            MaskStroke(listOf(0.5f, 0.24f, 0.5f, 0.32f, 0.5f, 0.6f, 0.5f, 0.95f), 0.11f, erase = false),
        )
        val (mw, mh) = MaskRenderer.workingSize(photo.width, photo.height)
        val mask = MaskRenderer.render(null, strokes, mw, mh)
        assertTrue(MaskRenderer.coverage(mask) > 0.05f)

        val withoutMask = Bitmap.createBitmap(screen.width, screen.height, Bitmap.Config.ARGB_8888)
        compositor.render(withoutMask, photo, null, project, extras)
        save("studio_without_mask", withoutMask)

        project = project.copy(strokes = strokes, hasMask = true)
        val withMask = Bitmap.createBitmap(screen.width, screen.height, Bitmap.Config.ARGB_8888)
        compositor.render(withMask, photo, mask, project, extras)
        save("studio_with_mask", withMask)

        // Franja central de la banda del reloj, sobre la silueta: sin máscara se ve el reloj (claro);
        // con máscara la tapa el sujeto (oscuro).
        val before = stripLuminance(withoutMask)
        val after = stripLuminance(withMask)
        println("AURA_DEPTH before=$before after=$after")
        assertTrue("el sujeto debería tapar el reloj: antes=$before después=$after", after < before && after < 0.2)

        // Cada material produce una imagen distinta.
        val renders = ClockMaterial.entries.map { m ->
            // Sin máscara, para documentar cada acabado completo.
            val p = project.copy(design = project.design.withMaterial(m), hasMask = false)
            Bitmap.createBitmap(screen.width / 2, screen.height / 2, Bitmap.Config.ARGB_8888).also {
                compositor.render(it, photo, mask, p, extras)
                save("studio_${m.name.lowercase()}", it)
            }
        }
        assertNotEquals(renders[0].getPixel(renders[0].width / 2 - 40, (renders[0].height * 0.27f).toInt() + 10), 0)

        // Persistencia: guardar, recargar, duplicar.
        repo.saveBaseMask(project.id, mask)
        repo.save(project, renders.first())
        val reloaded = repo.load(project.id)
        assertEquals(project.strokes, reloaded?.strokes)
        assertNotNull(repo.baseMask(project.id))
        val copy = repo.duplicate(project.id)
        assertNotNull(copy)
        assertNotEquals(project.id, copy!!.id)

        // Exportar a Galería y aplicar como fondo estático (API oficial).
        assertTrue(WallpaperApplier.saveToGallery(context, withMask, "Aura-test"))
        WallpaperApplier.applyStatic(context, withMask, WallpaperApplier.Target.HOME)
        repo.setActive(project.id)
        assertEquals(project.id, repo.activeIdBlocking())
    }

    @Test
    fun automaticSegmentationRunsLocallyOrReportsUnavailable() = runBlocking {
        val repo = context.aura.studio
        val p = repo.create(syntheticPhoto(), "Auto")
        val photo = repo.photo(p.id)!!
        val result = SubjectSegmenter().segment(photo, 0.5f)
        // En el emulador puede faltar el módulo de Play Services; la app debe degradar a modo manual.
        println("AURA_SEGMENTATION $result")
        when (result) {
            is SubjectSegmenter.Result.Mask -> {
                save("studio_auto_mask", result.alpha.copy(Bitmap.Config.ARGB_8888, false))
                assertTrue(result.coverage in 0.01f..0.95f)
            }
            is SubjectSegmenter.Result.Unavailable -> assertTrue(result.reason.isNotBlank())
        }
    }

    @Test
    fun liveWallpaperServiceIsDeclaredAndChooserOpens() {
        val services = context.packageManager.queryIntentServices(
            Intent(WallpaperService.SERVICE_INTERFACE).setPackage(context.packageName), PackageManager.GET_META_DATA,
        )
        assertEquals(1, services.size)
        runBlocking {
            val repo = context.aura.studio
            val p = repo.create(syntheticPhoto(), "Animado")
            repo.save(p.copy(design = p.design.withMaterial(ClockMaterial.NEON)))
            repo.setActive(p.id)
        }
        // El selector del sistema muestra una vista previa en vivo del fondo animado de Aura.
        val intent = WallpaperApplier.liveWallpaperIntent(context).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(intent)
        val device = UiDevice.getInstance(instrumentation)
        device.waitForIdle()
        Thread.sleep(5000)
        device.takeScreenshot(File(out, "studio_live_preview.png"))
        device.pressBack()
        assertTrue(WallpaperManager.getInstance(context).isWallpaperSupported)
    }

    private fun stripLuminance(b: Bitmap): Double {
        var sum = 0.0
        var n = 0
        val x0 = b.width / 2 - b.width / 6
        val x1 = b.width / 2 + b.width / 6
        for (y in (b.height * 0.22f).toInt() until (b.height * 0.31f).toInt() step 3) {
            for (x in x0 until x1 step 3) { sum += luminance(b.getPixel(x, y)); n++ }
        }
        return sum / n
    }

    private fun luminance(c: Int) = (0.2126 * Color.red(c) + 0.7152 * Color.green(c) + 0.0722 * Color.blue(c)) / 255.0
}
