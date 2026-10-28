// Generado por tools/aura_icons.py. No editar a mano.
package app.aura.ui.icons

import app.aura.R
import app.aura.core.weather.WeatherCondition

/** Capas vectoriales de cada condición: base (neutra, tintable) y acento (color de marca). */
data class WeatherIconLayers(
    val base: Int,
    val accent: Int,
    val hasBase: Boolean,
    val hasAccent: Boolean,
    /** Tono del acento para superficies claras, donde el dorado pálido perdería contraste. */
    val accentOnLight: Int,
)

object WeatherIcons {
    fun layers(condition: WeatherCondition): WeatherIconLayers = when (condition) {
        WeatherCondition.CLEAR_DAY -> WeatherIconLayers(R.drawable.ic_wx_clear_day_base, R.drawable.ic_wx_clear_day_accent, hasBase = false, hasAccent = true, accentOnLight = 0xFFF0A93A.toInt())
        WeatherCondition.CLEAR_NIGHT -> WeatherIconLayers(R.drawable.ic_wx_clear_night_base, R.drawable.ic_wx_clear_night_accent, hasBase = false, hasAccent = true, accentOnLight = 0xFFD69E2E.toInt())
        WeatherCondition.PARTLY_CLOUDY_DAY -> WeatherIconLayers(R.drawable.ic_wx_partly_cloudy_day_base, R.drawable.ic_wx_partly_cloudy_day_accent, hasBase = true, hasAccent = true, accentOnLight = 0xFFF0A93A.toInt())
        WeatherCondition.PARTLY_CLOUDY_NIGHT -> WeatherIconLayers(R.drawable.ic_wx_partly_cloudy_night_base, R.drawable.ic_wx_partly_cloudy_night_accent, hasBase = true, hasAccent = true, accentOnLight = 0xFFD69E2E.toInt())
        WeatherCondition.CLOUDY -> WeatherIconLayers(R.drawable.ic_wx_cloudy_base, R.drawable.ic_wx_cloudy_accent, hasBase = true, hasAccent = false, accentOnLight = 0xFF244B5B.toInt())
        WeatherCondition.DRIZZLE -> WeatherIconLayers(R.drawable.ic_wx_drizzle_base, R.drawable.ic_wx_drizzle_accent, hasBase = true, hasAccent = true, accentOnLight = 0xFF2F86BF.toInt())
        WeatherCondition.RAIN -> WeatherIconLayers(R.drawable.ic_wx_rain_base, R.drawable.ic_wx_rain_accent, hasBase = true, hasAccent = true, accentOnLight = 0xFF2F86BF.toInt())
        WeatherCondition.THUNDERSTORM -> WeatherIconLayers(R.drawable.ic_wx_thunderstorm_base, R.drawable.ic_wx_thunderstorm_accent, hasBase = true, hasAccent = true, accentOnLight = 0xFFF0A93A.toInt())
        WeatherCondition.SNOW -> WeatherIconLayers(R.drawable.ic_wx_snow_base, R.drawable.ic_wx_snow_accent, hasBase = true, hasAccent = false, accentOnLight = 0xFF244B5B.toInt())
        WeatherCondition.FOG -> WeatherIconLayers(R.drawable.ic_wx_fog_base, R.drawable.ic_wx_fog_accent, hasBase = true, hasAccent = false, accentOnLight = 0xFF244B5B.toInt())
        WeatherCondition.WIND -> WeatherIconLayers(R.drawable.ic_wx_wind_base, R.drawable.ic_wx_wind_accent, hasBase = true, hasAccent = false, accentOnLight = 0xFF244B5B.toInt())
    }
}
