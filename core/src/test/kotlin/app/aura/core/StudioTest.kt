package app.aura.core

import app.aura.core.studio.ClockDesign
import app.aura.core.studio.ClockMaterial
import app.aura.core.studio.ClockText
import app.aura.core.studio.Framing
import app.aura.core.studio.History
import app.aura.core.studio.MaskStroke
import app.aura.core.studio.PhotoFrame
import app.aura.core.studio.StudioProject
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Test

class StudioTest {

    @Test
    fun `history undoes and redoes in order and drops the future on new edits`() {
        var h = History(1)
        h = h.push(2).push(3)
        assertEquals(3, h.current)
        h = h.undo()
        assertEquals(2, h.current)
        assertTrue(h.canRedo)
        h = h.redo()
        assertEquals(3, h.current)
        h = h.undo().undo().push(9)
        assertEquals(9, h.current)
        assertFalse(h.canRedo)
        assertEquals(1, h.undo().current)
    }

    @Test
    fun `history ignores no-op pushes, respects the limit and replace adds no step`() {
        val h = History("a")
        assertSame(h, h.push("a"))
        var big = History(0, limit = 3)
        (1..10).forEach { big = big.push(it) }
        assertEquals(7, big.undo().undo().undo().current)
        assertFalse(big.undo().undo().undo().canUndo)
        val r = History(1).push(2).replace(5)
        assertEquals(5, r.current)
        assertEquals(1, r.undo().current)
    }

    @Test
    fun `cover framing fills the canvas and clamps panning`() {
        // Foto apaisada 4000×3000 en lienzo vertical 1080×2340.
        val p = Framing.place(4000, 3000, 1080, 2340, PhotoFrame())
        assertEquals(2340f / 3000f, p.scale, 1e-4f)
        assertEquals(0f, p.dy, 1e-3f)
        assertTrue(p.dx < 0)
        val farRight = Framing.place(4000, 3000, 1080, 2340, PhotoFrame(offsetX = 5f))
        val w = 4000 * farRight.scale
        assertEquals(0f, farRight.dx, 1e-3f) // borde izquierdo de la foto pegado al del lienzo, sin hueco
        assertTrue(farRight.dx + w >= 1080f)
        val zoomed = Framing.place(4000, 3000, 1080, 2340, PhotoFrame(zoom = 2f, offsetY = -1f))
        assertEquals(2340f - 3000 * zoomed.scale, zoomed.dy, 1e-2f) // tope inferior: sin hueco abajo
    }

    @Test
    fun `materials set coherent starting effects and keep layout`() {
        val d = ClockDesign(centerX = 0.3f, size = 0.2f)
        val neon = d.withMaterial(ClockMaterial.NEON)
        assertEquals(ClockMaterial.NEON, neon.material)
        assertTrue(neon.glow > 0)
        assertEquals(0, neon.depth)
        assertEquals(0.3f, neon.centerX)
        assertEquals(0, d.withMaterial(ClockMaterial.MINIMAL).bevel)
        ClockMaterial.entries.forEach { assertEquals(it, d.withMaterial(it).material) }
    }

    @Test
    fun `normalization clamps every parameter`() {
        val n = ClockDesign(size = 2f, centerX = -1f, lightAngle = -90, opacity = 300, letterSpacing = 3f, glow = -5).normalized()
        assertEquals(ClockDesign.MAX_SIZE, n.size)
        assertEquals(0f, n.centerX)
        assertEquals(270, n.lightAngle)
        assertEquals(100, n.opacity)
        assertEquals(ClockDesign.MAX_SPACING, n.letterSpacing)
        assertEquals(0, n.glow)
    }

    @Test
    fun `clock text splits hours and minutes`() {
        assertEquals("09" to ":05", ClockText.parts(9, 5, is24 = true))
        assertEquals("21" to ":50", ClockText.parts(21, 50, is24 = true))
        assertEquals("9" to ":50", ClockText.parts(21, 50, is24 = false))
        assertEquals("12" to ":00", ClockText.parts(0, 0, is24 = false))
    }

    @Test
    fun `projects round trip through json`() {
        val p = StudioProject(
            "id1", "Atardecer", 1, 2, ClockDesign().withMaterial(ClockMaterial.GLASS), PhotoFrame(1.5f, 0.1f, -0.2f),
            strokes = listOf(MaskStroke(listOf(0.1f, 0.2f, 0.3f, 0.4f), 0.02f, erase = true)), hasMask = true,
        )
        val json = Json.encodeToString(p)
        assertEquals(p, Json.decodeFromString<StudioProject>(json))
    }
}
