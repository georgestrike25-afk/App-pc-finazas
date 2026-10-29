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
    /** Ilustración con volumen (WebP generado por tools/aura_3d.py). */
    val realistic: Int,
    /** Escena de fondo del cielo para esta condición. */
    val scene: Int,
)

object WeatherIcons {
    fun layers(condition: WeatherCondition): WeatherIconLayers = when (condition) {
        WeatherCondition.CLEAR_DAY -> WeatherIconLayers(R.drawable.ic_wx_clear_day_base, R.drawable.ic_wx_clear_day_accent, hasBase = false, hasAccent = true, accentOnLight = 0xFFF0A93A.toInt(), realistic = R.drawable.ic3d_clear_day, scene = R.drawable.scene_clear_day)
        WeatherCondition.CLEAR_NIGHT -> WeatherIconLayers(R.drawable.ic_wx_clear_night_base, R.drawable.ic_wx_clear_night_accent, hasBase = false, hasAccent = true, accentOnLight = 0xFFD69E2E.toInt(), realistic = R.drawable.ic3d_clear_night, scene = R.drawable.scene_clear_night)
        WeatherCondition.PARTLY_CLOUDY_DAY -> WeatherIconLayers(R.drawable.ic_wx_partly_cloudy_day_base, R.drawable.ic_wx_partly_cloudy_day_accent, hasBase = true, hasAccent = true, accentOnLight = 0xFFF0A93A.toInt(), realistic = R.drawable.ic3d_partly_cloudy_day, scene = R.drawable.scene_partly_cloudy_day)
        WeatherCondition.PARTLY_CLOUDY_NIGHT -> WeatherIconLayers(R.drawable.ic_wx_partly_cloudy_night_base, R.drawable.ic_wx_partly_cloudy_night_accent, hasBase = true, hasAccent = true, accentOnLight = 0xFFD69E2E.toInt(), realistic = R.drawable.ic3d_partly_cloudy_night, scene = R.drawable.scene_partly_cloudy_night)
        WeatherCondition.CLOUDY -> WeatherIconLayers(R.drawable.ic_wx_cloudy_base, R.drawable.ic_wx_cloudy_accent, hasBase = true, hasAccent = false, accentOnLight = 0xFF244B5B.toInt(), realistic = R.drawable.ic3d_cloudy, scene = R.drawable.scene_cloudy)
        WeatherCondition.DRIZZLE -> WeatherIconLayers(R.drawable.ic_wx_drizzle_base, R.drawable.ic_wx_drizzle_accent, hasBase = true, hasAccent = true, accentOnLight = 0xFF2F86BF.toInt(), realistic = R.drawable.ic3d_drizzle, scene = R.drawable.scene_drizzle)
        WeatherCondition.RAIN -> WeatherIconLayers(R.drawable.ic_wx_rain_base, R.drawable.ic_wx_rain_accent, hasBase = true, hasAccent = true, accentOnLight = 0xFF2F86BF.toInt(), realistic = R.drawable.ic3d_rain, scene = R.drawable.scene_rain)
        WeatherCondition.THUNDERSTORM -> WeatherIconLayers(R.drawable.ic_wx_thunderstorm_base, R.drawable.ic_wx_thunderstorm_accent, hasBase = true, hasAccent = true, accentOnLight = 0xFFF0A93A.toInt(), realistic = R.drawable.ic3d_thunderstorm, scene = R.drawable.scene_thunderstorm)
        WeatherCondition.SNOW -> WeatherIconLayers(R.drawable.ic_wx_snow_base, R.drawable.ic_wx_snow_accent, hasBase = true, hasAccent = false, accentOnLight = 0xFF244B5B.toInt(), realistic = R.drawable.ic3d_snow, scene = R.drawable.scene_snow)
        WeatherCondition.FOG -> WeatherIconLayers(R.drawable.ic_wx_fog_base, R.drawable.ic_wx_fog_accent, hasBase = true, hasAccent = false, accentOnLight = 0xFF244B5B.toInt(), realistic = R.drawable.ic3d_fog, scene = R.drawable.scene_fog)
        WeatherCondition.WIND -> WeatherIconLayers(R.drawable.ic_wx_wind_base, R.drawable.ic_wx_wind_accent, hasBase = true, hasAccent = false, accentOnLight = 0xFF244B5B.toInt(), realistic = R.drawable.ic3d_wind, scene = R.drawable.scene_wind)
    }
}
