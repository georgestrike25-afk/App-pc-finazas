package com.afinador.acustico.ui

import java.util.Locale

/** Formatos numéricos en español rioplatense (coma decimal). */
object Format {
    private val locale = Locale.forLanguageTag("es-AR")

    fun hz(value: Double, decimals: Int = 1): String = String.format(locale, "%.${decimals}f Hz", value)

    fun number(value: Double, decimals: Int = 1): String = String.format(locale, "%.${decimals}f", value)

    /** "+2,1 cents", "−3,0 cents" o "0,0 cents". */
    fun cents(value: Double): String {
        val rounded = Math.round(value * 10.0) / 10.0
        val sign = when {
            rounded > 0 -> "+"
            rounded < 0 -> "−"
            else -> ""
        }
        return sign + String.format(locale, "%.1f", kotlin.math.abs(rounded)) + " cents"
    }

    /** A4 sin decimales innecesarios: "440 Hz", "441,5 Hz". */
    fun a4(value: Double): String =
        if (value % 1.0 == 0.0) "${value.toInt()} Hz" else String.format(locale, "%.1f Hz", value)
}
