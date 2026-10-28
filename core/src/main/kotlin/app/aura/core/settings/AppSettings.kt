package app.aura.core.settings

import app.aura.core.time.HourFormat
import app.aura.core.units.TemperatureUnit
import app.aura.core.weather.Place
import kotlinx.serialization.Serializable

@Serializable
enum class LocationMode { DEVICE, MANUAL }

@Serializable
enum class ThemeMode { SYSTEM, LIGHT, DARK }

@Serializable
data class AppSettings(
    val temperatureUnit: TemperatureUnit = TemperatureUnit.CELSIUS,
    val hourFormat: HourFormat = HourFormat.SYSTEM,
    /** Minutos entre actualizaciones automáticas. WorkManager no admite menos de 15. */
    val refreshIntervalMinutes: Int = 60,
    val locationMode: LocationMode = LocationMode.MANUAL,
    /** Ciudad elegida a mano (modo MANUAL) o último lugar resuelto por el dispositivo (modo DEVICE). */
    val manualPlace: Place? = null,
    val devicePlace: Place? = null,
    val savedPlaces: List<Place> = emptyList(),
    val wifiOnly: Boolean = false,
    val providerId: String = "open-meteo",
    val themeMode: ThemeMode = ThemeMode.SYSTEM,
    val onboardingDone: Boolean = false,
) {
    val activePlace: Place?
        get() = when (locationMode) {
            LocationMode.DEVICE -> devicePlace ?: manualPlace
            LocationMode.MANUAL -> manualPlace
        }

    companion object {
        val REFRESH_CHOICES = listOf(30, 60, 120, 180, 360)
    }
}
