package com.afinador.acustico.ui.components

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.border
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.State
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.clipPath
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.afinador.acustico.ui.theme.AppTheme
import com.afinador.core.StringTarget
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.roundToInt
import kotlin.math.sin

/** Geometría compartida entre el dibujo y los botones de cuerda superpuestos. */
private class HeadstockGeometry(val width: Float, val height: Float, sideReservePx: Float, keyPx: Float) {
    val cx = width / 2f
    val top = height * TOP
    val nutY = height * NUT
    val headHeight = nutY - top
    val halfTop = min(width / 2f - sideReservePx - keyPx, height * 0.30f).coerceAtLeast(width * 0.16f)
    val halfNut = halfTop * 0.60f
    val keyLength = keyPx

    /** Semiancho del clavijero a la altura y (estrechándose hacia la cejuela). */
    fun halfWidthAt(y: Float): Float {
        val t = ((y - top) / headHeight).coerceIn(0f, 1f)
        val curve = if (t < 0.78f) 1f - 0.08f * (t / 0.78f) else 0.92f - (0.92f - halfNut / halfTop) * ((t - 0.78f) / 0.22f).pow(0.8f)
        return halfTop * curve
    }

    fun postY(row: Int) = top + headHeight * (ROW_START + ROW_STEP * row)

    /** Clavija de cada cuerda: izquierda 6‑5‑4 de arriba abajo, derecha 1‑2‑3 (como en una guitarra real 3+3). */
    fun post(index: Int): Offset {
        val left = index <= 2
        val row = if (left) index else 5 - index
        val y = postY(row)
        val x = halfWidthAt(y) * 0.58f
        return Offset(if (left) cx - x else cx + x, y)
    }

    fun row(index: Int): Int = if (index <= 2) index else 5 - index

    fun keyEnd(index: Int): Offset {
        val p = post(index)
        val left = index <= 2
        val edge = halfWidthAt(p.y)
        return Offset(if (left) cx - edge - keyLength else cx + edge + keyLength, p.y)
    }

    fun stringAtNut(index: Int): Float = cx - halfNut * 0.78f + index * (halfNut * 1.56f / 5f)

    /** Posición de los trastes visibles según la regla del temperamento (distancia ∝ 1 − 2^(−n/12)). */
    fun fretY(n: Int): Float {
        val scale = (height - nutY) * 3.6f
        return nutY + scale * (1f - 2f.pow(-n / 12f))
    }

    companion object {
        const val TOP = 0.03f
        const val NUT = 0.60f
        const val ROW_START = 0.20f
        const val ROW_STEP = 0.24f
    }
}

/**
 * Clavijero y mástil de una guitarra acústica de seis cuerdas dibujados con Canvas.
 * La cuerda activa se ilumina con el color del estado de afinación y vibra mientras suena.
 */
@Composable
fun GuitarHeadstock(
    targets: List<StringTarget>,
    activeString: Int,
    statusColor: Color,
    hasPitch: Boolean,
    selectedString: Int?,
    onSelectString: (Int) -> Unit,
    modifier: Modifier = Modifier,
    overlay: @Composable BoxScope.(noteCenterY: Dp, neckWidth: Dp) -> Unit = { _, _ -> },
) {
    val colors = AppTheme.colors
    val glow by animateColorAsState(if (activeString >= 0) statusColor else Color.Transparent, label = "glow")
    val vibration = rememberVibration(hasPitch && activeString >= 0)

    BoxWithConstraints(modifier.fillMaxSize()) {
        val density = LocalDensity.current
        // En pantallas bajas la separación entre clavijas es menor que el botón: se achica el botón
        // (sin bajar de 40 dp para que siga siendo fácil de tocar) y, si aún no entra, la fila del
        // medio se desplaza hacia afuera en zigzag para que los botones no se tapen.
        val rowSpacing = maxHeight * (HeadstockGeometry.NUT - HeadstockGeometry.TOP) * HeadstockGeometry.ROW_STEP
        val buttonSize = minOf(if (maxWidth < 340.dp) 46.dp else 50.dp, maxOf(40.dp, rowSpacing * 0.95f))
        val zigzag = buttonSize > rowSpacing * 0.95f
        val zigzagShift = if (zigzag) buttonSize * 0.85f else 0.dp
        val keySize = if (maxWidth < 340.dp) 22.dp else 28.dp
        val geometry = with(density) {
            HeadstockGeometry(maxWidth.toPx(), maxHeight.toPx(), (buttonSize + zigzagShift + 8.dp).toPx(), keySize.toPx())
        }
        val wood = remember { woodPalette() }

        Canvas(Modifier.fillMaxSize()) {
            drawNeck(geometry, wood, colors.isDark)
            drawHeadstock(geometry, wood)
            drawTuners(geometry)
            drawStrings(geometry, activeString, glow, vibration.value)
            drawNut(geometry)
        }

        targets.forEach { target ->
            val end = geometry.keyEnd(target.index)
            val left = target.index <= 2
            val half = with(density) { buttonSize.toPx() / 2f }
            val gap = with(density) { 6.dp.toPx() + if (geometry.row(target.index) == 1) zigzagShift.toPx() else 0f }
            val x = if (left) end.x - gap - half * 2 else end.x + gap
            StringButton(
                target = target,
                active = target.index == activeString,
                selected = target.index == selectedString,
                activeColor = statusColor,
                size = buttonSize,
                onClick = { onSelectString(target.index) },
                modifier = Modifier.offset { IntOffset(x.roundToInt(), (end.y - half).roundToInt()) },
            )
        }

        with(density) {
            val noteY = (geometry.nutY + (geometry.height - geometry.nutY) * 0.5f).toDp()
            overlay(noteY, (geometry.halfNut * 2).toDp())
        }
    }
}

@Composable
private fun rememberVibration(active: Boolean): State<Float> {
    if (!active) return remember { androidx.compose.runtime.mutableFloatStateOf(0f) }
    val transition = rememberInfiniteTransition(label = "vibracion")
    return transition.animateFloat(
        initialValue = 0f,
        targetValue = (2 * Math.PI).toFloat(),
        animationSpec = infiniteRepeatable(tween(90, easing = LinearEasing), RepeatMode.Restart),
        label = "fase",
    )
}

@Composable
private fun StringButton(
    target: StringTarget,
    active: Boolean,
    selected: Boolean,
    activeColor: Color,
    size: Dp,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val colors = AppTheme.colors
    val border by animateColorAsState(
        when {
            active -> activeColor
            selected -> colors.accent
            else -> colors.outline
        },
        label = "borde",
    )
    val fill by animateColorAsState(if (active) activeColor.copy(alpha = 0.22f) else colors.surface, label = "relleno")
    Box(
        modifier
            .size(size)
            .shadow(if (active) 10.dp else 2.dp, CircleShape, ambientColor = border, spotColor = border)
            .clip(CircleShape)
            .background(fill)
            .border(if (active || selected) 2.5.dp else 1.5.dp, border, CircleShape)
            .clickable(onClick = onClick)
            .semantics {
                role = Role.Button
                this.selected = selected
                contentDescription = "Cuerda ${target.stringNumber}, ${target.name}"
            }
            .testTag("cuerda_${target.stringNumber}"),
        contentAlignment = Alignment.Center,
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(
                target.pitchName,
                color = if (active) activeColor else colors.text,
                fontSize = if (target.pitchName.length > 1) 16.sp else 19.sp,
                fontWeight = FontWeight.Bold,
                lineHeight = 18.sp,
            )
            Text(
                "${target.stringNumber}",
                color = colors.textMuted,
                fontSize = 10.sp,
                lineHeight = 10.sp,
            )
        }
    }
}

private class WoodPalette(val light: Color, val mid: Color, val dark: Color, val grain: List<Float>)

private fun woodPalette(): WoodPalette {
    // Vetas deterministas: el dibujo es idéntico en cada recomposición.
    val random = java.util.Random(42)
    return WoodPalette(
        light = Color(0xFFC98A4B),
        mid = Color(0xFF9A5B2B),
        dark = Color(0xFF5E3215),
        grain = List(26) { random.nextFloat() },
    )
}

private fun headstockPath(g: HeadstockGeometry): Path = Path().apply {
    val steps = 24
    moveTo(g.cx - g.halfNut, g.nutY)
    for (i in steps downTo 0) {
        val y = g.top + g.headHeight * 0.06f + (g.headHeight * 0.94f) * i / steps
        lineTo(g.cx - g.halfWidthAt(y), y)
    }
    // Corona curva con una leve muesca central.
    val crownY = g.top + g.headHeight * 0.06f
    cubicTo(
        g.cx - g.halfTop * 0.95f, g.top - g.headHeight * 0.01f,
        g.cx - g.halfTop * 0.35f, g.top - g.headHeight * 0.02f,
        g.cx, g.top + g.headHeight * 0.035f,
    )
    cubicTo(
        g.cx + g.halfTop * 0.35f, g.top - g.headHeight * 0.02f,
        g.cx + g.halfTop * 0.95f, g.top - g.headHeight * 0.01f,
        g.cx + g.halfWidthAt(crownY), crownY,
    )
    for (i in 0..steps) {
        val y = crownY + (g.nutY - crownY) * i / steps
        lineTo(g.cx + g.halfWidthAt(y), y)
    }
    close()
}

private fun DrawScope.drawHeadstock(g: HeadstockGeometry, wood: WoodPalette) {
    val path = headstockPath(g)
    // Sombra suave detrás de la pala.
    translate(0f, 6f) { drawPath(path, Color.Black.copy(alpha = 0.35f)) }
    drawPath(
        path,
        Brush.horizontalGradient(
            0f to wood.dark, 0.18f to wood.mid, 0.5f to wood.light, 0.82f to wood.mid, 1f to wood.dark,
            startX = g.cx - g.halfTop, endX = g.cx + g.halfTop,
        ),
    )
    // Vetas de la madera, recortadas a la forma de la pala.
    clipPath(path) {
        wood.grain.forEachIndexed { i, r ->
            val x = g.cx - g.halfTop + (2 * g.halfTop) * (i + r * 0.6f) / wood.grain.size
            val wave = (r - 0.5f) * g.halfTop * 0.08f
            val p = Path().apply {
                moveTo(x, g.top)
                cubicTo(x + wave, g.top + g.headHeight * 0.3f, x - wave, g.top + g.headHeight * 0.7f, x + wave * 0.5f, g.nutY)
            }
            drawPath(p, Color.Black.copy(alpha = 0.06f + 0.08f * r), style = Stroke(width = 1f + 2.2f * r))
        }
        // Brillo de laca.
        drawRect(
            Brush.verticalGradient(
                0f to Color.White.copy(alpha = 0.16f), 0.35f to Color.Transparent, 1f to Color.Black.copy(alpha = 0.25f),
                startY = g.top, endY = g.nutY,
            ),
        )
    }
    // Filete del borde.
    drawPath(path, Color(0xFF2A160A).copy(alpha = 0.8f), style = Stroke(width = 2.5f))
}

private fun DrawScope.drawTuners(g: HeadstockGeometry) {
    val metal = listOf(Color(0xFFF4F6F8), Color(0xFFB9C0C7), Color(0xFF6E767E), Color(0xFFD9DEE3))
    val postRadius = g.halfTop * 0.075f
    for (index in 0..5) {
        val post = g.post(index)
        val end = g.keyEnd(index)
        val left = index <= 2
        val edge = g.cx + (if (left) -1 else 1) * g.halfWidthAt(post.y)
        // Eje de la clavija.
        drawLine(Color(0xFF8E979F), Offset(edge, post.y), Offset(end.x + (if (left) g.keyLength * 0.55f else -g.keyLength * 0.55f), post.y), strokeWidth = postRadius * 0.9f)
        // Llave metálica ovalada.
        val keyW = g.keyLength * 0.75f
        val keyH = postRadius * 3.4f
        val keyLeft = if (left) end.x else end.x - keyW
        drawRoundRect(
            Brush.verticalGradient(metal, startY = post.y - keyH / 2, endY = post.y + keyH / 2),
            topLeft = Offset(keyLeft, post.y - keyH / 2),
            size = Size(keyW, keyH),
            cornerRadius = CornerRadius(keyH / 2, keyH / 2),
        )
        drawRoundRect(
            Color.Black.copy(alpha = 0.25f),
            topLeft = Offset(keyLeft, post.y - keyH / 2),
            size = Size(keyW, keyH),
            cornerRadius = CornerRadius(keyH / 2, keyH / 2),
            style = Stroke(1.2f),
        )
        // Buje y poste en la cara del clavijero.
        drawCircle(Brush.radialGradient(metal, center = post - Offset(postRadius * 0.4f, postRadius * 0.4f), radius = postRadius * 2.2f), postRadius * 1.6f, post)
        drawCircle(Color.Black.copy(alpha = 0.35f), postRadius * 1.6f, post, style = Stroke(1.2f))
        drawCircle(Color(0xFF9AA2AA), postRadius * 0.8f, post)
        drawCircle(Color(0xFF3E444A), postRadius * 0.35f, post)
    }
}

private fun DrawScope.drawNeck(g: HeadstockGeometry, wood: WoodPalette, dark: Boolean) {
    val neckLeft = g.cx - g.halfNut * 1.02f
    val neckRight = g.cx + g.halfNut * 1.02f
    val widen = g.halfNut * 0.06f
    val neck = Path().apply {
        moveTo(neckLeft, g.nutY)
        lineTo(neckRight, g.nutY)
        lineTo(neckRight + widen, size.height)
        lineTo(neckLeft - widen, size.height)
        close()
    }
    translate(0f, 4f) { drawPath(neck, Color.Black.copy(alpha = if (dark) 0.5f else 0.25f)) }
    // Diapasón de palo santo, más oscuro que el clavijero.
    drawPath(
        neck,
        Brush.horizontalGradient(
            0f to Color(0xFF24150D), 0.5f to Color(0xFF3B2416), 1f to Color(0xFF24150D),
            startX = neckLeft, endX = neckRight,
        ),
    )
    clipPath(neck) {
        wood.grain.take(14).forEachIndexed { i, r ->
            val x = neckLeft + (neckRight - neckLeft) * (i + r) / 14f
            drawLine(Color.Black.copy(alpha = 0.18f * r), Offset(x, g.nutY), Offset(x + (r - 0.5f) * 6f, size.height), strokeWidth = 1f + r)
        }
        // Marcadores de posición en los trastes 3 y 5.
        listOf(3, 5).forEach { fret ->
            val y = (g.fretY(fret - 1) + g.fretY(fret)) / 2f
            if (y < size.height) {
                drawCircle(Color(0xFFEDE6D6), g.halfNut * 0.11f, Offset(g.cx, y))
                drawCircle(Color.Black.copy(alpha = 0.2f), g.halfNut * 0.11f, Offset(g.cx, y), style = Stroke(1f))
            }
        }
        // Trastes de alpaca.
        for (n in 1..8) {
            val y = g.fretY(n)
            if (y > size.height) break
            drawLine(Color(0xFF6D7379), Offset(neckLeft - widen, y + 2f), Offset(neckRight + widen, y + 2f), strokeWidth = 3f)
            drawLine(Color(0xFFE3E7EB), Offset(neckLeft - widen, y), Offset(neckRight + widen, y), strokeWidth = 2.5f)
        }
    }
    // Filete claro a los costados del diapasón.
    drawLine(Color(0xFFE9DFC9).copy(alpha = 0.7f), Offset(neckLeft, g.nutY), Offset(neckLeft - widen, size.height), strokeWidth = 2f)
    drawLine(Color(0xFFE9DFC9).copy(alpha = 0.7f), Offset(neckRight, g.nutY), Offset(neckRight + widen, size.height), strokeWidth = 2f)
}

private fun DrawScope.drawNut(g: HeadstockGeometry) {
    val h = g.headHeight * 0.035f
    drawRoundRect(
        Brush.verticalGradient(listOf(Color(0xFFFBF7EE), Color(0xFFD9D0BC)), startY = g.nutY - h, endY = g.nutY + h),
        topLeft = Offset(g.cx - g.halfNut * 1.02f, g.nutY - h / 2),
        size = Size(g.halfNut * 2.04f, h),
        cornerRadius = CornerRadius(h / 3, h / 3),
    )
}

private fun DrawScope.drawStrings(g: HeadstockGeometry, active: Int, glow: Color, phase: Float) {
    for (index in 0..5) {
        val post = g.post(index)
        val nutX = g.stringAtNut(index)
        // Cuerdas entorchadas (6 a 3) color bronce; 2 y 1 lisas, plateadas.
        val wound = index <= 3
        val base = if (wound) Color(0xFFD7B57A) else Color(0xFFE6EAEE)
        val width = 1.4f + (5 - index) * 0.55f
        val isActive = index == active
        // Tramo del poste a la cejuela.
        drawLine(base.copy(alpha = 0.9f), post, Offset(nutX, g.nutY), strokeWidth = width, cap = StrokeCap.Round)
        // Tramo sobre el diapasón, con vibración visible si es la cuerda activa.
        val amplitude = if (isActive) 2.2f * sin(phase) else 0f
        val bottom = Offset(nutX + (nutX - g.cx) * 0.06f, size.height)
        if (isActive) {
            val mid = Offset((nutX + bottom.x) / 2f + amplitude, (g.nutY + size.height) / 2f)
            val path = Path().apply {
                moveTo(nutX, g.nutY)
                quadraticBezierTo(mid.x, mid.y, bottom.x, bottom.y)
            }
            drawPath(path, glow.copy(alpha = 0.28f), style = Stroke(width * 6f, cap = StrokeCap.Round))
            drawPath(path, glow, style = Stroke(width * 1.4f, cap = StrokeCap.Round))
            drawLine(glow, post, Offset(nutX, g.nutY), strokeWidth = width * 1.3f, cap = StrokeCap.Round)
        } else {
            drawLine(base, Offset(nutX, g.nutY), bottom, strokeWidth = width)
            drawLine(Color.Black.copy(alpha = 0.25f), Offset(nutX + width, g.nutY), Offset(bottom.x + width, bottom.y), strokeWidth = 1f)
        }
    }
}
