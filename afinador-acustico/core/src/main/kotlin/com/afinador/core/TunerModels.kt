package com.afinador.core

import kotlin.math.abs

/** Estado de afinación respecto del objetivo. */
enum class TuningStatus(val label: String) {
    WAITING("Esperando una cuerda"),
    TOO_LOW("Demasiado grave"),
    SLIGHTLY_LOW("Un poco grave"),
    IN_TUNE("Afinada"),
    SLIGHTLY_HIGH("Un poco aguda"),
    TOO_HIGH("Demasiado aguda");

    companion object {
        /** Desviación (en cents) a partir de la cual se considera "demasiado" grave o aguda. */
        const val FAR_CENTS = 15.0

        fun of(cents: Double, toleranceCents: Double): TuningStatus = when {
            cents.isNaN() -> WAITING
            abs(cents) <= toleranceCents -> IN_TUNE
            cents < -FAR_CENTS -> TOO_LOW
            cents < 0 -> SLIGHTLY_LOW
            cents > FAR_CENTS -> TOO_HIGH
            else -> SLIGHTLY_HIGH
        }
    }
}

enum class TunerMode { STRINGS, CHROMATIC }

/** Sensibilidad del micrófono: 0 = baja (sólo señales fuertes), 1 = alta (capta señales débiles). */
object Sensitivity {
    const val DEFAULT = 0.5f
    private const val LEAST_SENSITIVE_DB = -35.0
    private const val MOST_SENSITIVE_DB = -65.0

    /** Nivel mínimo (dBFS) que debe tener la señal para analizarla. */
    fun thresholdDb(value: Float): Double {
        val v = value.coerceIn(0f, 1f).toDouble()
        return LEAST_SENSITIVE_DB + (MOST_SENSITIVE_DB - LEAST_SENSITIVE_DB) * v
    }

    fun label(value: Float): String = when {
        value < 0.2f -> "Muy baja"
        value < 0.4f -> "Baja"
        value <= 0.6f -> "Media"
        value <= 0.8f -> "Alta"
        else -> "Muy alta"
    }
}

/** Configuración del afinador. Inmutable: el hilo de audio lee siempre una copia coherente. */
data class TunerConfig(
    val a4: Double = ReferencePitch.DEFAULT,
    val transpose: Int = 0,
    val tuning: Tuning = TuningPresets.STANDARD,
    val mode: TunerMode = TunerMode.STRINGS,
    /** Cuerda elegida a mano (0 = sexta … 5 = primera) o null para detección automática. */
    val selectedString: Int? = null,
    val sensitivity: Float = Sensitivity.DEFAULT,
    /** Margen en cents dentro del cual la cuerda se considera afinada. */
    val toleranceCents: Double = 3.0,
) {
    val targets: List<StringTarget> by lazy { tuning.targets(ReferencePitch.clamp(a4), Transpose.clamp(transpose)) }
}

/** Lectura que se muestra en pantalla. */
data class TunerReading(
    val hasPitch: Boolean,
    /** Frecuencia medida (Hz). */
    val frequency: Double = 0.0,
    /** Nota más cercana a la frecuencia medida. */
    val detectedMidi: Int = 0,
    val detectedName: String = "",
    /** Nota objetivo: la cuerda (modo cuerdas) o la nota cromática más cercana. */
    val targetMidi: Int = 0,
    val targetName: String = "",
    val targetPitchName: String = "",
    val targetOctave: Int = 0,
    val targetFrequency: Double = 0.0,
    /** Desviación respecto del objetivo, en cents. */
    val cents: Double = 0.0,
    /** Índice de la cuerda objetivo (0 = sexta) o −1 en modo cromático / sin señal. */
    val stringIndex: Int = -1,
    val status: TuningStatus = TuningStatus.WAITING,
    /** Nivel de entrada entre 0 y 1, cuantizado para no redibujar por ruido. */
    val signalLevel: Float = 0f,
    /** Calidad de la señal (periodicidad) entre 0 y 1. */
    val quality: Float = 0f,
) {
    companion object {
        val WAITING = TunerReading(hasPitch = false)
    }
}
