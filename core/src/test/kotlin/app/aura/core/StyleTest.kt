package app.aura.core

import app.aura.core.style.BackgroundMode
import app.aura.core.style.Brand
import app.aura.core.style.ColorMath
import app.aura.core.style.Legibility
import app.aura.core.style.ProfileId
import app.aura.core.style.Profiles
import app.aura.core.style.WidgetConfig
import app.aura.core.style.WidgetStyle
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class StyleTest {

    @Test
    fun `transparent mode has no background at all`() {
        assertNull(Profiles.MINIMAL.backgroundArgb())
        assertNull(WidgetStyle(background = BackgroundMode.TRANSPARENT, opacity = 80).backgroundArgb())
        assertNull(WidgetStyle(background = BackgroundMode.DARK, opacity = 0).backgroundArgb())
    }

    @Test
    fun `opacity maps the full 0-100 range to alpha`() {
        assertEquals(0, ColorMath.alphaFromPercent(0))
        assertEquals(128, ColorMath.alphaFromPercent(50))
        assertEquals(255, ColorMath.alphaFromPercent(100))
        assertEquals(255, ColorMath.alphaFromPercent(140))
        val dark = WidgetStyle(background = BackgroundMode.DARK, opacity = 100).backgroundArgb()!!
        assertEquals(Brand.NIGHT, dark)
        val custom = WidgetStyle(background = BackgroundMode.CUSTOM, customBackgroundColor = 0xFF336699.toInt(), opacity = 40)
        assertEquals(0x66336699, custom.backgroundArgb())
    }

    @Test
    fun `glass is translucent white and keeps an edge`() {
        val glass = Profiles.GLASS
        assertEquals(0xFFFFFF, glass.backgroundArgb()!! and 0xFFFFFF)
        assertTrue(ColorMath.alpha(glass.backgroundArgb()!!) in 20..60)
        assertTrue(glass.showsGlassEdge)
        assertFalse(Profiles.DARK.showsGlassEdge)
    }

    @Test
    fun `contrast ratios match WCAG references`() {
        assertEquals(21.0, ColorMath.contrast(0xFF000000.toInt(), 0xFFFFFFFF.toInt()), 0.01)
        assertEquals(1.0, ColorMath.contrast(Brand.NIGHT, Brand.NIGHT), 0.001)
        assertTrue(ColorMath.contrast(Brand.WHITE, Brand.NIGHT) > 15)
        assertTrue(ColorMath.contrast(Brand.SOLAR, Brand.NIGHT) > 10)
    }

    @Test
    fun `legibility flags white text on a white wallpaper unless a panel is used`() {
        val white = 0xFFF2F2F2.toInt()
        assertFalse(Legibility.evaluate(Profiles.MINIMAL, white).passes)
        assertTrue(Legibility.evaluate(Profiles.DARK, white).passes)
        assertTrue(Legibility.evaluate(Profiles.MINIMAL, 0xFF1B2A3A.toInt()).passes)
        assertEquals(Brand.NIGHT, Legibility.recommendedText(white))
    }

    @Test
    fun `hex parsing round trips`() {
        assertEquals(Brand.SOLAR, ColorMath.parseHex("#FFC857"))
        assertEquals("#FFC857", ColorMath.toHex(Brand.SOLAR))
        assertEquals(0x80101D2B.toInt(), ColorMath.parseHex("80101D2B"))
        assertNull(ColorMath.parseHex("xyz"))
    }

    @Test
    fun `widget configs survive serialization`() {
        val config = WidgetConfig(ProfileId.CUSTOM, Profiles.CUSTOM.copy(opacity = 33, timeScale = 120))
        val json = Json.encodeToString(config)
        assertEquals(config, Json.decodeFromString<WidgetConfig>(json))
    }

    @Test
    fun `normalization clamps out of range values`() {
        val s = WidgetStyle(background = BackgroundMode.TRANSPARENT, opacity = 50, timeScale = 300, temperatureScale = 10).normalized()
        assertEquals(0, s.opacity)
        assertEquals(WidgetStyle.MAX_SCALE, s.timeScale)
        assertEquals(WidgetStyle.MIN_SCALE, s.temperatureScale)
    }

    @Test
    fun `every profile has a preset and a name`() {
        ProfileId.entries.forEach {
            Profiles.preset(it)
            assertTrue(Profiles.displayName(it).startsWith("Aura "))
        }
    }
}
