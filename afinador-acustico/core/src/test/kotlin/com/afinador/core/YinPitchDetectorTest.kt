package com.afinador.core

import com.afinador.core.dsp.Fft
import com.afinador.core.dsp.YinPitchDetector
import kotlin.math.abs
import kotlin.random.Random
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

class YinPitchDetectorTest {

    @Test
    fun `la FFT ida y vuelta conserva la señal`() {
        val n = 1024
        val random = Random(3)
        val re = DoubleArray(n) { random.nextDouble(-1.0, 1.0) }
        val im = DoubleArray(n)
        val original = re.copyOf()
        val fft = Fft(n)
        fft.transform(re, im)
        fft.transform(re, im, inverse = true)
        for (i in 0 until n) {
            assertEquals(original[i], re[i], 1e-9)
            assertEquals(0.0, im[i], 1e-9)
        }
    }

    @Test
    fun `la funcion de diferencia por FFT coincide con el calculo directo`() {
        val sampleRate = 44100
        val detector = YinPitchDetector(sampleRate, 4096)
        val signal = SignalGenerator.addNoise(SignalGenerator.pluckedString(110.0, sampleRate, 0.2), 20.0)
        val fast = detector.differenceFor(signal)
        val mean = (0 until 4096).sumOf { signal[it].toDouble() } / 4096
        val x = DoubleArray(4096) { signal[it] - mean }
        for (tau in listOf(1, 7, 100, 401, 800, detector.tauMax)) {
            var direct = 0.0
            for (j in 0 until detector.windowSize) {
                val d = x[j] - x[j + tau]
                direct += d * d
            }
            assertEquals(direct, fast[tau], 1e-6 * maxOf(1.0, direct), "τ = $tau")
        }
    }

    @Test
    fun `silencio y ruido no producen nota`() {
        val detector = YinPitchDetector(44100, 4096)
        assertNull(detector.detect(FloatArray(4096)))
        for (seed in 1..20) {
            assertNull(detector.detect(SignalGenerator.whiteNoise(4096, 0.3, seed)), "ruido semilla $seed")
        }
    }

    @Test
    fun `seis cuerdas, senos puros, error menor a 0,2 cents`() {
        val sampleRate = 44100
        val detector = YinPitchDetector(sampleRate, 4096)
        for (target in TuningPresets.STANDARD.targets(440.0, 0)) {
            val estimate = assertNotNull(detector.detect(SignalGenerator.sine(target.frequency, sampleRate, 4096)))
            val error = NoteMath.cents(estimate.frequency, target.frequency)
            assertTrue(abs(error) < 0.2, "${target.name}: error $error cents")
            assertTrue(estimate.confidence > 0.95)
        }
    }

    @Test
    fun `fundamental debil no se confunde con el armonico`() {
        val sampleRate = 44100
        val detector = YinPitchDetector(sampleRate, 4096)
        // Segundo armónico cuatro veces más fuerte que la fundamental, como en una sexta cuerda real.
        val amps = doubleArrayOf(0.25, 1.0, 0.7, 0.5, 0.35, 0.2, 0.15, 0.1)
        for (f in listOf(65.41, 73.42, 82.41, 110.0, 146.83)) {
            val estimate = assertNotNull(detector.detect(SignalGenerator.harmonics(f, sampleRate, 4096, amps)))
            val error = NoteMath.cents(estimate.frequency, f)
            assertTrue(abs(error) < 1.0, "$f Hz detectado como ${estimate.frequency}")
        }
    }
}
