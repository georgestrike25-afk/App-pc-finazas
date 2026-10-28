package app.aura.core.style

import app.aura.core.time.HourFormat
import kotlinx.serialization.Serializable

@Serializable
enum class BackgroundMode { TRANSPARENT, GLASS, DARK, LIGHT, CUSTOM }

@Serializable
enum class IconStyle { COLOR, MONO }

/** Familias tipográficas del sistema que los widgets pueden usar sin incrustar fuentes. */
@Serializable
enum class FontChoice(val androidFamily: String) {
    LIGHT("sans-serif-light"),
    REGULAR("sans-serif"),
    MEDIUM("sans-serif-medium"),
    CONDENSED("sans-serif-condensed"),
}

@Serializable
enum class Alignment { START, CENTER, END }

@Serializable
enum class Spacing(val paddingDp: Int, val gapDp: Int) {
    COMPACT(8, 2),
    NORMAL(14, 4),
    RELAXED(20, 8),
}

/**
 * Apariencia completa de un widget. Se serializa en DataStore por cada appWidgetId, de modo que
 * cada widget colocado conserva su propia configuración.
 */
@Serializable
data class WidgetStyle(
    val background: BackgroundMode = BackgroundMode.TRANSPARENT,
    /** Solo para [BackgroundMode.CUSTOM]; RGB (el alfa se ignora). */
    val customBackgroundColor: Int = Brand.PETROL,
    /** 0–100. Se ignora en modo transparente. */
    val opacity: Int = 0,
    val textColor: Int = Brand.WHITE,
    /** Color de las partes neutras de los iconos (nubes, gotas de nieve, niebla) y del modo mono. */
    val iconColor: Int = Brand.WHITE,
    val iconStyle: IconStyle = IconStyle.COLOR,
    /** Escala de la hora y de la temperatura en %, 70–140. */
    val timeScale: Int = 100,
    val temperatureScale: Int = 100,
    val font: FontChoice = FontChoice.LIGHT,
    val alignment: Alignment = Alignment.START,
    val spacing: Spacing = Spacing.NORMAL,
    val textShadow: Boolean = true,
    val showDate: Boolean = true,
    val showLocation: Boolean = true,
    val showHighLow: Boolean = true,
    val hourFormat: HourFormat = HourFormat.SYSTEM,
) {
    /** Color ARGB final del fondo, o null si el widget es completamente transparente. */
    fun backgroundArgb(): Int? {
        val rgb = when (background) {
            BackgroundMode.TRANSPARENT -> return null
            BackgroundMode.GLASS -> Brand.WHITE
            BackgroundMode.DARK -> Brand.NIGHT
            BackgroundMode.LIGHT -> Brand.PAPER
            BackgroundMode.CUSTOM -> customBackgroundColor
        }
        if (opacity <= 0) return null
        return ColorMath.withOpacity(rgb, opacity)
    }

    /** El modo cristal añade un filo claro de 1 dp que delimita el panel sin opacarlo. */
    val showsGlassEdge: Boolean get() = background == BackgroundMode.GLASS && opacity > 0

    fun normalized(): WidgetStyle = copy(
        opacity = if (background == BackgroundMode.TRANSPARENT) 0 else opacity.coerceIn(0, 100),
        timeScale = timeScale.coerceIn(MIN_SCALE, MAX_SCALE),
        temperatureScale = temperatureScale.coerceIn(MIN_SCALE, MAX_SCALE),
    )

    companion object {
        const val MIN_SCALE = 70
        const val MAX_SCALE = 140
    }
}

@Serializable
enum class ProfileId { MINIMAL, GLASS, DARK, LIGHT, CUSTOM }

object Profiles {
    val MINIMAL = WidgetStyle()

    val GLASS = WidgetStyle(
        background = BackgroundMode.GLASS,
        opacity = 16,
        textShadow = false,
        font = FontChoice.REGULAR,
    )

    val DARK = WidgetStyle(
        background = BackgroundMode.DARK,
        opacity = 88,
        textShadow = false,
        textColor = Brand.WHITE,
        iconColor = Brand.MIST,
        font = FontChoice.LIGHT,
    )

    val LIGHT = WidgetStyle(
        background = BackgroundMode.LIGHT,
        opacity = 92,
        textShadow = false,
        textColor = Brand.NIGHT,
        iconColor = Brand.PETROL,
        font = FontChoice.REGULAR,
    )

    val CUSTOM = WidgetStyle(
        background = BackgroundMode.CUSTOM,
        customBackgroundColor = Brand.PETROL,
        opacity = 60,
        textShadow = false,
        font = FontChoice.MEDIUM,
        alignment = Alignment.CENTER,
    )

    fun preset(id: ProfileId): WidgetStyle = when (id) {
        ProfileId.MINIMAL -> MINIMAL
        ProfileId.GLASS -> GLASS
        ProfileId.DARK -> DARK
        ProfileId.LIGHT -> LIGHT
        ProfileId.CUSTOM -> CUSTOM
    }

    fun displayName(id: ProfileId): String = when (id) {
        ProfileId.MINIMAL -> "Aura Minimal"
        ProfileId.GLASS -> "Aura Glass"
        ProfileId.DARK -> "Aura Dark"
        ProfileId.LIGHT -> "Aura Light"
        ProfileId.CUSTOM -> "Aura Custom"
    }
}

/** Configuración persistida de un widget concreto. */
@Serializable
data class WidgetConfig(
    val profile: ProfileId = ProfileId.MINIMAL,
    val style: WidgetStyle = Profiles.preset(profile),
)
