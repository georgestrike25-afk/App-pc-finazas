package app.aura.core

import app.aura.core.weather.Coordinates
import app.aura.core.weather.CurrentConditions
import app.aura.core.weather.Freshness
import app.aura.core.weather.Freshness.Companion.HOUR
import app.aura.core.weather.Freshness.Companion.MINUTE
import app.aura.core.weather.Place
import app.aura.core.weather.RefreshPolicy
import app.aura.core.weather.WeatherCondition
import app.aura.core.weather.WeatherData
import app.aura.core.weather.WeatherSnapshot
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class FreshnessTest {
    private val now = 1_800_000_000_000L
    private val madrid = Place("om:1", "Madrid", coordinates = Coordinates(40.4165, -3.7026))
    private val sevilla = Place("om:2", "Sevilla", coordinates = Coordinates(37.38, -5.98))

    private fun snapshot(ageMillis: Long, place: Place = madrid) = WeatherSnapshot(
        place = place,
        data = WeatherData(
            CurrentConditions(0, 20.0, weatherCode = 0, isDay = true, condition = WeatherCondition.CLEAR_DAY),
            emptyList(), emptyList(),
        ),
        providerId = "test",
        fetchedAtMillis = now - ageMillis,
    )

    @Test
    fun `freshness thresholds`() {
        assertEquals(Freshness.FRESH, Freshness.of(now - 30 * MINUTE, now, 60))
        assertEquals(Freshness.FRESH, Freshness.of(now - 119 * MINUTE, now, 60))
        assertEquals(Freshness.STALE, Freshness.of(now - 2 * HOUR, now, 60))
        assertEquals(Freshness.STALE, Freshness.of(now - 100 * MINUTE, now, 30))
        assertEquals(Freshness.FRESH, Freshness.of(now - 80 * MINUTE, now, 30))
        assertEquals(Freshness.EXPIRED, Freshness.of(now - 13 * HOUR, now, 360))
    }

    @Test
    fun `periodic refresh respects the configured interval`() {
        assertFalse(RefreshPolicy.shouldRefresh(snapshot(30 * MINUTE), madrid, now, 60, manual = false))
        assertTrue(RefreshPolicy.shouldRefresh(snapshot(56 * MINUTE), madrid, now, 60, manual = false))
        assertTrue(RefreshPolicy.shouldRefresh(null, madrid, now, 60, manual = false))
    }

    @Test
    fun `manual refresh is throttled but allowed after a short gap`() {
        assertFalse(RefreshPolicy.shouldRefresh(snapshot(MINUTE), madrid, now, 60, manual = true))
        assertTrue(RefreshPolicy.shouldRefresh(snapshot(3 * MINUTE), madrid, now, 60, manual = true))
    }

    @Test
    fun `changing place forces a refresh, no place means nothing to fetch`() {
        assertTrue(RefreshPolicy.shouldRefresh(snapshot(MINUTE), sevilla, now, 60, manual = false))
        assertFalse(RefreshPolicy.shouldRefresh(snapshot(10 * HOUR), null, now, 60, manual = true))
    }

    @Test
    fun `device location moving more than about a kilometre counts as a new place`() {
        val here = Place(Place.CURRENT_LOCATION_ID, "Aquí", coordinates = Coordinates(40.0, -3.0))
        val near = here.copy(coordinates = Coordinates(40.004, -3.004))
        val far = here.copy(coordinates = Coordinates(40.05, -3.0))
        assertTrue(RefreshPolicy.samePlace(here, near))
        assertFalse(RefreshPolicy.samePlace(here, far))
    }

    @Test
    fun `a clock moved backwards triggers a refresh`() {
        assertTrue(RefreshPolicy.shouldRefresh(snapshot(-HOUR), madrid, now, 60, manual = false))
    }
}
