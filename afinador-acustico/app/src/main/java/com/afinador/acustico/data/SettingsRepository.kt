package com.afinador.acustico.data

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.doublePreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.floatPreferencesKey
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.afinador.core.CustomTunings
import com.afinador.core.ReferencePitch
import com.afinador.core.Sensitivity
import com.afinador.core.Transpose
import com.afinador.core.Tuning
import com.afinador.core.TuningPresets
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

enum class ThemeMode(val label: String) { SYSTEM("Sistema"), LIGHT("Claro"), DARK("Oscuro") }

/** Ajustes persistentes del usuario. */
data class AppSettings(
    val a4: Double = ReferencePitch.DEFAULT,
    val transpose: Int = 0,
    val tuningId: String = TuningPresets.STANDARD.id,
    val sensitivity: Float = Sensitivity.DEFAULT,
    val toleranceCents: Double = 3.0,
    val themeMode: ThemeMode = ThemeMode.SYSTEM,
    val showCents: Boolean = true,
    val keepScreenOn: Boolean = true,
    val onboardingDone: Boolean = false,
    val customTunings: List<Tuning> = emptyList(),
) {
    /** Afinación elegida; si fue eliminada, vuelve a la estándar. */
    val tuning: Tuning
        get() = TuningPresets.byId(tuningId) ?: customTunings.firstOrNull { it.id == tuningId } ?: TuningPresets.STANDARD

    companion object {
        val TOLERANCE_OPTIONS = listOf(1.0, 2.0, 3.0, 5.0)
    }
}

private val Context.dataStore: DataStore<Preferences> by preferencesDataStore(name = "ajustes")

/** Guarda los ajustes en DataStore (archivo local de la app; no sale del teléfono). */
class SettingsRepository(private val context: Context) {

    private object Keys {
        val A4 = doublePreferencesKey("a4")
        val TRANSPOSE = intPreferencesKey("transpose")
        val TUNING = stringPreferencesKey("tuning_id")
        val SENSITIVITY = floatPreferencesKey("sensitivity")
        val TOLERANCE = doublePreferencesKey("tolerance_cents")
        val THEME = stringPreferencesKey("theme")
        val SHOW_CENTS = booleanPreferencesKey("show_cents")
        val KEEP_SCREEN_ON = booleanPreferencesKey("keep_screen_on")
        val ONBOARDING = booleanPreferencesKey("onboarding_done")
        val CUSTOM_TUNINGS = stringPreferencesKey("custom_tunings")
    }

    val settings: Flow<AppSettings> = context.dataStore.data.map { p ->
        AppSettings(
            a4 = ReferencePitch.clamp(p[Keys.A4] ?: ReferencePitch.DEFAULT),
            transpose = Transpose.clamp(p[Keys.TRANSPOSE] ?: 0),
            tuningId = p[Keys.TUNING] ?: TuningPresets.STANDARD.id,
            sensitivity = (p[Keys.SENSITIVITY] ?: Sensitivity.DEFAULT).coerceIn(0f, 1f),
            toleranceCents = p[Keys.TOLERANCE]?.takeIf { it in AppSettings.TOLERANCE_OPTIONS } ?: 3.0,
            themeMode = ThemeMode.entries.firstOrNull { it.name == p[Keys.THEME] } ?: ThemeMode.SYSTEM,
            showCents = p[Keys.SHOW_CENTS] ?: true,
            keepScreenOn = p[Keys.KEEP_SCREEN_ON] ?: true,
            onboardingDone = p[Keys.ONBOARDING] ?: false,
            customTunings = CustomTunings.decode(p[Keys.CUSTOM_TUNINGS]),
        )
    }

    suspend fun setA4(value: Double) = edit { it[Keys.A4] = ReferencePitch.clamp(value) }
    suspend fun setTranspose(value: Int) = edit { it[Keys.TRANSPOSE] = Transpose.clamp(value) }

    /** Suma atómica: varios toques rápidos no se pierden aunque el valor guardado no se haya leído aún. */
    suspend fun changeTranspose(delta: Int) = edit { it[Keys.TRANSPOSE] = Transpose.clamp((it[Keys.TRANSPOSE] ?: 0) + delta) }

    suspend fun changeA4(delta: Double) = edit {
        val current = ReferencePitch.clamp(it[Keys.A4] ?: ReferencePitch.DEFAULT)
        it[Keys.A4] = ReferencePitch.clamp(Math.round((current + delta) * 10.0) / 10.0)
    }
    suspend fun setTuning(id: String) = edit { it[Keys.TUNING] = id }
    suspend fun setSensitivity(value: Float) = edit { it[Keys.SENSITIVITY] = value.coerceIn(0f, 1f) }
    suspend fun setTolerance(value: Double) = edit { it[Keys.TOLERANCE] = value }
    suspend fun setTheme(mode: ThemeMode) = edit { it[Keys.THEME] = mode.name }
    suspend fun setShowCents(value: Boolean) = edit { it[Keys.SHOW_CENTS] = value }
    suspend fun setKeepScreenOn(value: Boolean) = edit { it[Keys.KEEP_SCREEN_ON] = value }
    suspend fun setOnboardingDone(value: Boolean) = edit { it[Keys.ONBOARDING] = value }

    /** Modifica la lista de afinaciones personalizadas de forma atómica. */
    suspend fun updateCustomTunings(transform: (List<Tuning>) -> List<Tuning>) = edit { p ->
        val current = CustomTunings.decode(p[Keys.CUSTOM_TUNINGS])
        val updated = transform(current)
        p[Keys.CUSTOM_TUNINGS] = CustomTunings.encode(updated)
        // Si se borró la afinación activa, volver a la estándar.
        val selected = p[Keys.TUNING]
        if (selected != null && TuningPresets.byId(selected) == null && updated.none { it.id == selected }) {
            p[Keys.TUNING] = TuningPresets.STANDARD.id
        }
    }

    private suspend fun edit(block: (androidx.datastore.preferences.core.MutablePreferences) -> Unit) {
        context.dataStore.edit { block(it) }
    }
}
