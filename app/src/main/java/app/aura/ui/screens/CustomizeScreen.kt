package app.aura.ui.screens

import android.app.WallpaperManager
import android.content.Context
import android.os.Build
import android.widget.Toast
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.requiredSize
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Slider
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
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.aura.R
import app.aura.core.style.Alignment as StyleAlignment
import app.aura.core.style.BackgroundMode
import app.aura.core.style.Brand
import app.aura.core.style.ColorMath
import app.aura.core.style.FontChoice
import app.aura.core.style.IconStyle
import app.aura.core.style.Legibility
import app.aura.core.style.ProfileId
import app.aura.core.style.Profiles
import app.aura.core.style.Spacing
import app.aura.core.style.WidgetConfig
import app.aura.core.style.WidgetStyle
import app.aura.core.time.HourFormat
import app.aura.core.widget.SizeClass
import app.aura.core.widget.WidgetType
import app.aura.data.SettingsRepository
import app.aura.ui.AuraViewModel
import app.aura.ui.components.AuraCard
import app.aura.ui.components.ColorSwatches
import app.aura.ui.components.LabeledRow
import app.aura.ui.components.PreviewContent
import app.aura.ui.components.PreviewWallpaper
import app.aura.ui.components.ScreenHeader
import app.aura.ui.components.SectionTitle
import app.aura.ui.components.Segmented
import app.aura.ui.components.WallpaperBackdrop
import app.aura.ui.components.WidgetPreview
import app.aura.ui.components.previewSize
import app.aura.ui.components.rememberNow
import app.aura.ui.theme.Aura
import kotlin.math.roundToInt

/** Carga la configuración inicial (del widget concreto o del perfil por defecto del tipo). */
@Composable
fun CustomizeRoute(
    viewModel: AuraViewModel,
    type: WidgetType,
    widgetId: Int?,
    onDone: () -> Unit,
    onSavedToWidget: ((WidgetConfig) -> Unit)? = null,
) {
    val profiles by viewModel.profiles.collectAsStateWithLifecycle()
    var initial by remember { mutableStateOf<WidgetConfig?>(null) }
    LaunchedEffect(type, widgetId) {
        initial = if (widgetId != null) {
            viewModel.widgetConfig(widgetId, type)
        } else {
            val p = type.defaultProfile
            WidgetConfig(p, SettingsRepository.defaultStyleFor(type, profiles.getValue(p), customized = false))
        }
    }
    initial?.let { CustomizeScreen(viewModel, type, widgetId, it, onDone, onSavedToWidget) }
}

@Composable
fun CustomizeScreen(
    viewModel: AuraViewModel,
    initialType: WidgetType,
    widgetId: Int?,
    initial: WidgetConfig,
    onBack: () -> Unit,
    onSavedToWidget: ((WidgetConfig) -> Unit)?,
) {
    val context = LocalContext.current
    val settings by viewModel.settings.collectAsStateWithLifecycle()
    val snapshot by viewModel.snapshot.collectAsStateWithLifecycle()
    val profiles by viewModel.profiles.collectAsStateWithLifecycle()
    val now by rememberNow()

    var type by rememberSaveable { mutableStateOf(initialType) }
    var profile by rememberSaveable { mutableStateOf(initial.profile) }
    var style by remember { mutableStateOf(initial.style) }
    var size by rememberSaveable { mutableStateOf(SizeClass.MEDIUM) }
    var wallpaper by rememberSaveable { mutableStateOf(PreviewWallpaper.NIGHT) }
    val deviceColors = remember { wallpaperColors(context) }
    val content = remember(snapshot, settings) { PreviewContent.from(context, snapshot, settings, System.currentTimeMillis()) }
    val system24 = android.text.format.DateFormat.is24HourFormat(context)

    fun edit(transform: (WidgetStyle) -> WidgetStyle) {
        style = transform(style).normalized()
    }

    Column(Modifier.fillMaxSize().windowInsetsPadding(WindowInsets.statusBars)) {
        Box(Modifier.padding(horizontal = 12.dp)) {
            ScreenHeader(if (widgetId != null) "Editar widget" else "Personalizar", onBack = onBack)
        }

        // Vista previa sobre fondos de prueba.
        BoxWithConstraints(
            Modifier
                .padding(horizontal = 16.dp)
                .fillMaxWidth()
                .height(236.dp)
                .clip(RoundedCornerShape(28.dp)),
            contentAlignment = Alignment.Center,
        ) {
            WallpaperBackdrop(wallpaper, deviceColors)
            val (w, h) = previewSize(type, size)
            val scale = minOf(1f, (maxWidth - 24.dp) / w, (maxHeight - 24.dp) / h)
            WidgetPreview(
                type, size, style, content, now, system24, settings,
                modifier = Modifier.requiredSize(w, h).graphicsLayer(scaleX = scale, scaleY = scale),
            )
            if (content.isSample) {
                Surface(
                    color = Color(0x99000000),
                    shape = RoundedCornerShape(8.dp),
                    modifier = Modifier.align(Alignment.TopStart).padding(10.dp),
                ) {
                    Text("Datos de ejemplo", color = Color.White, style = MaterialTheme.typography.labelSmall, modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp))
                }
            }
        }
        Row(
            Modifier.padding(horizontal = 16.dp, vertical = 8.dp).horizontalScroll(rememberScrollState()),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            PreviewWallpaper.entries.forEach { wp ->
                FilterChip(selected = wallpaper == wp, onClick = { wallpaper = wp }, label = { Text(wp.label) })
            }
        }

        Column(
            Modifier
                .weight(1f)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp),
        ) {
            if (widgetId == null) {
                SectionTitle("Modelo")
                Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    WidgetType.entries.forEach { t ->
                        FilterChip(selected = type == t, onClick = { type = t }, label = { Text(t.displayName.removePrefix("Aura ")) })
                    }
                }
            }
            SectionTitle("Tamaño de la vista previa")
            Segmented(listOf(SizeClass.SMALL to "Pequeño", SizeClass.MEDIUM to "Mediano", SizeClass.LARGE to "Grande"), size, { size = it })

            LegibilityHint(style, wallpaper, deviceColors, onFix = { fix -> edit(fix) })

            SectionTitle("Perfil")
            Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                ProfileId.entries.forEach { id ->
                    FilterChip(
                        selected = profile == id,
                        onClick = {
                            profile = id
                            style = SettingsRepository.defaultStyleFor(type, profiles.getValue(id), customized = true)
                        },
                        label = { Text(Profiles.displayName(id)) },
                        colors = FilterChipDefaults.filterChipColors(selectedContainerColor = Aura.tokens.accent.copy(alpha = 0.25f)),
                    )
                }
            }

            SectionTitle("Fondo")
            ChipChoice(
                listOf(
                    BackgroundMode.TRANSPARENT to "Transparente", BackgroundMode.SCENE to "Escena del clima", BackgroundMode.GLASS to "Cristal",
                    BackgroundMode.DARK to "Oscuro", BackgroundMode.LIGHT to "Claro", BackgroundMode.CUSTOM to "Propio",
                ),
                style.background,
            ) { mode ->
                    edit {
                        it.copy(
                            background = mode,
                            opacity = when {
                                mode == BackgroundMode.TRANSPARENT -> 0
                                mode == BackgroundMode.SCENE -> 100
                                it.opacity == 0 -> defaultOpacity(mode)
                                else -> it.opacity
                            },
                        )
                    }
            }
            if (style.background == BackgroundMode.SCENE) {
                Text(
                    "El fondo cambia solo según el tiempo real: sol, nubes, lluvia, tormenta, nieve, niebla o noche.",
                    style = MaterialTheme.typography.bodySmall,
                    color = Aura.tokens.mutedText,
                    modifier = Modifier.padding(top = 6.dp),
                )
            }
            Spacer(Modifier.height(10.dp))
            LabeledRow("Opacidad", supporting = if (style.background == BackgroundMode.TRANSPARENT) "Sin fondo: se ve tu fondo de pantalla" else null) {
                Text("${style.opacity} %", style = MaterialTheme.typography.titleSmall)
            }
            Slider(
                value = style.opacity.toFloat(),
                onValueChange = { v -> edit { it.copy(opacity = v.roundToInt()) } },
                valueRange = 0f..100f,
                enabled = style.background != BackgroundMode.TRANSPARENT,
            )
            if (style.background == BackgroundMode.CUSTOM) {
                Text("Color del fondo", style = MaterialTheme.typography.bodyMedium)
                Spacer(Modifier.height(8.dp))
                ColorPicker(style.customBackgroundColor, BG_COLORS) { c -> edit { it.copy(customBackgroundColor = c) } }
            }

            SectionTitle("Colores")
            Text("Texto", style = MaterialTheme.typography.bodyMedium)
            Spacer(Modifier.height(8.dp))
            ColorPicker(style.textColor, INK_COLORS) { c -> edit { it.copy(textColor = c) } }
            Spacer(Modifier.height(14.dp))
            Text("Iconos", style = MaterialTheme.typography.bodyMedium)
            Spacer(Modifier.height(8.dp))
            ColorPicker(style.iconColor, INK_COLORS) { c -> edit { it.copy(iconColor = c) } }
            Spacer(Modifier.height(12.dp))
            Segmented(
                listOf(IconStyle.REALISTIC to "3D", IconStyle.COLOR to "Línea", IconStyle.MONO to "Mono"),
                style.iconStyle, { s -> edit { it.copy(iconStyle = s) } },
            )

            SectionTitle("Tipografía y tamaños")
            ChipChoice(
                listOf(
                    FontChoice.THIN to "Fina", FontChoice.LIGHT to "Ligera", FontChoice.REGULAR to "Normal", FontChoice.MEDIUM to "Media",
                    FontChoice.BLACK to "Negra", FontChoice.CONDENSED to "Estrecha", FontChoice.SERIF to "Serif", FontChoice.MONO to "Mono",
                ),
                style.font,
            ) { f -> edit { it.copy(font = f) } }
            LabeledRow("Horas en negrita", supporting = "Horas gruesas y minutos finos, p. ej. 02:45") {
                Switch(checked = style.boldHours, onCheckedChange = { v -> edit { it.copy(boldHours = v) } })
            }
            Text("Color de la hora", style = MaterialTheme.typography.bodyMedium)
            Spacer(Modifier.height(8.dp))
            ColorPicker(style.effectiveTimeColor, INK_COLORS) { c -> edit { it.copy(timeColor = c) } }
            if (style.timeColor != null) {
                TextButton(onClick = { edit { it.copy(timeColor = null) } }) { Text("Igual que el texto") }
            }
            Spacer(Modifier.height(6.dp))
            Spacer(Modifier.height(10.dp))
            ScaleSlider("Tamaño de la hora", style.timeScale) { v -> edit { it.copy(timeScale = v) } }
            ScaleSlider("Tamaño de la temperatura", style.temperatureScale) { v -> edit { it.copy(temperatureScale = v) } }
            LabeledRow("Sombra suave", supporting = "Mejora la lectura sobre fondos claros o con detalle") {
                Switch(checked = style.textShadow, onCheckedChange = { v -> edit { it.copy(textShadow = v) } })
            }

            SectionTitle("Disposición")
            Segmented(
                listOf(StyleAlignment.START to "Izquierda", StyleAlignment.CENTER to "Centro", StyleAlignment.END to "Derecha"),
                style.alignment, { a -> edit { it.copy(alignment = a) } },
            )
            Spacer(Modifier.height(8.dp))
            Segmented(
                listOf(Spacing.COMPACT to "Compacto", Spacing.NORMAL to "Normal", Spacing.RELAXED to "Amplio"),
                style.spacing, { s -> edit { it.copy(spacing = s) } },
            )

            SectionTitle("Contenido")
            LabeledRow("Fecha") { Switch(style.showDate, { v -> edit { it.copy(showDate = v) } }) }
            LabeledRow("Ubicación") { Switch(style.showLocation, { v -> edit { it.copy(showLocation = v) } }) }
            LabeledRow("Máxima y mínima") { Switch(style.showHighLow, { v -> edit { it.copy(showHighLow = v) } }) }
            LabeledRow("Pronóstico de mañana", supporting = "En Forecast mediano, Weather grande y Duo") {
                Switch(style.showTomorrow, { v -> edit { it.copy(showTomorrow = v) } })
            }
            Spacer(Modifier.height(8.dp))
            Text("Formato horario", style = MaterialTheme.typography.bodyMedium)
            Spacer(Modifier.height(8.dp))
            Segmented(
                listOf(HourFormat.SYSTEM to "Como la app", HourFormat.H12 to "12 h", HourFormat.H24 to "24 h"),
                style.hourFormat, { f -> edit { it.copy(hourFormat = f) } },
            )
            Spacer(Modifier.height(12.dp))
            Text(
                "Las unidades de temperatura se eligen en Ajustes y valen para todos los widgets.",
                style = MaterialTheme.typography.bodySmall,
                color = Aura.tokens.mutedText,
            )
            Spacer(Modifier.height(24.dp))
        }

        // Acciones
        Column(
            Modifier
                .fillMaxWidth()
                .windowInsetsPadding(WindowInsets.navigationBars)
                .padding(horizontal = 20.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            val config = WidgetConfig(profile, style)
            if (widgetId != null) {
                Button(
                    onClick = {
                        viewModel.saveWidgetConfig(widgetId, config)
                        onSavedToWidget?.invoke(config) ?: onBack()
                    },
                    modifier = Modifier.fillMaxWidth().height(52.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = Aura.tokens.accent, contentColor = Aura.tokens.onAccent),
                ) { Text("Aplicar a este widget") }
            } else if (viewModel.canPinWidgets) {
                Button(
                    onClick = {
                        val ok = viewModel.pinWidget(type, config)
                        Toast.makeText(
                            context,
                            if (ok) "Confirmá en la pantalla de inicio para colocar ${type.displayName}" else "Tu launcher no permite añadir widgets desde apps",
                            Toast.LENGTH_LONG,
                        ).show()
                    },
                    modifier = Modifier.fillMaxWidth().height(52.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = Aura.tokens.accent, contentColor = Aura.tokens.onAccent),
                ) {
                    Icon(painterResource(R.drawable.ic_ui_add), null, Modifier.size(18.dp))
                    Spacer(Modifier.width(8.dp))
                    Text("Añadir a la pantalla de inicio")
                }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(
                    onClick = {
                        viewModel.saveProfile(profile, style)
                        Toast.makeText(context, "Guardado en ${Profiles.displayName(profile)}", Toast.LENGTH_SHORT).show()
                    },
                    modifier = Modifier.weight(1f),
                ) { Text("Guardar en ${Profiles.displayName(profile).removePrefix("Aura ")}", maxLines = 1) }
                TextButton(onClick = {
                    viewModel.resetProfile(profile)
                    style = SettingsRepository.defaultStyleFor(type, Profiles.preset(profile), customized = false)
                }) { Text("Restablecer") }
            }
        }
    }
}

private fun defaultOpacity(mode: BackgroundMode) = when (mode) {
    BackgroundMode.TRANSPARENT -> 0
    BackgroundMode.GLASS -> Profiles.GLASS.opacity
    BackgroundMode.DARK -> Profiles.DARK.opacity
    BackgroundMode.LIGHT -> Profiles.LIGHT.opacity
    BackgroundMode.CUSTOM -> Profiles.CUSTOM.opacity
    BackgroundMode.SCENE -> Profiles.SKY.opacity
}

@Composable
private fun <T> ChipChoice(options: List<Pair<T, String>>, selected: T, onSelect: (T) -> Unit) {
    Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        options.forEach { (value, label) ->
            FilterChip(
                selected = value == selected,
                onClick = { onSelect(value) },
                label = { Text(label) },
                colors = FilterChipDefaults.filterChipColors(selectedContainerColor = Aura.tokens.accent.copy(alpha = 0.25f)),
            )
        }
    }
}

private val INK_COLORS = listOf(Brand.WHITE, Brand.MIST, Brand.SOLAR, Brand.PETROL, Brand.NIGHT)
private val BG_COLORS = listOf(Brand.PETROL, Brand.DEEP, Brand.NIGHT, 0xFF3B2F4A.toInt(), 0xFF2F4A3B.toInt(), Brand.SOLAR)

@Composable
private fun ColorPicker(selected: Int, palette: List<Int>, onSelect: (Int) -> Unit) {
    var hex by remember(selected) { mutableStateOf(ColorMath.toHex(selected).removePrefix("#")) }
    Row(verticalAlignment = Alignment.CenterVertically) {
        ColorSwatches(palette.map { Color(it) }, Color(ColorMath.opaque(selected)), { onSelect(it.toArgb()) })
        Spacer(Modifier.width(12.dp))
        OutlinedTextField(
            value = hex,
            onValueChange = { v ->
                hex = v.filter { it.isLetterOrDigit() }.take(6).uppercase()
                if (hex.length == 6) ColorMath.parseHex(hex)?.let(onSelect)
            },
            prefix = { Text("#") },
            singleLine = true,
            keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Characters),
            modifier = Modifier.width(118.dp),
            textStyle = MaterialTheme.typography.bodyMedium,
        )
    }
}

@Composable
private fun ScaleSlider(label: String, value: Int, onChange: (Int) -> Unit) {
    LabeledRow(label) { Text("$value %", style = MaterialTheme.typography.titleSmall) }
    Slider(
        value = value.toFloat(),
        onValueChange = { onChange((it / 5f).roundToInt() * 5) },
        valueRange = WidgetStyle.MIN_SCALE.toFloat()..WidgetStyle.MAX_SCALE.toFloat(),
    )
}

@Composable
private fun LegibilityHint(style: WidgetStyle, wallpaper: PreviewWallpaper, deviceColors: List<Color>, onFix: ((WidgetStyle) -> WidgetStyle) -> Unit) {
    val reference = representativeColor(wallpaper, deviceColors)
    val report = Legibility.evaluate(style, reference)
    if (report.passes) return
    Spacer(Modifier.height(12.dp))
    AuraCard(padding = 14) {
        Text("Poco contraste sobre este fondo", style = MaterialTheme.typography.titleSmall, color = Aura.tokens.stale)
        Text(
            "Relación ${"%.1f".format(report.ratio)}:1 (mínimo recomendado 3:1 para texto grande).",
            style = MaterialTheme.typography.bodySmall,
            color = Aura.tokens.mutedText,
        )
        Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            TextButton(onClick = { onFix { it.copy(textColor = Legibility.recommendedText(report.surface), iconColor = Legibility.recommendedText(report.surface)) } }) { Text("Ajustar color") }
            if (!style.textShadow) TextButton(onClick = { onFix { it.copy(textShadow = true) } }) { Text("Añadir sombra") }
            if (style.background == BackgroundMode.TRANSPARENT) {
                TextButton(onClick = { onFix { it.copy(background = BackgroundMode.GLASS, opacity = 22) } }) { Text("Usar cristal") }
            }
        }
    }
}

private fun representativeColor(wallpaper: PreviewWallpaper, deviceColors: List<Color>): Int = when (wallpaper) {
    PreviewWallpaper.NIGHT -> 0xFF1B3A55.toInt()
    PreviewWallpaper.DAWN -> 0xFFC0687A.toInt()
    PreviewWallpaper.LIGHT -> 0xFFE4ECF1.toInt()
    PreviewWallpaper.FOREST -> 0xFF4F6B45.toInt()
    PreviewWallpaper.DEVICE -> deviceColors.firstOrNull()?.toArgb() ?: 0xFF455D7A.toInt()
}

/** Colores dominantes del fondo de pantalla real (no requiere permisos; Android 8.1+). */
private fun wallpaperColors(context: Context): List<Color> {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O_MR1) return emptyList()
    val colors = runCatching { WallpaperManager.getInstance(context).getWallpaperColors(WallpaperManager.FLAG_SYSTEM) }.getOrNull()
        ?: return emptyList()
    return listOfNotNull(colors.primaryColor, colors.secondaryColor, colors.tertiaryColor).map { Color(it.toArgb()) }
}

