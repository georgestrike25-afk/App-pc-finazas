package app.aura.core

import app.aura.core.weather.DayPhase
import app.aura.core.weather.HourlyPoint
import app.aura.core.weather.WeatherCondition
import app.aura.core.weather.WeatherInsights
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class WeatherInsightsTest {
    private val base = 1_700_000_000L - Math.floorMod(1_700_000_000L, 3600L)
    private fun hour(i: Int, pop: Int?, mm: Double? = null) =
        HourlyPoint(base + i * 3600L, 20.0, 61, true, pop, WeatherCondition.RAIN, precipitationMm = mm)

    @Test
    fun `phase follows sunrise and sunset with twilight`() {
        val rise = base
        val set = base + 12 * 3600
        assertEquals(DayPhase.DAWN, WeatherInsights.phase(rise + 600, rise, set, true))
        assertEquals(DayPhase.DAY, WeatherInsights.phase(rise + 6 * 3600, rise, set, true))
        assertEquals(DayPhase.DUSK, WeatherInsights.phase(set - 600, rise, set, true))
        assertEquals(DayPhase.NIGHT, WeatherInsights.phase(set + 2 * 3600, rise, set, true))
        assertEquals(DayPhase.NIGHT, WeatherInsights.phase(rise, null, null, false))
        assertEquals(0.5f, WeatherInsights.sunProgress(rise + 6 * 3600, rise, set)!!, 0.001f)
        assertNull(WeatherInsights.sunProgress(set + 1, rise, set))
    }

    @Test
    fun `next rain finds the first wet run`() {
        val hours = listOf(hour(0, 5), hour(1, 10), hour(2, 45, 0.4), hour(3, 80, 2.0), hour(4, 30, 0.3), hour(5, 10), hour(6, 70))
        val w = WeatherInsights.nextRain(hours, base + 60)!!
        assertEquals(base + 2 * 3600, w.start)
        assertEquals(base + 5 * 3600, w.end)
        assertEquals(3, w.hours)
        assertEquals(80, w.peakProbability)
        assertEquals(2.7, w.totalMm, 0.001)
        assertNull(WeatherInsights.nextRain(listOf(hour(0, 5), hour(1, 20)), base))
    }

    @Test
    fun `saved data is reconciled and missing current rain uses the current hour`() {
        val dryNow = app.aura.core.weather.CurrentConditions(base + 60, 25.0, weatherCode = 61, isDay = true, condition = WeatherCondition.RAIN)
        val data = app.aura.core.weather.WeatherData(dryNow, listOf(hour(0, 86, 0.0), hour(1, 83, 0.6)), emptyList())
        val r = WeatherInsights.reconciled(data, base + 60)
        assertEquals(WeatherCondition.CLOUDY, r.current.condition)
        assertEquals(WeatherCondition.CLOUDY, r.hourly[0].condition)
        assertEquals(WeatherCondition.RAIN, r.hourly[1].condition)
        val wet = WeatherInsights.reconciled(data.copy(current = dryNow.copy(precipitationMm = 1.2)), base + 60)
        assertEquals(WeatherCondition.RAIN, wet.current.condition)
    }
}
