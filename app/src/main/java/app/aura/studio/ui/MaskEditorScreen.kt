package app.aura.studio.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.calculatePan
import androidx.compose.foundation.gestures.calculateZoom
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Slider
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.input.pointer.positionChanged
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.aura.R
import app.aura.core.studio.MaskStroke
import app.aura.ui.theme.Aura
import kotlin.math.roundToInt

/**
 * Edición manual de la máscara de profundidad: pincel/borrador con un dedo, zoom y desplazamiento
 * con dos. Funciona siempre, aunque la detección automática no esté disponible.
 */
@Composable
fun MaskEditorScreen(viewModel: StudioViewModel, onDone: () -> Unit) {
    val history by viewModel.history.collectAsStateWithLifecycle()
    val overlay by viewModel.maskOverlay.collectAsStateWithLifecycle()
    val busy by viewModel.busy.collectAsStateWithLifecycle()
    val photo = remember(history?.current?.id) { viewModel.previewPhotoBitmap }
    val project = history?.current

    var erase by remember { mutableStateOf(false) }
    var brushDp by remember { mutableFloatStateOf(28f) }
    var zoom by remember { mutableFloatStateOf(1f) }
    var pan by remember { mutableStateOf(Offset.Zero) }
    var viewSize by remember { mutableStateOf(IntSize.Zero) }
    val live = remember { mutableStateListOf<Offset>() }
    var cursor by remember { mutableStateOf<Offset?>(null) }

    Column(Modifier.fillMaxSize().background(Color.Black).windowInsetsPadding(WindowInsets.statusBars)) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = onDone) { Icon(painterResource(R.drawable.ic_ui_back), "Volver", tint = Color.White) }
            Text("Máscara de profundidad", color = Color.White, style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
            IconButton(onClick = viewModel::undo, enabled = history?.canUndo == true) { Icon(painterResource(R.drawable.ic_ui_undo), "Deshacer", tint = Color.White) }
            IconButton(onClick = viewModel::redo, enabled = history?.canRedo == true) { Icon(painterResource(R.drawable.ic_ui_redo), "Rehacer", tint = Color.White) }
        }

        Box(Modifier.weight(1f).fillMaxWidth()) {
            if (photo == null || project == null) {
                CircularProgressIndicator(Modifier.align(Alignment.Center), color = Aura.tokens.accent)
                return@Box
            }
            val imgW = photo.width.toFloat()
            val imgH = photo.height.toFloat()
            val density = androidx.compose.ui.platform.LocalDensity.current.density

            fun fitScale() = minOf(viewSize.width / imgW, viewSize.height / imgH).takeIf { it > 0f } ?: 1f
            fun toImage(p: Offset): Offset {
                val s = fitScale() * zoom
                val cx = viewSize.width / 2f + pan.x
                val cy = viewSize.height / 2f + pan.y
                return Offset(((p.x - cx) / s + imgW / 2f) / imgW, ((p.y - cy) / s + imgH / 2f) / imgH)
            }

            Canvas(
                Modifier
                    .fillMaxSize()
                    .onSizeChanged { viewSize = it }
                    .pointerInput(project.id) {
                        awaitEachGesture {
                            val down = awaitFirstDown(requireUnconsumed = false)
                            var drawing = true
                            live.clear()
                            live += down.position
                            cursor = down.position
                            do {
                                val event = awaitPointerEvent()
                                if (event.changes.count { it.pressed } > 1) {
                                    // Dos dedos: zoom y desplazamiento; se descarta el trazo en curso.
                                    drawing = false
                                    live.clear()
                                    zoom = (zoom * event.calculateZoom()).coerceIn(1f, 8f)
                                    pan += event.calculatePan()
                                } else if (drawing) {
                                    event.changes.firstOrNull()?.let { c -> live += c.position; cursor = c.position }
                                }
                                event.changes.forEach { if (it.positionChanged()) it.consume() }
                            } while (event.changes.any { it.pressed })
                            if (drawing && live.isNotEmpty()) {
                                val pts = live.flatMap { val q = toImage(it); listOf(q.x, q.y) }
                                val radius = (brushDp * density / (fitScale() * zoom)) / maxOf(imgW, imgH)
                                viewModel.addStroke(MaskStroke(pts, radius, erase))
                            }
                            live.clear()
                            cursor = null
                        }
                    },
            ) {
                val s = fitScale() * zoom
                val w = imgW * s
                val h = imgH * s
                val left = size.width / 2f + pan.x - w / 2f
                val top = size.height / 2f + pan.y - h / 2f
                val dstOffset = IntOffset(left.roundToInt(), top.roundToInt())
                val dstSize = IntSize(w.roundToInt().coerceAtLeast(1), h.roundToInt().coerceAtLeast(1))
                drawImage(photo, dstOffset = dstOffset, dstSize = dstSize)
                overlay?.let { drawImage(it, dstOffset = dstOffset, dstSize = dstSize) }
                if (live.size > 1) {
                    val path = androidx.compose.ui.graphics.Path().apply {
                        moveTo(live[0].x, live[0].y)
                        live.drop(1).forEach { lineTo(it.x, it.y) }
                    }
                    drawPath(
                        path,
                        color = if (erase) Color(0x99FFFFFF) else Color(0x99E5806B),
                        style = Stroke(width = brushDp * density * 2, cap = StrokeCap.Round, join = androidx.compose.ui.graphics.StrokeJoin.Round),
                    )
                }
                cursor?.let { drawCircle(Color.White, radius = brushDp * density, center = it, style = Stroke(width = 2f)) }
            }
            if (busy != null) CircularProgressIndicator(Modifier.align(Alignment.Center), color = Aura.tokens.accent)
        }

        Column(
            Modifier.fillMaxWidth().background(MaterialTheme.colorScheme.background).padding(horizontal = 20.dp, vertical = 10.dp)
                .windowInsetsPadding(WindowInsets.navigationBars),
        ) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                FilterChip(
                    selected = !erase, onClick = { erase = false }, label = { Text("Pincel") },
                    leadingIcon = { Icon(painterResource(R.drawable.ic_ui_brush), null, Modifier.size(16.dp)) },
                    colors = FilterChipDefaults.filterChipColors(selectedContainerColor = Aura.tokens.accent.copy(alpha = 0.25f)),
                )
                FilterChip(
                    selected = erase, onClick = { erase = true }, label = { Text("Borrador") },
                    leadingIcon = { Icon(painterResource(R.drawable.ic_ui_eraser), null, Modifier.size(16.dp)) },
                    colors = FilterChipDefaults.filterChipColors(selectedContainerColor = Aura.tokens.accent.copy(alpha = 0.25f)),
                )
                FilterChip(
                    selected = project?.mask?.inverted == true,
                    onClick = { viewModel.edit { it.copy(mask = it.mask.copy(inverted = !it.mask.inverted)) } },
                    label = { Text("Invertir") },
                    leadingIcon = { Icon(painterResource(R.drawable.ic_ui_invert), null, Modifier.size(16.dp)) },
                )
            }
            Text("Tamaño del pincel", style = MaterialTheme.typography.bodySmall, color = Aura.tokens.mutedText)
            Slider(value = brushDp, onValueChange = { brushDp = it }, valueRange = 6f..80f)
            Text("Suavizado de bordes · ${project?.mask?.feather ?: 0}", style = MaterialTheme.typography.bodySmall, color = Aura.tokens.mutedText)
            Slider(
                value = (project?.mask?.feather ?: 0).toFloat(), valueRange = 0f..30f,
                onValueChange = { v -> viewModel.live { it.copy(mask = it.mask.copy(feather = v.roundToInt())) } },
                onValueChangeFinished = viewModel::commit,
            )
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                Button(onClick = { viewModel.detectSubject() }, colors = ButtonDefaults.buttonColors(containerColor = Aura.tokens.accent, contentColor = Aura.tokens.onAccent)) {
                    Icon(painterResource(R.drawable.ic_ui_auto), null, Modifier.size(16.dp)); Spacer(Modifier.width(6.dp)); Text("Automático")
                }
                Button(onClick = { zoom = 1f; pan = Offset.Zero }) { Text("Ajustar vista") }
                Spacer(Modifier.weight(1f))
                Button(onClick = onDone) { Text("Listo") }
            }
            Text("Rojo = queda delante del reloj. Un dedo pinta, dos dedos hacen zoom y mueven.", style = MaterialTheme.typography.labelSmall, color = Aura.tokens.mutedText)
        }
    }
}
