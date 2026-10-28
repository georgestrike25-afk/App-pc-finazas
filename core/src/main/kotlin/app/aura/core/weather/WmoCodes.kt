package app.aura.core.weather

/**
 * Traducción de los códigos meteorológicos WMO 4677 (los que usa Open-Meteo y la mayoría de
 * proveedores abiertos) a las condiciones de Aura.
 */
object WmoCodes {

    /** Velocidad de viento (km/h) a partir de la cual un cielo seco se representa como "Viento". */
    const val WINDY_THRESHOLD_KMH = 40.0

    fun toCondition(code: Int, isDay: Boolean, windSpeedKmh: Double? = null): WeatherCondition {
        val base = when (code) {
            0, 1 -> if (isDay) WeatherCondition.CLEAR_DAY else WeatherCondition.CLEAR_NIGHT
            2 -> if (isDay) WeatherCondition.PARTLY_CLOUDY_DAY else WeatherCondition.PARTLY_CLOUDY_NIGHT
            3 -> WeatherCondition.CLOUDY
            45, 48 -> WeatherCondition.FOG
            51, 53, 55, 56, 57 -> WeatherCondition.DRIZZLE
            61, 63, 65, 66, 67, 80, 81, 82 -> WeatherCondition.RAIN
            71, 73, 75, 77, 85, 86 -> WeatherCondition.SNOW
            95, 96, 99 -> WeatherCondition.THUNDERSTORM
            else -> WeatherCondition.CLOUDY
        }
        val dry = base == WeatherCondition.CLEAR_DAY || base == WeatherCondition.CLEAR_NIGHT ||
            base == WeatherCondition.PARTLY_CLOUDY_DAY || base == WeatherCondition.PARTLY_CLOUDY_NIGHT ||
            base == WeatherCondition.CLOUDY
        return if (dry && windSpeedKmh != null && windSpeedKmh >= WINDY_THRESHOLD_KMH) {
            WeatherCondition.WIND
        } else {
            base
        }
    }
}
