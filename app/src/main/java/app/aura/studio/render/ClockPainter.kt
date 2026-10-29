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

/** Lo que hay detrás del reloj: imagen y su colocación en el lienzo (para el modo camaleón). */
class Backdrop(val bitmap: Bitmap, val matrix: android.graphics.Matrix)

/**
 * Pinta el reloj 3D paramétrico sobre un Canvas de software. Lo usan la vista previa, la exportación
 * y el fondo animado, así los tres muestran exactamente lo mismo.
 *
 * Capas (de atrás hacia adelante): sombra difusa → extrusión (profundidad) → brillo (neón) →
 * cara con el material → bisel (luz y sombra en el borde) → reflejo.
 */
class ClockPainter(private val fonts: (String) -> Typeface? = { null }) {
    private val paint = Paint(Paint.ANTI_ALIAS_FLAG or Paint.SUBPIXEL_TEXT_FLAG)
    private var stoneTexture: Bitmap? = null

    fun draw(canvas: Canvas, width: Int, height: Int, rawDesign: ClockDesign, extras: ClockExtras, backdrop: Backdrop? = null) {
        val d = rawDesign.normalized()
        val textSize = d.size * width
        val custom = d.customFont?.let(fonts)
        val family = custom ?: Typeface.create(d.font.androidFamily, Typeface.NORMAL)
        val hoursFace = when {
            !d.boldHours -> family
            custom != null -> Typeface.create(custom, Typeface.BOLD)
            else -> Typeface.create(Typeface.SANS_SERIF, Typeface.BOLD)
        }
        val cx = d.centerX * width
        val cy = d.centerY * height
        // Transformación del reloj: giro y estiramiento alrededor de su centro.
        val transform = android.graphics.Matrix().apply {
            postScale(d.stretchX, d.stretchY, cx, cy)
            postRotate(d.rotation, cx, cy)
        }
        val total0 = run {
            // Ancho total para la caja de la deformación (mismo cálculo que más abajo).
            var t = 0f
            listOf(extras.hours to hoursFace, extras.minutes to family).forEach { (txt, face) ->
                paint.reset(textSize, face, d.letterSpacing); t += paint.measureText(txt)
            }
            t
        }
        val spreadPx = d.spread * width * 0.5f
        val warpMatrix = warpMatrix(d, transform, cx - total0 / 2f - spreadPx, cy, total0 + 2 * spreadPx, textSize, width, height)
        // Transformación completa del reloj en pantalla: deformación ∘ (giro + estiramiento).
        val full = android.graphics.Matrix(transform).apply { warpMatrix?.let { postConcat(it) } }
        val camo = if (d.chameleon > 0 && backdrop != null) chameleonShader(backdrop, full, d) else null
        val camoTone = if (camo != null) averageBehind(backdrop!!, cx, cy, textSize * d.stretchX * 2.2f, textSize * d.stretchY) else null

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

        val outer = canvas.save()
        canvas.concat(full)
        val layer = canvas.saveLayerAlpha(null, (d.opacity * 255 / 100f).roundToInt())
        // Separación: las horas se alejan hacia la izquierda y los minutos hacia la derecha.
        val positions = listOf(startX - spreadPx, startX + runs[0].width + spreadPx)

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
            // En modo camaleón el canto toma el tono medio del fondo, más oscuro.
            val side = camoTone?.let { mix(sideColor(d), shade(it, 0.6f), d.chameleon / 100f) } ?: sideColor(d)
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
            if (camo != null) {
                paint.reset(textSize, r.face, d.letterSpacing)
                paint.shader = camo
                paint.alpha = (255 * d.chameleon / 100f).roundToInt()
                paint.colorFilter = liftFilter(d.chameleonLift)
                canvas.drawText(r.text, px, baseline, paint)
            }
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
        canvas.restoreToCount(outer)

        // Subtítulo (fecha · clima), sobrio y legible; acompaña la posición y el alto del reloj.
        extras.subtitle?.takeIf { it.isNotBlank() }?.let { sub ->
            paint.reset(width * 0.042f, Typeface.create("sans-serif", Typeface.NORMAL), 0.02f)
            val sw = paint.measureText(sub)
            val sy = cy + (baseline - cy + textSize * 0.34f) * d.stretchY + width * 0.03f
            paint.color = withAlpha(Color.BLACK, 120)
            paint.maskFilter = BlurMaskFilter(width * 0.006f, BlurMaskFilter.Blur.NORMAL)
            canvas.drawText(sub, d.centerX * width - sw / 2f, sy + width * 0.003f, paint)
            paint.maskFilter = null
            paint.color = withAlpha(d.color, (d.opacity * 2.4f).roundToInt().coerceIn(0, 240))
            canvas.drawText(sub, d.centerX * width - sw / 2f, sy, paint)
        }
    }

    /**
     * Esquinas del reloj en pantalla (arriba-izq., arriba-der., abajo-der., abajo-izq.; pares x,y),
     * ya giradas, estiradas y deformadas: son los tiradores del modo «Deformar».
     */
    fun quad(width: Int, height: Int, rawDesign: ClockDesign, extras: ClockExtras): FloatArray {
        val d = rawDesign.normalized()
        val textSize = d.size * width
        val custom = d.customFont?.let(fonts)
        val family = custom ?: Typeface.create(d.font.androidFamily, Typeface.NORMAL)
        val hoursFace = if (d.boldHours) (custom?.let { Typeface.create(it, Typeface.BOLD) } ?: Typeface.create(Typeface.SANS_SERIF, Typeface.BOLD)) else family
        var total = 0f
        listOf(extras.hours to hoursFace, extras.minutes to family).forEach { (t, f) -> paint.reset(textSize, f, d.letterSpacing); total += paint.measureText(t) }
        val cx = d.centerX * width
        val cy = d.centerY * height
        val spreadPx = d.spread * width * 0.5f
        val transform = android.graphics.Matrix().apply { postScale(d.stretchX, d.stretchY, cx, cy); postRotate(d.rotation, cx, cy) }
        val pts = boxCorners(cx - total / 2f - spreadPx, cy, total + 2 * spreadPx, textSize)
        transform.mapPoints(pts)
        if (d.warp.size == 8) for (i in 0 until 8) pts[i] += d.warp[i] * (if (i % 2 == 0) width else height)
        return pts
    }

    /** Caja de los números (sin transformar): arriba-izq., arriba-der., abajo-der., abajo-izq. */
    private fun boxCorners(left: Float, cy: Float, w: Float, textSize: Float): FloatArray {
        val baseline = cy + textSize * 0.36f
        val top = baseline - textSize * 0.80f
        val bottom = baseline + textSize * 0.08f
        return floatArrayOf(left, top, left + w, top, left + w, bottom, left, bottom)
    }

    /** Deformación por esquinas en coordenadas de pantalla (después del giro y el estiramiento). */
    private fun warpMatrix(d: ClockDesign, transform: android.graphics.Matrix, left: Float, cy: Float, w: Float, textSize: Float, width: Int, height: Int): android.graphics.Matrix? {
        if (d.warp.size != 8) return null
        val src = boxCorners(left, cy, w, textSize)
        transform.mapPoints(src)
        val dst = FloatArray(8) { i -> src[i] + d.warp[i] * (if (i % 2 == 0) width else height) }
        return android.graphics.Matrix().takeIf { it.setPolyToPoly(src, 0, dst, 0, 4) }
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

    /**
     * La foto que queda detrás de los números, alineada píxel a píxel aunque el reloj esté girado o
     * estirado: matriz local = transformación del reloj⁻¹ · colocación de la foto.
     */
    private fun chameleonShader(b: Backdrop, transform: android.graphics.Matrix, d: ClockDesign): Shader {
        val inverse = android.graphics.Matrix()
        transform.invert(inverse)
        val local = android.graphics.Matrix(b.matrix).apply { postConcat(inverse) }
        return BitmapShader(b.bitmap, Shader.TileMode.CLAMP, Shader.TileMode.CLAMP).apply { setLocalMatrix(local) }
    }

    /** Aclarar/oscurecer el camuflaje: escala y desplazamiento de luminancia. */
    private fun liftFilter(lift: Int): android.graphics.ColorFilter? {
        if (lift == 0) return null
        val k = lift / 100f
        val scale = if (k > 0) 1f - 0.35f * k else 1f + k * 0.6f
        val offset = if (k > 0) 255f * 0.45f * k else 0f
        val m = floatArrayOf(
            scale, 0f, 0f, 0f, offset,
            0f, scale, 0f, 0f, offset,
            0f, 0f, scale, 0f, offset,
            0f, 0f, 0f, 1f, 0f,
        )
        return android.graphics.ColorMatrixColorFilter(m)
    }

    /** Color medio del fondo en la zona del reloj (8×8 muestras). */
    private fun averageBehind(b: Backdrop, cx: Float, cy: Float, w: Float, h: Float): Int {
        val sample = Bitmap.createBitmap(8, 8, Bitmap.Config.ARGB_8888)
        val m = android.graphics.Matrix(b.matrix).apply {
            postTranslate(-(cx - w / 2f), -(cy - h / 2f))
            postScale(8f / max(1f, w), 8f / max(1f, h))
        }
        Canvas(sample).drawBitmap(b.bitmap, m, Paint(Paint.FILTER_BITMAP_FLAG))
        var r = 0
        var g = 0
        var bl = 0
        val px = IntArray(64)
        sample.getPixels(px, 0, 8, 0, 0, 8, 8)
        px.forEach { r += Color.red(it); g += Color.green(it); bl += Color.blue(it) }
        sample.recycle()
        return Color.rgb(r / 64, g / 64, bl / 64)
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
