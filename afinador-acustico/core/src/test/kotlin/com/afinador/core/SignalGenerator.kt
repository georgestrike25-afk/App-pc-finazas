package com.afinador.core

import kotlin.math.PI
import kotlin.math.exp
import kotlin.math.log10
import kotlin.math.pow
import kotlin.math.sin
import kotlin.math.sqrt
import kotlin.random.Random

/** Señales de prueba con frecuencia conocida. */
object SignalGenerator {

    fun sine(frequency: Double, sampleRate: Int, length: Int, amplitude: Double = 0.5, phase: Double = 0.0): FloatArray =
        FloatArray(length) { i -> (amplitude * sin(2 * PI * frequency * i / sampleRate + phase)).toFloat() }

    /** Suma de armónicos con las amplitudes relativas indicadas (índice 0 = fundamental). */
    fun harmonics(
        frequency: Double,
        sampleRate: Int,
        length: Int,
        relativeAmplitudes: DoubleArray,
        amplitude: Double = 0.5,
    ): FloatArray {
        val total = relativeAmplitudes.sum()
        val nyquist = sampleRate / 2.0
        return FloatArray(length) { i ->
            var v = 0.0
            for (h in relativeAmplitudes.indices) {
                val f = frequency * (h + 1)
                if (f < nyquist) v += relativeAmplitudes[h] * sin(2 * PI * f * i / sampleRate + h * 0.7)
            }
            (amplitude * v / total).toFloat()
        }
    }

    /**
     * Cuerda pulsada sintética: armónicos que decaen a ritmos distintos, inarmonicidad de cuerda
     * real (f_n = n·f0·√(1 + B·n²)) y un breve ruido de ataque de púa.
     */
    fun pluckedString(
        frequency: Double,
        sampleRate: Int,
        seconds: Double,
        amplitude: Double = 0.6,
        inharmonicity: Double = 1.0e-4,
        weakFundamental: Boolean = false,
        seed: Int = 7,
    ): FloatArray {
        val length = (seconds * sampleRate).toInt()
        val random = Random(seed)
        val partials = 14
        val amps = DoubleArray(partials) { n ->
            val base = 1.0 / (n + 1).toDouble().pow(0.9)
            if (weakFundamental && n == 0) base * 0.25 else base
        }
        val decay = DoubleArray(partials) { n -> 1.2 + 0.6 * n }
        val phases = DoubleArray(partials) { random.nextDouble(0.0, 2 * PI) }
        val nyquist = sampleRate / 2.0
        val norm = amps.sum()
        val attackSamples = (0.012 * sampleRate).toInt()
        return FloatArray(length) { i ->
            val t = i.toDouble() / sampleRate
            var v = 0.0
            for (n in 0 until partials) {
                val k = n + 1
                val f = k * frequency * sqrt(1 + inharmonicity * k * k)
                if (f < nyquist) v += amps[n] * exp(-decay[n] * t) * sin(2 * PI * f * t + phases[n])
            }
            var s = amplitude * v / norm
            if (i < attackSamples) s += 0.3 * amplitude * (random.nextDouble() * 2 - 1) * (1 - i.toDouble() / attackSamples)
            s.toFloat()
        }
    }

    fun whiteNoise(length: Int, amplitude: Double, seed: Int = 11): FloatArray {
        val random = Random(seed)
        return FloatArray(length) { (amplitude * (random.nextDouble() * 2 - 1)).toFloat() }
    }

    /** Suma ruido blanco con la relación señal/ruido indicada (en dB). */
    fun addNoise(signal: FloatArray, snrDb: Double, seed: Int = 13): FloatArray {
        val signalRms = rms(signal)
        val noiseRms = signalRms / 10.0.pow(snrDb / 20.0)
        // Ruido uniforme en [−a, a] tiene RMS = a/√3.
        val noise = whiteNoise(signal.size, noiseRms * sqrt(3.0), seed)
        return FloatArray(signal.size) { signal[it] + noise[it] }
    }

    fun scale(signal: FloatArray, gain: Double): FloatArray = FloatArray(signal.size) { (signal[it] * gain).toFloat() }

    fun concat(vararg parts: FloatArray): FloatArray {
        val out = FloatArray(parts.sumOf { it.size })
        var pos = 0
        for (p in parts) {
            System.arraycopy(p, 0, out, pos, p.size)
            pos += p.size
        }
        return out
    }

    fun rms(signal: FloatArray): Double = sqrt(signal.sumOf { it.toDouble() * it } / signal.size)

    fun dbfs(signal: FloatArray): Double = 20 * log10(rms(signal))
}
