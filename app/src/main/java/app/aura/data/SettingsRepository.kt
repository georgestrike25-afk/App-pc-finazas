package app.aura.data

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.emptyPreferences
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import app.aura.core.settings.AppSettings
import app.aura.core.style.Brand
import app.aura.core.style.ProfileId
import app.aura.core.style.Profiles
import app.aura.core.style.WidgetConfig
import app.aura.core.style.WidgetStyle
import app.aura.core.widget.WidgetType
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.io.IOException

private val Context.auraStore: DataStore<Preferences> by preferencesDataStore(name = "aura")

/**
 * Preferencias persistentes: ajustes generales, los cinco perfiles de estilo y la configuración
 * individual de cada widget colocado (clave por appWidgetId). Todo queda en el dispositivo.
 */
class SettingsRepository(context: Context) {
    private val store = context.applicationContext.auraStore

    private val data: Flow<Preferences> = store.data.catch { e ->
        if (e is IOException) emit(emptyPreferences()) else throw e
    }

    val settings: Flow<AppSettings> = data.map { decode<AppSettings>(it[KEY_SETTINGS]) ?: AppSettings() }.distinctUntilChanged()

    val profiles: Flow<Map<ProfileId, WidgetStyle>> = data.map { prefs ->
        ProfileId.entries.associateWith { id -> decode<WidgetStyle>(prefs[profileKey(id)]) ?: Profiles.preset(id) }
    }.distinctUntilChanged()

    val widgetConfigs: Flow<Map<Int, WidgetConfig>> = data.map { prefs ->
        prefs.asMap().mapNotNull { (key, value) ->
            val id = key.name.removePrefix(WIDGET_PREFIX).toIntOrNull()
            if (!key.name.startsWith(WIDGET_PREFIX) || id == null) return@mapNotNull null
            decode<WidgetConfig>(value as? String)?.let { id to it }
        }.toMap()
    }.distinctUntilChanged()

    suspend fun current(): AppSettings = settings.first()

    suspend fun update(transform: (AppSettings) -> AppSettings) {
        store.edit { prefs ->
            val current = decode<AppSettings>(prefs[KEY_SETTINGS]) ?: AppSettings()
            prefs[KEY_SETTINGS] = json.encodeToString(transform(current))
        }
    }

    suspend fun saveProfile(id: ProfileId, style: WidgetStyle) {
        store.edit { it[profileKey(id)] = json.encodeToString(style.normalized()) }
    }

    suspend fun resetProfile(id: ProfileId) {
        store.edit { it.remove(profileKey(id)) }
    }

    suspend fun widgetConfig(appWidgetId: Int, type: WidgetType): WidgetConfig {
        val prefs = data.first()
        decode<WidgetConfig>(prefs[widgetKey(appWidgetId)])?.let { return it }
        val profile = type.defaultProfile
        val base = decode<WidgetStyle>(prefs[profileKey(profile)]) ?: Profiles.preset(profile)
        return WidgetConfig(profile, defaultStyleFor(type, base, customized = prefs[profileKey(profile)] != null))
    }

    suspend fun saveWidgetConfig(appWidgetId: Int, config: WidgetConfig) {
        store.edit { it[widgetKey(appWidgetId)] = json.encodeToString(config.copy(style = config.style.normalized())) }
    }

    suspend fun deleteWidgetConfigs(appWidgetIds: IntArray) {
        store.edit { prefs -> appWidgetIds.forEach { prefs.remove(widgetKey(it)) } }
    }

    /** Borra todo (Ajustes > Privacidad). */
    suspend fun clearAll() {
        store.edit { it.clear() }
    }

    private inline fun <reified T> decode(raw: String?): T? =
        raw?.let { runCatching { json.decodeFromString<T>(it) }.getOrNull() }

    companion object {
        private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true }
        private val KEY_SETTINGS = stringPreferencesKey("settings")
        private const val WIDGET_PREFIX = "widget_"
        private fun profileKey(id: ProfileId) = stringPreferencesKey("profile_${id.name.lowercase()}")
        private fun widgetKey(appWidgetId: Int) = stringPreferencesKey("$WIDGET_PREFIX$appWidgetId")

        /** Aura Night parte de colores atenuados, salvo que el usuario haya editado el perfil. */
        fun defaultStyleFor(type: WidgetType, profileStyle: WidgetStyle, customized: Boolean): WidgetStyle =
            if (type == WidgetType.NIGHT && !customized) {
                profileStyle.copy(textColor = Brand.MIST, iconColor = Brand.MIST, showHighLow = false, showLocation = false)
            } else {
                profileStyle
            }
    }
}
