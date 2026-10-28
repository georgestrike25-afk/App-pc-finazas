package app.aura.core.weather

/** Información pública de un proveedor: se muestra en Ajustes > Fuente meteorológica. */
data class ProviderInfo(
    val id: String,
    val displayName: String,
    val attribution: String,
    val attributionUrl: String,
    val termsSummary: String,
)

/**
 * Contrato independiente del proveedor. Para sustituir Open-Meteo basta con implementar esta
 * interfaz (y [PlaceSearchProvider] si el nuevo servicio ofrece búsqueda de ciudades).
 */
interface WeatherProvider {
    val info: ProviderInfo
    suspend fun fetch(coordinates: Coordinates): WeatherData
}

interface PlaceSearchProvider {
    suspend fun search(query: String, languageTag: String, limit: Int = 10): List<Place>
}

class WeatherProviderException(message: String, cause: Throwable? = null) : Exception(message, cause)
