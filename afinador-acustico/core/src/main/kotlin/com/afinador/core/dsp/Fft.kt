package com.afinador.core.dsp

import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.sin

/** FFT compleja radix-2 iterativa, en el lugar, con tablas precalculadas. */
class Fft(val size: Int) {
    private val cosTable: DoubleArray
    private val sinTable: DoubleArray
    private val bitReversed: IntArray

    init {
        require(size >= 2 && size and (size - 1) == 0) { "El tamaño de la FFT debe ser potencia de 2" }
        cosTable = DoubleArray(size / 2) { cos(2.0 * PI * it / size) }
        sinTable = DoubleArray(size / 2) { sin(2.0 * PI * it / size) }
        val bits = Integer.numberOfTrailingZeros(size)
        bitReversed = IntArray(size) { Integer.reverse(it) ushr (32 - bits) }
    }

    /** Transforma [re] e [im] en el lugar. Con [inverse] aplica la inversa normalizada por 1/size. */
    fun transform(re: DoubleArray, im: DoubleArray, inverse: Boolean = false) {
        for (i in 0 until size) {
            val j = bitReversed[i]
            if (j > i) {
                val tr = re[i]; re[i] = re[j]; re[j] = tr
                val ti = im[i]; im[i] = im[j]; im[j] = ti
            }
        }
        val sign = if (inverse) 1.0 else -1.0
        var half = 1
        while (half < size) {
            val step = size / (half * 2)
            var start = 0
            while (start < size) {
                var k = 0
                for (j in start until start + half) {
                    val wr = cosTable[k]
                    val wi = sign * sinTable[k]
                    val l = j + half
                    val xr = re[l] * wr - im[l] * wi
                    val xi = re[l] * wi + im[l] * wr
                    re[l] = re[j] - xr
                    im[l] = im[j] - xi
                    re[j] += xr
                    im[j] += xi
                    k += step
                }
                start += half * 2
            }
            half *= 2
        }
        if (inverse) {
            val scale = 1.0 / size
            for (i in 0 until size) {
                re[i] *= scale
                im[i] *= scale
            }
        }
    }

    companion object {
        fun nextPowerOfTwo(n: Int): Int {
            var p = 1
            while (p < n) p = p shl 1
            return p
        }
    }
}
