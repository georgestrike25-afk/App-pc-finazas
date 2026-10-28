package app.aura

import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.uiautomator.By
import androidx.test.uiautomator.UiDevice
import androidx.test.uiautomator.Until
import app.aura.ui.MainActivity
import org.junit.Assert.assertNotNull
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File

/** Abre la app real y captura cada pantalla principal para revisión visual. */
@RunWith(AndroidJUnit4::class)
class AppScreensTest {
    private val instrumentation = InstrumentationRegistry.getInstrumentation()
    private val device = UiDevice.getInstance(instrumentation)
    private val out = File(instrumentation.targetContext.getExternalFilesDir(null), "aura-shots").apply { mkdirs() }

    private fun shot(name: String) {
        device.waitForIdle()
        Thread.sleep(1200)
        device.takeScreenshot(File(out, "app_$name.png"))
    }

    private fun tap(text: String) {
        val node = device.wait(Until.findObject(By.text(text)), 5_000)
        assertNotNull("No se encontró «$text»", node)
        node.click()
    }

    @Test
    fun captureMainScreens() {
        ActivityScenario.launch(MainActivity::class.java).use {
            assertNotNull(device.wait(Until.findObject(By.text("Aura")), 8_000))
            shot("home")
            tap("Pronóstico"); shot("forecast")
            tap("Widgets"); shot("widgets")
            tap("Ajustes"); shot("settings")
            tap("Inicio")
            tap("Personalizar"); shot("customize")
            device.swipe(device.displayWidth / 2, device.displayHeight * 3 / 4, device.displayWidth / 2, device.displayHeight / 3, 30)
            shot("customize_controls")
        }
    }
}
