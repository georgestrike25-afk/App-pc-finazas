package app.aura

import android.app.Application
import android.content.Context
import app.aura.core.net.UrlConnectionHttpClient
import app.aura.core.openmeteo.OpenMeteoGeocoder
import app.aura.core.openmeteo.OpenMeteoWeatherProvider
import app.aura.data.LocationRepository
import app.aura.data.SettingsRepository
import app.aura.data.WeatherRepository
import app.aura.widget.WidgetUpdater
import app.aura.work.RefreshScheduler
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

class AuraApp : Application() {
    lateinit var container: AppContainer
        private set

    override fun onCreate() {
        super.onCreate()
        container = AppContainer(this)
        container.appScope.launch {
            RefreshScheduler.schedule(this@AuraApp, container.settings.current(), replace = false)
        }
    }
}

/** Contenedor de dependencias manual: la app es pequeña y no justifica un framework de DI. */
class AppContainer(context: Context) {
    val appScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val http = UrlConnectionHttpClient(userAgent = "Aura/${BuildConfig.VERSION_NAME} (Android)")

    val weatherProvider = OpenMeteoWeatherProvider(http)
    val placeSearch = OpenMeteoGeocoder(http)
    val settings = SettingsRepository(context)
    val weather = WeatherRepository(context, weatherProvider, settings)
    val location = LocationRepository(context)
    val widgets = WidgetUpdater(context, settings, weather)
}

val Context.aura: AppContainer get() = (applicationContext as AuraApp).container
