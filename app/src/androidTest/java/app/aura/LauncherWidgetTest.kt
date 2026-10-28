package app.aura

import android.app.PendingIntent
import android.app.WallpaperManager
import android.appwidget.AppWidgetManager
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.Shader
import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.uiautomator.By
import androidx.test.uiautomator.UiDevice
import androidx.test.uiautomator.Until
import app.aura.core.style.ProfileId
import app.aura.core.style.Profiles
import app.aura.core.style.WidgetConfig
import app.aura.core.widget.WidgetType
import app.aura.ui.MainActivity
import app.aura.widget.WidgetActionReceiver
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File
import java.util.regex.Pattern

/**
 * Coloca widgets reales en el launcher del emulador (flujo requestPinAppWidget, igual que el botón
 * «Añadir» de la app) y captura la pantalla de inicio sobre un fondo claro y otro oscuro.
 */
@RunWith(AndroidJUnit4::class)
class LauncherWidgetTest {
    private val instrumentation = InstrumentationRegistry.getInstrumentation()
    private val context = instrumentation.targetContext
    private val device = UiDevice.getInstance(instrumentation)
    private val out = File(context.getExternalFilesDir(null), "aura-shots").apply { mkdirs() }

    private fun setWallpaper(dark: Boolean) {
        val dm = context.resources.displayMetrics
        val bmp = Bitmap.createBitmap(dm.widthPixels, dm.heightPixels, Bitmap.Config.ARGB_8888)
        val colors = if (dark) intArrayOf(0xFF0B1622.toInt(), 0xFF3B5E7A.toInt()) else intArrayOf(0xFFF3EFE6.toInt(), 0xFFB9CCDA.toInt())
        val c = Canvas(bmp)
        c.drawPaint(Paint().apply { shader = LinearGradient(0f, 0f, dm.widthPixels.toFloat(), dm.heightPixels.toFloat(), colors[0], colors[1], Shader.TileMode.CLAMP) })
        val circle = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = if (dark) 0x40FFC857 else 0x40244B5B }
        c.drawCircle(dm.widthPixels * 0.75f, dm.heightPixels * 0.3f, dm.widthPixels * 0.35f, circle)
        WallpaperManager.getInstance(context).setBitmap(bmp, null, true, WallpaperManager.FLAG_SYSTEM)
    }

    private fun pin(type: WidgetType, profile: ProfileId): Boolean {
        val manager = AppWidgetManager.getInstance(context)
        if (!manager.isRequestPinAppWidgetSupported) return false
        val callback = Intent(context, WidgetActionReceiver::class.java)
            .setAction(WidgetActionReceiver.ACTION_PINNED)
            .putExtra(WidgetActionReceiver.EXTRA_CONFIG, Json.encodeToString(WidgetConfig(profile, Profiles.preset(profile))))
        val pending = PendingIntent.getBroadcast(context, 500 + type.ordinal, callback, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE)
        val requested = manager.requestPinAppWidget(context.aura.widgets.component(type), null, pending)
        if (!requested) return false
        val add = device.wait(Until.findObject(By.text(Pattern.compile("(?i)(add to home screen|add automatically|add|añadir.*|agregar.*)"))), 8_000)
        add?.click()
        device.waitForIdle()
        Thread.sleep(1500)
        return add != null
    }

    @Test
    fun widgetsOnRealLauncherOverLightAndDarkWallpapers() {
        ActivityScenario.launch(MainActivity::class.java).use {
            Thread.sleep(1500)
            setWallpaper(dark = false)
            val placed = listOf(
                pin(WidgetType.DUO, ProfileId.MINIMAL),
                pin(WidgetType.CLOCK, ProfileId.MINIMAL),
                pin(WidgetType.WEATHER, ProfileId.GLASS),
                pin(WidgetType.FORECAST, ProfileId.DARK),
            )
            println("AURA_PINNED $placed placed=${context.aura.widgets.placed()}")
        }
        device.pressHome()
        Thread.sleep(3000)
        device.takeScreenshot(File(out, "launcher_light.png"))
        setWallpaper(dark = true)
        Thread.sleep(2500)
        device.takeScreenshot(File(out, "launcher_dark.png"))
        assertTrue("No se colocó ningún widget en el launcher", context.aura.widgets.placed().isNotEmpty())
    }
}
