package app.aura.core

import app.aura.core.widget.SizeClass
import app.aura.core.widget.WidgetSizing
import app.aura.core.widget.WidgetType
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class WidgetSizingTest {

    @Test
    fun `each breakpoint classifies as its own size class`() {
        WidgetType.entries.forEach { type ->
            val bps = WidgetSizing.breakpoints(type)
            assertEquals(SizeClass.entries.toList(), bps.map { it.sizeClass })
            bps.forEach { bp ->
                assertEquals("$type ${bp.sizeClass}", bp.sizeClass, WidgetSizing.classify(type, bp.minWidthDp, bp.minHeightDp))
            }
        }
    }

    @Test
    fun `larger compositions dominate smaller ones so Android 12 responsive layouts are unambiguous`() {
        WidgetType.entries.forEach { type ->
            WidgetSizing.breakpoints(type).zipWithNext().forEach { (a, b) ->
                assertTrue("$type", b.minWidthDp >= a.minWidthDp && b.minHeightDp >= a.minHeightDp)
            }
        }
    }

    @Test
    fun `typical One UI grid sizes`() {
        // 2×1, 4×1 y 4×2 en una cuadrícula 4×5 del Galaxy S24+.
        assertEquals(SizeClass.SMALL, WidgetSizing.classify(WidgetType.CLOCK, 150, 80))
        assertEquals(SizeClass.MEDIUM, WidgetSizing.classify(WidgetType.CLOCK, 320, 80))
        assertEquals(SizeClass.LARGE, WidgetSizing.classify(WidgetType.CLOCK, 320, 180))
        assertEquals(SizeClass.SMALL, WidgetSizing.classify(WidgetType.WEATHER, 70, 80))
        assertEquals(SizeClass.LARGE, WidgetSizing.classify(WidgetType.DUO, 320, 180))
        assertEquals(SizeClass.LARGE, WidgetSizing.classify(WidgetType.FORECAST, 320, 280))
        assertEquals(SizeClass.SMALL, WidgetSizing.classify(WidgetType.DUO, 20, 20))
    }

    @Test
    fun `scaled sizes`() {
        assertEquals(58f, WidgetSizing.scaled(58, 100))
        assertEquals(69.6f, WidgetSizing.scaled(58, 120), 0.01f)
    }
}
