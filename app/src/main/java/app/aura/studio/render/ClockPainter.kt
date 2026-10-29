package app.aura.studio.render

import android.graphics.Bitmap
import android.graphics.BitmapShader
import android.graphics.BlurMaskFilter
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.Rect
import android.graphics.Shader
import android.graphics.Typeface
import app.aura.core.studio.ClockDesign
import app.aura.core.studio.ClockMaterial
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.roundToInt
import kotlin.math.sin
import kotlin.random.Random

/** Texto que acompaña a la hora (fecha y clima en caché), ya formateado por quien llama. */
data class ClockExtras(val hours: String, val minutes: String, val subtitle: String?)

/**
 * Pinta el reloj 3D paramétrico sobre un Canvas de software. Lo usan la vista previa, la exportación
 * y el fondo animado, así los tres muestran exactamente lo mismo.
 *
 * Capas (de atrás hacia adelante): sombra difusa → extrusión (profundidad) → brillo (neón) →
 * cara con el material → bisel (luz y sombra en el borde) → reflejo.
 */
class ClockPainter {
    private val paint = Paint(Paint.ANTI_ALIAS_FLAG or Paint.SUBPIXEL_TEXT_FLAG)
    private var stoneTexture: Bitmap? = null

    fun draw(canvas: Canvas, width: Int, height: Int, rawDesign: ClockDesign, extras: ClockExtras) {
        val d = rawDesign.normalized()
        val textSize = d.size * width
        val family = Typeface.create(d.font.androidFamily, Typeface.NORMAL)
        val hoursFace = if (d.boldHours) Typeface.create(Typeface.SANS_SERIF, Typeface.BOLD) else family

        val runs = listOf(Run(extras.hours, hoursFace), Run(extras.minutes, family))
        runs.forEach { r ->
            paint.reset(textSize, r.face, d.letterSpacing)
            r.width = paint.measureText(r.text)
        }
        val total = runs.sumOf { it.width.toDouble() }.toFloat()
        val startX = d.centerX * width - total / 2f
        val baseline = d.centerY * height + textSize * 0.36f

        // Luz: vector unitario hacia donde llega; la sombra y la extrusión van al lado contrario.
        val a = Math.toRadians(d.lightAngle.toDouble())
        val lx = cos(a).toFloat()
        val ly = sin(a).toFloat()

        val layer = canvas.saveLayerAlpha(0f, 0f, width.toFloat(), height.toFloat(), (d.opacity * 255 / 100f).roundToInt())
        var x = startX
        val positions = runs.map { r -> (x).also { x += r.width } }

        fun eachRun(block: (Run, Float) -> Unit) = runs.forEachIndexed { i, r -> block(r, positions[i]) }

        // 1. Sombra difusa
        if (d.shadow > 0) {
            val dist = textSize * (0.03f + 0.07f * d.shadow / 100f)
            eachRun { r, px ->
                paint.reset(textSize, r.face, d.letterSpacing)
                paint.color = Color.argb((90 + 120 * d.shadow / 100f).roundToInt().coerceAtMost(220), 0, 0, 0)
                paint.maskFilter = BlurMaskFilter(textSize * (0.02f + 0.06f * d.shadow / 100f), BlurMaskFilter.Blur.NORMAL)
                canvas.drawText(r.text, px - lx * dist, baseline - ly * dist, paint)
            }
        }

        // 2. Extrusión: copias apiladas cada vez más oscuras en dirección opuesta a la luz.
        val depthPx = textSize * 0.09f * d.depth / 100f
        if (depthPx >= 1f) {
            val steps = depthPx.roundToInt().coerceIn(1, 48)
            val side = sideColor(d)
            for (s in steps downTo 1) {
                val t = s / steps.toFloat()
                eachRun { r, px ->
                    paint.reset(textSize, r.face, d.letterSpacing)
                    paint.color = shade(side, 1f - 0.45f * t)
                    canvas.drawText(r.text, px - lx * depthPx * t, baseline - ly * depthPx * t, paint)
                }
            }
        }

        // 3. Brillo (neón y cualquier material con «glow»)
        if (d.glow > 0) {
            val glowColor = if (d.material == ClockMaterial.NEON) d.accentColor else d.color
            listOf(0.22f, 0.10f, 0.04f).forEach { k ->
                eachRun { r, px ->
                    paint.reset(textSize, r.face, d.letterSpacing)
                    paint.color = withAlpha(glowColor, (60 + 150 * d.glow / 100f).roundToInt().coerceAtMost(230))
                    paint.maskFilter = BlurMaskFilter(textSize * k * (0.4f + d.glow / 100f), BlurMaskFilter.Blur.NORMAL)
                    canvas.drawText(r.text, px, baseline, paint)
                }
            }
        }

        // 4. Cara
        val top = baseline - textSize * 0.74f
        val bottom = baseline + textSize * 0.02f
        eachRun { r, px ->
            paint.reset(textSize, r.face, d.letterSpacing)
            applyFace(paint, d, top, bottom, px, r.width)
            canvas.drawText(r.text, px, baseline, paint)
            if (d.material == ClockMaterial.GLASS) {
                paint.reset(textSize, r.face, d.letterSpacing)
                paint.style = Paint.Style.STROKE
                paint.strokeWidth = max(1f, textSize * 0.012f)
                paint.color = withAlpha(Color.WHITE, 170)
                canvas.drawText(r.text, px, baseline, paint)
            }
        }

        // 5. Bisel: borde iluminado hacia la luz y en sombra del lado opuesto.
        if (d.bevel > 0) {
            val w = max(1f, textSize * 0.018f * d.bevel / 100f)
            val off = w * 0.6f
            eachRun { r, px ->
                paint.reset(textSize, r.face, d.letterSpacing)
                paint.style = Paint.Style.STROKE
                paint.strokeWidth = w
                paint.color = withAlpha(Color.WHITE, (60 + 140 * d.bevel / 100f).roundToInt())
                canvas.drawText(r.text, px + lx * off, baseline + ly * off, paint)
                paint.color = withAlpha(Color.BLACK, (40 + 110 * d.bevel / 100f).roundToInt())
                canvas.drawText(r.text, px - lx * off, baseline - ly * off, paint)
            }
        }

        // 6. Reflejo: brillo especular en la mitad superior.
        if (d.reflection > 0) {
            eachRun { r, px ->
                paint.reset(textSize, r.face, d.letterSpacing)
                paint.shader = LinearGradient(
                    0f, top, 0f, top + (bottom - top) * 0.55f,
                    intArrayOf(withAlpha(Color.WHITE, (200 * d.reflection / 100f).roundToInt()), Color.TRANSPARENT),
                    null, Shader.TileMode.CLAMP,
                )
                canvas.drawText(r.text, px, baseline, paint)
            }
        }
        canvas.restoreToCount(layer)

        // Subtítulo (fecha · clima), sobrio y legible.
        extras.subtitle?.takeIf { it.isNotBlank() }?.let { sub ->
            paint.reset(width * 0.042f, Typeface.create("sans-serif", Typeface.NORMAL), 0.02f)
            val sw = paint.measureText(sub)
            val sy = baseline + textSize * 0.34f + width * 0.03f
            paint.color = withAlpha(Color.BLACK, 120)
            paint.maskFilter = BlurMaskFilter(width * 0.006f, BlurMaskFilter.Blur.NORMAL)
            canvas.drawText(sub, d.centerX * width - sw / 2f, sy + width * 0.003f, paint)
            paint.maskFilter = null
            paint.color = withAlpha(d.color, (d.opacity * 2.4f).roundToInt().coerceIn(0, 240))
            canvas.drawText(sub, d.centerX * width - sw / 2f, sy, paint)
        }
    }

    /** Caja del reloj en el lienzo, para tocarlo y moverlo en el editor. */
    fun bounds(width: Int, height: Int, d: ClockDesign, extras: ClockExtras): Rect {
        val n = d.normalized()
        val textSize = n.size * width
        paint.reset(textSize, Typeface.create(n.font.androidFamily, Typeface.NORMAL), n.letterSpacing)
        val w = paint.measureText(extras.hours + extras.minutes) * 1.08f
        val cx = n.centerX * width
        val cy = n.centerY * height
        return Rect((cx - w / 2).toInt(), (cy - textSize * 0.55f).toInt(), (cx + w / 2).toInt(), (cy + textSize * 0.75f).toInt())
    }

    private fun applyFace(p: Paint, d: ClockDesign, top: Float, bottom: Float, left: Float, width: Float) {
        when (d.material) {
            ClockMaterial.MINIMAL -> p.color = d.color
            ClockMaterial.METAL -> {
                val tint = mix(Color.WHITE, d.accentColor, 0.25f)
                p.shader = LinearGradient(
                    0f, top, 0f, bottom,
                    intArrayOf(lighten(tint, 0.6f), tint, shade(tint, 0.45f), lighten(tint, 0.35f), shade(tint, 0.6f)),
                    floatArrayOf(0f, 0.35f, 0.52f, 0.7f, 1f), Shader.TileMode.CLAMP,
                )
            }
            ClockMaterial.GLASS -> {
                p.shader = LinearGradient(
                    0f, top, 0f, bottom,
                    intArrayOf(withAlpha(d.color, 150), withAlpha(d.color, 60), withAlpha(d.color, 110)),
                    null, Shader.TileMode.CLAMP,
                )
            }
            ClockMaterial.NEON -> p.color = mix(Color.WHITE, d.accentColor, 0.25f)
            ClockMaterial.STONE -> {
                p.shader = BitmapShader(stone(), Shader.TileMode.REPEAT, Shader.TileMode.REPEAT)
                p.colorFilter = android.graphics.PorterDuffColorFilter(withAlpha(d.color, 90), android.graphics.PorterDuff.Mode.MULTIPLY)
            }
        }
    }

    private fun sideColor(d: ClockDesign): Int = when (d.material) {
        ClockMaterial.METAL -> shade(mix(Color.WHITE, d.accentColor, 0.3f), 0.55f)
        ClockMaterial.GLASS -> withAlpha(shade(d.color, 0.6f), 120)
        ClockMaterial.NEON -> shade(d.accentColor, 0.4f)
        ClockMaterial.STONE -> 0xFF4E4A46.toInt()
        ClockMaterial.MINIMAL -> shade(d.color, 0.55f)
    }

    /** Textura de granito procedural (sin imágenes externas), generada una sola vez. */
    private fun stone(): Bitmap = stoneTexture ?: Bitmap.createBitmap(STONE_SIZE, STONE_SIZE, Bitmap.Config.ARGB_8888).also { bmp ->
        val rnd = Random(42)
        val px = IntArray(STONE_SIZE * STONE_SIZE) {
            val v = 150 + rnd.nextInt(70)
            val fleck = if (rnd.nextInt(40) == 0) -70 else 0
            val g = (v + fleck).coerceIn(0, 255)
            Color.rgb(g, (g * 0.97f).toInt(), (g * 0.92f).toInt())
        }
        bmp.setPixels(px, 0, STONE_SIZE, 0, 0, STONE_SIZE, STONE_SIZE)
        stoneTexture = bmp
    }

    private class Run(val text: String, val face: Typeface) {
        var width = 0f
    }

    companion object {
        private const val STONE_SIZE = 128

        private fun Paint.reset(size: Float, face: Typeface, spacing: Float) {
            reset()
            isAntiAlias = true
            isSubpixelText = true
            textSize = size
            typeface = face
            letterSpacing = spacing
        }

        fun withAlpha(c: Int, a: Int) = Color.argb(a.coerceIn(0, 255), Color.red(c), Color.green(c), Color.blue(c))
        fun shade(c: Int, k: Float) = Color.argb(Color.alpha(c), (Color.red(c) * k).toInt(), (Color.green(c) * k).toInt(), (Color.blue(c) * k).toInt())
        fun lighten(c: Int, k: Float) = mix(c, Color.WHITE, k)
        fun mix(a: Int, b: Int, t: Float) = Color.argb(
            (Color.alpha(a) + (Color.alpha(b) - Color.alpha(a)) * t).toInt(),
            (Color.red(a) + (Color.red(b) - Color.red(a)) * t).toInt(),
            (Color.green(a) + (Color.green(b) - Color.green(a)) * t).toInt(),
            (Color.blue(a) + (Color.blue(b) - Color.blue(a)) * t).toInt(),
        )
    }
}
