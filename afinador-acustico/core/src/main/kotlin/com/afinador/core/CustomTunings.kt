package com.afinador.core

/**
 * Operaciones y formato de guardado de las afinaciones personalizadas.
 *
 * El formato es texto plano, una afinación por línea con campos separados por tabulaciones:
 * `id  nombre  descripción  midi1,midi2,…,midi6  bemoles(0|1)`.
 */
object CustomTunings {
    const val MAX_NAME_LENGTH = 40
    const val MAX_DESCRIPTION_LENGTH = 120
    private const val ID_PREFIX = "custom_"

    fun encode(tunings: List<Tuning>): String = tunings.joinToString("\n") { t ->
        listOf(
            sanitize(t.id),
            sanitize(t.name),
            sanitize(t.description),
            t.midiNotes.joinToString(","),
            if (t.preferFlats) "1" else "0",
        ).joinToString("\t")
    }

    /** Lee afinaciones guardadas. Las líneas dañadas se descartan sin interrumpir la lectura. */
    fun decode(text: String?): List<Tuning> {
        if (text.isNullOrBlank()) return emptyList()
        return text.lineSequence().mapNotNull { line ->
            val parts = line.split('\t')
            if (parts.size < 4) return@mapNotNull null
            val notes = parts[3].split(',').mapNotNull { it.trim().toIntOrNull() }
            if (notes.size != Tuning.STRING_COUNT || notes.any { it !in Tuning.MIN_MIDI..Tuning.MAX_MIDI }) {
                return@mapNotNull null
            }
            val id = parts[0].ifBlank { return@mapNotNull null }
            Tuning(
                id = id,
                name = parts[1].ifBlank { "Personalizada" },
                description = parts[2],
                midiNotes = notes,
                isCustom = true,
                preferFlats = parts.getOrNull(4) == "1",
            )
        }.distinctBy { it.id }.toList()
    }

    /** Crea un identificador nuevo que no choca con los existentes. */
    fun newId(existing: Collection<Tuning>, seed: Long = System.currentTimeMillis()): String {
        val used = existing.map { it.id }.toSet()
        var n = seed
        while ("$ID_PREFIX$n" in used) n++
        return "$ID_PREFIX$n"
    }

    fun create(existing: List<Tuning>, name: String, description: String, midiNotes: List<Int>, preferFlats: Boolean = false): Tuning =
        Tuning(
            id = newId(existing),
            name = cleanName(name),
            description = cleanDescription(description),
            midiNotes = midiNotes,
            isCustom = true,
            preferFlats = preferFlats,
        )

    /** Copia cualquier afinación (predefinida o personalizada) como una nueva afinación personalizada. */
    fun duplicate(existing: List<Tuning>, source: Tuning): Tuning =
        create(existing, uniqueName(existing, source.name), source.description, source.midiNotes, source.preferFlats)

    /** Agrega o reemplaza (por id) una afinación personalizada. */
    fun upsert(list: List<Tuning>, tuning: Tuning): List<Tuning> {
        val custom = tuning.copy(isCustom = true)
        val index = list.indexOfFirst { it.id == custom.id }
        return if (index >= 0) list.toMutableList().also { it[index] = custom } else list + custom
    }

    fun delete(list: List<Tuning>, id: String): List<Tuning> = list.filterNot { it.id == id }

    fun cleanName(name: String): String = sanitize(name).trim().take(MAX_NAME_LENGTH).ifBlank { "Personalizada" }

    fun cleanDescription(description: String): String = sanitize(description).trim().take(MAX_DESCRIPTION_LENGTH)

    private fun uniqueName(existing: List<Tuning>, base: String): String {
        val names = existing.map { it.name }.toSet()
        val first = cleanName("$base (copia)")
        if (first !in names) return first
        var i = 2
        while (cleanName("$base (copia $i)") in names) i++
        return cleanName("$base (copia $i)")
    }

    private fun sanitize(text: String): String = text.replace('\t', ' ').replace('\n', ' ').replace('\r', ' ')
}
