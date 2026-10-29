package app.aura.ui.components

import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Dp
import app.aura.core.weather.WeatherCondition
import app.aura.ui.icons.WeatherIcons

/**
 * Icono meteorológico de dos capas, idéntico al de los widgets: base neutra teñida con [ink] y
 * acento de color (o teñido con [accentTint] en modo monocromo / superficies claras).
 */
@Composable
fun WeatherIcon(
    condition: WeatherCondition,
    size: Dp,
    ink: Color,
    modifier: Modifier = Modifier,
    accentTint: Color? = null,
    contentDescription: String? = null,
    realistic: Boolean = false,
) {
    val layers = WeatherIcons.layers(condition)
    Box(
        modifier = modifier
            .size(size)
            .then(if (contentDescription != null) Modifier.semantics { this.contentDescription = contentDescription } else Modifier),
    ) {
        if (realistic) {
            Image(painter = painterResource(layers.realistic), contentDescription = null, modifier = Modifier.fillMaxSize())
            return@Box
        }
        if (layers.hasBase) {
            Image(
                painter = painterResource(layers.base),
                contentDescription = null,
                colorFilter = ColorFilter.tint(ink, BlendMode.SrcIn),
                modifier = Modifier.fillMaxSize(),
            )
        }
        if (layers.hasAccent) {
            Image(
                painter = painterResource(layers.accent),
                contentDescription = null,
                colorFilter = accentTint?.let { ColorFilter.tint(it, BlendMode.SrcIn) },
                modifier = Modifier.fillMaxSize(),
            )
        }
    }
}
