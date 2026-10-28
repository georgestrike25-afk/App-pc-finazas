package app.aura.core.time

import kotlinx.serialization.Serializable

@Serializable
enum class HourFormat { SYSTEM, H12, H24 }

/** Patrones para TextClock / DateTimeFormatter. La fecha se localiza en la app con getBestDateTimePattern. */
object ClockPatterns {
    const val TIME_24 = "HH:mm"
    const val TIME_12 = "h:mm"
    const val AM_PM = "a"
    const val DATE_SKELETON_SHORT = "EEEdMMM"
    const val DATE_SKELETON_LONG = "EEEEdMMMM"

    fun is24(format: HourFormat, system24: Boolean): Boolean = when (format) {
        HourFormat.SYSTEM -> system24
        HourFormat.H12 -> false
        HourFormat.H24 -> true
    }

    fun timePattern(format: HourFormat, system24: Boolean): String =
        if (is24(format, system24)) TIME_24 else TIME_12
}
