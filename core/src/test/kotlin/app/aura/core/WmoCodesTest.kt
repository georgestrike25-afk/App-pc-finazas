package app.aura.core

import app.aura.core.weather.WeatherCondition
import app.aura.core.weather.WeatherCondition.*
import app.aura.core.weather.WmoCodes
import org.junit.Assert.assertEquals
import org.junit.Test

class WmoCodesTest {
    @Test
    fun `codes map to the expected families`() {
        val expected = mapOf(
            0 to CLEAR_DAY, 1 to CLEAR_DAY, 2 to PARTLY_CLOUDY_DAY, 3 to CLOUDY,
            45 to FOG, 48 to FOG, 51 to DRIZZLE, 57 to DRIZZLE,
            61 to RAIN, 65 to RAIN, 80 to RAIN, 82 to RAIN,
            71 to SNOW, 77 to SNOW, 86 to SNOW, 95 to THUNDERSTORM, 99 to THUNDERSTORM,
        )
        expected.forEach { (code, condition) -> assertEquals("código $code", condition, WmoCodes.toCondition(code, true)) }
    }

    @Test
    fun `night variants are used for clear and partly cloudy skies`() {
        assertEquals(CLEAR_NIGHT, WmoCodes.toCondition(0, isDay = false))
        assertEquals(PARTLY_CLOUDY_NIGHT, WmoCodes.toCondition(2, isDay = false))
        assertEquals(RAIN, WmoCodes.toCondition(63, isDay = false))
    }

    @Test
    fun `strong wind overrides only dry skies`() {
        assertEquals(WIND, WmoCodes.toCondition(1, true, windSpeedKmh = 45.0))
        assertEquals(WIND, WmoCodes.toCondition(3, false, windSpeedKmh = 40.0))
        assertEquals(RAIN, WmoCodes.toCondition(61, true, windSpeedKmh = 60.0))
        assertEquals(CLEAR_DAY, WmoCodes.toCondition(0, true, windSpeedKmh = 39.9))
    }

    @Test
    fun `unknown codes fall back to cloudy`() {
        assertEquals(WeatherCondition.CLOUDY, WmoCodes.toCondition(42, true))
    }
}
