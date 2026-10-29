package app.aura.studio.ui

import android.content.ActivityNotFoundException
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Slider
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.aura.R
import app.aura.core.studio.ClockMaterial
import app.aura.core.studio.StudioProject
import app.aura.core.style.Brand
import app.aura.core.style.FontChoice
import app.aura.core.time.HourFormat
import app.aura.studio.wallpaper.WallpaperApplier
import app.aura.ui.components.ColorSwatches
import app.aura.ui.components.LabeledRow
import app.aura.ui.components.Segmented
import app.aura.ui.theme.Aura
import kotlin.math.roundToInt

private enum class EditorTab(val label: String) { FRAME("Encuadre"), CLOCK("Reloj"), EFFECTS("Efectos"), DEPTH("Profundidad"), EXPORT("Exportar") }

@Composable
fun StudioEditorScreen(viewModel: StudioViewModel, projectId: String, onBack: () -> Unit, onEditMask: () -> Unit) {
    LaunchedEffect(projectId) { viewModel.open(projectId) }
    val history by viewModel.history.collectAsStateWithLifecycle()
    val preview by viewModel.preview.collectAsStateWithLifecycle()
    val busy by viewModel.busy.collectAsStateWithLifecycle()
    val message by viewModel.message.collectAsStateWithLifecycle()
    val snackbar = remember { SnackbarHostState() }
    var tab by rememberSaveable { mutableStateOf(EditorTab.CLOCK) }
    var area by remember { mutableStateOf(IntSize.Zero) }
    val context = LocalContext.current

    LaunchedEffect(message) {
        message?.let {
            snackbar.showSnackbar(it)
            viewModel.consumeMessage()
        }
    }
    val leave = {
        if (viewModel.hasUnsavedChanges) viewModel.save { onBack() } else onBack()
    }
    BackHandler(onBack = leave)

    val project = history?.current
    Box(Modifier.fillMaxSize()) {
        Column(Modifier.fillMaxSize().windowInsetsPadding(WindowInsets.statusBars)) {
            Row(Modifier.fillMaxWidth().padding(horizontal = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = leave) { Icon(painterResource(R.drawable.ic_ui_back), contentDescription = "Volver") }
                Text(project?.name ?: "Editor", style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f), maxLines = 1)
                IconButton(onClick = viewModel::undo, enabled = history?.canUndo == true) { Icon(painterResource(R.drawable.ic_ui_undo), contentDescription = "Deshacer") }
                IconButton(onClick = viewModel::redo, enabled = history?.canRedo == true) { Icon(painterResource(R.drawable.ic_ui_redo), contentDescription = "Rehacer") }
                IconButton(onClick = { viewModel.save() }) { Icon(painterResource(R.drawable.ic_ui_check), contentDescription = "Guardar", tint = Aura.tokens.accent) }
            }

            // Vista previa con la proporción real de la pantalla.
            Box(Modifier.weight(1f).fillMaxWidth().padding(horizontal = 24.dp, vertical = 6.dp), contentAlignment = Alignment.Center) {
                val ratio = viewModel.screen.width / viewModel.screen.height.toFloat()
                Box(
                    Modifier
                        .aspectRatio(ratio)
                        .clip(RoundedCornerShape(22.dp))
                        .background(Color.Black)
                        .onSizeChanged { area = it }
                        .transformGesture(
                            key = tab,
                            onTransform = { pan, zoom ->
                                if (area.width == 0) return@transformGesture
                                when (tab) {
                                    EditorTab.FRAME -> viewModel.frameLive {
                                        it.copy(zoom = it.zoom * zoom, offsetX = it.offsetX + pan.x / area.width, offsetY = it.offsetY + pan.y / area.height)
                                    }
                                    else -> viewModel.designLive {
                                        it.copy(size = it.size * zoom, centerX = it.centerX + pan.x / area.width, centerY = it.centerY + pan.y / area.height)
                                    }
                                }
                            },
                            onEnd = viewModel::commit,
                        ),
                ) {
                    preview?.let { Image(it, contentDescription = "Vista previa del fondo", modifier = Modifier.fillMaxSize()) }
                    if (preview == null || busy != null) {
                        Column(Modifier.align(Alignment.Center), horizontalAlignment = Alignment.CenterHorizontally) {
                            CircularProgressIndicator(color = Aura.tokens.accent)
                            busy?.let { Text(it, color = Color.White, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(top = 8.dp)) }
                        }
                    }
                    Surface(color = Color(0x88000000), shape = RoundedCornerShape(8.dp), modifier = Modifier.align(Alignment.BottomCenter).padding(8.dp)) {
                        Text(
                            if (tab == EditorTab.FRAME) "Arrastrá y pellizcá para encuadrar la foto" else "Arrastrá y pellizcá para mover y escalar el reloj",
                            color = Color.White, style = MaterialTheme.typography.labelSmall, modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp),
                        )
                    }
                }
            }

            Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = 12.dp), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                EditorTab.entries.forEach { t ->
                    val on = t == tab
                    Text(
                        t.label,
                        color = if (on) Aura.tokens.accent else Aura.tokens.mutedText,
                        fontWeight = if (on) FontWeight.SemiBold else FontWeight.Normal,
                        modifier = Modifier.clip(RoundedCornerShape(10.dp)).clickable { tab = t }.padding(horizontal = 12.dp, vertical = 10.dp),
                    )
                }
            }

            Column(
                Modifier
                    .fillMaxWidth()
                    .height(268.dp)
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = 20.dp)
                    .windowInsetsPadding(WindowInsets.navigationBars),
            ) {
                if (project != null) {
                    when (tab) {
                        EditorTab.FRAME -> FramePanel(viewModel, project)
                        EditorTab.CLOCK -> ClockPanel(viewModel, project)
                        EditorTab.EFFECTS -> EffectsPanel(viewModel, project)
                        EditorTab.DEPTH -> DepthPanel(viewModel, project, onEditMask)
                        EditorTab.EXPORT -> ExportPanel(viewModel, onLive = { intent ->
                            try {
                                context.startActivity(intent)
                            } catch (e: ActivityNotFoundException) {
                                viewModel.applyStatic(WallpaperApplier.Target.HOME)
                            }
                        })
                    }
                }
                Spacer(Modifier.height(16.dp))
            }
        }
        SnackbarHost(snackbar, Modifier.align(Alignment.BottomCenter).padding(bottom = 80.dp))
    }
}

@Composable
private fun StudioSlider(label: String, value: Float, range: ClosedFloatingPointRange<Float>, display: String, onChange: (Float) -> Unit, onDone: () -> Unit) {
    LabeledRow(label) { Text(display, style = MaterialTheme.typography.titleSmall) }
    Slider(value = value.coerceIn(range.start, range.endInclusive), onValueChange = onChange, valueRange = range, onValueChangeFinished = onDone)
}

@Composable
private fun <T> Chips(options: List<Pair<T, String>>, selected: T, onSelect: (T) -> Unit) {
    Row(Modifier.horizontalScroll(rememberScrollState()).padding(vertical = 4.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        options.forEach { (v, label) ->
            FilterChip(
                selected = v == selected, onClick = { onSelect(v) }, label = { Text(label) },
                colors = FilterChipDefaults.filterChipColors(selectedContainerColor = Aura.tokens.accent.copy(alpha = 0.25f)),
            )
        }
    }
}

private val INKS = listOf(Brand.WHITE, Brand.MIST, Brand.SOLAR, 0xFFFF7A59.toInt(), 0xFF7FD6FF.toInt(), Brand.PETROL, Brand.NIGHT)

@Composable
private fun ColumnScope.FramePanel(vm: StudioViewModel, p: StudioProject) {
    StudioSlider("Zoom", p.frame.zoom, 1f..5f, "%.1f×".format(p.frame.zoom), { v -> vm.frameLive { it.copy(zoom = v) } }, vm::commit)
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        OutlinedButton(onClick = { vm.edit { it.copy(frame = it.frame.copy(offsetX = 0f, offsetY = 0f)) } }) { Text("Centrar foto") }
        OutlinedButton(onClick = { vm.edit { it.copy(frame = app.aura.core.studio.PhotoFrame()) } }) { Text("Restablecer") }
    }
    Text(
        "La foto siempre cubre toda la pantalla (${vm.screen.width}×${vm.screen.height}); el original no se modifica.",
        style = MaterialTheme.typography.bodySmall, color = Aura.tokens.mutedText, modifier = Modifier.padding(top = 8.dp),
    )
}

@Composable
private fun ColumnScope.ClockPanel(vm: StudioViewModel, p: StudioProject) {
    val d = p.design
    Chips(
        listOf(
            FontChoice.THIN to "Fina", FontChoice.LIGHT to "Ligera", FontChoice.REGULAR to "Normal", FontChoice.MEDIUM to "Media",
            FontChoice.BLACK to "Negra", FontChoice.CONDENSED to "Estrecha", FontChoice.SERIF to "Serif", FontChoice.MONO to "Mono",
        ),
        d.font,
    ) { f -> vm.design { it.copy(font = f) } }
    LabeledRow("Horas en negrita") { Switch(d.boldHours, { v -> vm.design { it.copy(boldHours = v) } }) }
    Text("Color", style = MaterialTheme.typography.bodyMedium)
    ColorSwatches(INKS.map { Color(it) }, Color(d.color), { c -> vm.design { it.copy(color = c.toArgb()) } }, Modifier.padding(vertical = 8.dp))
    StudioSlider("Tamaño", d.size, 0.10f..0.50f, "${(d.size * 100).roundToInt()} %", { v -> vm.designLive { it.copy(size = v) } }, vm::commit)
    StudioSlider("Espaciado", d.letterSpacing, -0.10f..0.40f, "%.2f".format(d.letterSpacing), { v -> vm.designLive { it.copy(letterSpacing = v) } }, vm::commit)
    StudioSlider("Opacidad", d.opacity.toFloat(), 0f..100f, "${d.opacity} %", { v -> vm.designLive { it.copy(opacity = v.roundToInt()) } }, vm::commit)
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        OutlinedButton(onClick = { vm.design { it.copy(centerX = 0.5f) } }) { Text("Centrar") }
        OutlinedButton(onClick = { vm.design { it.copy(centerX = 0.5f, centerY = 0.28f) } }) { Text("Arriba") }
        OutlinedButton(onClick = { vm.design { it.copy(centerX = 0.5f, centerY = 0.5f) } }) { Text("Medio") }
    }
    LabeledRow("Fecha") { Switch(d.showDate, { v -> vm.design { it.copy(showDate = v) } }) }
    LabeledRow("Clima de Aura", supporting = "Temperatura y ciudad de la última actualización") { Switch(d.showWeather, { v -> vm.design { it.copy(showWeather = v) } }) }
    Segmented(listOf(HourFormat.SYSTEM to "Como la app", HourFormat.H12 to "12 h", HourFormat.H24 to "24 h"), d.hourFormat, { f -> vm.design { it.copy(hourFormat = f) } })
}

@Composable
private fun ColumnScope.EffectsPanel(vm: StudioViewModel, p: StudioProject) {
    val d = p.design
    Chips(
        listOf(ClockMaterial.METAL to "Metal", ClockMaterial.GLASS to "Vidrio", ClockMaterial.NEON to "Neón", ClockMaterial.STONE to "Piedra", ClockMaterial.MINIMAL to "Minimal"),
        d.material,
    ) { m -> vm.design { it.withMaterial(m) } }
    if (d.material == ClockMaterial.METAL || d.material == ClockMaterial.NEON || d.material == ClockMaterial.STONE) {
        Text(if (d.material == ClockMaterial.NEON) "Color del neón" else "Tinte", style = MaterialTheme.typography.bodyMedium)
        ColorSwatches(INKS.map { Color(it) }, Color(d.accentColor), { c -> vm.design { it.copy(accentColor = c.toArgb()) } }, Modifier.padding(vertical = 8.dp))
    }
    StudioSlider("Dirección de la luz", d.lightAngle.toFloat(), 0f..359f, "${d.lightAngle}°", { v -> vm.designLive { it.copy(lightAngle = v.roundToInt()) } }, vm::commit)
    StudioSlider("Sombra", d.shadow.toFloat(), 0f..100f, "${d.shadow}", { v -> vm.designLive { it.copy(shadow = v.roundToInt()) } }, vm::commit)
    StudioSlider("Profundidad (relieve)", d.depth.toFloat(), 0f..100f, "${d.depth}", { v -> vm.designLive { it.copy(depth = v.roundToInt()) } }, vm::commit)
    StudioSlider("Bisel", d.bevel.toFloat(), 0f..100f, "${d.bevel}", { v -> vm.designLive { it.copy(bevel = v.roundToInt()) } }, vm::commit)
    StudioSlider("Reflejo", d.reflection.toFloat(), 0f..100f, "${d.reflection}", { v -> vm.designLive { it.copy(reflection = v.roundToInt()) } }, vm::commit)
    StudioSlider("Brillo", d.glow.toFloat(), 0f..100f, "${d.glow}", { v -> vm.designLive { it.copy(glow = v.roundToInt()) } }, vm::commit)
}

@Composable
private fun ColumnScope.DepthPanel(vm: StudioViewModel, p: StudioProject, onEditMask: () -> Unit) {
    LabeledRow("Sujeto delante del reloj", supporting = if (p.hasMask) "Máscara lista" else "Todavía no hay máscara") {
        Switch(p.design.behindSubject, { v -> vm.design { it.copy(behindSubject = v) } }, enabled = p.hasMask)
    }
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(vertical = 6.dp)) {
        Button(
            onClick = { vm.detectSubject() },
            colors = ButtonDefaults.buttonColors(containerColor = Aura.tokens.accent, contentColor = Aura.tokens.onAccent),
        ) {
            Icon(painterResource(R.drawable.ic_ui_auto), null, Modifier.size(18.dp)); Spacer(Modifier.width(6.dp)); Text("Automático")
        }
        OutlinedButton(onClick = onEditMask) {
            Icon(painterResource(R.drawable.ic_ui_brush), null, Modifier.size(18.dp)); Spacer(Modifier.width(6.dp)); Text("Editar a mano")
        }
    }
    StudioSlider("Suavizado de bordes", p.mask.feather.toFloat(), 0f..30f, "${p.mask.feather}", { v -> vm.live { it.copy(mask = it.mask.copy(feather = v.roundToInt())) } }, vm::commit)
    LabeledRow("Invertir máscara") { Switch(p.mask.inverted, { v -> vm.edit { it.copy(mask = it.mask.copy(inverted = v)) } }) }
    if (p.hasMask) TextButton(onClick = vm::clearMask) { Text("Quitar máscara") }
    Text(
        "La detección usa ML Kit en el teléfono: la foto no se sube a ningún servidor. Si no está disponible, pintá el sujeto con el pincel.",
        style = MaterialTheme.typography.bodySmall, color = Aura.tokens.mutedText,
    )
}

@Composable
private fun ColumnScope.ExportPanel(vm: StudioViewModel, onLive: (android.content.Intent) -> Unit) {
    Button(
        onClick = { vm.prepareLive(onLive) },
        modifier = Modifier.fillMaxWidth().height(52.dp),
        colors = ButtonDefaults.buttonColors(containerColor = Aura.tokens.accent, contentColor = Aura.tokens.onAccent),
    ) { Text("Fondo animado · hora en tiempo real") }
    Text("Fondo estático (la hora queda fija en la imagen)", style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(top = 14.dp, bottom = 6.dp))
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        OutlinedButton(onClick = { vm.applyStatic(WallpaperApplier.Target.HOME) }) { Text("Inicio") }
        OutlinedButton(onClick = { vm.applyStatic(WallpaperApplier.Target.LOCK) }) { Text("Bloqueo") }
        OutlinedButton(onClick = { vm.applyStatic(WallpaperApplier.Target.BOTH) }) { Text("Ambas") }
    }
    OutlinedButton(onClick = vm::saveToGallery, modifier = Modifier.fillMaxWidth().padding(top = 10.dp)) {
        Icon(painterResource(R.drawable.ic_ui_image), null, Modifier.size(18.dp)); Spacer(Modifier.width(8.dp))
        Text("Guardar en Galería (${vm.screen.width}×${vm.screen.height})")
    }
    Text(
        "El fondo animado redibuja el reloj una vez por minuto y se detiene cuando no se ve. En Samsung, la pantalla de bloqueo " +
            "puede no admitir fondos animados de otras apps: usá «Bloqueo» para una imagen estática.",
        style = MaterialTheme.typography.bodySmall, color = Aura.tokens.mutedText, modifier = Modifier.padding(top = 10.dp),
    )
}
