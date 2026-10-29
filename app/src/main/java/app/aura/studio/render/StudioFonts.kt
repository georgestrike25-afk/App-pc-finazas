package app.aura.studio.render

import android.content.Context
import android.graphics.Typeface
import androidx.annotation.FontRes
import androidx.core.content.res.ResourcesCompat
import app.aura.R

/**
 * Fuentes para números incluidas en Aura (Google Fonts, licencia SIL OFL 1.1; ver
 * docs/licencias/fuentes). Están recortadas a los caracteres del reloj (0–9, «:», a. m./p. m.),
 * por eso las 20 ocupan ≈100 KB.
 */
object StudioFonts {
    data class Entry(val id: String, val label: String, @FontRes val res: Int)

    val all = listOf(
        Entry("clock_bebas", "Bebas Neue", R.font.clock_bebas),
        Entry("clock_anton", "Anton", R.font.clock_anton),
        Entry("clock_oswald", "Oswald", R.font.clock_oswald),
        Entry("clock_teko", "Teko", R.font.clock_teko),
        Entry("clock_rajdhani", "Rajdhani", R.font.clock_rajdhani),
        Entry("clock_orbitron", "Orbitron", R.font.clock_orbitron),
        Entry("clock_audiowide", "Audiowide", R.font.clock_audiowide),
        Entry("clock_michroma", "Michroma", R.font.clock_michroma),
        Entry("clock_russo", "Russo One", R.font.clock_russo),
        Entry("clock_blackops", "Black Ops", R.font.clock_blackops),
        Entry("clock_monoton", "Monoton", R.font.clock_monoton),
        Entry("clock_bungee", "Bungee", R.font.clock_bungee),
        Entry("clock_righteous", "Righteous", R.font.clock_righteous),
        Entry("clock_sharetech", "Share Tech", R.font.clock_sharetech),
        Entry("clock_majormono", "Major Mono", R.font.clock_majormono),
        Entry("clock_poiret", "Poiret One", R.font.clock_poiret),
        Entry("clock_comfortaa", "Comfortaa", R.font.clock_comfortaa),
        Entry("clock_abril", "Abril Fatface", R.font.clock_abril),
        Entry("clock_playfair", "Playfair", R.font.clock_playfair),
        Entry("clock_pacifico", "Pacifico", R.font.clock_pacifico),
    )

    private val cache = HashMap<String, Typeface>()

    fun resolver(context: Context): (String) -> Typeface? {
        val app = context.applicationContext
        return { id ->
            synchronized(cache) {
                cache[id] ?: all.firstOrNull { it.id == id }
                    ?.let { runCatching { ResourcesCompat.getFont(app, it.res) }.getOrNull() }
                    ?.also { cache[id] = it }
            }
        }
    }
}
