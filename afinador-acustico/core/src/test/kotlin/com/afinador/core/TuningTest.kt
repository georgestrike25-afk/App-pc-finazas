package com.afinador.core

import kotlin.math.pow
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNotEquals
import kotlin.test.assertTrue

class TuningTest {

    /** Notas exigidas por la especificación, de la sexta a la primera cuerda. */
    private val expected = mapOf(
        "Estándar" to "E2 A2 D3 G3 B3 E4",
        "Medio tono abajo" to "Eb2 Ab2 Db3 Gb3 Bb3 Eb4",
        "Un tono abajo" to "D2 G2 C3 F3 A3 D4",
        "Drop D" to "D2 A2 D3 G3 B3 E4",
        "Drop C" to "C2 G2 C3 F3 A3 D4",
        "Open D" to "D2 A2 D3 F#3 A3 D4",
        "Open G" to "D2 G2 D3 G3 B3 D4",
        "Open C" to "C2 G2 C3 G3 C4 E4",
        "Open E" to "E2 B2 E3 G#3 B3 E4",
        "DADGAD" to "D2 A2 D3 G3 A3 D4",
    )

    @Test
    fun `los presets tienen las notas y octavas correctas`() {
        assertEquals(expected.keys.toList(), TuningPresets.ALL.map { it.name })
        for (tuning in TuningPresets.ALL) {
            assertEquals(expected[tuning.name], tuning.noteNames().joinToString(" "), tuning.name)
            assertEquals(6, tuning.midiNotes.size)
            assertTrue(tuning.description.isNotBlank())
        }
    }

    @Test
    fun `los presets son independientes de la grafia`() {
        // Verificación cruzada: semitonos respecto de la afinación estándar.
        val std = TuningPresets.STANDARD.midiNotes
        fun offsets(t: Tuning) = t.midiNotes.zip(std) { a, b -> a - b }
        assertEquals(listOf(-1, -1, -1, -1, -1, -1), offsets(TuningPresets.HALF_STEP_DOWN))
        assertEquals(listOf(-2, -2, -2, -2, -2, -2), offsets(TuningPresets.WHOLE_STEP_DOWN))
        assertEquals(listOf(-2, 0, 0, 0, 0, 0), offsets(TuningPresets.DROP_D))
        assertEquals(listOf(-4, -2, -2, -2, -2, -2), offsets(TuningPresets.DROP_C))
        assertEquals(listOf(-2, 0, 0, -1, -2, -2), offsets(TuningPresets.OPEN_D))
        assertEquals(listOf(-2, -2, 0, 0, 0, -2), offsets(TuningPresets.OPEN_G))
        assertEquals(listOf(-4, -2, -2, 0, 1, 0), offsets(TuningPresets.OPEN_C))
        assertEquals(listOf(0, 2, 2, 1, 0, 0), offsets(TuningPresets.OPEN_E))
        assertEquals(listOf(-2, 0, 0, 0, -2, -2), offsets(TuningPresets.DADGAD))
    }

    @Test
    fun `ids unicos y busqueda por id`() {
        assertEquals(TuningPresets.ALL.size, TuningPresets.ALL.map { it.id }.toSet().size)
        assertEquals(TuningPresets.DROP_D, TuningPresets.byId("drop_d"))
    }

    @Test
    fun `objetivos de la afinacion estandar`() {
        val targets = TuningPresets.STANDARD.targets(440.0, 0)
        assertEquals(listOf(6, 5, 4, 3, 2, 1), targets.map { it.stringNumber })
        assertEquals(listOf("Mi", "La", "Re", "Sol", "Si", "Mi"), targets.map { it.solfege })
        assertEquals(listOf(82.4069, 110.0, 146.8324, 195.9977, 246.9417, 329.6276), targets.map { it.frequency }, 0.0005)
    }

    @Test
    fun `la transposicion cambia los objetivos reales`() {
        val base = TuningPresets.STANDARD.targets(440.0, 0)
        val down2 = TuningPresets.STANDARD.targets(440.0, -2)
        assertEquals(TuningPresets.WHOLE_STEP_DOWN.noteNames(), down2.map { it.name })
        for (i in 0 until 6) {
            assertEquals(base[i].frequency * 2.0.pow(-2 / 12.0), down2[i].frequency, 1e-9)
            assertEquals(base[i].midi - 2, down2[i].midi)
        }
        val up1 = TuningPresets.STANDARD.targets(440.0, 1)
        assertEquals("F2 A#2 D#3 G#3 C4 F4", up1.joinToString(" ") { it.name })
        val up12 = TuningPresets.STANDARD.targets(440.0, 12)
        assertEquals(base.map { it.frequency * 2 }, up12.map { it.frequency }, 1e-9)
    }

    @Test
    fun `referencia y transposicion combinadas son coherentes`() {
        // 432 Hz y −1 semitono deben dar lo mismo que calcular cada nota por separado.
        val combined = TuningPresets.DROP_D.targets(432.0, -1)
        TuningPresets.DROP_D.midiNotes.forEachIndexed { i, midi ->
            assertEquals(432.0 * 2.0.pow((midi - 1 - 69) / 12.0), combined[i].frequency, 1e-9)
        }
        // El orden de los ajustes no importa: transponer y luego cambiar A4 es una sola fórmula.
        val a = TuningPresets.STANDARD.targets(432.0, 3).map { it.frequency }
        val b = TuningPresets.STANDARD.targets(440.0, 3).map { it.frequency * 432.0 / 440.0 }
        assertEquals(a, b, 1e-9)
    }

    @Test
    fun `medio tono abajo se muestra con bemoles al transponer`() {
        assertEquals("D2 G2 C3 F3 A3 D4", TuningPresets.HALF_STEP_DOWN.noteNames(-1).joinToString(" "))
        assertEquals("Db2", TuningPresets.HALF_STEP_DOWN.targets(440.0, -2)[0].name)
    }

    @Test
    fun `la configuracion limita valores fuera de rango`() {
        val cfg = TunerConfig(a4 = 1000.0, transpose = 99)
        assertEquals(TuningPresets.STANDARD.targets(480.0, 12).map { it.frequency }, cfg.targets.map { it.frequency }, 1e-9)
    }

    @Test
    fun `una afinacion necesita seis notas validas`() {
        assertFailsWith<IllegalArgumentException> { Tuning("x", "x", "", listOf(40, 45, 50)) }
        assertFailsWith<IllegalArgumentException> { Tuning("x", "x", "", listOf(10, 45, 50, 55, 59, 64)) }
        assertNotEquals(TuningPresets.STANDARD, TuningPresets.DROP_D)
    }

    private fun assertEquals(expected: List<Double>, actual: List<Double>, tolerance: Double) {
        assertEquals(expected.size, actual.size)
        expected.indices.forEach { assertEquals(expected[it], actual[it], tolerance, "índice $it") }
    }
}
