package app.aura.core.openmeteo

import app.aura.core.net.HttpClient
import app.aura.core.net.HttpException
import app.aura.core.weather.Coordinates
import app.aura.core.weather.PlaceSearchProvider
import app.aura.core.weather.Place
import app.aura.core.weather.ProviderInfo
import app.aura.core.weather.WeatherData
import app.aura.core.weather.WeatherProvider
import app.aura.core.weather.WeatherProviderException
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.IOException
import java.net.URLEncoder
import java.util.Locale

/**
 * Open-Meteo (https://open-meteo.com): gratuito para uso no comercial, sin clave API, datos bajo
 * licencia CC BY 4.0 (requiere atribución). Límite orientativo del plan libre: 10 000 llamadas
 * diarias. Aura hace como máximo una llamada por hora y lugar en condiciones normales.
 */
class OpenMeteoWeatherProvider(
    private val http: HttpClient,
    private val baseUrl: String = "https://api.open-meteo.com/v1/forecast",
    private val dispatcher: CoroutineDispatcher = Dispatchers.IO,
) : WeatherProvider {

    override val info = INFO

    override suspend fun fetch(coordinates: Coordinates): WeatherData = withContext(dispatcher) {
        val response = try {
            http.get(forecastUrl(coordinates))
        } catch (e: IOException) {
            throw WeatherProviderException("No se pudo contactar con Open-Meteo", e)
        }
        if (response.code !in 200..299) {
            throw WeatherProviderException(
                "Open-Meteo respondió ${response.code}",
                HttpException(response.code, response.body.take(200)),
            )
        }
        OpenMeteoParser.parseForecast(response.body)
    }

    fun forecastUrl(c: Coordinates): String = buildString {
        append(baseUrl)
        append("?latitude=").append(formatCoordinate(c.latitude))
        append("&longitude=").append(formatCoordinate(c.longitude))
        append("&current=temperature_2m,apparent_temperature,relative_humidity_2m,is_day,weather_code,wind_speed_10m")
        append("&hourly=temperature_2m,weather_code,is_day,precipitation_probability")
        append("&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,precipitation_probability_max")
        append("&timezone=auto&forecast_days=6&forecast_hours=30&timeformat=unixtime&wind_speed_unit=kmh")
    }

    companion object {
        val INFO = ProviderInfo(
            id = "open-meteo",
            displayName = "Open-Meteo",
            attribution = "Datos meteorológicos de Open-Meteo.com (CC BY 4.0)",
            attributionUrl = "https://open-meteo.com/",
            termsSummary = "Gratuito y sin clave API para uso no comercial; hasta 10 000 consultas diarias.",
        )

        /** 4 decimales (~11 m): suficiente y evita filtrar más precisión de la necesaria. */
        fun formatCoordinate(value: Double): String = String.format(Locale.ROOT, "%.4f", value)
    }
}

class OpenMeteoGeocoder(
    private val http: HttpClient,
    private val baseUrl: String = "https://geocoding-api.open-meteo.com/v1/search",
    private val dispatcher: CoroutineDispatcher = Dispatchers.IO,
) : PlaceSearchProvider {

    override suspend fun search(query: String, languageTag: String, limit: Int): List<Place> {
        val trimmed = query.trim()
        if (trimmed.length < 2) return emptyList()
        return withContext(dispatcher) {
            val url = "$baseUrl?name=${URLEncoder.encode(trimmed, "UTF-8")}" +
                "&count=$limit&language=${URLEncoder.encode(languageTag.substringBefore('-'), "UTF-8")}&format=json"
            val response = try {
                http.get(url)
            } catch (e: IOException) {
                throw WeatherProviderException("No se pudo buscar la ciudad", e)
            }
            if (response.code !in 200..299) {
                throw WeatherProviderException("El buscador respondió ${response.code}")
            }
            OpenMeteoParser.parseGeocoding(response.body)
        }
    }
}
