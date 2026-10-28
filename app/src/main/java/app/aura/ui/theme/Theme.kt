package app.aura.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.ColorScheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.aura.core.settings.ThemeMode

/** Paleta de marca de Aura (ver docs/DISENO.md). */
object AuraPalette {
    val Night = Color(0xFF101D2B)
    val Deep = Color(0xFF18364A)
    val Petrol = Color(0xFF244B5B)
    val Solar = Color(0xFFFFC857)
    val White = Color(0xFFFFFFFF)
    val Mist = Color(0xFFDCE3E8)
    val Paper = Color(0xFFF5F7F8)

    // Derivados para superficies (no son colores de marca, solo escalones tonales).
    val NightRaised = Color(0xFF15273A)
    val Ink = Color(0xFF101D2B)
    val InkMuted = Color(0xFF52626F)
    val MistMuted = Color(0xFF9FB0BD)
    val SolarDeep = Color(0xFFB07A00)
    val Danger = Color(0xFFE5806B)
}

/** Tokens semánticos propios que Material 3 no modela. */
@Immutable
data class AuraTokens(
    val accent: Color,
    val onAccent: Color,
    val heroText: Color,
    val mutedText: Color,
    val card: Color,
    val cardBorder: Color,
    val stale: Color,
)

private val DarkTokens = AuraTokens(
    accent = AuraPalette.Solar,
    onAccent = AuraPalette.Night,
    heroText = AuraPalette.White,
    mutedText = AuraPalette.MistMuted,
    card = AuraPalette.NightRaised,
    cardBorder = Color(0x1FFFFFFF),
    stale = AuraPalette.Solar,
)

private val LightTokens = AuraTokens(
    accent = AuraPalette.Solar,
    onAccent = AuraPalette.Night,
    heroText = AuraPalette.Ink,
    mutedText = AuraPalette.InkMuted,
    card = AuraPalette.White,
    cardBorder = Color(0x14101D2B),
    stale = AuraPalette.SolarDeep,
)

val LocalAuraTokens = staticCompositionLocalOf { DarkTokens }

private val DarkScheme: ColorScheme = darkColorScheme(
    primary = AuraPalette.Solar,
    onPrimary = AuraPalette.Night,
    primaryContainer = AuraPalette.Petrol,
    onPrimaryContainer = AuraPalette.White,
    secondary = AuraPalette.Mist,
    onSecondary = AuraPalette.Night,
    secondaryContainer = AuraPalette.Deep,
    onSecondaryContainer = AuraPalette.White,
    tertiary = AuraPalette.Solar,
    background = AuraPalette.Night,
    onBackground = AuraPalette.White,
    surface = AuraPalette.Night,
    onSurface = AuraPalette.White,
    surfaceVariant = AuraPalette.Deep,
    onSurfaceVariant = AuraPalette.Mist,
    surfaceContainer = AuraPalette.NightRaised,
    surfaceContainerHigh = AuraPalette.Deep,
    surfaceContainerLow = AuraPalette.NightRaised,
    outline = Color(0x33FFFFFF),
    outlineVariant = Color(0x1FFFFFFF),
    error = AuraPalette.Danger,
)

private val LightScheme: ColorScheme = lightColorScheme(
    primary = AuraPalette.Deep,
    onPrimary = AuraPalette.White,
    primaryContainer = AuraPalette.Mist,
    onPrimaryContainer = AuraPalette.Night,
    secondary = AuraPalette.Petrol,
    onSecondary = AuraPalette.White,
    secondaryContainer = AuraPalette.Mist,
    onSecondaryContainer = AuraPalette.Night,
    tertiary = AuraPalette.SolarDeep,
    background = AuraPalette.Paper,
    onBackground = AuraPalette.Ink,
    surface = AuraPalette.Paper,
    onSurface = AuraPalette.Ink,
    surfaceVariant = AuraPalette.Mist,
    onSurfaceVariant = AuraPalette.InkMuted,
    surfaceContainer = AuraPalette.White,
    surfaceContainerHigh = AuraPalette.Mist,
    surfaceContainerLow = AuraPalette.White,
    outline = Color(0x33101D2B),
    outlineVariant = Color(0x1A101D2B),
)

/** Números tabulares: la hora no "baila" al cambiar de minuto. */
private const val TABULAR = "tnum"

private val AuraTypography = Typography(
    displayLarge = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.Light, fontSize = 88.sp, lineHeight = 92.sp, letterSpacing = (-2).sp, fontFeatureSettings = TABULAR),
    displayMedium = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.Light, fontSize = 64.sp, lineHeight = 68.sp, letterSpacing = (-1.5).sp, fontFeatureSettings = TABULAR),
    displaySmall = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.Light, fontSize = 44.sp, lineHeight = 50.sp, letterSpacing = (-0.5).sp, fontFeatureSettings = TABULAR),
    headlineMedium = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.Normal, fontSize = 26.sp, lineHeight = 32.sp),
    titleLarge = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.Medium, fontSize = 20.sp, lineHeight = 26.sp),
    titleMedium = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.Medium, fontSize = 16.sp, lineHeight = 22.sp),
    titleSmall = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.Medium, fontSize = 14.sp, lineHeight = 20.sp, letterSpacing = 0.1.sp),
    bodyLarge = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.Normal, fontSize = 16.sp, lineHeight = 24.sp),
    bodyMedium = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.Normal, fontSize = 14.sp, lineHeight = 20.sp),
    bodySmall = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.Normal, fontSize = 12.sp, lineHeight = 16.sp),
    labelLarge = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.Medium, fontSize = 14.sp, lineHeight = 20.sp, letterSpacing = 0.1.sp),
    labelMedium = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.Medium, fontSize = 12.sp, lineHeight = 16.sp, letterSpacing = 0.4.sp),
    labelSmall = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.Medium, fontSize = 11.sp, lineHeight = 14.sp, letterSpacing = 0.6.sp),
)

private val AuraShapes = Shapes(
    extraSmall = RoundedCornerShape(8.dp),
    small = RoundedCornerShape(12.dp),
    medium = RoundedCornerShape(20.dp),
    large = RoundedCornerShape(28.dp),
    extraLarge = RoundedCornerShape(36.dp),
)

@Composable
fun AuraTheme(mode: ThemeMode = ThemeMode.SYSTEM, content: @Composable () -> Unit) {
    val dark = when (mode) {
        ThemeMode.SYSTEM -> isSystemInDarkTheme()
        ThemeMode.LIGHT -> false
        ThemeMode.DARK -> true
    }
    androidx.compose.runtime.CompositionLocalProvider(LocalAuraTokens provides if (dark) DarkTokens else LightTokens) {
        MaterialTheme(
            colorScheme = if (dark) DarkScheme else LightScheme,
            typography = AuraTypography,
            shapes = AuraShapes,
            content = content,
        )
    }
}

object Aura {
    val tokens: AuraTokens
        @Composable get() = LocalAuraTokens.current
}
