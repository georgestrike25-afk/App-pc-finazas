package app.aura.studio.render

import android.graphics.Bitmap
import android.graphics.BitmapShader
import android.graphics.BlurMaskFilter
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.Rect
import android.graphics.RectF
import android.graphics.Shader
import android.graphics.Typeface
import app.aura.core.studio.ClockDesign
import app.aura.core.studio.ClockLayout
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
        val lay = layout(d, extras, width, height)
        val textSize = lay.textSize
        val cx = d.centerX * width
        val cy = d.centerY * height
        val transform = lay.transform
        val warpMatrix = warpMatrix(d, transform, lay.box, width, height)
        // Transformación completa del reloj en pantalla: deformación ∘ (giro + estiramiento).
        val full = android.graphics.Matrix(transform).apply { warpMatrix?.let { postConcat(it) } }
        val camo = if (d.chameleon > 0 && backdrop != null) chameleonShader(backdrop, full, d) else null
        val camoTone = if (camo != null) {
            averageBehind(backdrop!!, cx, cy, lay.box.width() * d.stretchX, lay.box.height() * d.stretchY)
        } else {
            null
        }
        val runs = lay.runs

        // Luz: vector unitario hacia donde llega; la sombra y la extrusión van al lado contrario.
        val a = Math.toRadians(d.lightAngle.toDouble())
        val lx = cos(a).toFloat()
        val ly = sin(a).toFloat()

        val outer = canvas.save()
        canvas.concat(full)
        val layer = canvas.saveLayerAlpha(null, (d.opacity * 255 / 100f).roundToInt())

        // 1. Sombra difusa
        if (d.shadow > 0) {
            val dist = textSize * (0.03f + 0.07f * d.shadow / 100f)
            runs.forEach { r ->
                paint.reset(textSize, r.face, d.letterSpacing)
                paint.color = Color.argb((90 + 120 * d.shadow / 100f).roundToInt().coerceAtMost(220), 0, 0, 0)
                paint.maskFilter = BlurMaskFilter(textSize * (0.02f + 0.06f * d.shadow / 100f), BlurMaskFilter.Blur.NORMAL)
                canvas.drawText(r.text, r.x - lx * dist, r.baseline - ly * dist, paint)
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
                runs.forEach { r ->
                    paint.reset(textSize, r.face, d.letterSpacing)
                    paint.color = shade(side, 1f - 0.45f * t)
                    canvas.drawText(r.text, r.x - lx * depthPx * t, r.baseline - ly * depthPx * t, paint)
                }
            }
        }

        // 3. Brillo (neón y cualquier material con «glow»)
        if (d.glow > 0) {
            val glowColor = if (d.material == ClockMaterial.NEON) d.accentColor else d.color
            listOf(0.22f, 0.10f, 0.04f).forEach { k ->
                runs.forEach { r ->
                    paint.reset(textSize, r.face, d.letterSpacing)
                    paint.color = withAlpha(glowColor, (60 + 150 * d.glow / 100f).roundToInt().coerceAtMost(230))
                    paint.maskFilter = BlurMaskFilter(textSize * k * (0.4f + d.glow / 100f), BlurMaskFilter.Blur.NORMAL)
                    canvas.drawText(r.text, r.x, r.baseline, paint)
                }
            }
        }

        // 4. Cara
        runs.forEach { r ->
            val top = r.baseline - textSize * 0.74f
            val bottom = r.baseline + textSize * 0.02f
            paint.reset(textSize, r.face, d.letterSpacing)
            applyFace(paint, d, top, bottom, r.x, r.width)
            canvas.drawText(r.text, r.x, r.baseline, paint)
            if (camo != null) {
                paint.reset(textSize, r.face, d.letterSpacing)
                paint.shader = camo
                paint.alpha = (255 * d.chameleon / 100f).roundToInt()
                paint.colorFilter = liftFilter(d.chameleonLift)
                canvas.drawText(r.text, r.x, r.baseline, paint)
            }
            if (d.material == ClockMaterial.GLASS) {
                paint.reset(textSize, r.face, d.letterSpacing)
                paint.style = Paint.Style.STROKE
                paint.strokeWidth = max(1f, textSize * 0.012f)
                paint.color = withAlpha(Color.WHITE, 170)
                canvas.drawText(r.text, r.x, r.baseline, paint)
            }
        }

        // 5. Bisel: borde iluminado hacia la luz y en sombra del lado opuesto.
        if (d.bevel > 0) {
            val w = max(1f, textSize * 0.018f * d.bevel / 100f)
            val off = w * 0.6f
            runs.forEach { r ->
                paint.reset(textSize, r.face, d.letterSpacing)
                paint.style = Paint.Style.STROKE
                paint.strokeWidth = w
                paint.color = withAlpha(Color.WHITE, (60 + 140 * d.bevel / 100f).roundToInt())
                canvas.drawText(r.text, r.x + lx * off, r.baseline + ly * off, paint)
                paint.color = withAlpha(Color.BLACK, (40 + 110 * d.bevel / 100f).roundToInt())
                canvas.drawText(r.text, r.x - lx * off, r.baseline - ly * off, paint)
            }
        }

        // 6. Reflejo: brillo especular en la mitad superior de cada línea.
        if (d.reflection > 0) {
            runs.forEach { r ->
                val top = r.baseline - textSize * 0.74f
                val bottom = r.baseline + textSize * 0.02f
                paint.reset(textSize, r.face, d.letterSpacing)
                paint.shader = LinearGradient(
                    0f, top, 0f, top + (bottom - top) * 0.55f,
                    intArrayOf(withAlpha(Color.WHITE, (200 * d.reflection / 100f).roundToInt()), Color.TRANSPARENT),
                    null, Shader.TileMode.CLAMP,
                )
                canvas.drawText(r.text, r.x, r.baseline, paint)
            }
        }
        canvas.restoreToCount(layer)
        canvas.restoreToCount(outer)

        // Subtítulo (fecha · clima), sobrio y legible; acompaña la posición y el alto del reloj.
        extras.subtitle?.takeIf { it.isNotBlank() }?.let { sub ->
            paint.reset(width * 0.042f, Typeface.create("sans-serif", Typeface.NORMAL), 0.02f)
            val sw = paint.measureText(sub)
            val sy = (cy + (lay.lastBaseline - cy + textSize * 0.34f) * d.stretchY + width * 0.03f)
                .coerceAtMost(height - width * 0.03f)
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
        val lay = layout(d, extras, width, height)
        val pts = boxCorners(lay.box)
        lay.transform.mapPoints(pts)
        if (d.warp.size == 8) for (i in 0 until 8) pts[i] += d.warp[i] * (if (i % 2 == 0) width else height)
        return pts
    }

    /**
     * Dónde va cada grupo de cifras (sin girar ni estirar). En horizontal: horas, «:» y minutos en
     * una línea; al separar desde el centro las horas van a la izquierda, los minutos a la derecha y
     * los dos puntos quedan siempre en el medio del hueco. En vertical: horas arriba y minutos abajo,
     * cada línea centrada; al separar se alejan hacia arriba y hacia abajo.
     */
    private fun layout(d: ClockDesign, extras: ClockExtras, width: Int, height: Int): Layout {
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
        fun measure(text: String, face: Typeface): Float {
            paint.reset(textSize, face, d.letterSpacing)
            return paint.measureText(text)
        }
        val hasColon = extras.minutes.startsWith(":")
        val minutes = extras.minutes.removePrefix(":")
        val hW = measure(extras.hours, hoursFace)
        val mW = measure(minutes, family)

        if (d.layout == ClockLayout.VERTICAL) {
            // Distancia entre las dos líneas de base; el centro del reloj queda entre ambas.
            val step = textSize * 0.86f
            val bH0 = cy - step / 2f + textSize * 0.36f
            val bM0 = cy + step / 2f + textSize * 0.36f
            var up = 0f
            var down = 0f
            if (d.spread > 0f) {
                val margin = width * 0.03f
                val half = (step / 2f + textSize * 0.44f) * d.stretchY
                up = d.spread * (cy - half - margin).coerceAtLeast(0f) / d.stretchY
                down = d.spread * (height - margin - (cy + half)).coerceAtLeast(0f) / d.stretchY
            }
            val bH = bH0 - up
            val bM = bM0 + down
            val runs = listOf(
                Run(extras.hours, hoursFace, cx - hW / 2f, bH, hW),
                Run(minutes, family, cx - mW / 2f, bM, mW),
            )
            val w = max(hW, mW)
            val box = RectF(cx - w / 2f, bH - textSize * 0.80f, cx + w / 2f, bM + textSize * 0.08f)
            return Layout(runs, box, textSize, transform, bM)
        }

        val sW = if (hasColon) measure(":", family) else 0f
        val total = hW + sW + mW
        val (shiftH, shiftM) = spreadShifts(d, cx, total, width)
        val startX = cx - total / 2f
        val baseline = cy + textSize * 0.36f
        val runs = buildList {
            add(Run(extras.hours, hoursFace, startX - shiftH, baseline, hW))
            // Los dos puntos, centrados en el hueco entre horas y minutos.
            if (hasColon) add(Run(":", family, startX + hW + (shiftM - shiftH) / 2f, baseline, sW))
            add(Run(minutes, family, startX + hW + sW + shiftM, baseline, mW))
        }
        val box = RectF(startX - shiftH, baseline - textSize * 0.80f, startX + total + shiftM, baseline + textSize * 0.08f)
        return Layout(runs, box, textSize, transform, baseline)
    }

    /**
     * Separación desde el centro: al 100 % el borde exterior de las horas toca el margen izquierdo y
     * el de los minutos el derecho (teniendo en cuenta el estiramiento horizontal).
     */
    private fun spreadShifts(d: ClockDesign, cx: Float, total: Float, width: Int): Pair<Float, Float> {
        if (d.spread <= 0f) return 0f to 0f
        val margin = width * 0.03f
        val half = total * d.stretchX / 2f
        val left = (cx - half - margin).coerceAtLeast(0f) / d.stretchX
        val right = (width - margin - (cx + half)).coerceAtLeast(0f) / d.stretchX
        return d.spread * left to d.spread * right
    }

    /** Esquinas de una caja: arriba-izq., arriba-der., abajo-der., abajo-izq. */
    private fun boxCorners(b: RectF): FloatArray =
        floatArrayOf(b.left, b.top, b.right, b.top, b.right, b.bottom, b.left, b.bottom)

    /** Deformación por esquinas en coordenadas de pantalla (después del giro y el estiramiento). */
    private fun warpMatrix(d: ClockDesign, transform: android.graphics.Matrix, box: RectF, width: Int, height: Int): android.graphics.Matrix? {
        if (d.warp.size != 8) return null
        val src = boxCorners(box)
        transform.mapPoints(src)
        val dst = FloatArray(8) { i -> src[i] + d.warp[i] * (if (i % 2 == 0) width else height) }
        if (!isConvex(dst)) return null // esquinas cruzadas: deformación imposible, se ignora
        return android.graphics.Matrix().takeIf { it.setPolyToPoly(src, 0, dst, 0, 4) }
    }

    private fun isConvex(q: FloatArray): Boolean {
        var sign = 0
        for (i in 0 until 4) {
            val ax = q[((i + 1) % 4) * 2] - q[i * 2]
            val ay = q[((i + 1) % 4) * 2 + 1] - q[i * 2 + 1]
            val bx = q[((i + 2) % 4) * 2] - q[((i + 1) % 4) * 2]
            val by = q[((i + 2) % 4) * 2 + 1] - q[((i + 1) % 4) * 2 + 1]
            val cross = ax * by - ay * bx
            val sgn = if (cross > 0) 1 else if (cross < 0) -1 else 0
            if (sgn == 0) return false
            if (sign == 0) sign = sgn else if (sgn != sign) return false
        }
        return true
    }

    /** Caja del reloj en el lienzo (girada y estirada), para tocarlo y moverlo en el editor. */
    fun bounds(width: Int, height: Int, d: ClockDesign, extras: ClockExtras): Rect {
        val lay = layout(d.normalized(), extras, width, height)
        val r = RectF(lay.box).apply { inset(-lay.textSize * 0.08f, -lay.textSize * 0.15f) }
        lay.transform.mapRect(r)
        return Rect(r.left.toInt(), r.top.toInt(), r.right.toInt(), r.bottom.toInt())
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

    /** Un grupo de cifras ya colocado: texto, tipografía, x izquierda, línea de base y ancho. */
    private class Run(val text: String, val face: Typeface, val x: Float, val baseline: Float, val width: Float)

    /** Disposición del reloj: grupos, caja que los contiene (para la deformación) y última línea de base. */
    private class Layout(val runs: List<Run>, val box: RectF, val textSize: Float, val transform: android.graphics.Matrix, val lastBaseline: Float)

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
