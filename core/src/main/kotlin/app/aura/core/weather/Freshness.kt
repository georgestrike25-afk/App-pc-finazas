package app.aura.core.weather

import kotlin.math.max

enum class Freshness {
    /** Datos dentro del intervalo de actualización esperado. */
    FRESH,

    /** Datos antiguos: se siguen mostrando, pero marcados como desactualizados. */
    STALE,

    /** Más de [Freshness.EXPIRED_AFTER_MILLIS]: se muestran atenuados y con aviso explícito. */
    EXPIRED;

    companion object {
        const val MINUTE = 60_000L
        const val HOUR = 60 * MINUTE
        const val EXPIRED_AFTER_MILLIS = 12 * HOUR

        fun of(fetchedAtMillis: Long, nowMillis: Long, refreshIntervalMinutes: Int): Freshness {
            val age = nowMillis - fetchedAtMillis
            val staleAfter = max(2L * refreshIntervalMinutes * MINUTE, 90 * MINUTE)
            return when {
                age >= EXPIRED_AFTER_MILLIS -> EXPIRED
                age >= staleAfter -> STALE
                else -> FRESH
            }
        }
    }
}

object RefreshPolicy {
    /** Separación mínima entre dos actualizaciones manuales para no saturar al proveedor. */
    const val MIN_MANUAL_GAP_MILLIS = 2 * Freshness.MINUTE

    /** Margen para que una ejecución periódica algo adelantada no se salte la descarga. */
    private const val PERIODIC_TOLERANCE_MILLIS = 5 * Freshness.MINUTE

    fun shouldRefresh(
        snapshot: WeatherSnapshot?,
        targetPlace: Place?,
        nowMillis: Long,
        refreshIntervalMinutes: Int,
        manual: Boolean,
    ): Boolean {
        if (targetPlace == null) return false
        if (snapshot == null) return true
        if (!samePlace(snapshot.place, targetPlace)) return true
        val age = nowMillis - snapshot.fetchedAtMillis
        if (age < 0) return true // reloj del sistema retrocedido
        return if (manual) {
            age >= MIN_MANUAL_GAP_MILLIS
        } else {
            age >= refreshIntervalMinutes * Freshness.MINUTE - PERIODIC_TOLERANCE_MILLIS
        }
    }

    /** Dos lugares se consideran el mismo si comparten id y están a menos de ~1 km. */
    fun samePlace(a: Place, b: Place): Boolean {
        if (a.id != b.id) return false
        val dLat = kotlin.math.abs(a.coordinates.latitude - b.coordinates.latitude)
        val dLon = kotlin.math.abs(a.coordinates.longitude - b.coordinates.longitude)
        return dLat < 0.01 && dLon < 0.01
    }
}
