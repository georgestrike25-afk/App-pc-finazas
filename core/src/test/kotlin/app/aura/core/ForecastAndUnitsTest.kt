package app.aura.core

import app.aura.core.time.ClockPatterns
import app.aura.core.time.HourFormat
import app.aura.core.units.TemperatureFormatter
import app.aura.core.units.TemperatureUnit
import app.aura.core.weather.DailyPoint
import app.aura.core.weather.ForecastSlots
import app.aura.core.weather.HourlyPoint
import app.aura.core.weather.WeatherCondition
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate

class ForecastAndUnitsTest {

    private fun hour(t: Long) = HourlyPoint(t, 10.0, 0, true, null, WeatherCondition.CLEAR_DAY)
    private fun day(d: String) = DailyPoint(d, 20.0, 10.0, 0, condition = WeatherCondition.CLEAR_DAY)

    @Test
    fun `upcoming hours start at the current hour`() {
        val hours = (0 until 10).map { hour(36_000L + it * 3600) }
        val now = 36_000L + 2 * 3600 + 1200 // 20 minutos después de la tercera hora
        val result = ForecastSlots.upcomingHours(hours.shuffled(), now, 3)
        assertEquals(listOf(43_200L, 46_800L, 50_400L), result.map { it.time })
    }

    @Test
    fun `upcoming days skip past dates`() {
        val days = listOf(day("2026-10-27"), day("2026-10-28"), day("2026-10-29"), day("2026-10-30"))
        val result = ForecastSlots.upcomingDays(days, LocalDate.parse("2026-10-28"), 5)
        assertEquals(listOf("2026-10-28", "2026-10-29", "2026-10-30"), result.map { it.date })
        assertEquals("2026-10-28", ForecastSlots.todayRange(days, LocalDate.parse("2026-10-28"))?.date)
        assertNull(ForecastSlots.todayRange(days, LocalDate.parse("2027-01-01")))
        assertEquals("2026-10-29", ForecastSlots.tomorrow(days, LocalDate.parse("2026-10-28"))?.date)
        assertNull(ForecastSlots.tomorrow(days, LocalDate.parse("2026-10-30")))
    }

    @Test
    fun `temperatures round and convert`() {
        assertEquals("21°", TemperatureFormatter.short(21.4, TemperatureUnit.CELSIUS))
        assertEquals("22°", TemperatureFormatter.short(21.5, TemperatureUnit.CELSIUS))
        assertEquals("71°", TemperatureFormatter.short(21.4, TemperatureUnit.FAHRENHEIT))
        assertEquals("0°", TemperatureFormatter.short(-0.3, TemperatureUnit.CELSIUS))
        assertEquals("-3°", TemperatureFormatter.short(-2.6, TemperatureUnit.CELSIUS))
        assertEquals("32 °F", TemperatureFormatter.withUnit(0.0, TemperatureUnit.FAHRENHEIT))
        assertEquals("25° / 14°", TemperatureFormatter.range(24.6, 14.1, TemperatureUnit.CELSIUS))
    }

    @Test
    fun `hour format honours the system unless overridden`() {
        assertEquals("HH:mm", ClockPatterns.timePattern(HourFormat.SYSTEM, system24 = true))
        assertEquals("h:mm", ClockPatterns.timePattern(HourFormat.SYSTEM, system24 = false))
        assertEquals("h:mm", ClockPatterns.timePattern(HourFormat.H12, system24 = true))
        assertTrue(ClockPatterns.is24(HourFormat.H24, system24 = false))
    }
}
