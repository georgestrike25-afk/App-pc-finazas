package com.afinador.core

/**
 * Una afinación de guitarra de seis cuerdas.
 *
 * [midiNotes] se ordena desde la sexta cuerda (la más grave) hasta la primera.
 */
data class Tuning(
    val id: String,
    val name: String,
    val description: String,
    val midiNotes: List<Int>,
    val isCustom: Boolean = false,
    val preferFlats: Boolean = false,
) {
    init {
        require(midiNotes.size == STRING_COUNT) { "Una afinación necesita exactamente $STRING_COUNT notas" }
        require(midiNotes.all { it in MIN_MIDI..MAX_MIDI }) { "Nota fuera del rango permitido" }
    }

    /** Nombres de las notas sin transponer, de la sexta a la primera cuerda. */
    fun noteNames(transpose: Int = 0): List<String> = midiNotes.map { NoteMath.noteName(it + transpose, preferFlats) }

    /** Objetivos reales de afinación con la referencia [a4] y la transposición [transpose] aplicadas. */
    fun targets(a4: Double, transpose: Int): List<StringTarget> = midiNotes.mapIndexed { index, midi ->
        val transposed = midi + transpose
        StringTarget(
            index = index,
            stringNumber = STRING_COUNT - index,
            midi = transposed,
            frequency = NoteMath.midiToFrequency(transposed, a4),
            name = NoteMath.noteName(transposed, preferFlats),
            pitchName = NoteMath.pitchName(transposed, preferFlats),
            solfege = NoteMath.solfegeName(transposed, preferFlats),
        )
    }

    companion object {
        const val STRING_COUNT = 6

        /** Rango de notas admitidas en afinaciones (C1 a E5), antes de transponer. */
        const val MIN_MIDI = 24
        const val MAX_MIDI = 76
    }
}

/** Objetivo de afinación de una cuerda concreta. */
data class StringTarget(
    /** Posición en la lista: 0 = sexta cuerda, 5 = primera cuerda. */
    val index: Int,
    /** Número de cuerda en la guitarra: 6 = la más grave, 1 = la más aguda. */
    val stringNumber: Int,
    val midi: Int,
    val frequency: Double,
    val name: String,
    val pitchName: String,
    val solfege: String,
)

/** Afinaciones predefinidas. Las notas se escriben de la sexta a la primera cuerda. */
object TuningPresets {
    val STANDARD = preset(
        "estandar", "Estándar",
        "La afinación más usada en guitarra acústica.",
        "E2", "A2", "D3", "G3", "B3", "E4",
    )
    val HALF_STEP_DOWN = preset(
        "medio_tono_abajo", "Medio tono abajo",
        "Toda la guitarra un semitono más grave. Común en rock y blues.",
        "Eb2", "Ab2", "Db3", "Gb3", "Bb3", "Eb4", flats = true,
    )
    val WHOLE_STEP_DOWN = preset(
        "un_tono_abajo", "Un tono abajo",
        "Toda la guitarra dos semitonos más grave. Sonido más grueso.",
        "D2", "G2", "C3", "F3", "A3", "D4",
    )
    val DROP_D = preset(
        "drop_d", "Drop D",
        "Sexta cuerda bajada a Re para acordes de quinta con un dedo.",
        "D2", "A2", "D3", "G3", "B3", "E4",
    )
    val DROP_C = preset(
        "drop_c", "Drop C",
        "Un tono abajo con la sexta cuerda bajada a Do.",
        "C2", "G2", "C3", "F3", "A3", "D4",
    )
    val OPEN_D = preset(
        "open_d", "Open D",
        "Al aire suena un acorde de Re mayor. Ideal para slide.",
        "D2", "A2", "D3", "F#3", "A3", "D4",
    )
    val OPEN_G = preset(
        "open_g", "Open G",
        "Al aire suena un acorde de Sol mayor. Muy usada en blues.",
        "D2", "G2", "D3", "G3", "B3", "D4",
    )
    val OPEN_C = preset(
        "open_c", "Open C",
        "Al aire suena un acorde de Do mayor, amplio y resonante.",
        "C2", "G2", "C3", "G3", "C4", "E4",
    )
    val OPEN_E = preset(
        "open_e", "Open E",
        "Al aire suena un acorde de Mi mayor. Brillante, para slide.",
        "E2", "B2", "E3", "G#3", "B3", "E4",
    )
    val DADGAD = preset(
        "dadgad", "DADGAD",
        "Afinación modal muy usada en música celta y folk.",
        "D2", "A2", "D3", "G3", "A3", "D4",
    )

    val ALL: List<Tuning> = listOf(
        STANDARD, HALF_STEP_DOWN, WHOLE_STEP_DOWN, DROP_D, DROP_C,
        OPEN_D, OPEN_G, OPEN_C, OPEN_E, DADGAD,
    )

    fun byId(id: String): Tuning? = ALL.firstOrNull { it.id == id }

    private fun preset(id: String, name: String, description: String, vararg notes: String, flats: Boolean = false): Tuning =
        Tuning(
            id = id,
            name = name,
            description = description,
            midiNotes = notes.map { requireNotNull(NoteMath.parseNote(it)) { "Nota inválida: $it" } },
            preferFlats = flats,
        )
}
