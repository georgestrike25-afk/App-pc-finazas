package app.aura.core.weather

/** Momento del día según el sol del lugar; define el cielo de la pantalla Clima. */
enum class DayPhase { DAWN, DAY, DUSK, NIGHT }

/** Tramo continuo de horas con lluvia probable (instantes en segundos Unix; [end] es exclusivo). */
data class RainWindow(val start: Long, val end: Long, val peakProbability: Int, val totalMm: Double) {
    val hours: Int get() = ((end - start) / 3600).toInt()
}

object WeatherInsights {
    /** Duración de amanecer y atardecer a cada lado de la salida/puesta del sol. */
    const val TWILIGHT_SECONDS = 45 * 60L

    /** Probabilidad desde la que una hora cuenta como lluviosa. */
    const val RAIN_THRESHOLD = 40

    fun phase(nowSec: Long, sunrise: Long?, sunset: Long?, isDayFallback: Boolean): DayPhase {
        if (sunrise == null || sunset == null || sunset <= sunrise) return if (isDayFallback) DayPhase.DAY else DayPhase.NIGHT
        return when {
            nowSec in (sunrise - TWILIGHT_SECONDS) until (sunrise + TWILIGHT_SECONDS) -> DayPhase.DAWN
            nowSec in (sunset - TWILIGHT_SECONDS) until (sunset + TWILIGHT_SECONDS) -> DayPhase.DUSK
            nowSec in sunrise until sunset -> DayPhase.DAY
            else -> DayPhase.NIGHT
        }
    }

    /** Recorrido del sol entre la salida (0) y la puesta (1); fuera de ese tramo, null. */
    fun sunProgress(nowSec: Long, sunrise: Long?, sunset: Long?): Float? {
        if (sunrise == null || sunset == null || sunset <= sunrise || nowSec !in sunrise..sunset) return null
        return (nowSec - sunrise).toFloat() / (sunset - sunrise)
    }

    /**
     * Próximo tramo con lluvia dentro de las próximas [horizonHours] horas: horas consecutivas con
     * probabilidad ≥ [threshold] o con al menos 0,2 mm previstos. Null si no se espera lluvia.
     */
    fun nextRain(hourly: List<HourlyPoint>, nowSec: Long, horizonHours: Int = 24, threshold: Int = RAIN_THRESHOLD): RainWindow? {
        val hours = ForecastSlots.upcomingHours(hourly, nowSec, horizonHours)
        val firstWet = hours.indexOfFirst { isWet(it, threshold) }
        if (firstWet < 0) return null
        var last = firstWet
        while (last + 1 < hours.size && isWet(hours[last + 1], threshold) && hours[last + 1].time - hours[last].time <= 3600) last++
        val run = hours.subList(firstWet, last + 1)
        return RainWindow(
            start = run.first().time,
            end = run.last().time + 3600,
            peakProbability = run.maxOf { it.precipitationProbability ?: 0 },
            totalMm = run.sumOf { it.precipitationMm ?: 0.0 },
        )
    }

    private fun isWet(h: HourlyPoint, threshold: Int) =
        (h.precipitationProbability ?: 0) >= threshold || (h.precipitationMm ?: 0.0) >= 0.2

    /** Salida y puesta del sol que caen dentro de las horas mostradas, para marcarlas en la franja horaria. */
    fun sunEvents(daily: List<DailyPoint>, from: Long, to: Long): List<Pair<Long, Boolean>> =
        daily.flatMap { d -> listOfNotNull(d.sunrise?.let { it to true }, d.sunset?.let { it to false }) }
            .filter { it.first in from until to }
            .sortedBy { it.first }

    /**
     * Recalcula las condiciones con la regla de [WmoCodes.toCondition] a partir de los datos crudos
     * (código, mm y nubosidad). Sirve para datos guardados por versiones anteriores y para cuando el
     * proveedor no informa la precipitación actual: se usa la de la hora en curso.
     */
    fun reconciled(data: WeatherData, nowSec: Long): WeatherData {
        val hourly = data.hourly.map { h ->
            h.copy(condition = WmoCodes.toCondition(h.weatherCode, h.isDay, null, h.precipitationMm, h.cloudCoverPercent, h.precipitationProbability))
        }
        val c = data.current
        val hour = ForecastSlots.upcomingHours(hourly, nowSec, 1).firstOrNull()
        val mm = c.precipitationMm ?: hour?.precipitationMm
        val pop = hour?.precipitationProbability
        val current = c.copy(
            precipitationMm = mm,
            precipitationProbability = pop,
            condition = WmoCodes.toCondition(c.weatherCode, c.isDay, c.windSpeedKmh, mm, c.cloudCoverPercent, pop),
        )
        return data.copy(current = current, hourly = hourly)
    }

    private val WET = setOf(WeatherCondition.DRIZZLE, WeatherCondition.RAIN, WeatherCondition.THUNDERSTORM, WeatherCondition.SNOW)

    /** Lluvia, nieve o tormenta probable pero sin milímetros previstos ahora: se dice «posible». */
    fun isPossible(c: CurrentConditions): Boolean = c.condition in WET && (c.precipitationMm ?: 0.0) < WmoCodes.WET_MM
}
