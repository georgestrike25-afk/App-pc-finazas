package app.aura.ui

import android.content.Context
import app.aura.R
import app.aura.core.weather.Freshness
import app.aura.core.weather.WeatherCondition

/** Textos localizados compartidos por la app y los widgets. */
object WeatherText {
    fun conditionRes(c: WeatherCondition): Int = when (c) {
        WeatherCondition.CLEAR_DAY -> R.string.cond_clear_day
        WeatherCondition.CLEAR_NIGHT -> R.string.cond_clear_night
        WeatherCondition.PARTLY_CLOUDY_DAY -> R.string.cond_partly_cloudy_day
        WeatherCondition.PARTLY_CLOUDY_NIGHT -> R.string.cond_partly_cloudy_night
        WeatherCondition.CLOUDY -> R.string.cond_cloudy
        WeatherCondition.DRIZZLE -> R.string.cond_drizzle
        WeatherCondition.RAIN -> R.string.cond_rain
        WeatherCondition.THUNDERSTORM -> R.string.cond_thunderstorm
        WeatherCondition.SNOW -> R.string.cond_snow
        WeatherCondition.FOG -> R.string.cond_fog
        WeatherCondition.WIND -> R.string.cond_wind
    }

    fun condition(context: Context, c: WeatherCondition): String = context.getString(conditionRes(c))

    /** "5 min", "3 h", "2 d". */
    fun age(context: Context, ageMillis: Long): String {
        val minutes = (ageMillis / Freshness.MINUTE).coerceAtLeast(1)
        return when {
            minutes < 60 -> context.getString(R.string.age_minutes, minutes.toInt())
            minutes < 48 * 60 -> context.getString(R.string.age_hours, (minutes / 60).toInt())
            else -> context.getString(R.string.age_days, (minutes / (60 * 24)).toInt())
        }
    }
}
