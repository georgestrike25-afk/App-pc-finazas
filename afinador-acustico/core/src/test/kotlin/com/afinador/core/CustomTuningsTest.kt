package com.afinador.core

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotEquals
import kotlin.test.assertTrue

class CustomTuningsTest {

    @Test
    fun `guardar y leer afinaciones personalizadas`() {
        val a = CustomTunings.create(emptyList(), "Mi afinación", "Para slide", listOf(38, 45, 50, 55, 59, 62))
        val b = CustomTunings.create(listOf(a), "Con\ttab\ny salto", "desc\tcon\ntabs", listOf(36, 43, 48, 53, 57, 62), preferFlats = true)
        val decoded = CustomTunings.decode(CustomTunings.encode(listOf(a, b)))
        assertEquals(2, decoded.size)
        assertEquals(a, decoded[0])
        assertEquals("Con tab y salto", decoded[1].name)
        assertEquals("desc con tabs", decoded[1].description)
        assertEquals(b.midiNotes, decoded[1].midiNotes)
        assertTrue(decoded[1].preferFlats && decoded.all { it.isCustom })
    }

    @Test
    fun `lineas dañadas se descartan`() {
        val good = CustomTunings.create(emptyList(), "Buena", "", TuningPresets.STANDARD.midiNotes)
        val text = CustomTunings.encode(listOf(good)) + "\nbasura\nid\tn\td\t1,2,3\t0\nid2\tn\td\t40,45,50,55,59,200\t0\n\n"
        assertEquals(listOf(good), CustomTunings.decode(text))
        assertEquals(emptyList(), CustomTunings.decode(null))
        assertEquals(emptyList(), CustomTunings.decode(""))
    }

    @Test
    fun `crear, editar, duplicar y eliminar`() {
        var list = emptyList<Tuning>()
        val created = CustomTunings.create(list, "  ", "", TuningPresets.STANDARD.midiNotes)
        assertEquals("Personalizada", created.name)
        list = CustomTunings.upsert(list, created)

        val edited = created.copy(name = "Editada", midiNotes = TuningPresets.DROP_D.midiNotes)
        list = CustomTunings.upsert(list, edited)
        assertEquals(1, list.size)
        assertEquals("Editada", list[0].name)
        assertEquals(TuningPresets.DROP_D.midiNotes, list[0].midiNotes)

        val copy = CustomTunings.duplicate(list, TuningPresets.OPEN_G)
        assertEquals("Open G (copia)", copy.name)
        assertTrue(copy.isCustom)
        assertNotEquals(TuningPresets.OPEN_G.id, copy.id)
        list = CustomTunings.upsert(list, copy)
        val copy2 = CustomTunings.duplicate(list, TuningPresets.OPEN_G)
        assertEquals("Open G (copia 2)", copy2.name)
        list = CustomTunings.upsert(list, copy2)
        assertEquals(3, list.map { it.id }.toSet().size)

        list = CustomTunings.delete(list, copy.id)
        assertEquals(listOf(edited.id, copy2.id), list.map { it.id })
    }

    @Test
    fun `nombres demasiado largos se recortan`() {
        val t = CustomTunings.create(emptyList(), "x".repeat(100), "y".repeat(500), TuningPresets.STANDARD.midiNotes)
        assertEquals(CustomTunings.MAX_NAME_LENGTH, t.name.length)
        assertEquals(CustomTunings.MAX_DESCRIPTION_LENGTH, t.description.length)
    }

    @Test
    fun `ids nuevos no chocan`() {
        val existing = listOf(TuningPresets.STANDARD.copy(id = "custom_5", isCustom = true))
        assertEquals("custom_6", CustomTunings.newId(existing, seed = 5))
    }
}
