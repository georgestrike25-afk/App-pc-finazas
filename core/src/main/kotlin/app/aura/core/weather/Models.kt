package app.aura.core.weather

import kotlinx.serialization.Serializable

@Serializable
data class Coordinates(val latitude: Double, val longitude: Double)

/**
 * Lugar para el que se consulta el tiempo. [id] es estable: el identificador del geocodificador
 * para ciudades elegidas a mano, o [CURRENT_LOCATION_ID] para la ubicación del dispositivo.
 */
@Serializable
data class Place(
    val id: String,
    val name: String,
    val region: String? = null,
    val country: String? = null,
    val coordinates: Coordinates,
    val timeZoneId: String? = null,
) {
    val subtitle: String
        get() = listOfNotNull(region, country).filter { it.isNotBlank() && it != name }.joinToString(", ")

    companion object {
        const val CURRENT_LOCATION_ID = "device"
    }
}

@Serializable
data class CurrentConditions(
    /** Instante de la observación, segundos Unix (UTC). */
    val time: Long,
    val temperatureC: Double,
    val apparentTemperatureC: Double? = null,
    val humidityPercent: Int? = null,
    val windSpeedKmh: Double? = null,
    val weatherCode: Int,
    val isDay: Boolean,
    val condition: WeatherCondition,
)

@Serializable
data class HourlyPoint(
    val time: Long,
    val temperatureC: Double,
    val weatherCode: Int,
    val isDay: Boolean,
    val precipitationProbability: Int? = null,
    val condition: WeatherCondition,
)

@Serializable
data class DailyPoint(
    /** Fecha local en formato ISO (yyyy-MM-dd) en la zona horaria del lugar. */
    val date: String,
    val maxC: Double,
    val minC: Double,
    val weatherCode: Int,
    val precipitationProbabilityMax: Int? = null,
    val sunrise: Long? = null,
    val sunset: Long? = null,
    val condition: WeatherCondition,
)

/** Datos meteorológicos tal como los entrega un proveedor, sin metadatos de Aura. */
@Serializable
data class WeatherData(
    val current: CurrentConditions,
    val hourly: List<HourlyPoint>,
    val daily: List<DailyPoint>,
    val timeZoneId: String? = null,
    val utcOffsetSeconds: Int = 0,
)

/**
 * Última respuesta válida conservada en caché. Es lo que consumen la app y los widgets: nunca se
 * fabrican valores, solo se muestra lo que llegó del proveedor junto con su antigüedad.
 */
@Serializable
data class WeatherSnapshot(
    val place: Place,
    val data: WeatherData,
    val providerId: String,
    /** Momento de la descarga, milisegundos Unix. */
    val fetchedAtMillis: Long,
) {
    val today: DailyPoint? get() = data.daily.firstOrNull()
}
