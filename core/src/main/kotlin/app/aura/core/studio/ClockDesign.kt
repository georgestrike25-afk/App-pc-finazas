package app.aura.core.studio

import app.aura.core.style.Brand
import app.aura.core.style.FontChoice
import app.aura.core.time.HourFormat
import kotlinx.serialization.Serializable

/** Acabado del reloj 3D de Aura Studio. */
@Serializable
enum class ClockMaterial { MINIMAL, METAL, GLASS, NEON, STONE }

/**
 * Diseño editable del reloj de un fondo. Todo es paramétrico (no hay imágenes prediseñadas): el
 * mismo valor se dibuja en la vista previa, en la exportación y en el fondo animado.
 * Posiciones y tamaños son fracciones del lienzo, así el diseño sirve para cualquier resolución.
 */
@Serializable
data class ClockDesign(
    val font: FontChoice = FontChoice.THIN,
    val boldHours: Boolean = true,
    val color: Int = Brand.WHITE,
    /** Tinte del metal, brillo del neón y vetas de la piedra. */
    val accentColor: Int = Brand.SOLAR,
    /** 0–100. */
    val opacity: Int = 100,
    /** Espaciado entre letras en em (−0,10 a 0,40). */
    val letterSpacing: Float = 0f,
    /** Altura de las cifras como fracción del ancho del lienzo (0,10–0,50). */
    val size: Float = 0.28f,
    /** Centro del reloj, fracciones del lienzo (0–1). */
    val centerX: Float = 0.5f,
    val centerY: Float = 0.30f,
    val material: ClockMaterial = ClockMaterial.METAL,
    /** Dirección desde la que llega la luz, en grados (0 = derecha, 90 = abajo; 225 = arriba a la izquierda). */
    val lightAngle: Int = 225,
    /** Intensidades 0–100. */
    val shadow: Int = 55,
    val depth: Int = 40,
    val bevel: Int = 45,
    val reflection: Int = 35,
    val glow: Int = 0,
    val showDate: Boolean = true,
    val showWeather: Boolean = true,
    val hourFormat: HourFormat = HourFormat.SYSTEM,
    /** Con máscara de profundidad: el sujeto de la foto queda delante del reloj. */
    val behindSubject: Boolean = true,
) {
    fun normalized(): ClockDesign = copy(
        opacity = opacity.coerceIn(0, 100),
        letterSpacing = letterSpacing.coerceIn(MIN_SPACING, MAX_SPACING),
        size = size.coerceIn(MIN_SIZE, MAX_SIZE),
        centerX = centerX.coerceIn(0f, 1f),
        centerY = centerY.coerceIn(0f, 1f),
        lightAngle = Math.floorMod(lightAngle, 360),
        shadow = shadow.coerceIn(0, 100),
        depth = depth.coerceIn(0, 100),
        bevel = bevel.coerceIn(0, 100),
        reflection = reflection.coerceIn(0, 100),
        glow = glow.coerceIn(0, 100),
    )

    /** Cambia el acabado con valores de partida coherentes, conservando posición, tipografía y colores. */
    fun withMaterial(m: ClockMaterial): ClockDesign = when (m) {
        ClockMaterial.MINIMAL -> copy(material = m, shadow = 30, depth = 0, bevel = 0, reflection = 0, glow = 0)
        ClockMaterial.METAL -> copy(material = m, shadow = 55, depth = 40, bevel = 45, reflection = 35, glow = 0)
        ClockMaterial.GLASS -> copy(material = m, shadow = 35, depth = 10, bevel = 60, reflection = 60, glow = 0)
        ClockMaterial.NEON -> copy(material = m, shadow = 0, depth = 0, bevel = 10, reflection = 0, glow = 70)
        ClockMaterial.STONE -> copy(material = m, shadow = 65, depth = 60, bevel = 35, reflection = 0, glow = 0)
    }

    companion object {
        const val MIN_SIZE = 0.10f
        const val MAX_SIZE = 0.50f
        const val MIN_SPACING = -0.10f
        const val MAX_SPACING = 0.40f
    }
}

/**
 * Encuadre de la foto: escala adicional sobre el ajuste «cubrir» y desplazamiento en fracciones del
 * lienzo. Con los valores por defecto la foto llena el lienzo centrada.
 */
@Serializable
data class PhotoFrame(val zoom: Float = 1f, val offsetX: Float = 0f, val offsetY: Float = 0f) {
    fun normalized() = copy(zoom = zoom.coerceIn(1f, 5f))
}

/** Transformación final foto → lienzo: escala uniforme y traslación en píxeles. */
data class Placement(val scale: Float, val dx: Float, val dy: Float)

object Framing {
    fun place(imageW: Int, imageH: Int, canvasW: Int, canvasH: Int, frame: PhotoFrame): Placement {
        require(imageW > 0 && imageH > 0 && canvasW > 0 && canvasH > 0)
        val f = frame.normalized()
        val cover = maxOf(canvasW.toFloat() / imageW, canvasH.toFloat() / imageH)
        val scale = cover * f.zoom
        val w = imageW * scale
        val h = imageH * scale
        // Desplazamiento limitado para que la foto nunca deje huecos.
        val maxX = (w - canvasW) / 2f
        val maxY = (h - canvasH) / 2f
        val ox = (f.offsetX * canvasW).coerceIn(-maxX, maxX)
        val oy = (f.offsetY * canvasH).coerceIn(-maxY, maxY)
        return Placement(scale, (canvasW - w) / 2f + ox, (canvasH - h) / 2f + oy)
    }
}

/** Ajustes de la máscara de profundidad. */
@Serializable
data class MaskSettings(
    val inverted: Boolean = false,
    /** Suavizado de bordes en milésimas del ancho del lienzo (0–30). */
    val feather: Int = 4,
    /** Umbral de confianza para la máscara automática (0,2–0,8). */
    val threshold: Float = 0.5f,
)

/** Trazo de pincel o borrador en coordenadas normalizadas de la foto (0–1). */
@Serializable
data class MaskStroke(
    val points: List<Float>,
    /** Radio como fracción del lado mayor de la foto. */
    val radius: Float,
    val erase: Boolean,
)

@Serializable
data class StudioProject(
    val id: String,
    val name: String,
    val createdAt: Long,
    val updatedAt: Long,
    val design: ClockDesign = ClockDesign(),
    val frame: PhotoFrame = PhotoFrame(),
    val mask: MaskSettings = MaskSettings(),
    /** El sujeto se obtuvo automáticamente (antes de retoques manuales). */
    val autoMask: Boolean = false,
    val strokes: List<MaskStroke> = emptyList(),
    val hasMask: Boolean = false,
)

object ClockText {
    /** Horas y «:mm» por separado, para poder destacar las horas. */
    fun parts(hour: Int, minute: Int, is24: Boolean): Pair<String, String> {
        val h = if (is24) "%02d".format(hour) else (if (hour % 12 == 0) 12 else hour % 12).toString()
        return h to ":%02d".format(minute)
    }
}
