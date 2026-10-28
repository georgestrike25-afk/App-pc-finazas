package app.aura.core

import app.aura.core.net.HttpClient
import app.aura.core.net.HttpResponse
import app.aura.core.openmeteo.OpenMeteoGeocoder
import app.aura.core.openmeteo.OpenMeteoWeatherProvider
import app.aura.core.weather.Coordinates
import app.aura.core.weather.WeatherProviderException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.IOException

class OpenMeteoProviderTest {

    @Test
    fun `request asks only for the fields Aura shows, with limited precision`() = runTest {
        var requested = ""
        val provider = OpenMeteoWeatherProvider(
            http = HttpClient { url -> requested = url; HttpResponse(200, Fixtures.read("open_meteo_forecast.json")) },
            dispatcher = Dispatchers.Unconfined,
        )
        val data = provider.fetch(Coordinates(-34.603722, -58.381592))
        assertEquals(21.4, data.current.temperatureC, 0.0)
        assertTrue(requested.startsWith("https://api.open-meteo.com/v1/forecast?latitude=-34.6037&longitude=-58.3816"))
        assertTrue("timezone=auto" in requested)
        assertTrue("timeformat=unixtime" in requested)
        assertFalse("apikey" in requested.lowercase())
    }

    @Test(expected = WeatherProviderException::class)
    fun `http errors become provider exceptions`() = runTest {
        OpenMeteoWeatherProvider(HttpClient { HttpResponse(429, "Too many requests") }, dispatcher = Dispatchers.Unconfined)
            .fetch(Coordinates(0.0, 0.0))
    }

    @Test(expected = WeatherProviderException::class)
    fun `network failures become provider exceptions`() = runTest {
        OpenMeteoWeatherProvider(HttpClient { throw IOException("offline") }, dispatcher = Dispatchers.Unconfined)
            .fetch(Coordinates(0.0, 0.0))
    }

    @Test
    fun `geocoder encodes the query and language`() = runTest {
        var requested = ""
        val geocoder = OpenMeteoGeocoder(
            HttpClient { url -> requested = url; HttpResponse(200, Fixtures.read("open_meteo_geocoding.json")) },
            dispatcher = Dispatchers.Unconfined,
        )
        val places = geocoder.search("São Paulo", "es-AR", 5)
        assertEquals(2, places.size)
        assertTrue("name=S%C3%A3o+Paulo" in requested)
        assertTrue("language=es" in requested)
        assertTrue("count=5" in requested)
    }

    @Test
    fun `geocoder ignores too short queries without calling the network`() = runTest {
        val geocoder = OpenMeteoGeocoder(HttpClient { error("no debería llamarse") }, dispatcher = Dispatchers.Unconfined)
        assertTrue(geocoder.search(" a ", "es", 5).isEmpty())
    }
}
