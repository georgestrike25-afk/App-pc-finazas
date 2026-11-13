package app.aura.core.weather

/**
 * Traducción de los códigos meteorológicos WMO 4677 (los que usa Open-Meteo y la mayoría de
 * proveedores abiertos) a las condiciones de Aura.
 */
object WmoCodes {

    /** Velocidad de viento (km/h) a partir de la cual un cielo seco se representa como "Viento". */
    const val WINDY_THRESHOLD_KMH = 40.0

    /** Por debajo de esto (mm) el modelo no prevé que moje: un código de lluvia o tormenta es solo «posible». */
    const val WET_MM = 0.1

    /** Probabilidad desde la que un código de lluvia sin milímetros se muestra como «posible lluvia». */
    const val LIKELY_PERCENT = 50

    /**
     * [precipitationMm], [cloudCoverPercent] y [probabilityPercent] son del mismo modelo y momento. Si el
     * código dice lluvia, nieve o tormenta pero no prevé milímetros y la probabilidad es baja, se muestra
     * el cielo según la nubosidad (los modelos marcan «tormenta» en días inestables aunque no caiga una
     * gota). Con probabilidad alta se conserva: es «posible lluvia» (ver WeatherInsights.isPossible).
     */
    fun toCondition(
        code: Int,
        isDay: Boolean,
        windSpeedKmh: Double? = null,
        precipitationMm: Double? = null,
        cloudCoverPercent: Int? = null,
        probabilityPercent: Int? = null,
    ): WeatherCondition {
        val unlikely = probabilityPercent == null || probabilityPercent < LIKELY_PERCENT
        val effective = when {
            code >= 51 && precipitationMm != null && precipitationMm < WET_MM && unlikely -> dryCode(cloudCoverPercent)
            // El código del modelo dice cielo seco pero la probabilidad de lluvia es alta: lluvia (posible).
            code < 45 && !unlikely -> 61
            else -> code
        }
        val base = when (effective) {
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

    private fun dryCode(cloudCover: Int?): Int = when {
        cloudCover == null -> 3
        cloudCover < 25 -> 1
        cloudCover < 70 -> 2
        else -> 3
    }
}
