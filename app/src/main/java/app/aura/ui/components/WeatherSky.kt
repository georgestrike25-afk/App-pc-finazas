package app.aura.ui.components

import android.provider.Settings
import androidx.compose.foundation.Canvas
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.graphics.lerp
import app.aura.core.weather.DayPhase
import app.aura.core.weather.WeatherCondition
import kotlinx.coroutines.isActive
import androidx.compose.runtime.withFrameMillis
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.sin
import kotlin.random.Random

/**
 * Cielo animado de la pantalla Clima, dibujado por código (sin imágenes ni videos): degradado según
 * el momento del día, sol o luna con estrellas, nubes a la deriva, lluvia, llovizna, nieve,
 * relámpagos y niebla, y un paisaje de colinas abajo.
 *
 * Batería: solo se anima mientras la pantalla está visible, a 30 cuadros por segundo como máximo,
 * y queda quieto si el sistema tiene las animaciones desactivadas.
 *
 * [horizon] es la altura (0–1) donde termina el paisaje; debajo el fondo se oscurece para las tarjetas.
 */
@Composable
fun WeatherSky(
    condition: WeatherCondition,
    phase: DayPhase,
    sunProgress: Float?,
    modifier: Modifier = Modifier,
    horizon: Float = 0.46f,
    /** 0–1: atenúa el cielo al desplazar el contenido hacia arriba. */
    dim: Float = 0f,
    /** Desplazamiento del contenido en px: el paisaje sube con él (paralaje) y no queda detrás de las tarjetas. */
    scroll: Float = 0f,
    animate: Boolean = true,
) {
    val context = LocalContext.current
    val motion = remember {
        animate && runCatching { Settings.Global.getFloat(context.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) }.getOrDefault(1f) > 0f
    }
    val time = remember { mutableFloatStateOf(7.3f) }
    if (motion) {
        LaunchedEffect(Unit) {
            var start = -1L
            var last = 0L
            while (isActive) {
                withFrameMillis { ms ->
                    if (start < 0) start = ms
                    if (ms - last >= FRAME_MS) {
                        last = ms
                        time.floatValue = (ms - start) / 1000f + 7.3f
                    }
                }
            }
        }
    }
    val scene = remember(condition, phase) { SkyScene.of(condition, phase) }
    val particles = remember { Particles(Random(7)) }

    Canvas(modifier) {
        val t = time.floatValue
        val lift = scroll * 0.7f
        // Fondo profundo debajo de todo, por si el paisaje ya subió.
        drawRect(scene.ground)
        translate(top = -lift) { drawScene(scene, particles, phase, sunProgress, t, horizon) }
        // La lluvia y la nieve cubren siempre toda la pantalla.
        when (scene.precipitation) {
            Precip.RAIN -> drawRain(particles.rain, t, heavy = true)
            Precip.DRIZZLE -> drawRain(particles.rain.take(70), t, heavy = false)
            Precip.SNOW -> drawSnow(particles.snow, t)
            Precip.NONE -> Unit
        }
        if (dim > 0f) drawRect(Color.Black.copy(alpha = 0.35f * dim.coerceIn(0f, 1f)))
    }
}

private fun DrawScope.drawScene(scene: SkyScene, particles: Particles, phase: DayPhase, sunProgress: Float?, t: Float, horizon: Float) {
    run {
        drawRect(Brush.verticalGradient(scene.sky, endY = size.height * horizon))
        // Debajo del horizonte: continúa en un tono profundo para que las tarjetas se lean bien.
        drawRect(
            Brush.verticalGradient(listOf(scene.sky.last(), scene.ground), startY = size.height * horizon * 0.9f, endY = size.height),
            topLeft = Offset(0f, size.height * horizon * 0.9f),
        )
        if (scene.stars > 0f) drawStars(particles, t, scene.stars, horizon)
        when (phase) {
            DayPhase.NIGHT -> if (scene.celestial > 0f) drawMoon(t, scene.celestial, horizon)
            else -> if (scene.celestial > 0f) drawSun(t, phase, sunProgress, scene.celestial, horizon)
        }
        drawClouds(particles, t, scene, horizon, back = true)
        if (scene.fog) drawFog(t, horizon)
        drawHills(scene, horizon)
        drawClouds(particles, t, scene, horizon, back = false)
        if (scene.lightning) drawLightning(t, horizon)
    }
}

private const val FRAME_MS = 33L

private enum class Precip { NONE, DRIZZLE, RAIN, SNOW }

/** Paleta y elementos de cada combinación de clima y momento del día. */
private class SkyScene(
    val sky: List<Color>,
    val ground: Color,
    val hillsFar: Color,
    val hillsNear: Color,
    val cloud: Color,
    /** Cantidad de nubes (0–8). */
    val clouds: Int,
    val stars: Float,
    val celestial: Float,
    val precipitation: Precip,
    val lightning: Boolean,
    val fog: Boolean,
) {
    companion object {
        fun of(c: WeatherCondition, phase: DayPhase): SkyScene {
            val overcast = c in setOf(WeatherCondition.CLOUDY, WeatherCondition.RAIN, WeatherCondition.DRIZZLE, WeatherCondition.THUNDERSTORM, WeatherCondition.SNOW, WeatherCondition.FOG)
            val clear = when (phase) {
                DayPhase.DAY -> listOf(Color(0xFF2C77C9), Color(0xFF5FA4E0), Color(0xFFA9D3F2))
                DayPhase.DAWN -> listOf(Color(0xFF263A6B), Color(0xFF8F6E9E), Color(0xFFF2A07B), Color(0xFFFAD08F))
                DayPhase.DUSK -> listOf(Color(0xFF1B2552), Color(0xFF7A4A80), Color(0xFFE07A5F), Color(0xFFF4B06A))
                DayPhase.NIGHT -> listOf(Color(0xFF050B1C), Color(0xFF0C1C3D), Color(0xFF1A3460))
            }
            val grey = when (phase) {
                DayPhase.DAY -> if (c == WeatherCondition.SNOW) listOf(Color(0xFF8197AB), Color(0xFFB9C7D3), Color(0xFFE2E9EF))
                else listOf(Color(0xFF4E5F70), Color(0xFF7D8E9D), Color(0xFFA8B5C0))
                DayPhase.DAWN, DayPhase.DUSK -> listOf(Color(0xFF2E3448), Color(0xFF5F5A6E), Color(0xFF9A8584))
                DayPhase.NIGHT -> listOf(Color(0xFF070C15), Color(0xFF131D2B), Color(0xFF243142))
            }.let { g -> if (c == WeatherCondition.THUNDERSTORM) g.map { lerp(it, Color(0xFF0B0F1A), 0.45f) } else g }
            val night = phase == DayPhase.NIGHT
            val sky = if (overcast) grey else clear
            return SkyScene(
                sky = sky,
                ground = if (night) Color(0xFF060B14) else lerp(sky.first(), Color(0xFF0B1626), 0.7f),
                hillsFar = lerp(sky.last(), if (night) Color(0xFF03060C) else Color(0xFF1F3A3A), if (night) 0.65f else 0.55f),
                hillsNear = lerp(sky.last(), if (night) Color(0xFF020409) else Color(0xFF112222), if (night) 0.85f else 0.78f),
                cloud = when {
                    c == WeatherCondition.THUNDERSTORM -> Color(0xFF3A4252)
                    night -> Color(0xFF8C9AB0)
                    overcast -> Color(0xFFD5DCE3)
                    phase == DayPhase.DAWN || phase == DayPhase.DUSK -> Color(0xFFFFE1C7)
                    else -> Color.White
                },
                clouds = when (c) {
                    WeatherCondition.CLEAR_DAY, WeatherCondition.CLEAR_NIGHT -> 1
                    WeatherCondition.PARTLY_CLOUDY_DAY, WeatherCondition.PARTLY_CLOUDY_NIGHT, WeatherCondition.WIND -> 4
                    WeatherCondition.FOG -> 3
                    else -> 8
                },
                stars = when {
                    !night -> 0f
                    overcast -> 0.15f
                    c == WeatherCondition.PARTLY_CLOUDY_NIGHT -> 0.7f
                    else -> 1f
                },
                celestial = when {
                    overcast -> if (c == WeatherCondition.CLOUDY || c == WeatherCondition.FOG) 0.25f else 0f
                    else -> 1f
                },
                precipitation = when (c) {
                    WeatherCondition.RAIN, WeatherCondition.THUNDERSTORM -> Precip.RAIN
                    WeatherCondition.DRIZZLE -> Precip.DRIZZLE
                    WeatherCondition.SNOW -> Precip.SNOW
                    else -> Precip.NONE
                },
                lightning = c == WeatherCondition.THUNDERSTORM,
                fog = c == WeatherCondition.FOG,
            )
        }
    }
}

/** Posiciones fijas (semilla constante): el cielo es el mismo cada vez que se abre la pantalla. */
private class Particles(r: Random) {
    val stars = List(90) { floatArrayOf(r.nextFloat(), r.nextFloat(), 0.6f + r.nextFloat() * 1.6f, r.nextFloat() * 6.28f, 0.6f + r.nextFloat() * 1.8f) }
    val rain = List(150) { floatArrayOf(r.nextFloat(), r.nextFloat(), 0.7f + r.nextFloat() * 0.6f, 0.4f + r.nextFloat() * 0.6f) }
    val snow = List(110) { floatArrayOf(r.nextFloat(), r.nextFloat(), 1.5f + r.nextFloat() * 3f, r.nextFloat() * 6.28f, 0.5f + r.nextFloat() * 0.8f) }
    /** x, y (fracción del horizonte), escala, velocidad, forma. */
    val clouds = List(8) { i -> floatArrayOf(r.nextFloat(), 0.10f + (i % 4) * 0.075f + r.nextFloat() * 0.05f, 0.7f + r.nextFloat() * 0.7f, 0.006f + r.nextFloat() * 0.012f, r.nextFloat()) }
}

private fun DrawScope.drawStars(p: Particles, t: Float, amount: Float, horizon: Float) {
    val top = size.height * horizon * 0.85f
    p.stars.forEach { s ->
        val twinkle = 0.55f + 0.45f * sin(t * s[4] + s[3])
        drawCircle(Color.White.copy(alpha = (0.85f * twinkle * amount).coerceIn(0f, 1f)), radius = s[2] * density * 0.8f, center = Offset(s[0] * size.width, s[1] * top))
    }
}

private fun DrawScope.drawSun(t: Float, phase: DayPhase, progress: Float?, strength: Float, horizon: Float) {
    val p = progress ?: if (phase == DayPhase.DAWN) 0.05f else if (phase == DayPhase.DUSK) 0.95f else 0.5f
    val h = size.height * horizon
    val c = Offset(size.width * (0.12f + 0.76f * p), h * (0.80f - 0.62f * sin(PI.toFloat() * p)))
    val r = size.width * 0.075f
    val warm = phase != DayPhase.DAY
    val core = if (warm) Color(0xFFFFC37A) else Color(0xFFFFF4D2)
    val glowColor = if (warm) Color(0xFFFF9E5E) else Color(0xFFFFE08A)
    val pulse = 1f + 0.06f * sin(t * 0.9f)
    drawCircle(Brush.radialGradient(listOf(glowColor.copy(alpha = 0.55f * strength), Color.Transparent), center = c, radius = r * 4.2f * pulse), radius = r * 4.2f * pulse, center = c)
    // Rayos suaves que giran despacio.
    rotate(t * 4f, pivot = c) {
        for (i in 0 until 12) {
            val a = i * (2 * PI / 12).toFloat()
            val len = r * (1.9f + 0.25f * sin(t * 1.3f + i))
            drawLine(
                glowColor.copy(alpha = 0.22f * strength),
                start = Offset(c.x + cos(a) * r * 1.25f, c.y + sin(a) * r * 1.25f),
                end = Offset(c.x + cos(a) * len, c.y + sin(a) * len),
                strokeWidth = r * 0.16f,
                cap = StrokeCap.Round,
            )
        }
    }
    drawCircle(core.copy(alpha = strength), radius = r, center = c)
    drawCircle(Brush.radialGradient(listOf(Color.White.copy(alpha = 0.9f * strength), Color.Transparent), center = c - Offset(r * 0.3f, r * 0.3f), radius = r), radius = r, center = c)
}

private fun DrawScope.drawMoon(t: Float, strength: Float, horizon: Float) {
    val c = Offset(size.width * 0.76f, size.height * horizon * 0.30f)
    val r = size.width * 0.06f
    val pulse = 1f + 0.04f * sin(t * 0.7f)
    drawCircle(Brush.radialGradient(listOf(Color(0xFFBFD4FF).copy(alpha = 0.35f * strength), Color.Transparent), center = c, radius = r * 4f * pulse), radius = r * 4f * pulse, center = c)
    // Luna creciente: disco claro recortado por otro del color del cielo.
    val moon = Path().apply { addOval(Rect(c, r)) }
    val bite = Path().apply { addOval(Rect(c + Offset(r * 0.55f, -r * 0.35f), r * 0.95f)) }
    val crescent = Path().apply { op(moon, bite, androidx.compose.ui.graphics.PathOperation.Difference) }
    drawPath(crescent, Color(0xFFF3F1E4).copy(alpha = strength))
}

private fun cloudPath(w: Float, shape: Float): Path = Path().apply {
    val h = w * 0.36f
    addRoundRect(androidx.compose.ui.geometry.RoundRect(Rect(0f, h * 0.45f, w, h), h * 0.3f, h * 0.3f))
    addOval(Rect(Offset(w * 0.28f, h * 0.48f), w * (0.17f + 0.04f * shape)))
    addOval(Rect(Offset(w * 0.52f, h * 0.36f), w * (0.22f - 0.03f * shape)))
    addOval(Rect(Offset(w * 0.75f, h * 0.55f), w * 0.15f))
}

private fun DrawScope.drawClouds(p: Particles, t: Float, scene: SkyScene, horizon: Float, back: Boolean) {
    val h = size.height * horizon
    p.clouds.take(scene.clouds).forEachIndexed { i, c ->
        if ((i % 2 == 0) != back) return@forEachIndexed
        val w = size.width * 0.30f * c[2] * (if (back) 0.8f else 1.05f)
        val span = size.width + w
        val x = ((c[0] + t * c[3] * (if (back) 0.6f else 1f)) % 1f) * span - w
        val y = h * c[1] * (if (scene.clouds >= 8) 1.15f else 1f)
        val path = cloudPath(w, c[4])
        val alpha = if (back) 0.55f else 0.85f
        translate(x, y) {
            // Borde suave: una versión algo mayor y más transparente detrás.
            translate(-w * 0.02f, -w * 0.02f) { drawPath(path, scene.cloud.copy(alpha = alpha * 0.25f)) }
            drawPath(path, Brush.verticalGradient(listOf(scene.cloud.copy(alpha = alpha), lerp(scene.cloud, Color(0xFF6E7C8C), 0.35f).copy(alpha = alpha)), startY = 0f, endY = w * 0.36f))
        }
    }
}

private fun DrawScope.drawHills(scene: SkyScene, horizon: Float) {
    val base = size.height * horizon
    val w = size.width
    val far = Path().apply {
        moveTo(0f, base - w * 0.10f)
        quadraticTo(w * 0.22f, base - w * 0.20f, w * 0.45f, base - w * 0.11f)
        quadraticTo(w * 0.70f, base - w * 0.02f, w, base - w * 0.16f)
        lineTo(w, base + 2f); lineTo(0f, base + 2f); close()
    }
    val near = Path().apply {
        moveTo(0f, base - w * 0.03f)
        quadraticTo(w * 0.35f, base - w * 0.12f, w * 0.62f, base - w * 0.04f)
        quadraticTo(w * 0.85f, base + w * 0.01f, w, base - w * 0.06f)
        lineTo(w, base + 2f); lineTo(0f, base + 2f); close()
    }
    drawPath(far, scene.hillsFar)
    drawPath(near, scene.hillsNear)
}

private fun DrawScope.drawRain(drops: List<FloatArray>, t: Float, heavy: Boolean) {
    val len = size.height * (if (heavy) 0.035f else 0.018f)
    val speed = size.height * (if (heavy) 1.25f else 0.7f)
    val color = Color(0xFFCFE3F5)
    drops.forEach { d ->
        val y = ((d[1] * size.height + t * speed * d[2]) % (size.height + len)) - len
        val x = (d[0] * size.width + y * 0.12f) % size.width
        drawLine(
            color.copy(alpha = (if (heavy) 0.45f else 0.35f) * d[3]),
            start = Offset(x, y), end = Offset(x + len * 0.12f, y + len * d[2]),
            strokeWidth = density * (if (heavy) 1.4f else 1f), cap = StrokeCap.Round,
        )
    }
}

private fun DrawScope.drawSnow(flakes: List<FloatArray>, t: Float) {
    flakes.forEach { f ->
        val y = ((f[1] * size.height + t * size.height * 0.07f * f[4]) % (size.height + 10f)) - 5f
        val x = f[0] * size.width + sin(t * 0.8f + f[3]) * 14f * density
        drawCircle(Color.White.copy(alpha = 0.55f + 0.35f * f[4] / 1.3f), radius = f[2] * density * 0.55f, center = Offset(x, y))
    }
}

private fun DrawScope.drawFog(t: Float, horizon: Float) {
    val h = size.height * horizon
    for (i in 0 until 4) {
        val y = h * (0.45f + i * 0.14f)
        val shift = sin(t * 0.15f + i) * size.width * 0.08f
        drawRect(
            Brush.horizontalGradient(listOf(Color.Transparent, Color.White.copy(alpha = 0.22f), Color.Transparent), startX = shift - size.width * 0.2f, endX = shift + size.width * 1.2f),
            topLeft = Offset(0f, y), size = Size(size.width, h * 0.12f),
        )
    }
}

private fun DrawScope.drawLightning(t: Float, horizon: Float) {
    // Un relámpago cada ~7 s: destello breve y un rayo que se apaga enseguida.
    val cycle = t % 7f
    if (cycle > 0.45f) return
    val k = if (cycle < 0.08f) 1f else if (cycle in 0.16f..0.24f) 0.7f else 0.25f
    drawRect(Color.White.copy(alpha = 0.22f * k))
    val x0 = size.width * (0.25f + 0.5f * ((t / 7f).toInt() % 3) / 2f)
    val h = size.height * horizon
    val bolt = Path().apply {
        moveTo(x0, h * 0.18f)
        lineTo(x0 - size.width * 0.05f, h * 0.42f)
        lineTo(x0 + size.width * 0.01f, h * 0.44f)
        lineTo(x0 - size.width * 0.06f, h * 0.72f)
    }
    drawPath(bolt, Color(0xFFFFF6C8).copy(alpha = 0.9f * k), style = Stroke(width = 3f * density, cap = StrokeCap.Round))
}
