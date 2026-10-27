package com.afinador.core.dsp

import kotlin.math.abs

/**
 * Estabiliza la secuencia de frecuencias detectadas bloque a bloque.
 *
 * - Filtro de mediana para descartar errores aislados (por ejemplo, un armónico en un solo bloque).
 * - Cambio de nota sólo cuando varios bloques seguidos coinciden, para no saltar entre notas.
 * - Suavizado exponencial en cents, más rápido cuando la afinación se está moviendo.
 * - Retención breve de la última lectura cuando la señal se pierde un instante.
 *
 * Trabaja en cents absolutos (relativos a 440 Hz), por lo que no depende de la referencia A4.
 */
class PitchStabilizer(
    /** Bloques sin señal que se toleran antes de declarar que no hay nota. */
    private val holdFrames: Int = 12,
    private val medianSize: Int = 5,
    /** Diferencia en cents a partir de la cual se considera que cambió la nota. */
    private val jumpCents: Double = 60.0,
    /** Bloques consecutivos necesarios para aceptar una nota nueva. */
    private val confirmFrames: Int = 2,
    private val slowAlpha: Double = 0.3,
    private val fastAlpha: Double = 0.65,
) {
    private val history = ArrayDeque<Double>()
    private val candidates = ArrayDeque<Double>()
    private var output: Double? = null
    private var missed = 0

    /** Última frecuencia estabilizada o null si no hay nota. */
    val current: Double? get() = output?.let { centsToFrequency(it) }

    fun reset() {
        history.clear()
        candidates.clear()
        output = null
        missed = 0
    }

    /** Bloque sin señal confiable. */
    fun miss(): Double? {
        missed++
        if (missed > holdFrames) reset()
        return current
    }

    /** Bloque ignorado a propósito (por ejemplo, el ataque de la púa): no cuenta como pérdida. */
    fun skip(): Double? = current

    fun update(frequency: Double): Double? {
        if (!(frequency > 0.0)) return miss()
        missed = 0
        val c = frequencyToCents(frequency)
        val out = output

        if (out == null) {
            if (!addCandidate(c)) return null
            startNote()
            return current
        }

        if (abs(c - out) > jumpCents) {
            if (addCandidate(c)) startNote()
            return current
        }

        candidates.clear()
        history.addLast(c)
        if (history.size > medianSize) history.removeFirst()
        val median = median(history)
        val alpha = if (abs(median - out) > 12.0) fastAlpha else slowAlpha
        output = out + alpha * (median - out)
        return current
    }

    /** Acumula candidatos coherentes entre sí; devuelve true cuando hay suficientes para confirmar. */
    private fun addCandidate(c: Double): Boolean {
        if (candidates.isNotEmpty() && abs(c - median(candidates)) > jumpCents) candidates.clear()
        candidates.addLast(c)
        return candidates.size >= confirmFrames
    }

    private fun startNote() {
        history.clear()
        history.addAll(candidates)
        candidates.clear()
        output = median(history)
    }

    private fun median(values: Collection<Double>): Double {
        val sorted = values.sorted()
        val n = sorted.size
        return if (n % 2 == 1) sorted[n / 2] else (sorted[n / 2 - 1] + sorted[n / 2]) / 2.0
    }

    private fun frequencyToCents(f: Double) = 1200.0 * kotlin.math.ln(f / 440.0) / kotlin.math.ln(2.0)
    private fun centsToFrequency(c: Double) = 440.0 * Math.pow(2.0, c / 1200.0)
}
