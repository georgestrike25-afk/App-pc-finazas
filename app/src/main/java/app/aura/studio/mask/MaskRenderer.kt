package app.aura.studio.mask

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.graphics.PorterDuff
import android.graphics.PorterDuffXfermode
import app.aura.core.studio.MaskStroke

/**
 * Máscara final = base automática (o vacía) + trazos manuales. Los trazos se guardan como datos
 * (no como píxeles), así deshacer/rehacer es exacto y el proyecto sigue editable.
 */
object MaskRenderer {
    private val brush = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeCap = Paint.Cap.ROUND
        strokeJoin = Paint.Join.ROUND
        color = Color.BLACK
    }
    private val eraser = Paint(brush).apply { xfermode = PorterDuffXfermode(PorterDuff.Mode.CLEAR) }

    /** Resolución de trabajo de la máscara para una foto: lado mayor ≤ 1600 px (memoria acotada). */
    fun workingSize(photoW: Int, photoH: Int): Pair<Int, Int> {
        val k = minOf(1f, 1600f / maxOf(photoW, photoH))
        return maxOf(1, (photoW * k).toInt()) to maxOf(1, (photoH * k).toInt())
    }

    /** [width]×[height] es la resolución de trabajo de la máscara (la de la base, o la elegida). */
    fun render(base: Bitmap?, strokes: List<MaskStroke>, width: Int, height: Int): Bitmap {
        val out = Bitmap.createBitmap(width, height, Bitmap.Config.ALPHA_8)
        val c = Canvas(out)
        base?.let { c.drawBitmap(it, null, android.graphics.Rect(0, 0, width, height), Paint(Paint.FILTER_BITMAP_FLAG)) }
        strokes.forEach { drawStroke(c, it, width, height) }
        return out
    }

    fun drawStroke(c: Canvas, s: MaskStroke, width: Int, height: Int) {
        if (s.points.size < 2) return
        val p = if (s.erase) eraser else brush
        p.strokeWidth = s.radius * 2f * maxOf(width, height)
        val path = Path()
        path.moveTo(s.points[0] * width, s.points[1] * height)
        var i = 2
        if (s.points.size == 2) path.lineTo(s.points[0] * width + 0.1f, s.points[1] * height)
        while (i + 1 < s.points.size) {
            path.lineTo(s.points[i] * width, s.points[i + 1] * height)
            i += 2
        }
        c.drawPath(path, p)
    }

    /** Cobertura aproximada (0–1), para avisar si la máscara está vacía. */
    fun coverage(mask: Bitmap): Float {
        val step = maxOf(1, maxOf(mask.width, mask.height) / 128)
        var on = 0
        var total = 0
        val argb = mask.copy(Bitmap.Config.ARGB_8888, false)
        var y = 0
        while (y < argb.height) {
            var x = 0
            while (x < argb.width) {
                if (Color.alpha(argb.getPixel(x, y)) > 127) on++
                total++
                x += step
            }
            y += step
        }
        argb.recycle()
        return if (total == 0) 0f else on / total.toFloat()
    }
}
