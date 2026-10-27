package com.afinador.acustico.ui.components

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.sp
import com.afinador.acustico.ui.theme.AppTheme
import com.afinador.core.TuningStatus
import java.util.Locale
import kotlin.math.cos
import kotlin.math.min
import kotlin.math.sin

/**
 * Medidor de afinación en arco, de −50 a +50 cents. La zona verde corresponde al margen de afinado
 * configurado, la ámbar a una desviación moderada y la roja a una desviación considerable.
 */
@Composable
fun TuningMeter(
    cents: Double,
    hasPitch: Boolean,
    toleranceCents: Double,
    status: TuningStatus,
    modifier: Modifier = Modifier,
) {
    val colors = AppTheme.colors
    val target = if (hasPitch && !cents.isNaN()) cents.coerceIn(-50.0, 50.0).toFloat() else 0f
    val animated by animateFloatAsState(
        target,
        animationSpec = spring(dampingRatio = 0.72f, stiffness = Spring.StiffnessMediumLow),
        label = "aguja",
    )
    val needleColor by animateColorAsState(if (hasPitch) colors.forStatus(status) else colors.textMuted.copy(alpha = 0.5f), label = "colorAguja")
    val measurer = rememberTextMeasurer()
    val labelStyle = TextStyle(color = colors.textMuted, fontSize = 11.sp)
    val description = if (hasPitch) String.format(Locale.ROOT, "Desviación %+.1f cents, %s", cents, status.label) else "Sin señal"

    Canvas(
        modifier
            .fillMaxWidth()
            .semantics { contentDescription = description }
            .testTag("medidor"),
    ) {
        val sweep = 140f
        val start = 270f - sweep / 2
        val radius = min(size.width * 0.46f, size.height * 0.92f)
        val center = Offset(size.width / 2f, size.height * 0.97f)
        val track = radius * 0.11f
        val arcTopLeft = Offset(center.x - radius, center.y - radius)
        val arcSize = Size(radius * 2, radius * 2)

        fun angleFor(c: Float) = start + sweep * ((c + 50f) / 100f)
        fun point(angleDeg: Float, r: Float): Offset {
            val a = Math.toRadians(angleDeg.toDouble())
            return Offset(center.x + r * cos(a).toFloat(), center.y + r * sin(a).toFloat())
        }

        // Fondo del arco.
        drawArc(colors.meterTrack, start, sweep, false, arcTopLeft, arcSize, style = Stroke(track, cap = StrokeCap.Round))
        // Zonas de color.
        val tol = toleranceCents.toFloat().coerceIn(0.5f, 15f)
        val far = TuningStatus.FAR_CENTS.toFloat()
        val zones = listOf(
            -50f to -far to colors.red,
            -far to -tol to colors.amber,
            -tol to tol to colors.accent,
            tol to far to colors.amber,
            far to 50f to colors.red,
        )
        zones.forEach { (range, color) ->
            val (from, to) = range
            val near = (target in from..to) && hasPitch
            drawArc(
                color.copy(alpha = if (near) 0.95f else 0.35f),
                angleFor(from), angleFor(to) - angleFor(from), false, arcTopLeft, arcSize,
                style = Stroke(track * if (near) 1f else 0.6f, cap = StrokeCap.Butt),
            )
        }
        // Marcas cada 5 cents; largas cada 10.
        for (c in -50..50 step 5) {
            val major = c % 10 == 0
            val a = angleFor(c.toFloat())
            val inner = radius - track * (if (major) 1.9f else 1.4f)
            drawLine(
                if (c == 0) colors.accent else colors.textMuted.copy(alpha = if (major) 0.8f else 0.45f),
                point(a, inner), point(a, radius - track * 0.9f),
                strokeWidth = if (c == 0) 4f else if (major) 2.5f else 1.5f,
                cap = StrokeCap.Round,
            )
        }
        listOf(-50, -25, 0, 25, 50).forEach { c ->
            val text = if (c > 0) "+$c" else "$c"
            val layout = measurer.measure(text, labelStyle)
            val p = point(angleFor(c.toFloat()), radius - track * 3.1f)
            drawText(layout, topLeft = Offset(p.x - layout.size.width / 2f, p.y - layout.size.height / 2f))
        }
        // Aguja.
        val needleAngle = angleFor(animated)
        val tip = point(needleAngle, radius - track * 0.3f)
        drawLine(needleColor.copy(alpha = 0.25f), center, tip, strokeWidth = 14f, cap = StrokeCap.Round)
        drawLine(needleColor, center, tip, strokeWidth = 5f, cap = StrokeCap.Round)
        drawCircle(needleColor, radius * 0.07f, center)
        drawCircle(Color.White.copy(alpha = 0.85f), radius * 0.028f, center)
    }
}
