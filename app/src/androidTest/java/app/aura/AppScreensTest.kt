package app.aura

import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.uiautomator.By
import androidx.test.uiautomator.UiDevice
import androidx.test.uiautomator.Until
import app.aura.core.settings.LocationMode
import app.aura.core.weather.Coordinates
import app.aura.core.weather.Place
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
    private val out = File(instrumentation.targetContext.filesDir, "aura-shots").apply { mkdirs() }

    private fun shot(name: String) {
        device.waitForIdle()
        Thread.sleep(1200)
        device.takeScreenshot(File(out, "app_$name.png"))
    }

    /** En emuladores recién arrancados puede aparecer «X no responde»: se descarta con «Esperar». */
    private fun dismissSystemDialogs() {
        device.findObject(By.text(java.util.regex.Pattern.compile("(?i)wait|esperar")))?.click()
    }

    private fun tap(text: String) {
        dismissSystemDialogs()
        val node = device.wait(Until.findObject(By.text(text)), 15_000)
        assertNotNull("No se encontró «$text»", node)
        node.click()
    }

    @org.junit.Before
    fun withRealPlace() = kotlinx.coroutines.runBlocking {
        val c = instrumentation.targetContext.aura
        val madrid = Place(
            "om:3117735", "Madrid", "Madrid", "España", Coordinates(40.4165, -3.7026), "Europe/Madrid",
        )
        c.settings.update { it.copy(locationMode = LocationMode.MANUAL, manualPlace = madrid, savedPlaces = listOf(madrid)) }
        c.weather.refresh(manual = true)
        Unit
    }

    @Test
    fun captureMainScreens() {
        ActivityScenario.launch(MainActivity::class.java).use {
            dismissSystemDialogs()
            assertNotNull("La pantalla de inicio de Aura no apareció", device.wait(Until.findObject(By.text("Aura")), 30_000))
            shot("home")
            tap("Pronóstico"); shot("forecast")
            tap("Widgets"); shot("widgets")
            tap("Studio"); shot("studio")
            tap("Ajustes"); shot("settings")
            tap("Inicio")
            tap("Personalizar"); shot("customize")
            device.swipe(device.displayWidth / 2, device.displayHeight * 3 / 4, device.displayWidth / 2, device.displayHeight / 3, 30)
            shot("customize_controls")
        }
    }
}
