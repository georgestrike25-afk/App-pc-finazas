package app.aura.core.weather

import java.time.LocalDate

object ForecastSlots {
    /** Próximas [count] horas a partir de la hora en curso (incluida). */
    fun upcomingHours(hourly: List<HourlyPoint>, nowEpochSeconds: Long, count: Int): List<HourlyPoint> {
        val currentHourStart = nowEpochSeconds - Math.floorMod(nowEpochSeconds, 3600L)
        return hourly.asSequence()
            .filter { it.time >= currentHourStart }
            .sortedBy { it.time }
            .take(count)
            .toList()
    }

    /** Próximos [count] días desde [today] (incluido), según la fecha local del lugar. */
    fun upcomingDays(daily: List<DailyPoint>, today: LocalDate, count: Int): List<DailyPoint> =
        daily.asSequence()
            .filter { runCatching { !LocalDate.parse(it.date).isBefore(today) }.getOrDefault(false) }
            .sortedBy { it.date }
            .take(count)
            .toList()

    /** Pronóstico de mañana (día local siguiente a [today]), si el proveedor lo incluyó. */
    fun tomorrow(daily: List<DailyPoint>, today: LocalDate): DailyPoint? =
        daily.firstOrNull { it.date == today.plusDays(1).toString() }

    /** Máxima y mínima del día local [today], si el proveedor las incluyó. */
    fun todayRange(daily: List<DailyPoint>, today: LocalDate): DailyPoint? =
        daily.firstOrNull { it.date == today.toString() }
}
