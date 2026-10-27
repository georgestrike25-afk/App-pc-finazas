package com.afinador.acustico.ui.components

import androidx.compose.animation.animateColorAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.path
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.afinador.acustico.ui.theme.AppTheme
import com.afinador.core.TuningStatus

/** Íconos propios dibujados como vectores (sin recursos de terceros). */
object AppIcons {
    private fun outline(name: String, block: androidx.compose.ui.graphics.vector.PathBuilder.() -> Unit) =
        ImageVector.Builder(name, 24.dp, 24.dp, 24f, 24f).path(
            fill = null,
            stroke = SolidColor(Color.Black),
            strokeLineWidth = 1.8f,
            strokeLineCap = StrokeCap.Round,
            strokeLineJoin = StrokeJoin.Round,
            pathBuilder = block,
        ).build()

    /** Clavijero con seis clavijas. */
    val Headstock: ImageVector = outline("clavijero") {
        moveTo(9f, 21f); lineTo(9f, 14f); lineTo(7.5f, 4.5f)
        quadTo(12f, 1.5f, 16.5f, 4.5f); lineTo(15f, 14f); lineTo(15f, 21f)
        moveTo(5f, 6f); lineTo(8f, 6f); moveTo(4.5f, 9f); lineTo(8.5f, 9f); moveTo(5f, 12f); lineTo(8.8f, 12f)
        moveTo(16f, 6f); lineTo(19f, 6f); moveTo(15.5f, 9f); lineTo(19.5f, 9f); moveTo(15.2f, 12f); lineTo(19f, 12f)
    }

    /** Onda sonora (modo cromático). */
    val Wave: ImageVector = outline("onda") {
        moveTo(2f, 12f); lineTo(5f, 12f); lineTo(7f, 6f); lineTo(10f, 18f); lineTo(13f, 4f)
        lineTo(16f, 20f); lineTo(18f, 9f); lineTo(19.5f, 12f); lineTo(22f, 12f)
    }

    /** Lista con notas (afinaciones). */
    val Tunings: ImageVector = outline("afinaciones") {
        moveTo(4f, 6f); lineTo(14f, 6f); moveTo(4f, 11f); lineTo(14f, 11f); moveTo(4f, 16f); lineTo(10f, 16f)
        moveTo(18f, 4f); lineTo(18f, 16f); moveTo(18f, 4f); lineTo(21f, 5.5f)
        moveTo(18f, 16f); arcTo(2f, 2f, 0f, true, true, 17.99f, 16f)
    }

    /** Engranaje simplificado (ajustes). */
    val Settings: ImageVector = outline("ajustes") {
        moveTo(12f, 15f); arcTo(3f, 3f, 0f, true, true, 12.01f, 15f)
        moveTo(12f, 2.5f); lineTo(12f, 5f); moveTo(12f, 19f); lineTo(12f, 21.5f)
        moveTo(2.5f, 12f); lineTo(5f, 12f); moveTo(19f, 12f); lineTo(21.5f, 12f)
        moveTo(5.3f, 5.3f); lineTo(7f, 7f); moveTo(17f, 17f); lineTo(18.7f, 18.7f)
        moveTo(18.7f, 5.3f); lineTo(17f, 7f); moveTo(7f, 17f); lineTo(5.3f, 18.7f)
        moveTo(12f, 19f); arcTo(7f, 7f, 0f, true, true, 12.01f, 19f)
    }
}

/** Píldora con el estado textual de afinación. */
@Composable
fun StatusPill(status: TuningStatus, hasPitch: Boolean, modifier: Modifier = Modifier) {
    val colors = AppTheme.colors
    val color by animateColorAsState(if (hasPitch) colors.forStatus(status) else colors.textMuted, label = "estado")
    val text = if (hasPitch) {
        if (status == TuningStatus.IN_TUNE) "✓ ¡Afinada!" else status.label
    } else {
        TuningStatus.WAITING.label
    }
    Box(
        modifier
            .clip(RoundedCornerShape(50))
            .background(color.copy(alpha = 0.16f))
            .border(1.dp, color.copy(alpha = 0.6f), RoundedCornerShape(50))
            .padding(horizontal = 18.dp, vertical = 6.dp)
            .semantics(mergeDescendants = true) {}
            .testTag("estado"),
    ) {
        Text(text, color = color, fontWeight = FontWeight.SemiBold, fontSize = 15.sp)
    }
}

/** Indicador de nivel y calidad de la señal en cinco barras. */
@Composable
fun SignalBars(level: Float, quality: Float, modifier: Modifier = Modifier) {
    val colors = AppTheme.colors
    val bars = (level * 5f).toInt().coerceIn(0, 5)
    val good = quality >= 0.85f
    Row(
        modifier.semantics { contentDescription = "Nivel de señal $bars de 5" },
        horizontalArrangement = Arrangement.spacedBy(2.dp),
        verticalAlignment = Alignment.Bottom,
    ) {
        for (i in 0 until 5) {
            Box(
                Modifier
                    .width(4.dp)
                    .height((6 + i * 3).dp)
                    .clip(RoundedCornerShape(2.dp))
                    .background(
                        when {
                            i >= bars -> colors.outline
                            good -> colors.accent
                            else -> colors.amber
                        },
                    ),
            )
        }
    }
}

/** Botón redondo con texto (−, +). */
@Composable
fun RoundTextButton(text: String, onClick: () -> Unit, modifier: Modifier = Modifier, size: Dp = 40.dp, description: String = text, tag: String? = null) {
    val colors = AppTheme.colors
    Box(
        modifier
            .size(size)
            .clip(CircleShape)
            .background(colors.panel)
            .border(1.dp, colors.outline, CircleShape)
            .clickable(onClick = onClick)
            .semantics { contentDescription = description }
            .let { if (tag != null) it.testTag(tag) else it },
        contentAlignment = Alignment.Center,
    ) {
        Text(text, color = colors.accent, fontSize = 22.sp, fontWeight = FontWeight.Bold)
    }
}

/** Tarjeta de panel con el estilo de la app. */
@Composable
fun Panel(modifier: Modifier = Modifier, content: @Composable () -> Unit) {
    val colors = AppTheme.colors
    Box(
        modifier
            .clip(RoundedCornerShape(18.dp))
            .background(colors.surface)
            .border(1.dp, colors.outline, RoundedCornerShape(18.dp)),
    ) { content() }
}

@Composable
fun SectionTitle(text: String, modifier: Modifier = Modifier) {
    Text(
        text,
        modifier = modifier.padding(start = 4.dp, top = 18.dp, bottom = 8.dp),
        color = AppTheme.colors.accent,
        fontWeight = FontWeight.SemiBold,
        fontSize = 14.sp,
    )
}

@Composable
fun IconLabel(icon: ImageVector, label: String, value: String, modifier: Modifier = Modifier, onClick: (() -> Unit)? = null) {
    val colors = AppTheme.colors
    Column(
        modifier
            .clip(RoundedCornerShape(12.dp))
            .let { if (onClick != null) it.clickable(onClick = onClick) else it }
            .padding(horizontal = 8.dp, vertical = 6.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Icon(icon, contentDescription = null, tint = colors.accent, modifier = Modifier.size(20.dp))
        Spacer(Modifier.height(2.dp))
        Text(label, color = colors.textMuted, fontSize = 11.sp, maxLines = 1)
        Text(value, color = colors.text, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, maxLines = 1)
    }
}

/** Fila de ancho completo para listas de ajustes. */
@Composable
fun SettingRow(
    title: String,
    modifier: Modifier = Modifier,
    subtitle: String? = null,
    onClick: (() -> Unit)? = null,
    trailing: @Composable () -> Unit = {},
) {
    val colors = AppTheme.colors
    Row(
        modifier
            .fillMaxWidth()
            .let { if (onClick != null) it.clickable(onClick = onClick) else it }
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text(title, color = colors.text, fontSize = 15.sp)
            if (subtitle != null) Text(subtitle, color = colors.textMuted, fontSize = 12.sp)
        }
        trailing()
    }
}
