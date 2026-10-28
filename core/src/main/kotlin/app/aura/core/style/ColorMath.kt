package app.aura.core.style

import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.roundToInt

/** Utilidades de color sobre enteros ARGB (mismo formato que android.graphics.Color). */
object ColorMath {
    fun alpha(argb: Int) = (argb ushr 24) and 0xFF
    fun red(argb: Int) = (argb shr 16) and 0xFF
    fun green(argb: Int) = (argb shr 8) and 0xFF
    fun blue(argb: Int) = argb and 0xFF

    fun argb(a: Int, r: Int, g: Int, b: Int): Int =
        (a.coerceIn(0, 255) shl 24) or (r.coerceIn(0, 255) shl 16) or (g.coerceIn(0, 255) shl 8) or b.coerceIn(0, 255)

    fun opaque(rgb: Int): Int = rgb or (0xFF shl 24)

    /** Convierte un porcentaje de opacidad (0–100) al canal alfa (0–255). */
    fun alphaFromPercent(percent: Int): Int = (percent.coerceIn(0, 100) * 255 / 100.0).roundToInt()

    fun withOpacity(rgb: Int, percent: Int): Int = (rgb and 0x00FFFFFF) or (alphaFromPercent(percent) shl 24)

    /** Mezcla [top] (con su alfa) sobre [bottom] opaco. */
    fun composite(top: Int, bottom: Int): Int {
        val a = alpha(top) / 255.0
        fun ch(t: Int, b: Int) = (t * a + b * (1 - a)).roundToInt()
        return argb(255, ch(red(top), red(bottom)), ch(green(top), green(bottom)), ch(blue(top), blue(bottom)))
    }

    /** Luminancia relativa WCAG 2.x. */
    fun luminance(argb: Int): Double {
        fun lin(c: Int): Double {
            val s = c / 255.0
            return if (s <= 0.04045) s / 12.92 else ((s + 0.055) / 1.055).pow(2.4)
        }
        return 0.2126 * lin(red(argb)) + 0.7152 * lin(green(argb)) + 0.0722 * lin(blue(argb))
    }

    /** Relación de contraste WCAG entre dos colores opacos (1.0–21.0). */
    fun contrast(a: Int, b: Int): Double {
        val la = luminance(a)
        val lb = luminance(b)
        return (max(la, lb) + 0.05) / (min(la, lb) + 0.05)
    }

    fun toHex(argb: Int, includeAlpha: Boolean = false): String =
        if (includeAlpha) "#%08X".format(argb) else "#%06X".format(argb and 0xFFFFFF)

    fun parseHex(hex: String): Int? {
        val clean = hex.trim().removePrefix("#")
        return when (clean.length) {
            6 -> clean.toLongOrNull(16)?.toInt()?.let { opaque(it) }
            8 -> clean.toLongOrNull(16)?.toInt()
            else -> null
        }
    }
}
