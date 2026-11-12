package app.aura

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.ComposeView
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.uiautomator.By
import androidx.test.uiautomator.UiDevice
import androidx.test.uiautomator.Until
import app.aura.core.settings.AppSettings
import app.aura.core.weather.Coordinates
import app.aura.core.weather.CurrentConditions
import app.aura.core.weather.DailyPoint
import app.aura.core.weather.DayPhase
import app.aura.core.weather.HourlyPoint
import app.aura.core.weather.Place
import app.aura.core.weather.WeatherCondition
import app.aura.core.weather.WeatherData
import app.aura.core.weather.WeatherSnapshot
import app.aura.ui.MainActivity
import app.aura.ui.components.WeatherSky
import app.aura.ui.screens.WeatherDetail
import app.aura.ui.theme.AuraTheme
import org.junit.Assert.assertNotNull
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File
import java.time.LocalDate
import java.time.ZoneId

/** Pantalla Clima con datos de ejemplo (lluvia por la tarde, de día y de noche) y muestrario de cielos. */
@RunWith(AndroidJUnit4::class)
class WeatherScreenTest {
    private val instrumentation = InstrumentationRegistry.getInstrumentation()
    private val device = UiDevice.getInstance(instrumentation)
    private val out = File(instrumentation.targetContext.filesDir, "aura-shots").apply { mkdirs() }

    private fun shot(name: String) {
        device.waitForIdle()
        Thread.sleep(1500)
        device.takeScreenshot(File(out, "$name.png"))
    }

    private fun sample(condition: WeatherCondition, night: Boolean): WeatherSnapshot {
        val now = System.currentTimeMillis() / 1000
        val hour0 = now - Math.floorMod(now, 3600L)
        val zone = ZoneId.systemDefault()
        val today = LocalDate.now(zone)
        val (rise, set) = if (night) (now - 20 * 3600) to (now - 8 * 3600) else (now - 4 * 3600) to (now + 6 * 3600)
        val hourly = List(48) { i ->
            val t = hour0 + i * 3600L
            val pop = when (i) { in 3..6 -> 55 + i * 5; 2, 7 -> 25; else -> 5 }
            val wet = pop >= 40
            val day = (t in rise until set) || (t in rise + 86400 until set + 86400)
            val c = if (wet) WeatherCondition.RAIN else if (day) WeatherCondition.PARTLY_CLOUDY_DAY else WeatherCondition.CLEAR_NIGHT
            HourlyPoint(t, 24.0 - 6 * kotlin.math.sin(i / 24.0 * 2 * Math.PI + 1), if (wet) 63 else 2, day, pop, c, precipitationMm = if (wet) 1.4 else 0.0)
        }
        val daily = List(14) { d ->
            DailyPoint(
                today.plusDays(d.toLong()).toString(), 33.0 - (d % 5) * 2, 17.0 - (d % 3), if (d % 4 == 2) 63 else 1,
                precipitationProbabilityMax = listOf(5, 24, 84, 34, 84, 37)[d % 6],
                sunrise = rise + d * 86400L, sunset = set + d * 86400L,
                condition = if (d % 4 == 2) WeatherCondition.RAIN else WeatherCondition.PARTLY_CLOUDY_DAY,
                uvIndexMax = 11.0,
            )
        }
        return WeatherSnapshot(
            place = Place("cba", "Córdoba", coordinates = Coordinates(-31.4, -64.2)),
            data = WeatherData(
                current = CurrentConditions(now, 24.0, 26.0, 54, 14.0, 0, !night, condition),
                hourly = hourly, daily = daily, timeZoneId = zone.id,
            ),
            providerId = "test", fetchedAtMillis = System.currentTimeMillis() - 5 * 60_000,
        )
    }

    private fun show(content: @androidx.compose.runtime.Composable () -> Unit, run: () -> Unit) {
        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            scenario.onActivity { a -> a.setContentView(ComposeView(a).apply { setContent { AuraTheme { content() } } }) }
            run()
        }
    }

    @Test
    fun weatherDetailDayWithAfternoonRain() = show({
        WeatherDetail(sample(WeatherCondition.PARTLY_CLOUDY_DAY, night = false), AppSettings(), false, {}, {})
    }) {
        assertNotNull(device.wait(Until.findObject(By.textContains("Desde las")), 10_000))
        shot("weather_day")
        device.swipe(device.displayWidth / 2, device.displayHeight * 4 / 5, device.displayWidth / 2, device.displayHeight / 5, 40)
        shot("weather_day_scrolled")
        device.swipe(device.displayWidth / 2, device.displayHeight * 4 / 5, device.displayWidth / 2, device.displayHeight / 5, 40)
        shot("weather_day_bottom")
    }

    @Test
    fun weatherDetailNightClear() = show({
        WeatherDetail(sample(WeatherCondition.CLEAR_NIGHT, night = true), AppSettings(), false, {}, {})
    }) {
        assertNotNull(device.wait(Until.findObject(By.text("Córdoba")), 10_000))
        shot("weather_night")
    }

    @Test
    fun weatherDetailThunderstorm() = show({
        WeatherDetail(sample(WeatherCondition.THUNDERSTORM, night = false), AppSettings(), false, {}, {})
    }) {
        assertNotNull(device.wait(Until.findObject(By.text("Córdoba")), 10_000))
        shot("weather_storm")
    }

    @Test
    fun skyForEveryConditionAndTimeOfDay() = show({
        Column(Modifier.fillMaxSize()) {
            WeatherCondition.entries.forEach { c ->
                Row(Modifier.weight(1f).fillMaxWidth()) {
                    DayPhase.entries.forEach { p ->
                        Box(Modifier.weight(1f).fillMaxSize().padding(1.dp)) {
                            WeatherSky(c, p, sunProgress = if (p == DayPhase.DAY) 0.4f else null, horizon = 0.8f, modifier = Modifier.fillMaxSize())
                            Text("${c.name.lowercase()} ${p.name.lowercase()}", color = Color.White, fontSize = 8.sp, modifier = Modifier.padding(2.dp))
                        }
                    }
                }
            }
        }
    }) {
        shot("weather_skies")
    }
}
