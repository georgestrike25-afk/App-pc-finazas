package app.aura.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.requiredSize
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import android.widget.Toast
import app.aura.core.style.Profiles
import app.aura.core.style.WidgetConfig
import app.aura.core.widget.SizeClass
import app.aura.core.widget.WidgetType
import app.aura.data.SettingsRepository
import app.aura.ui.AuraViewModel
import app.aura.ui.components.AuraCard
import app.aura.ui.components.PreviewContent
import app.aura.ui.components.PreviewWallpaper
import app.aura.ui.components.ScreenHeader
import app.aura.ui.components.SectionTitle
import app.aura.ui.components.WallpaperBackdrop
import app.aura.ui.components.WidgetPreview
import app.aura.ui.components.previewSize
import app.aura.ui.components.rememberNow
import app.aura.ui.theme.Aura

private fun description(type: WidgetType) = when (type) {
    WidgetType.CLOCK -> "Hora grande, fecha opcional. Transparente por defecto."
    WidgetType.WEATHER -> "Icono y temperatura; ubicación y máx./mín. opcionales."
    WidgetType.DUO -> "El principal: hora, temperatura, icono y ubicación."
    WidgetType.FORECAST -> "Clima actual y próximas horas; días en tamaño grande."
    WidgetType.NIGHT -> "Reloj nocturno de baja distracción."
}

@Composable
fun WidgetsScreen(viewModel: AuraViewModel, onCustomize: (WidgetType, Int?) -> Unit) {
    val context = LocalContext.current
    val settings by viewModel.settings.collectAsStateWithLifecycle()
    val snapshot by viewModel.snapshot.collectAsStateWithLifecycle()
    val profiles by viewModel.profiles.collectAsStateWithLifecycle()
    val placed by viewModel.placedWidgets.collectAsStateWithLifecycle()
    val configs by viewModel.widgetConfigs.collectAsStateWithLifecycle()
    val now by rememberNow()
    val sizes = remember { mutableStateMapOf<WidgetType, SizeClass>() }
    val content = remember(snapshot, settings) { PreviewContent.from(context, snapshot, settings, System.currentTimeMillis()) }
    val system24 = android.text.format.DateFormat.is24HourFormat(context)

    LazyColumn(
        Modifier.fillMaxSize().windowInsetsPadding(WindowInsets.statusBars).padding(horizontal = 20.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        item { ScreenHeader("Widgets") }
        if (placed.isNotEmpty()) {
            item { SectionTitle("En tu pantalla de inicio") }
            items(placed.entries.toList(), key = { it.key }) { (id, type) ->
                val profile = configs[id]?.profile ?: type.defaultProfile
                AuraCard(padding = 16) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text(type.displayName, style = MaterialTheme.typography.titleMedium)
                            Text(Profiles.displayName(profile), style = MaterialTheme.typography.bodySmall, color = Aura.tokens.mutedText)
                        }
                        TextButton(onClick = { onCustomize(type, id) }) { Text("Editar") }
                    }
                }
            }
            item { SectionTitle("Catálogo") }
        }
        items(WidgetType.entries.toList(), key = { it.name }) { type ->
            val size = sizes[type] ?: SizeClass.MEDIUM
            val style = SettingsRepository.defaultStyleFor(type, profiles.getValue(type.defaultProfile), customized = false)
            AuraCard(padding = 16) {
                Text(type.displayName, style = MaterialTheme.typography.titleLarge)
                Text(description(type), style = MaterialTheme.typography.bodyMedium, color = Aura.tokens.mutedText)
                Spacer(Modifier.height(12.dp))
                val (w, h) = previewSize(type, size)
                BoxWithConstraints(
                    Modifier.fillMaxWidth().height(h.coerceAtMost(220.dp) + 24.dp).clip(RoundedCornerShape(20.dp)),
                    contentAlignment = Alignment.Center,
                ) {
                    WallpaperBackdrop(PreviewWallpaper.NIGHT, emptyList())
                    val scale = minOf(1f, (maxWidth - 16.dp) / w, (maxHeight - 16.dp) / h)
                    WidgetPreview(
                        type, size, style, content, now, system24, settings,
                        modifier = Modifier.requiredSize(w, h).graphicsLayer(scaleX = scale, scaleY = scale),
                    )
                }
                Spacer(Modifier.height(10.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    listOf(SizeClass.SMALL to "Pequeño", SizeClass.MEDIUM to "Mediano", SizeClass.LARGE to "Grande").forEach { (s, label) ->
                        FilterChip(selected = size == s, onClick = { sizes[type] = s }, label = { Text(label) })
                    }
                }
                Spacer(Modifier.height(8.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    if (viewModel.canPinWidgets) {
                        Button(
                            onClick = {
                                val ok = viewModel.pinWidget(type, WidgetConfig(type.defaultProfile, style))
                                if (!ok) Toast.makeText(context, "Mantené pulsada la pantalla de inicio > Widgets > Aura", Toast.LENGTH_LONG).show()
                            },
                            colors = ButtonDefaults.buttonColors(containerColor = Aura.tokens.accent, contentColor = Aura.tokens.onAccent),
                        ) { Text("Añadir") }
                    }
                    OutlinedButton(onClick = { onCustomize(type, null) }) { Text("Personalizar") }
                }
            }
        }
        item {
            Text(
                "También podés añadirlos manteniendo pulsada la pantalla de inicio › Widgets › Aura. " +
                    "Cada widget guarda su propia configuración; tocá «Editar» o mantenelo pulsado › Configuración.",
                style = MaterialTheme.typography.bodySmall,
                color = Aura.tokens.mutedText,
                modifier = Modifier.padding(bottom = 24.dp),
            )
        }
    }
}
