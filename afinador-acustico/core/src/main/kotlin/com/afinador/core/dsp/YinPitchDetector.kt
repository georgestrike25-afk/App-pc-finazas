package com.afinador.core.dsp

import kotlin.math.ceil
import kotlin.math.floor
import kotlin.math.log10
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sqrt

/** Resultado de analizar un bloque de audio. */
data class PitchEstimate(
    /** Frecuencia fundamental estimada en Hz. */
    val frequency: Double,
    /** Periodicidad de la señal entre 0 y 1 (1 − valor YIN en el mínimo elegido). */
    val confidence: Double,
)

/**
 * Detector de frecuencia fundamental basado en YIN (de Cheveigné y Kawahara, 2002).
 *
 * La función de diferencia se calcula con autocorrelación por FFT, por lo que el costo por bloque es
 * O(n log n) en lugar de O(n²). Esto mantiene bajo el consumo de batería aun con ventanas largas,
 * necesarias para medir con precisión la sexta cuerda (E2 ≈ 82 Hz) y afinaciones más graves.
 *
 * No es seguro para uso concurrente: cada hilo debe tener su propia instancia.
 */
class YinPitchDetector(
    val sampleRate: Int,
    val bufferSize: Int,
    val minFrequency: Double = 40.0,
    val maxFrequency: Double = 1600.0,
    /** Umbral absoluto de YIN: valores menores son más estrictos. */
    val threshold: Double = 0.12,
    /** Si ningún mínimo cruza el umbral, se acepta el mínimo global sólo si es menor que este valor. */
    val fallbackThreshold: Double = 0.35,
) {
    val windowSize: Int = bufferSize / 2
    val tauMax: Int = min(bufferSize - windowSize, ceil(sampleRate / minFrequency).toInt())
    val tauMin: Int = max(2, floor(sampleRate / maxFrequency).toInt())

    private val fftSize = Fft.nextPowerOfTwo(windowSize + tauMax + 1)
    private val fft = Fft(fftSize)
    private val aRe = DoubleArray(fftSize)
    private val aIm = DoubleArray(fftSize)
    private val bRe = DoubleArray(fftSize)
    private val bIm = DoubleArray(fftSize)
    private val centered = DoubleArray(bufferSize)
    private val energyPrefix = DoubleArray(bufferSize + 1)
    private val difference = DoubleArray(tauMax + 1)
    private val cmnd = DoubleArray(tauMax + 1)

    init {
        require(sampleRate > 0) { "Frecuencia de muestreo inválida" }
        require(bufferSize >= 64) { "Bloque de audio demasiado corto" }
        require(minFrequency > 0 && maxFrequency > minFrequency) { "Rango de frecuencias inválido" }
        require(tauMin < tauMax) { "El bloque es demasiado corto para la frecuencia mínima" }
    }

    /**
     * Estima la frecuencia fundamental de [samples] (al menos [bufferSize] muestras desde [offset]).
     * Devuelve null si el bloque no contiene una señal periódica confiable.
     */
    fun detect(samples: FloatArray, offset: Int = 0): PitchEstimate? {
        require(samples.size - offset >= bufferSize) { "Bloque de audio incompleto" }
        computeDifference(samples, offset)
        cumulativeMeanNormalized()

        val tau = selectTau() ?: return null
        val refined = parabolicInterpolation(tau)
        if (!(refined > 0.0)) return null
        val frequency = sampleRate / refined
        if (frequency < minFrequency * 0.97 || frequency > maxFrequency * 1.03) return null
        return PitchEstimate(frequency, (1.0 - cmnd[tau]).coerceIn(0.0, 1.0))
    }

    /** Función de diferencia d(τ) = Σ (x_j − x_{j+τ})², para pruebas y diagnóstico. */
    internal fun differenceFor(samples: FloatArray, offset: Int = 0): DoubleArray {
        computeDifference(samples, offset)
        return difference.copyOf()
    }

    private fun computeDifference(samples: FloatArray, offset: Int) {
        // Quitar la componente continua evita que un desplazamiento de DC sesgue la diferencia.
        var mean = 0.0
        for (i in 0 until bufferSize) mean += samples[offset + i]
        mean /= bufferSize
        energyPrefix[0] = 0.0
        for (i in 0 until bufferSize) {
            val v = samples[offset + i] - mean
            centered[i] = v
            energyPrefix[i + 1] = energyPrefix[i] + v * v
        }

        // r(τ) = Σ_{j<W} x_j · x_{j+τ}, mediante la correlación cruzada por FFT.
        java.util.Arrays.fill(aRe, 0.0); java.util.Arrays.fill(aIm, 0.0)
        java.util.Arrays.fill(bRe, 0.0); java.util.Arrays.fill(bIm, 0.0)
        for (i in 0 until windowSize) aRe[i] = centered[i]
        val bLength = min(bufferSize, windowSize + tauMax)
        for (i in 0 until bLength) bRe[i] = centered[i]
        fft.transform(aRe, aIm)
        fft.transform(bRe, bIm)
        for (k in 0 until fftSize) {
            // conj(A) · B
            val re = aRe[k] * bRe[k] + aIm[k] * bIm[k]
            val im = aRe[k] * bIm[k] - aIm[k] * bRe[k]
            bRe[k] = re
            bIm[k] = im
        }
        fft.transform(bRe, bIm, inverse = true)

        val energy0 = energyPrefix[windowSize]
        for (tau in 0..tauMax) {
            val energyTau = energyPrefix[tau + windowSize] - energyPrefix[tau]
            difference[tau] = max(0.0, energy0 + energyTau - 2.0 * bRe[tau])
        }
        difference[0] = 0.0
    }

    private fun cumulativeMeanNormalized() {
        cmnd[0] = 1.0
        var runningSum = 0.0
        for (tau in 1..tauMax) {
            runningSum += difference[tau]
            cmnd[tau] = if (runningSum > 0.0) difference[tau] * tau / runningSum else 1.0
        }
    }

    private fun selectTau(): Int? {
        // Primer mínimo por debajo del umbral absoluto: favorece el período fundamental
        // y evita confundir la nota con un subarmónico (una octava abajo).
        var tau = tauMin
        while (tau < tauMax) {
            if (cmnd[tau] < threshold) {
                while (tau + 1 < tauMax && cmnd[tau + 1] < cmnd[tau]) tau++
                return tau
            }
            tau++
        }
        // Sin cruce del umbral (típico con ruido de fondo): se busca el mínimo global y, si la señal
        // sigue siendo bastante periódica, se elige el PRIMER mínimo local cercano a ese valor.
        // Con ruido, la normalización de YIN hace que los múltiplos del período (una octava abajo)
        // queden apenas más bajos que el período real; tomar el primero evita ese error de octava.
        var bestValue = Double.MAX_VALUE
        for (t in tauMin until tauMax) {
            if (cmnd[t] < bestValue && cmnd[t] <= cmnd[t - 1] && cmnd[t] <= cmnd[t + 1]) bestValue = cmnd[t]
        }
        if (bestValue >= fallbackThreshold) return null
        val accept = bestValue + FALLBACK_MARGIN
        for (t in tauMin until tauMax) {
            if (cmnd[t] <= accept && cmnd[t] <= cmnd[t - 1] && cmnd[t] <= cmnd[t + 1]) return t
        }
        return null
    }

    private fun parabolicInterpolation(tau: Int): Double {
        if (tau <= 0 || tau >= tauMax) return tau.toDouble()
        val s0 = cmnd[tau - 1]
        val s1 = cmnd[tau]
        val s2 = cmnd[tau + 1]
        val denominator = s0 - 2.0 * s1 + s2
        if (denominator <= 0.0) return tau.toDouble()
        val shift = 0.5 * (s0 - s2) / denominator
        return tau + shift.coerceIn(-1.0, 1.0)
    }

    companion object {
        private const val FALLBACK_MARGIN = 0.08

        /** Nivel RMS en dBFS (0 dBFS = onda a escala completa). Silencio absoluto devuelve −120. */
        fun rmsDb(samples: FloatArray, offset: Int = 0, length: Int = samples.size - offset): Double {
            if (length <= 0) return -120.0
            var mean = 0.0
            for (i in offset until offset + length) mean += samples[i]
            mean /= length
            var sum = 0.0
            for (i in offset until offset + length) {
                val v = samples[i] - mean
                sum += v * v
            }
            val rms = sqrt(sum / length)
            return if (rms <= 1e-6) -120.0 else 20.0 * log10(rms)
        }
    }
}
