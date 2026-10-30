package app.aura.studio.render

import android.content.Context
import android.text.format.DateFormat
import app.aura.core.settings.AppSettings
import app.aura.core.studio.ClockDesign
import app.aura.core.studio.ClockText
import app.aura.core.time.ClockPatterns
import app.aura.core.time.HourFormat
import app.aura.core.units.TemperatureFormatter
import app.aura.core.weather.WeatherSnapshot
import java.time.LocalDateTime
import java.time.format.DateTimeFormatter
import java.util.Locale

/**
 * Textos del reloj de Studio reutilizando la lógica horaria y meteorológica de Aura: formato 12/24 h
 * (del diseño, de la app o del sistema), fecha localizada y la temperatura en caché.
 */
object ClockExtrasBuilder {
    fun build(context: Context, design: ClockDesign, settings: AppSettings, snapshot: WeatherSnapshot?, now: LocalDateTime): ClockExtras {
        val format = if (design.hourFormat != HourFormat.SYSTEM) design.hourFormat else settings.hourFormat
        val is24 = ClockPatterns.is24(format, DateFormat.is24HourFormat(context))
        val (h, m) = ClockText.parts(now.hour, now.minute, is24)
        val parts = mutableListOf<String>()
        if (design.showDate) {
            val pattern = ClockPatterns.datePattern(design.dateStyle, long = true) { DateFormat.getBestDateTimePattern(Locale.getDefault(), it) }
            parts += now.format(DateTimeFormatter.ofPattern(pattern, Locale.getDefault())).replaceFirstChar { it.titlecase(Locale.getDefault()) }
        }
        if (design.showWeather && snapshot != null) {
            parts += "${TemperatureFormatter.short(snapshot.data.current.temperatureC, settings.temperatureUnit)} ${snapshot.place.name}"
        }
        val ampm = if (!is24) " " + now.format(DateTimeFormatter.ofPattern("a", Locale.getDefault())) else ""
        return ClockExtras(h, m + ampm.lowercase(Locale.getDefault()).takeIf { it.isNotBlank() }.orEmpty(), parts.joinToString(" · ").ifBlank { null })
    }
}
