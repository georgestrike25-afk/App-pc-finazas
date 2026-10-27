package com.afinador.core

import kotlin.math.abs
import kotlin.math.pow
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

class NoteMathTest {

    private val standardHz = mapOf(
        "E2" to 82.4069, "A2" to 110.0000, "D3" to 146.8324,
        "G3" to 195.9977, "B3" to 246.9417, "E4" to 329.6276,
    )

    @Test
    fun `frecuencias de las seis cuerdas con A4 = 440`() {
        for ((name, hz) in standardHz) {
            val midi = NoteMath.parseNote(name)!!
            assertEquals(hz, NoteMath.midiToFrequency(midi, 440.0), 0.0005, name)
        }
    }

    @Test
    fun `numeros MIDI de las cuerdas`() {
        assertEquals(listOf(40, 45, 50, 55, 59, 64), standardHz.keys.map { NoteMath.parseNote(it) })
        assertEquals(69, NoteMath.parseNote("A4"))
        assertEquals(60, NoteMath.parseNote("C4"))
    }

    @Test
    fun `cambiar de 440 a 432 Hz escala todas las frecuencias`() {
        val ratio = 432.0 / 440.0
        for ((name, hz) in standardHz) {
            val midi = NoteMath.parseNote(name)!!
            assertEquals(hz * ratio, NoteMath.midiToFrequency(midi, 432.0), 0.0005, name)
        }
        assertEquals(80.9086, NoteMath.midiToFrequency(40, 432.0), 0.0005)
        assertEquals(432.0, NoteMath.midiToFrequency(69, 432.0), 1e-9)
        // 432 Hz está 31,77 cents por debajo de 440 Hz.
        assertEquals(-31.77, NoteMath.cents(432.0, 440.0), 0.01)
    }

    @Test
    fun `calculo de cents`() {
        assertEquals(0.0, NoteMath.cents(440.0, 440.0), 1e-9)
        assertEquals(1200.0, NoteMath.cents(880.0, 440.0), 1e-9)
        assertEquals(-1200.0, NoteMath.cents(220.0, 440.0), 1e-9)
        assertEquals(100.0, NoteMath.cents(440.0 * 2.0.pow(1 / 12.0), 440.0), 1e-9)
        for (c in listOf(-25.0, -10.0, -5.0, 5.0, 10.0, 25.0)) {
            assertEquals(c, NoteMath.cents(NoteMath.shiftByCents(82.4069, c), 82.4069), 1e-9)
        }
    }

    @Test
    fun `frecuencias invalidas no rompen el calculo`() {
        assertTrue(NoteMath.cents(0.0, 440.0).isNaN())
        assertTrue(NoteMath.cents(-10.0, 440.0).isNaN())
        assertTrue(NoteMath.cents(Double.NaN, 440.0).isNaN())
        assertTrue(NoteMath.cents(Double.POSITIVE_INFINITY, 440.0).isNaN())
        assertTrue(NoteMath.cents(440.0, 0.0).isNaN())
        assertNull(NoteMath.nearestMidi(0.0, 440.0))
        assertNull(NoteMath.nearestMidi(Double.NaN, 440.0))
        assertEquals(TuningStatus.WAITING, TuningStatus.of(Double.NaN, 3.0))
    }

    @Test
    fun `notas muy graves y muy agudas`() {
        assertEquals(41.2034, NoteMath.midiToFrequency(28, 440.0), 0.0005) // E1
        assertEquals(65.4064, NoteMath.midiToFrequency(36, 440.0), 0.0005) // C2
        assertEquals(28, NoteMath.nearestMidi(41.2, 440.0))
        assertEquals(-1, NoteMath.octave(0))
        assertEquals(11, NoteMath.pitchClass(-1))
        assertEquals("B-2", NoteMath.noteName(-1))
        assertEquals("C8", NoteMath.noteName(108))
    }

    @Test
    fun `nombres de notas con sostenidos, bemoles y solfeo`() {
        assertEquals("F#3", NoteMath.noteName(54))
        assertEquals("Gb3", NoteMath.noteName(54, preferFlats = true))
        assertEquals("Eb2", NoteMath.noteName(39, preferFlats = true))
        assertEquals("Mi", NoteMath.solfegeName(40))
        assertEquals("Sol#", NoteMath.solfegeName(56))
        assertEquals("Sib", NoteMath.solfegeName(58, preferFlats = true))
        for (midi in 24..96) {
            assertEquals(midi, NoteMath.parseNote(NoteMath.noteName(midi)))
            assertEquals(midi, NoteMath.parseNote(NoteMath.noteName(midi, preferFlats = true)))
        }
        assertEquals(54, NoteMath.parseNote("F♯3"))
        assertEquals(51, NoteMath.parseNote("e♭3"))
        assertNull(NoteMath.parseNote("H2"))
        assertNull(NoteMath.parseNote("E"))
        assertNull(NoteMath.parseNote(""))
        assertNull(NoteMath.parseNote("E99"))
    }

    @Test
    fun `limites de la referencia A4`() {
        assertEquals(400.0, ReferencePitch.clamp(350.0))
        assertEquals(480.0, ReferencePitch.clamp(500.0))
        assertEquals(432.0, ReferencePitch.clamp(432.0))
        assertEquals(440.0, ReferencePitch.clamp(Double.NaN))
        assertEquals(440.0, ReferencePitch.clamp(Double.POSITIVE_INFINITY))
        assertTrue(ReferencePitch.isValid(400.0) && ReferencePitch.isValid(480.0))
        assertTrue(!ReferencePitch.isValid(399.9) && !ReferencePitch.isValid(480.1))
    }

    @Test
    fun `calibracion de A4 con un instrumento de referencia`() {
        // Un La medido a 442 Hz implica A4 = 442.
        assertEquals(442.0, ReferencePitch.calibrateFrom(442.0, 440.0))
        // Un Mi2 de un instrumento afinado a 432 Hz implica A4 = 432.
        assertEquals(432.0, ReferencePitch.calibrateFrom(NoteMath.midiToFrequency(40, 432.0), 440.0))
        assertNull(ReferencePitch.calibrateFrom(0.0, 440.0))
        // Una nota 40 cents grave respecto de 400 Hz daría una A4 fuera de rango.
        assertNull(ReferencePitch.calibrateFrom(NoteMath.shiftByCents(400.0, -40.0), 400.0))
    }

    @Test
    fun `limites y texto de la transposicion`() {
        assertEquals(-12, Transpose.clamp(-20))
        assertEquals(12, Transpose.clamp(30))
        assertEquals("−2 semitonos", Transpose.label(-2))
        assertEquals("+1 semitono", Transpose.label(1))
        assertEquals("0 semitonos", Transpose.label(0))
    }

    @Test
    fun `clasificacion del estado de afinacion`() {
        assertEquals(TuningStatus.IN_TUNE, TuningStatus.of(0.0, 3.0))
        assertEquals(TuningStatus.IN_TUNE, TuningStatus.of(-3.0, 3.0))
        assertEquals(TuningStatus.SLIGHTLY_LOW, TuningStatus.of(-3.1, 3.0))
        assertEquals(TuningStatus.SLIGHTLY_HIGH, TuningStatus.of(10.0, 3.0))
        assertEquals(TuningStatus.TOO_LOW, TuningStatus.of(-25.0, 3.0))
        assertEquals(TuningStatus.TOO_HIGH, TuningStatus.of(40.0, 3.0))
        assertEquals(TuningStatus.SLIGHTLY_HIGH, TuningStatus.of(15.0, 3.0))
        assertEquals("Afinada", TuningStatus.IN_TUNE.label)
    }

    @Test
    fun `sensibilidad del microfono`() {
        assertEquals(-50.0, Sensitivity.thresholdDb(0.5f), 1e-9)
        assertEquals(-35.0, Sensitivity.thresholdDb(0f), 1e-9)
        assertEquals(-65.0, Sensitivity.thresholdDb(1f), 1e-9)
        assertEquals(-65.0, Sensitivity.thresholdDb(5f), 1e-9)
        assertEquals("Media", Sensitivity.label(0.5f))
        assertTrue(abs(Sensitivity.thresholdDb(0.25f) + 42.5) < 1e-9)
    }
}
