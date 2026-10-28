package app.aura.data

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.emptyPreferences
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import app.aura.core.weather.RefreshPolicy
import app.aura.core.weather.WeatherProvider
import app.aura.core.weather.WeatherProviderException
import app.aura.core.weather.WeatherSnapshot
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.io.IOException

private val Context.weatherCache: DataStore<Preferences> by preferencesDataStore(name = "weather_cache")

sealed interface RefreshResult {
    data object Updated : RefreshResult
    data object NotNeeded : RefreshResult
    data object NoPlace : RefreshResult
    data class Failed(val message: String) : RefreshResult
}

/**
 * Fuente única de datos meteorológicos para app y widgets. Conserva la última respuesta válida;
 * si una actualización falla (p. ej. sin conexión) los datos anteriores siguen disponibles y la
 * interfaz los marca como desactualizados según su antigüedad.
 */
class WeatherRepository(
    context: Context,
    private val provider: WeatherProvider,
    private val settings: SettingsRepository,
    private val clock: () -> Long = System::currentTimeMillis,
) {
    private val store = context.applicationContext.weatherCache
    private val mutex = Mutex()

    private val _refreshing = MutableStateFlow(false)
    val refreshing: StateFlow<Boolean> = _refreshing.asStateFlow()

    private val _lastError = MutableStateFlow<String?>(null)
    val lastError: StateFlow<String?> = _lastError.asStateFlow()

    val snapshot: Flow<WeatherSnapshot?> = store.data
        .catch { e -> if (e is IOException) emit(emptyPreferences()) else throw e }
        .map { prefs -> prefs[KEY]?.let { runCatching { json.decodeFromString<WeatherSnapshot>(it) }.getOrNull() } }
        .distinctUntilChanged()

    suspend fun cached(): WeatherSnapshot? = snapshot.first()

    suspend fun refresh(manual: Boolean): RefreshResult = mutex.withLock {
        val appSettings = settings.current()
        val place = appSettings.activePlace ?: return RefreshResult.NoPlace
        val now = clock()
        if (!RefreshPolicy.shouldRefresh(cached(), place, now, appSettings.refreshIntervalMinutes, manual)) {
            return RefreshResult.NotNeeded
        }
        _refreshing.value = true
        try {
            val data = provider.fetch(place.coordinates)
            val snap = WeatherSnapshot(place, data, provider.info.id, fetchedAtMillis = clock())
            store.edit { it[KEY] = json.encodeToString(snap) }
            _lastError.value = null
            RefreshResult.Updated
        } catch (e: WeatherProviderException) {
            _lastError.value = e.message
            RefreshResult.Failed(e.message ?: "Error")
        } finally {
            _refreshing.value = false
        }
    }

    suspend fun clear() {
        store.edit { it.clear() }
    }

    companion object {
        private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true }
        private val KEY = stringPreferencesKey("snapshot")
    }
}
