package com.afinador.core.dsp

import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.sin

/**
 * Pasa bajos Butterworth de cuarto orden (dos biquads en cascada).
 *
 * Las fundamentales de la guitarra están por debajo de ~1,4 kHz; todo el ruido por encima sólo
 * empeora la estimación de YIN. Recortarlo mejora mucho la estabilidad con ruido de fondo.
 * Mantiene estado entre bloques; la frecuencia de corte puede cambiarse sin reiniciar.
 */
class LowPassFilter(private val sampleRate: Int, cutoffHz: Double) {
    private val stages = arrayOf(Biquad(), Biquad())
    var cutoffHz: Double = cutoffHz
        private set

    init {
        setCutoff(cutoffHz)
    }

    fun setCutoff(hz: Double) {
        val fc = hz.coerceIn(50.0, sampleRate * 0.45)
        cutoffHz = fc
        // Q de cada etapa para un Butterworth de 4.º orden.
        stages[0].configure(fc, 0.5411961)
        stages[1].configure(fc, 1.3065630)
    }

    fun process(buffer: FloatArray, offset: Int = 0, length: Int = buffer.size - offset) {
        for (i in offset until offset + length) {
            var x = buffer[i].toDouble()
            for (s in stages) x = s.process(x)
            buffer[i] = x.toFloat()
        }
    }

    fun reset() = stages.forEach { it.reset() }

    companion object {
        /** Corte adecuado: tres veces la nota objetivo más aguda, entre 700 Hz y 2 kHz. */
        fun cutoffFor(highestTargetHz: Double): Double = (highestTargetHz * 3.0).coerceIn(700.0, 2000.0)
    }

    private inner class Biquad {
        private var b0 = 1.0; private var b1 = 0.0; private var b2 = 0.0
        private var a1 = 0.0; private var a2 = 0.0
        private var z1 = 0.0; private var z2 = 0.0

        fun configure(fc: Double, q: Double) {
            val w = 2 * PI * fc / sampleRate
            val alpha = sin(w) / (2 * q)
            val c = cos(w)
            val a0 = 1 + alpha
            b0 = (1 - c) / 2 / a0
            b1 = (1 - c) / a0
            b2 = (1 - c) / 2 / a0
            a1 = -2 * c / a0
            a2 = (1 - alpha) / a0
        }

        // Forma directa II transpuesta: estable numéricamente en coma flotante.
        fun process(x: Double): Double {
            val y = b0 * x + z1
            z1 = b1 * x - a1 * y + z2
            z2 = b2 * x - a2 * y
            return y
        }

        fun reset() {
            z1 = 0.0; z2 = 0.0
        }
    }
}
