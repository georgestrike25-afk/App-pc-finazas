package com.afinador.acustico.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import com.afinador.acustico.data.ThemeMode
import com.afinador.core.TuningStatus

/** Paleta propia del afinador, además del esquema de Material 3. */
@Immutable
data class TunerColors(
    val isDark: Boolean,
    val background: Color,
    val surface: Color,
    val panel: Color,
    val outline: Color,
    val text: Color,
    val textMuted: Color,
    val accent: Color,
    val accentSoft: Color,
    val amber: Color,
    val red: Color,
    val meterTrack: Color,
) {
    fun forStatus(status: TuningStatus): Color = when (status) {
        TuningStatus.IN_TUNE -> accent
        TuningStatus.SLIGHTLY_LOW, TuningStatus.SLIGHTLY_HIGH -> amber
        TuningStatus.TOO_LOW, TuningStatus.TOO_HIGH -> red
        TuningStatus.WAITING -> textMuted
    }
}

/** Colores de marca de EnTono. */
object BrandColors {
    val Graphite = Color(0xFF1E1E1E)
    val Green = Color(0xFF00C853)
    val GreenDark = Color(0xFF0A6B45)
}

val DarkTunerColors = TunerColors(
    isDark = true,
    background = BrandColors.Graphite,
    surface = Color(0xFF262626),
    panel = Color(0xFF2E2E2E),
    outline = Color(0xFF3B3B3B),
    text = Color(0xFFF2F2F2),
    textMuted = Color(0xFFA3A8A5),
    accent = BrandColors.Green,
    accentSoft = Color(0x3300C853),
    amber = Color(0xFFFFB020),
    red = Color(0xFFFF5A5F),
    meterTrack = Color(0xFF353535),
)

// En el tema claro el verde principal no contrasta lo suficiente sobre blanco para textos:
// se usa el verde secundario de la marca.
val LightTunerColors = TunerColors(
    isDark = false,
    background = Color(0xFFF4F5F4),
    surface = Color(0xFFFFFFFF),
    panel = Color(0xFFECEFED),
    outline = Color(0xFFD3D9D6),
    text = Color(0xFF1E1E1E),
    textMuted = Color(0xFF5B635F),
    accent = BrandColors.GreenDark,
    accentSoft = Color(0x260A6B45),
    amber = Color(0xFFB86E00),
    red = Color(0xFFD93A40),
    meterTrack = Color(0xFFDDE3E0),
)

val LocalTunerColors = staticCompositionLocalOf { DarkTunerColors }

object AppTheme {
    val colors: TunerColors @Composable get() = LocalTunerColors.current
}

@Composable
fun isDarkTheme(mode: ThemeMode): Boolean = when (mode) {
    ThemeMode.SYSTEM -> isSystemInDarkTheme()
    ThemeMode.LIGHT -> false
    ThemeMode.DARK -> true
}

private val AppTypography = Typography().run {
    copy(
        displayLarge = displayLarge.copy(fontWeight = FontWeight.Bold),
        headlineSmall = headlineSmall.copy(fontWeight = FontWeight.SemiBold),
        titleLarge = titleLarge.copy(fontWeight = FontWeight.SemiBold),
        titleMedium = titleMedium.copy(fontWeight = FontWeight.SemiBold),
        labelLarge = labelLarge.copy(fontWeight = FontWeight.SemiBold),
    )
}

/** Números tabulares para que las cifras no "bailen" mientras cambian. */
val NumberStyle = TextStyle(fontFamily = FontFamily.Default, fontFeatureSettings = "tnum", fontSize = 14.sp)

@Composable
fun AfinadorTheme(dark: Boolean, content: @Composable () -> Unit) {
    val c = if (dark) DarkTunerColors else LightTunerColors
    val scheme = if (dark) {
        darkColorScheme(
            primary = c.accent, onPrimary = Color(0xFF00210E),
            primaryContainer = c.accentSoft, onPrimaryContainer = c.accent,
            secondary = c.accent, onSecondary = Color(0xFF00210E),
            background = c.background, onBackground = c.text,
            surface = c.surface, onSurface = c.text,
            surfaceVariant = c.panel, onSurfaceVariant = c.textMuted,
            surfaceContainer = c.surface, surfaceContainerHigh = c.panel, surfaceContainerHighest = c.panel,
            outline = c.outline, outlineVariant = c.outline,
            error = c.red,
        )
    } else {
        lightColorScheme(
            primary = c.accent, onPrimary = Color.White,
            primaryContainer = c.accentSoft, onPrimaryContainer = BrandColors.GreenDark,
            secondary = c.accent, onSecondary = Color.White,
            background = c.background, onBackground = c.text,
            surface = c.surface, onSurface = c.text,
            surfaceVariant = c.panel, onSurfaceVariant = c.textMuted,
            surfaceContainer = c.surface, surfaceContainerHigh = c.panel, surfaceContainerHighest = c.panel,
            outline = c.outline, outlineVariant = c.outline,
            error = c.red,
        )
    }
    CompositionLocalProvider(LocalTunerColors provides c) {
        MaterialTheme(colorScheme = scheme, typography = AppTypography, content = content)
    }
}
