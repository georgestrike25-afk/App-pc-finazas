package app.aura.core.time

import kotlinx.serialization.Serializable

@Serializable
enum class HourFormat { SYSTEM, H12, H24 }

/** Cómo se escribe la fecha: con palabras («jueves, 30 de octubre»), en números («30/10/2026») o ambos («jue 30/10/2026»). */
@Serializable
enum class DateStyle { TEXT, NUMERIC, WEEKDAY_NUMERIC }

/** Patrones para TextClock / DateTimeFormatter. La fecha se localiza en la app con getBestDateTimePattern. */
object ClockPatterns {
    const val TIME_24 = "HH:mm"
    const val TIME_12 = "h:mm"
    const val AM_PM = "a"
    const val DATE_SKELETON_SHORT = "EEEdMMM"
    const val DATE_SKELETON_LONG = "EEEEdMMMM"
    const val DATE_NUMERIC = "dd/MM/yyyy"
    const val DATE_WEEKDAY_NUMERIC = "EEE dd/MM/yyyy"

    /**
     * Patrón final de la fecha. [localized] traduce un esqueleto al orden y la puntuación del idioma
     * (en Android, DateFormat.getBestDateTimePattern); los formatos numéricos son fijos día/mes/año.
     */
    fun datePattern(style: DateStyle, long: Boolean, localized: (String) -> String): String = when (style) {
        DateStyle.TEXT -> localized(if (long) DATE_SKELETON_LONG else DATE_SKELETON_SHORT)
        DateStyle.NUMERIC -> DATE_NUMERIC
        DateStyle.WEEKDAY_NUMERIC -> DATE_WEEKDAY_NUMERIC
    }

    fun is24(format: HourFormat, system24: Boolean): Boolean = when (format) {
        HourFormat.SYSTEM -> system24
        HourFormat.H12 -> false
        HourFormat.H24 -> true
    }

    fun timePattern(format: HourFormat, system24: Boolean): String =
        if (is24(format, system24)) TIME_24 else TIME_12
}
