package app.aura.ui

import android.app.Application
import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.content.Intent
import android.os.Build
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import app.aura.aura
import app.aura.core.settings.AppSettings
import app.aura.core.settings.LocationMode
import app.aura.core.style.ProfileId
import app.aura.core.style.Profiles
import app.aura.core.style.WidgetConfig
import app.aura.core.style.WidgetStyle
import app.aura.core.weather.Place
import app.aura.core.weather.WeatherSnapshot
import app.aura.core.widget.WidgetType
import app.aura.widget.WidgetActionReceiver
import app.aura.work.RefreshScheduler
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.FlowPreview
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.mapLatest
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.util.Locale

sealed interface SearchState {
    data object Idle : SearchState
    data object Loading : SearchState
    data class Results(val places: List<Place>) : SearchState
    data class Error(val message: String) : SearchState
}

class AuraViewModel(application: Application) : AndroidViewModel(application) {
    private val app = application.aura

    val settings: StateFlow<AppSettings> = app.settings.settings.stateIn(viewModelScope, SharingStarted.Eagerly, AppSettings())
    val snapshot: StateFlow<WeatherSnapshot?> = app.weather.snapshot.stateIn(viewModelScope, SharingStarted.Eagerly, null)
    val refreshing: StateFlow<Boolean> = app.weather.refreshing
    val lastError: StateFlow<String?> = app.weather.lastError
    val profiles: StateFlow<Map<ProfileId, WidgetStyle>> = app.settings.profiles
        .stateIn(viewModelScope, SharingStarted.Eagerly, ProfileId.entries.associateWith { Profiles.preset(it) })
    val widgetConfigs: StateFlow<Map<Int, WidgetConfig>> = app.settings.widgetConfigs.stateIn(viewModelScope, SharingStarted.Eagerly, emptyMap())

    private val _placed = MutableStateFlow<Map<Int, WidgetType>>(emptyMap())
    val placedWidgets: StateFlow<Map<Int, WidgetType>> = _placed.asStateFlow()

    private val _locating = MutableStateFlow(false)
    val locating: StateFlow<Boolean> = _locating.asStateFlow()

    private val query = MutableStateFlow("")
    val searchQuery: StateFlow<String> = query.asStateFlow()

    @OptIn(FlowPreview::class, ExperimentalCoroutinesApi::class)
    val search: StateFlow<SearchState> = query
        .debounce(350)
        .distinctUntilChanged()
        .mapLatest { q ->
            if (q.trim().length < 2) {
                SearchState.Idle
            } else {
                runCatching { app.placeSearch.search(q, Locale.getDefault().toLanguageTag(), 10) }
                    .fold({ SearchState.Results(it) }, { SearchState.Error(it.message ?: "Sin conexión") })
            }
        }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), SearchState.Idle)

    val hasLocationPermission: Boolean get() = app.location.hasPermission()

    /** Al volver a primer plano: ubicación (si corresponde) y datos si están vencidos. */
    fun onForeground() {
        refreshPlaced()
        viewModelScope.launch {
            val s = app.settings.current()
            if (s.locationMode == LocationMode.DEVICE && app.location.hasPermission()) locateNow(refreshAfter = false)
            app.weather.refresh(manual = false)
            app.widgets.updateAll()
        }
    }

    fun refresh() {
        viewModelScope.launch {
            app.weather.refresh(manual = true)
            app.widgets.updateAll()
        }
    }

    fun setQuery(value: String) {
        query.value = value
    }

    fun useDeviceLocation() {
        viewModelScope.launch {
            app.settings.update { it.copy(locationMode = LocationMode.DEVICE) }
            locateNow(refreshAfter = true)
        }
    }

    private suspend fun locateNow(refreshAfter: Boolean) {
        _locating.value = true
        try {
            val place = app.location.locateDevice() ?: return
            app.settings.update { it.copy(devicePlace = place) }
            if (refreshAfter) {
                app.weather.refresh(manual = true)
                app.widgets.updateAll()
            }
        } finally {
            _locating.value = false
        }
    }

    fun selectPlace(place: Place) {
        viewModelScope.launch {
            app.settings.update { s ->
                s.copy(
                    locationMode = LocationMode.MANUAL,
                    manualPlace = place,
                    savedPlaces = (listOf(place) + s.savedPlaces.filterNot { it.id == place.id }).take(MAX_SAVED),
                )
            }
            query.value = ""
            app.weather.refresh(manual = true)
            app.widgets.updateAll()
        }
    }

    fun removeSavedPlace(place: Place) {
        viewModelScope.launch { app.settings.update { s -> s.copy(savedPlaces = s.savedPlaces.filterNot { it.id == place.id }) } }
    }

    fun updateSettings(transform: (AppSettings) -> AppSettings) {
        viewModelScope.launch {
            val before = app.settings.current()
            app.settings.update(transform)
            val after = app.settings.current()
            if (before.refreshIntervalMinutes != after.refreshIntervalMinutes || before.wifiOnly != after.wifiOnly) {
                RefreshScheduler.schedule(getApplication(), after, replace = true)
            }
            app.widgets.updateAll()
        }
    }

    fun saveProfile(id: ProfileId, style: WidgetStyle) {
        app.appScope.launch { app.settings.saveProfile(id, style) }
    }

    fun resetProfile(id: ProfileId) {
        viewModelScope.launch { app.settings.resetProfile(id) }
    }

    /** En el ámbito de la app: la pantalla de configuración se cierra justo después de guardar. */
    fun saveWidgetConfig(appWidgetId: Int, config: WidgetConfig) {
        app.appScope.launch {
            app.settings.saveWidgetConfig(appWidgetId, config)
            app.widgets.updateById(appWidgetId)
        }
    }

    suspend fun widgetConfig(appWidgetId: Int, type: WidgetType): WidgetConfig = app.settings.widgetConfig(appWidgetId, type)

    fun refreshPlaced() {
        _placed.value = app.widgets.placed()
    }

    val canPinWidgets: Boolean
        get() = AppWidgetManager.getInstance(getApplication()).isRequestPinAppWidgetSupported

    /** Pide al launcher (One UI lo admite) que coloque el widget con esta configuración ya aplicada. */
    fun pinWidget(type: WidgetType, config: WidgetConfig): Boolean {
        val context = getApplication<Application>()
        val manager = AppWidgetManager.getInstance(context)
        if (!manager.isRequestPinAppWidgetSupported) return false
        val callback = Intent(context, WidgetActionReceiver::class.java)
            .setAction(WidgetActionReceiver.ACTION_PINNED)
            .putExtra(WidgetActionReceiver.EXTRA_CONFIG, Json.encodeToString(config))
        // Mutable: el sistema añade EXTRA_APPWIDGET_ID al confirmar. El Intent es explícito.
        val flags = PendingIntent.FLAG_UPDATE_CURRENT or
            (if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) PendingIntent.FLAG_MUTABLE else 0)
        val pending = PendingIntent.getBroadcast(context, type.ordinal + PIN_REQUEST_BASE, callback, flags)
        return manager.requestPinAppWidget(app.widgets.component(type), null, pending)
    }

    fun clearAllData() {
        viewModelScope.launch {
            app.weather.clear()
            app.settings.clearAll()
            app.widgets.updateAll()
        }
    }

    companion object {
        private const val MAX_SAVED = 8
        private const val PIN_REQUEST_BASE = 100
    }
}
