package app.aura.data

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.location.Address
import android.location.Geocoder
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Build
import android.os.Bundle
import android.os.CancellationSignal
import android.os.Looper
import app.aura.R
import app.aura.core.weather.Coordinates
import app.aura.core.weather.Place
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import java.util.Locale
import kotlin.coroutines.resume
import kotlin.math.round

/**
 * Ubicación del dispositivo con el mínimo de datos: solo permiso aproximado, solo en primer plano
 * (al abrir la app o tocar "Usar mi ubicación"), una lectura puntual y coordenadas redondeadas a
 * 0,01° (~1 km) antes de guardarlas o enviarlas al proveedor. No usa Google Play Services.
 */
class LocationRepository(context: Context) {
    private val appContext = context.applicationContext
    private val manager = appContext.getSystemService(LocationManager::class.java)

    fun hasPermission(): Boolean =
        appContext.checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED

    suspend fun locateDevice(): Place? {
        val location = currentLocation() ?: return null
        val coordinates = Coordinates(roundCoordinate(location.latitude), roundCoordinate(location.longitude))
        val address = reverseGeocode(coordinates)
        return Place(
            id = Place.CURRENT_LOCATION_ID,
            name = address?.locality ?: address?.subAdminArea ?: address?.adminArea
                ?: appContext.getString(R.string.current_location),
            region = address?.adminArea,
            country = address?.countryName,
            coordinates = coordinates,
        )
    }

    @SuppressLint("MissingPermission")
    private suspend fun currentLocation(): Location? {
        if (!hasPermission() || manager == null) return null
        val providers = buildList {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) add(LocationManager.FUSED_PROVIDER)
            add(LocationManager.NETWORK_PROVIDER)
            add(LocationManager.PASSIVE_PROVIDER)
        }.filter { runCatching { manager.isProviderEnabled(it) }.getOrDefault(false) }

        val fresh = providers.firstOrNull { it != LocationManager.PASSIVE_PROVIDER }?.let { provider ->
            withTimeoutOrNull(LOCATION_TIMEOUT_MS) { singleFix(provider) }
        }
        if (fresh != null) return fresh
        return providers.mapNotNull { runCatching { manager.getLastKnownLocation(it) }.getOrNull() }
            .maxByOrNull { it.time }
    }

    @SuppressLint("MissingPermission")
    private suspend fun singleFix(provider: String): Location? = suspendCancellableCoroutine { cont ->
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                val signal = CancellationSignal()
                cont.invokeOnCancellation { signal.cancel() }
                manager!!.getCurrentLocation(provider, signal, appContext.mainExecutor) { location ->
                    if (cont.isActive) cont.resume(location)
                }
            } else {
                val listener = object : LocationListener {
                    override fun onLocationChanged(location: Location) {
                        if (cont.isActive) cont.resume(location)
                    }

                    @Deprecated("Requerido en Android 10 y anteriores")
                    override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) = Unit
                    override fun onProviderEnabled(provider: String) = Unit
                    override fun onProviderDisabled(provider: String) {
                        if (cont.isActive) cont.resume(null)
                    }
                }
                cont.invokeOnCancellation { manager!!.removeUpdates(listener) }
                @Suppress("DEPRECATION")
                manager!!.requestSingleUpdate(provider, listener, Looper.getMainLooper())
            }
        } catch (e: SecurityException) {
            if (cont.isActive) cont.resume(null)
        } catch (e: IllegalArgumentException) {
            if (cont.isActive) cont.resume(null)
        }
    }

    private suspend fun reverseGeocode(c: Coordinates): Address? {
        if (!Geocoder.isPresent()) return null
        val geocoder = Geocoder(appContext, Locale.getDefault())
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            withTimeoutOrNull(LOCATION_TIMEOUT_MS) {
                suspendCancellableCoroutine { cont ->
                    geocoder.getFromLocation(c.latitude, c.longitude, 1, object : Geocoder.GeocodeListener {
                        override fun onGeocode(addresses: MutableList<Address>) {
                            if (cont.isActive) cont.resume(addresses.firstOrNull())
                        }

                        override fun onError(errorMessage: String?) {
                            if (cont.isActive) cont.resume(null)
                        }
                    })
                }
            }
        } else {
            withContext(Dispatchers.IO) {
                @Suppress("DEPRECATION")
                runCatching { geocoder.getFromLocation(c.latitude, c.longitude, 1)?.firstOrNull() }.getOrNull()
            }
        }
    }

    companion object {
        private const val LOCATION_TIMEOUT_MS = 15_000L

        fun roundCoordinate(value: Double): Double = round(value * 100.0) / 100.0
    }
}
