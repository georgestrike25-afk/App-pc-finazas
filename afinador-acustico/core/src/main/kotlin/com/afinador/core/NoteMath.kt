package com.afinador.core

import kotlin.math.floor
import kotlin.math.ln
import kotlin.math.pow
import kotlin.math.roundToInt

/**
 * Matemática musical de la escala temperada de doce semitonos.
 *
 * Las notas se representan con su número MIDI (A4 = 69, E2 = 40). La frecuencia de cada nota
 * se calcula a partir de la referencia A4 elegida por el usuario: f = A4 · 2^((midi − 69) / 12).
 */
object NoteMath {
    const val A4_MIDI = 69

    private val SHARP_NAMES = arrayOf("C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B")
    private val FLAT_NAMES = arrayOf("C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B")
    private val SOLFEGE_SHARP = arrayOf("Do", "Do#", "Re", "Re#", "Mi", "Fa", "Fa#", "Sol", "Sol#", "La", "La#", "Si")
    private val SOLFEGE_FLAT = arrayOf("Do", "Reb", "Re", "Mib", "Mi", "Fa", "Solb", "Sol", "Lab", "La", "Sib", "Si")

    private val LETTER_PITCH = mapOf('C' to 0, 'D' to 2, 'E' to 4, 'F' to 5, 'G' to 7, 'A' to 9, 'B' to 11)

    /** Frecuencia (Hz) de una nota MIDI, que puede ser fraccionaria, con la referencia [a4]. */
    fun midiToFrequency(midi: Double, a4: Double): Double = a4 * 2.0.pow((midi - A4_MIDI) / 12.0)

    fun midiToFrequency(midi: Int, a4: Double): Double = midiToFrequency(midi.toDouble(), a4)

    /** Número MIDI fraccionario de una frecuencia. Devuelve NaN si la frecuencia no es válida. */
    fun frequencyToMidi(frequency: Double, a4: Double): Double {
        if (!(frequency > 0.0) || !(a4 > 0.0) || frequency.isInfinite()) return Double.NaN
        return A4_MIDI + 12.0 * log2(frequency / a4)
    }

    /** Nota MIDI más cercana a una frecuencia, o null si la frecuencia no es válida. */
    fun nearestMidi(frequency: Double, a4: Double): Int? {
        val midi = frequencyToMidi(frequency, a4)
        return if (midi.isNaN()) null else midi.roundToInt()
    }

    /**
     * Desviación en cents de [frequency] respecto de [target]: 1200 · log2(f / objetivo).
     * Positivo = agudo, negativo = grave. NaN si alguna frecuencia no es válida.
     */
    fun cents(frequency: Double, target: Double): Double {
        if (!(frequency > 0.0) || !(target > 0.0) || frequency.isInfinite() || target.isInfinite()) return Double.NaN
        return 1200.0 * log2(frequency / target)
    }

    /** Aplica una desviación en cents a una frecuencia. */
    fun shiftByCents(frequency: Double, cents: Double): Double = frequency * 2.0.pow(cents / 1200.0)

    fun pitchClass(midi: Int): Int = Math.floorMod(midi, 12)

    /** Octava en notación científica (C4 = do central, MIDI 60). */
    fun octave(midi: Int): Int = Math.floorDiv(midi, 12) - 1

    /** Nombre de la clase de nota sin octava, por ejemplo "F#" o "Eb". */
    fun pitchName(midi: Int, preferFlats: Boolean = false): String =
        (if (preferFlats) FLAT_NAMES else SHARP_NAMES)[pitchClass(midi)]

    /** Nombre completo con octava, por ejemplo "E2" o "Bb3". */
    fun noteName(midi: Int, preferFlats: Boolean = false): String = pitchName(midi, preferFlats) + octave(midi)

    /** Nombre en solfeo, por ejemplo "Mi" o "Sib". */
    fun solfegeName(midi: Int, preferFlats: Boolean = false): String =
        (if (preferFlats) SOLFEGE_FLAT else SOLFEGE_SHARP)[pitchClass(midi)]

    /**
     * Interpreta un nombre de nota con octava ("E2", "F#3", "Eb4", "Bb3", "G♯3").
     * Devuelve el número MIDI o null si el texto no es una nota válida.
     */
    fun parseNote(text: String): Int? {
        val s = text.trim()
        if (s.length < 2) return null
        val base = LETTER_PITCH[s[0].uppercaseChar()] ?: return null
        var index = 1
        var accidental = 0
        while (index < s.length) {
            when (s[index]) {
                '#', '♯' -> accidental += 1
                'b', '♭' -> accidental -= 1
                else -> break
            }
            index++
        }
        val octave = s.substring(index).toIntOrNull() ?: return null
        if (octave !in -1..9) return null
        return (octave + 1) * 12 + base + accidental
    }

    /** Redondea hacia abajo un número MIDI fraccionario respetando negativos. */
    fun floorMidi(midi: Double): Int = floor(midi).toInt()

    private val LN2 = ln(2.0)
    private fun log2(x: Double): Double = ln(x) / LN2
}

/** Límites y valor predeterminado de la frecuencia de referencia A4. */
object ReferencePitch {
    const val DEFAULT = 440.0
    const val BAROQUE_432 = 432.0
    const val MIN = 400.0
    const val MAX = 480.0

    /** Ajusta un valor al rango permitido. Valores no numéricos vuelven a 440 Hz. */
    fun clamp(value: Double): Double = if (value.isNaN() || value.isInfinite()) DEFAULT else value.coerceIn(MIN, MAX)

    fun isValid(value: Double): Boolean = !value.isNaN() && value in MIN..MAX

    /**
     * Calibración con un instrumento de referencia: devuelve la A4 con la que [measuredFrequency]
     * quedaría exactamente afinada en su nota más cercana, redondeada a 0,1 Hz.
     * Devuelve null si la medición no es válida o la A4 resultante queda fuera del rango permitido.
     */
    fun calibrateFrom(measuredFrequency: Double, currentA4: Double): Double? {
        val nearest = NoteMath.nearestMidi(measuredFrequency, currentA4) ?: return null
        val a4 = measuredFrequency * Math.pow(2.0, (NoteMath.A4_MIDI - nearest) / 12.0)
        val rounded = Math.round(a4 * 10.0) / 10.0
        return if (isValid(rounded)) rounded else null
    }
}

/** Límites de la transposición global en semitonos. */
object Transpose {
    const val MIN = -12
    const val MAX = 12

    fun clamp(value: Int): Int = value.coerceIn(MIN, MAX)

    /** Texto para la interfaz, por ejemplo "−2 semitonos", "+1 semitono" o "0 semitonos". */
    fun label(value: Int): String {
        val sign = when {
            value > 0 -> "+"
            value < 0 -> "−"
            else -> ""
        }
        val abs = kotlin.math.abs(value)
        return "$sign$abs ${if (abs == 1) "semitono" else "semitonos"}"
    }
}
