package app.aura.studio.ui

import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.calculatePan
import androidx.compose.foundation.gestures.calculateRotation
import androidx.compose.foundation.gestures.calculateZoom
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.input.pointer.positionChanged

/** Arrastre, pellizco y giro con aviso de fin, para registrar un solo paso de deshacer por gesto. */
fun Modifier.transformGesture(
    key: Any?,
    onTransform: (pan: Offset, zoom: Float, rotation: Float) -> Unit,
    onEnd: () -> Unit,
    enabled: Boolean = true,
): Modifier = if (!enabled) this else pointerInput(key) {
    awaitEachGesture {
        awaitFirstDown(requireUnconsumed = false)
        do {
            val event = awaitPointerEvent()
            val zoom = event.calculateZoom()
            val pan = event.calculatePan()
            val rotation = event.calculateRotation()
            if (zoom != 1f || pan != Offset.Zero || rotation != 0f) onTransform(pan, zoom, rotation)
            event.changes.forEach { if (it.positionChanged()) it.consume() }
        } while (event.changes.any { it.pressed })
        onEnd()
    }
}
