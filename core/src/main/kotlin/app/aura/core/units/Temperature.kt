package app.aura.core.units

import kotlinx.serialization.Serializable
import kotlin.math.roundToInt

@Serializable
enum class TemperatureUnit(val symbol: String) {
    CELSIUS("C"),
    FAHRENHEIT("F");

    fun fromCelsius(celsius: Double): Double = when (this) {
        CELSIUS -> celsius
        FAHRENHEIT -> celsius * 9.0 / 5.0 + 32.0
    }
}

object TemperatureFormatter {
    /** Grados redondeados al entero más cercano; nunca devuelve "-0". */
    fun round(celsius: Double, unit: TemperatureUnit): Int {
        val value = unit.fromCelsius(celsius).roundToInt()
        return if (value == 0) 0 else value
    }

    /** "21°" — formato compacto para widgets. */
    fun short(celsius: Double, unit: TemperatureUnit): String = "${round(celsius, unit)}°"

    /** "21 °C" — formato explícito para la app. */
    fun withUnit(celsius: Double, unit: TemperatureUnit): String = "${round(celsius, unit)} °${unit.symbol}"

    /** "25° / 14°" */
    fun range(maxC: Double, minC: Double, unit: TemperatureUnit): String =
        "${short(maxC, unit)} / ${short(minC, unit)}"
}
