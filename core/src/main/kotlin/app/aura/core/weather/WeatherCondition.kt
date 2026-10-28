package app.aura.core.weather

/**
 * Condiciones meteorológicas que Aura sabe representar con su iconografía.
 * Cada condición se corresponde con un icono vectorial propio (ver docs/ICONOGRAFIA.md).
 */
enum class WeatherCondition(val isNight: Boolean = false) {
    CLEAR_DAY,
    CLEAR_NIGHT(isNight = true),
    PARTLY_CLOUDY_DAY,
    PARTLY_CLOUDY_NIGHT(isNight = true),
    CLOUDY,
    DRIZZLE,
    RAIN,
    THUNDERSTORM,
    SNOW,
    FOG,
    WIND,
}
