package app.aura.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.aura.core.time.ClockPatterns
import app.aura.core.units.TemperatureFormatter
import app.aura.core.weather.ForecastSlots
import app.aura.ui.AuraViewModel
import app.aura.ui.WeatherText
import app.aura.ui.components.AuraCard
import app.aura.ui.components.ScreenHeader
import app.aura.ui.components.SectionTitle
import app.aura.ui.components.WeatherIcon
import app.aura.ui.theme.Aura
import app.aura.ui.theme.AuraPalette
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

@Composable
fun ForecastScreen(viewModel: AuraViewModel, onOpenLocation: () -> Unit) {
    val settings by viewModel.settings.collectAsStateWithLifecycle()
    val snapshot by viewModel.snapshot.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val unit = settings.temperatureUnit

    Column(Modifier.fillMaxSize().windowInsetsPadding(WindowInsets.statusBars).padding(horizontal = 20.dp)) {
        ScreenHeader("Pronóstico")
        val snap = snapshot
        if (snap == null) {
            AuraCard {
                Text("Todavía no hay pronóstico.", style = MaterialTheme.typography.titleMedium)
                Spacer(Modifier.height(12.dp))
                Button(onClick = onOpenLocation) { Text("Elegir ubicación") }
            }
            return@Column
        }
        val zone = snap.data.timeZoneId?.let { runCatching { ZoneId.of(it) }.getOrNull() } ?: ZoneId.systemDefault()
        val is24 = ClockPatterns.is24(settings.hourFormat, android.text.format.DateFormat.is24HourFormat(context))
        val hourFormat = DateTimeFormatter.ofPattern(if (is24) "HH:mm" else "h a", Locale.getDefault())
        val hours = ForecastSlots.upcomingHours(snap.data.hourly, System.currentTimeMillis() / 1000, 24)
        val today = LocalDate.now(zone)
        val days = ForecastSlots.upcomingDays(snap.data.daily, today, 6)
        val weekMin = days.minOfOrNull { it.minC } ?: 0.0
        val weekMax = days.maxOfOrNull { it.maxC } ?: 1.0

        LazyColumn(Modifier.fillMaxSize()) {
            item {
                Text(
                    listOfNotNull(snap.place.name, snap.place.subtitle.ifBlank { null }).joinToString(" · "),
                    style = MaterialTheme.typography.bodyMedium,
                    color = Aura.tokens.mutedText,
                )
                SectionTitle("Próximas horas")
                AuraCard(padding = 12) {
                    LazyRow(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                        items(hours, key = { it.time }) { h ->
                            Column(Modifier.width(60.dp).padding(vertical = 8.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                                Text(
                                    if (h == hours.first()) "Ahora" else hourFormat.format(Instant.ofEpochSecond(h.time).atZone(zone)),
                                    style = MaterialTheme.typography.labelMedium,
                                    color = Aura.tokens.mutedText,
                                )
                                Spacer(Modifier.height(8.dp))
                                WeatherIcon(h.condition, 30.dp, MaterialTheme.colorScheme.onSurface, contentDescription = WeatherText.condition(context, h.condition))
                                Spacer(Modifier.height(8.dp))
                                Text(TemperatureFormatter.short(h.temperatureC, unit), style = MaterialTheme.typography.titleMedium)
                                Text(
                                    h.precipitationProbability?.takeIf { it > 0 }?.let { "$it %" } ?: " ",
                                    style = MaterialTheme.typography.labelSmall,
                                    color = Aura.tokens.mutedText,
                                )
                            }
                        }
                    }
                }
                SectionTitle("Próximos días")
            }
            item {
                AuraCard(padding = 16) {
                    days.forEachIndexed { index, d ->
                        val date = LocalDate.parse(d.date)
                        Row(Modifier.fillMaxWidth().padding(vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                            Text(
                                if (date == today) "Hoy" else DateTimeFormatter.ofPattern("EEEE", Locale.getDefault()).format(date).replaceFirstChar { it.titlecase() },
                                style = MaterialTheme.typography.bodyLarge,
                                modifier = Modifier.width(96.dp),
                                maxLines = 1,
                            )
                            WeatherIcon(d.condition, 28.dp, MaterialTheme.colorScheme.onSurface, contentDescription = WeatherText.condition(context, d.condition))
                            Text(
                                d.precipitationProbabilityMax?.takeIf { it >= 10 }?.let { "$it %" } ?: "",
                                style = MaterialTheme.typography.labelSmall,
                                color = Aura.tokens.mutedText,
                                modifier = Modifier.width(40.dp).padding(start = 6.dp),
                            )
                            Text(TemperatureFormatter.short(d.minC, unit), style = MaterialTheme.typography.bodyMedium, color = Aura.tokens.mutedText, modifier = Modifier.width(34.dp))
                            RangeBar(d.minC, d.maxC, weekMin, weekMax, Modifier.weight(1f))
                            Text(TemperatureFormatter.short(d.maxC, unit), style = MaterialTheme.typography.bodyMedium, modifier = Modifier.width(38.dp).padding(start = 8.dp))
                        }
                        if (index < days.lastIndex) HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
                    }
                }
                Spacer(Modifier.height(12.dp))
                Text(
                    "Fuente: ${viewModelAttribution()} · Pronóstico hasta ${days.size} días.",
                    style = MaterialTheme.typography.bodySmall,
                    color = Aura.tokens.mutedText,
                )
                Spacer(Modifier.height(24.dp))
            }
        }
    }
}

private fun viewModelAttribution() = "Open-Meteo.com (CC BY 4.0)"

@Composable
private fun RangeBar(min: Double, max: Double, weekMin: Double, weekMax: Double, modifier: Modifier) {
    val span = (weekMax - weekMin).takeIf { it > 0.1 } ?: 1.0
    val start = ((min - weekMin) / span).toFloat().coerceIn(0f, 1f)
    val end = ((max - weekMin) / span).toFloat().coerceIn(start, 1f)
    Box(modifier.height(6.dp).clip(RoundedCornerShape(3.dp)).background(MaterialTheme.colorScheme.outlineVariant)) {
        Row(Modifier.fillMaxSize()) {
            if (start > 0f) Spacer(Modifier.weight(start))
            Box(
                Modifier
                    .weight((end - start).coerceAtLeast(0.04f))
                    .fillMaxHeight()
                    .clip(RoundedCornerShape(3.dp))
                    .background(Brush.horizontalGradient(listOf(AuraPalette.Petrol, AuraPalette.Solar))),
            )
            if (end < 1f) Spacer(Modifier.weight(1f - end))
        }
    }
}
