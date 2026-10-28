package app.aura.core.openmeteo

import app.aura.core.weather.Coordinates
import app.aura.core.weather.CurrentConditions
import app.aura.core.weather.DailyPoint
import app.aura.core.weather.HourlyPoint
import app.aura.core.weather.Place
import app.aura.core.weather.WeatherData
import app.aura.core.weather.WeatherProviderException
import app.aura.core.weather.WmoCodes
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.longOrNull
import java.time.Instant
import java.time.ZoneOffset

/**
 * Convierte las respuestas JSON de Open-Meteo en modelos de Aura. Es tolerante con valores nulos
 * dentro de las series (Open-Meteo los usa cuando un modelo no cubre una hora), pero rechaza
 * respuestas sin datos actuales: Aura nunca rellena huecos con valores inventados.
 */
object OpenMeteoParser {
    private val json = Json { ignoreUnknownKeys = true }

    fun parseForecast(body: String): WeatherData {
        val root = parseObject(body)
        if (root.bool("error") == true) {
            throw WeatherProviderException("Open-Meteo: ${root.string("reason") ?: "error desconocido"}")
        }
        val offset = root.int("utc_offset_seconds") ?: 0
        val current = root.obj("current") ?: throw WeatherProviderException("Respuesta sin datos actuales")
        val currentTemp = current.double("temperature_2m")
            ?: throw WeatherProviderException("Respuesta sin temperatura actual")
        val currentCode = current.int("weather_code")
            ?: throw WeatherProviderException("Respuesta sin código meteorológico")
        val isDay = (current.int("is_day") ?: 1) == 1
        val wind = current.double("wind_speed_10m")

        val conditions = CurrentConditions(
            time = current.long("time") ?: 0L,
            temperatureC = currentTemp,
            apparentTemperatureC = current.double("apparent_temperature"),
            humidityPercent = current.int("relative_humidity_2m"),
            windSpeedKmh = wind,
            weatherCode = currentCode,
            isDay = isDay,
            condition = WmoCodes.toCondition(currentCode, isDay, wind),
        )

        val hourly = root.obj("hourly")?.let { h ->
            val times = h.array("time")
            val temps = h.array("temperature_2m")
            val codes = h.array("weather_code")
            val days = h.array("is_day")
            val pop = h.array("precipitation_probability")
            times.indices.mapNotNull { i ->
                val t = times.longAt(i) ?: return@mapNotNull null
                val temp = temps.doubleAt(i) ?: return@mapNotNull null
                val code = codes.intAt(i) ?: return@mapNotNull null
                val day = (days.intAt(i) ?: 1) == 1
                HourlyPoint(t, temp, code, day, pop.intAt(i), WmoCodes.toCondition(code, day))
            }
        }.orEmpty()

        val daily = root.obj("daily")?.let { d ->
            val times = d.array("time")
            val max = d.array("temperature_2m_max")
            val min = d.array("temperature_2m_min")
            val codes = d.array("weather_code")
            val pop = d.array("precipitation_probability_max")
            val sunrise = d.array("sunrise")
            val sunset = d.array("sunset")
            times.indices.mapNotNull { i ->
                val t = times.longAt(i) ?: return@mapNotNull null
                val hi = max.doubleAt(i) ?: return@mapNotNull null
                val lo = min.doubleAt(i) ?: return@mapNotNull null
                val code = codes.intAt(i) ?: return@mapNotNull null
                // Con timeformat=unixtime, la fecha diaria es la medianoche local expresada en UTC.
                val localDate = Instant.ofEpochSecond(t + offset).atOffset(ZoneOffset.UTC).toLocalDate()
                DailyPoint(
                    date = localDate.toString(),
                    maxC = hi,
                    minC = lo,
                    weatherCode = code,
                    precipitationProbabilityMax = pop.intAt(i),
                    sunrise = sunrise.longAt(i),
                    sunset = sunset.longAt(i),
                    condition = WmoCodes.toCondition(code, isDay = true),
                )
            }
        }.orEmpty()

        return WeatherData(
            current = conditions,
            hourly = hourly,
            daily = daily,
            timeZoneId = root.string("timezone"),
            utcOffsetSeconds = offset,
        )
    }

    fun parseGeocoding(body: String): List<Place> {
        val root = parseObject(body)
        val results = root["results"] as? JsonArray ?: return emptyList()
        return results.mapNotNull { element ->
            val o = element as? JsonObject ?: return@mapNotNull null
            val lat = o.double("latitude") ?: return@mapNotNull null
            val lon = o.double("longitude") ?: return@mapNotNull null
            val name = o.string("name") ?: return@mapNotNull null
            Place(
                id = "om:" + (o.long("id")?.toString() ?: "$lat,$lon"),
                name = name,
                region = o.string("admin1"),
                country = o.string("country"),
                coordinates = Coordinates(lat, lon),
                timeZoneId = o.string("timezone"),
            )
        }
    }

    private fun parseObject(body: String): JsonObject = try {
        json.parseToJsonElement(body).jsonObject
    } catch (e: Exception) {
        throw WeatherProviderException("Respuesta JSON no válida", e)
    }

    private fun JsonObject.obj(key: String) = this[key] as? JsonObject
    private fun JsonObject.array(key: String): List<JsonElement> = (this[key] as? JsonArray) ?: emptyList()
    private fun JsonObject.prim(key: String) = (this[key] as? JsonPrimitive)?.takeUnless { it is JsonNull }
    private fun JsonObject.double(key: String) = prim(key)?.doubleOrNull
    private fun JsonObject.int(key: String) = prim(key)?.let { it.intOrNull ?: it.doubleOrNull?.toInt() }
    private fun JsonObject.long(key: String) = prim(key)?.let { it.longOrNull ?: it.doubleOrNull?.toLong() }
    private fun JsonObject.string(key: String) = prim(key)?.takeIf { it.isString }?.content
    private fun JsonObject.bool(key: String) = prim(key)?.content?.toBooleanStrictOrNull()

    private fun List<JsonElement>.p(i: Int) = (getOrNull(i) as? JsonPrimitive)?.takeUnless { it is JsonNull }
    private fun List<JsonElement>.doubleAt(i: Int) = p(i)?.doubleOrNull
    private fun List<JsonElement>.intAt(i: Int) = p(i)?.let { it.intOrNull ?: it.doubleOrNull?.toInt() }
    private fun List<JsonElement>.longAt(i: Int) = p(i)?.let { it.longOrNull ?: it.doubleOrNull?.toLong() }
}
