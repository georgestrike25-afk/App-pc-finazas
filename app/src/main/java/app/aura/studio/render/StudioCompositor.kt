package app.aura.studio.render

import android.graphics.Bitmap
import android.graphics.BlurMaskFilter
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.PorterDuff
import android.graphics.PorterDuffXfermode
import app.aura.core.studio.Framing
import app.aura.core.studio.StudioProject

/**
 * Compone el fondo final: foto encuadrada → reloj 3D → sujeto recortado por la máscara encima.
 * Así parte del reloj queda detrás de la persona u objeto principal, como en los fondos con
 * «efecto de profundidad».
 */
class StudioCompositor(private val painter: ClockPainter) {
    private val bitmapPaint = Paint(Paint.FILTER_BITMAP_FLAG or Paint.ANTI_ALIAS_FLAG)
    private val maskPaint = Paint(Paint.FILTER_BITMAP_FLAG)
    private val srcIn = Paint(Paint.FILTER_BITMAP_FLAG).apply { xfermode = PorterDuffXfermode(PorterDuff.Mode.SRC_IN) }

    /** Dibuja la foto encuadrada; también lo usa el fondo animado para cachear la capa de fondo. */
    fun drawPhoto(canvas: Canvas, w: Int, h: Int, photo: Bitmap, project: StudioProject) {
        canvas.drawColor(Color.BLACK)
        canvas.drawBitmap(photo, photoMatrix(w, h, photo, project), bitmapPaint)
    }

    /**
     * Capa del sujeto (foto recortada por la máscara) en un bitmap transparente del tamaño del lienzo,
     * o null si no corresponde. Se calcula una vez y se reutiliza mientras no cambien foto ni máscara.
     */
    fun subjectLayer(w: Int, h: Int, photo: Bitmap, mask: Bitmap?, project: StudioProject): Bitmap? {
        if (mask == null || !project.hasMask || !project.design.behindSubject) return null
        val out = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
        val c = Canvas(out)
        val m = photoMatrix(w, h, photo, project)
        val maskMatrix = Matrix(m).apply { preScale(photo.width / mask.width.toFloat(), photo.height / mask.height.toFloat()) }
        val feather = project.mask.feather / 1000f * w
        maskPaint.maskFilter = if (feather >= 0.5f) BlurMaskFilter(feather, BlurMaskFilter.Blur.NORMAL) else null
        maskPaint.color = Color.BLACK
        if (project.mask.inverted) {
            c.drawColor(Color.BLACK)
            maskPaint.xfermode = PorterDuffXfermode(PorterDuff.Mode.DST_OUT)
        } else {
            maskPaint.xfermode = null
        }
        c.drawBitmap(mask, maskMatrix, maskPaint)
        c.drawBitmap(photo, m, srcIn)
        return out
    }

    fun render(
        out: Bitmap,
        photo: Bitmap,
        mask: Bitmap?,
        project: StudioProject,
        extras: ClockExtras,
        subject: Bitmap? = subjectLayer(out.width, out.height, photo, mask, project),
    ) {
        val c = Canvas(out)
        drawPhoto(c, out.width, out.height, photo, project)
        painter.draw(c, out.width, out.height, project.design, extras, Backdrop(photo, photoMatrix(out.width, out.height, photo, project)))
        subject?.let { c.drawBitmap(it, 0f, 0f, null) }
    }

    fun photoMatrix(w: Int, h: Int, photo: Bitmap, project: StudioProject): Matrix {
        val p = Framing.place(photo.width, photo.height, w, h, project.frame)
        return Matrix().apply {
            setScale(p.scale, p.scale)
            postTranslate(p.dx, p.dy)
        }
    }

    val clock: ClockPainter get() = painter
}
