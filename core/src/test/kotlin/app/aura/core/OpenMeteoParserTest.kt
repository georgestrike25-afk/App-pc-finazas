package app.aura.core

import app.aura.core.openmeteo.OpenMeteoParser
import app.aura.core.weather.WeatherCondition
import app.aura.core.weather.WeatherProviderException
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class OpenMeteoParserTest {

    private val data = OpenMeteoParser.parseForecast(Fixtures.read("open_meteo_forecast.json"))

    @Test
    fun `current conditions are parsed as delivered`() {
        val c = data.current
        assertEquals(21.4, c.temperatureC, 0.0)
        assertEquals(20.9, c.apparentTemperatureC!!, 0.0)
        assertEquals(61, c.humidityPercent)
        assertEquals(2, c.weatherCode)
        assertTrue(c.isDay)
        assertEquals(WeatherCondition.PARTLY_CLOUDY_DAY, c.condition)
        assertEquals(1761674400L, c.time)
    }

    @Test
    fun `hourly entries with null values are skipped, never invented`() {
        assertEquals(4, data.hourly.size)
        assertTrue(data.hourly.none { it.time == 1761681600L })
        assertNull(data.hourly.first { it.time == 1761678000L }.precipitationProbability)
        assertEquals(WeatherCondition.THUNDERSTORM, data.hourly.last().condition)
    }

    @Test
    fun `daily dates use the local calendar of the place`() {
        assertEquals(listOf("2025-10-28", "2025-10-29"), data.daily.map { it.date })
        assertEquals(24.6, data.daily[0].maxC, 0.0)
        assertEquals(WeatherCondition.RAIN, data.daily[1].condition)
        assertEquals("America/Argentina/Buenos_Aires", data.timeZoneId)
        assertEquals(-10800, data.utcOffsetSeconds)
    }

    @Test(expected = WeatherProviderException::class)
    fun `response without current temperature is rejected`() {
        OpenMeteoParser.parseForecast("""{"current":{"weather_code":1}}""")
    }

    @Test(expected = WeatherProviderException::class)
    fun `api error payload is rejected`() {
        OpenMeteoParser.parseForecast("""{"error":true,"reason":"Latitude must be in range"}""")
    }

    @Test(expected = WeatherProviderException::class)
    fun `malformed json is rejected`() {
        OpenMeteoParser.parseForecast("<html>")
    }

    @Test
    fun `geocoding results are mapped and incomplete ones dropped`() {
        val places = OpenMeteoParser.parseGeocoding(Fixtures.read("open_meteo_geocoding.json"))
        assertEquals(2, places.size)
        assertEquals("om:3117735", places[0].id)
        assertEquals("España", places[0].country)
        assertEquals("España", places[0].subtitle) // la región igual al nombre se omite
        assertEquals("Buenos Aires F.D., Argentina", places[1].subtitle)
    }

    @Test
    fun `geocoding without results yields an empty list`() {
        assertTrue(OpenMeteoParser.parseGeocoding("""{"generationtime_ms":0.2}""").isEmpty())
    }
}
