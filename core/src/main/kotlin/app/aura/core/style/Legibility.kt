package app.aura.core.style

/**
 * Evalúa si el texto de un widget será legible. Con fondo transparente el contraste depende del
 * fondo de pantalla, así que se compara contra el color dominante que informa Android
 * (WallpaperManager#getWallpaperColors) cuando está disponible.
 */
object Legibility {
    /** WCAG AA para texto grande (la hora y la temperatura lo son). */
    const val LARGE_TEXT_MIN = 3.0

    /** Tono medio de las escenas ilustradas (llevan un velo oscuro del lado del texto). */
    private const val SCENE_TYPICAL = 0xFF3A4C61.toInt()

    data class Report(val ratio: Double, val passes: Boolean, val surface: Int)

    fun evaluate(style: WidgetStyle, wallpaperColor: Int): Report {
        val base = if (style.usesScene) ColorMath.composite(ColorMath.withOpacity(SCENE_TYPICAL, style.opacity), ColorMath.opaque(wallpaperColor))
        else ColorMath.opaque(wallpaperColor)
        val surface = style.backgroundArgb()?.let { ColorMath.composite(it, base) } ?: base
        val ratio = ColorMath.contrast(ColorMath.opaque(style.textColor), surface)
        // La sombra suave añade separación local; se tolera algo menos de contraste global.
        val threshold = if (style.textShadow) LARGE_TEXT_MIN - 0.5 else LARGE_TEXT_MIN
        return Report(ratio, ratio >= threshold, surface)
    }

    /** Color de texto recomendado (blanco o azul noche) para una superficie dada. */
    fun recommendedText(surface: Int): Int =
        if (ColorMath.contrast(Brand.WHITE, surface) >= ColorMath.contrast(Brand.NIGHT, surface)) Brand.WHITE else Brand.NIGHT
}
