package app.aura.ui.screens

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.ui.draw.clip
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AssistChip
import androidx.compose.material3.AssistChipDefaults
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.aura.R
import app.aura.core.settings.AppSettings
import app.aura.core.time.ClockPatterns
import app.aura.core.units.TemperatureFormatter
import app.aura.core.weather.ForecastSlots
import app.aura.core.weather.Freshness
import app.aura.core.weather.WeatherSnapshot
import app.aura.ui.AuraViewModel
import app.aura.ui.WeatherText
import app.aura.ui.components.AuraCard
import app.aura.ui.components.WeatherIcon
import app.aura.ui.components.rememberNow
import app.aura.ui.theme.Aura
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlin.math.roundToInt

@Composable
fun HomeScreen(
    viewModel: AuraViewModel,
    onOpenLocation: () -> Unit,
    onOpenWidgets: () -> Unit,
    onCustomize: () -> Unit,
    onOpenForecast: () -> Unit,
    onOpenStudio: () -> Unit = {},
) {
    val settings by viewModel.settings.collectAsStateWithLifecycle()
    val snapshot by viewModel.snapshot.collectAsStateWithLifecycle()
    val refreshing by viewModel.refreshing.collectAsStateWithLifecycle()
    val error by viewModel.lastError.collectAsStateWithLifecycle()
    val now by rememberNow()
    val context = LocalContext.current
    val is24 = ClockPatterns.is24(settings.hourFormat, android.text.format.DateFormat.is24HourFormat(context))

    Column(
        Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .windowInsetsPadding(WindowInsets.statusBars)
            .padding(horizontal = 20.dp),
    ) {
        Row(Modifier.fillMaxWidth().padding(top = 12.dp), verticalAlignment = Alignment.CenterVertically) {
            Image(painterResource(R.drawable.ic_aura_mark), contentDescription = null, modifier = Modifier.size(28.dp))
            Spacer(Modifier.width(10.dp))
            Text("Aura", style = MaterialTheme.typography.titleLarge, modifier = Modifier.weight(1f).semantics { heading() })
            AssistChip(
                onClick = onOpenLocation,
                label = { Text(settings.activePlace?.name ?: "Elegir ciudad", maxLines = 1, overflow = TextOverflow.Ellipsis) },
                leadingIcon = { Icon(painterResource(R.drawable.ic_ui_location), null, Modifier.size(18.dp)) },
                colors = AssistChipDefaults.assistChipColors(labelColor = MaterialTheme.colorScheme.onSurface),
            )
        }

        // Hora y fecha: protagonistas.
        Spacer(Modifier.height(36.dp))
        Row(verticalAlignment = Alignment.Bottom) {
            Text(
                now.format(DateTimeFormatter.ofPattern(if (is24) ClockPatterns.TIME_24 else ClockPatterns.TIME_12)),
                style = MaterialTheme.typography.displayLarge,
                color = Aura.tokens.heroText,
            )
            if (!is24) {
                Text(
                    now.format(DateTimeFormatter.ofPattern("a", Locale.getDefault())),
                    style = MaterialTheme.typography.titleMedium,
                    color = Aura.tokens.mutedText,
                    modifier = Modifier.padding(start = 6.dp, bottom = 14.dp),
                )
            }
        }
        Text(
            now.format(DateTimeFormatter.ofPattern(android.text.format.DateFormat.getBestDateTimePattern(Locale.getDefault(), ClockPatterns.DATE_SKELETON_LONG), Locale.getDefault()))
                .replaceFirstChar { it.titlecase(Locale.getDefault()) },
            style = MaterialTheme.typography.titleMedium,
            color = Aura.tokens.mutedText,
        )

        Spacer(Modifier.height(28.dp))
        val snap = snapshot
        if (settings.activePlace == null) {
            EmptyPlaceCard(onOpenLocation)
        } else if (snap == null) {
            AuraCard {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    if (refreshing) CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp)
                    Spacer(Modifier.width(12.dp))
                    Text(if (refreshing) "Consultando el tiempo…" else (error ?: "Sin datos todavía"), style = MaterialTheme.typography.bodyLarge)
                }
                if (!refreshing) {
                    Spacer(Modifier.height(12.dp))
                    FilledTonalButton(onClick = viewModel::refresh) { Text("Reintentar") }
                }
            }
        } else {
            CurrentWeatherCard(snap, settings, refreshing, error, onRefresh = viewModel::refresh, onOpenForecast = onOpenForecast)
        }

        Spacer(Modifier.height(16.dp))
        StudioEntryCard(onOpenStudio)
        Spacer(Modifier.height(16.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.fillMaxWidth()) {
            Button(
                onClick = onCustomize,
                modifier = Modifier.weight(1f).height(52.dp),
                colors = ButtonDefaults.buttonColors(containerColor = Aura.tokens.accent, contentColor = Aura.tokens.onAccent),
            ) {
                Icon(painterResource(R.drawable.ic_ui_customize), null, Modifier.size(18.dp))
                Spacer(Modifier.width(8.dp))
                Text("Personalizar")
            }
            OutlinedButton(onClick = onOpenWidgets, modifier = Modifier.weight(1f).height(52.dp)) {
                Icon(painterResource(R.drawable.ic_ui_widgets), null, Modifier.size(18.dp))
                Spacer(Modifier.width(8.dp))
                Text("Widgets")
            }
        }
        Spacer(Modifier.height(24.dp))
        Text(
            "Datos meteorológicos: Open-Meteo.com (CC BY 4.0)",
            style = MaterialTheme.typography.bodySmall,
            color = Aura.tokens.mutedText,
        )
        Spacer(Modifier.height(24.dp))
    }
}

/** Acceso a Aura Studio desde Inicio, con la misma estética de Aura (azul profundo y filo dorado). */
@Composable
private fun StudioEntryCard(onOpen: () -> Unit) {
    androidx.compose.material3.Surface(
        onClick = onOpen,
        shape = MaterialTheme.shapes.large,
        color = androidx.compose.ui.graphics.Color.Transparent,
        border = androidx.compose.foundation.BorderStroke(1.dp, Aura.tokens.accent.copy(alpha = 0.45f)),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Row(
            Modifier
                .background(androidx.compose.ui.graphics.Brush.linearGradient(listOf(app.aura.ui.theme.AuraPalette.Deep, app.aura.ui.theme.AuraPalette.NightRaised)))
                .padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Image(painterResource(R.drawable.scene_clear_night), contentDescription = null, contentScale = androidx.compose.ui.layout.ContentScale.Crop,
                modifier = Modifier.size(width = 56.dp, height = 88.dp).clip(androidx.compose.foundation.shape.RoundedCornerShape(12.dp)))
            Spacer(Modifier.width(14.dp))
            Column(Modifier.weight(1f)) {
                Text("Aura Studio", style = MaterialTheme.typography.titleMedium, color = androidx.compose.ui.graphics.Color.White)
                Text("Creá un fondo con reloj 3D a partir de tus fotos", style = MaterialTheme.typography.bodySmall, color = app.aura.ui.theme.AuraPalette.Mist)
            }
            Icon(painterResource(R.drawable.ic_ui_studio), null, tint = Aura.tokens.accent)
        }
    }
}

@Composable
private fun EmptyPlaceCard(onOpenLocation: () -> Unit) {
    AuraCard {
        Text("¿Dónde mirás el cielo?", style = MaterialTheme.typography.titleLarge)
        Spacer(Modifier.height(6.dp))
        Text(
            "Elegí una ciudad o usá la ubicación aproximada del teléfono para ver el clima en la app y en los widgets.",
            style = MaterialTheme.typography.bodyMedium,
            color = Aura.tokens.mutedText,
        )
        Spacer(Modifier.height(16.dp))
        Button(onClick = onOpenLocation, colors = ButtonDefaults.buttonColors(containerColor = Aura.tokens.accent, contentColor = Aura.tokens.onAccent)) {
            Text("Elegir ubicación")
        }
    }
}

@Composable
private fun CurrentWeatherCard(
    snap: WeatherSnapshot,
    settings: AppSettings,
    refreshing: Boolean,
    error: String?,
    onRefresh: () -> Unit,
    onOpenForecast: () -> Unit,
    onOpenStudio: () -> Unit = {},
) {
    val context = LocalContext.current
    val unit = settings.temperatureUnit
    val current = snap.data.current
    val zone = snap.data.timeZoneId?.let { runCatching { ZoneId.of(it) }.getOrNull() } ?: ZoneId.systemDefault()
    val today = ForecastSlots.todayRange(snap.data.daily, LocalDate.now(zone))
    val nowMillis = System.currentTimeMillis()
    val freshness = Freshness.of(snap.fetchedAtMillis, nowMillis, settings.refreshIntervalMinutes)
    val label = WeatherText.condition(context, current.condition)
    AuraCard {
        Row(verticalAlignment = Alignment.CenterVertically) {
            WeatherIcon(current.condition, 76.dp, MaterialTheme.colorScheme.onSurface, contentDescription = label)
            Spacer(Modifier.width(18.dp))
            Column(Modifier.weight(1f)) {
                Text(
                    TemperatureFormatter.short(current.temperatureC, unit),
                    style = MaterialTheme.typography.displayMedium,
                    color = if (freshness == Freshness.EXPIRED) Aura.tokens.mutedText else Aura.tokens.heroText,
                )
                Text(label, style = MaterialTheme.typography.titleMedium)
            }
        }
        Spacer(Modifier.height(16.dp))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            today?.let { Metric("Máx./mín.", TemperatureFormatter.range(it.maxC, it.minC, unit), Modifier.weight(1.3f)) }
            current.apparentTemperatureC?.let { Metric("Sensación", TemperatureFormatter.short(it, unit), Modifier.weight(1f)) }
            current.humidityPercent?.let { Metric("Humedad", "$it %", Modifier.weight(1f)) }
            current.windSpeedKmh?.let { Metric("Viento", "${it.roundToInt()} km/h", Modifier.weight(1f)) }
        }
        Spacer(Modifier.height(14.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            val age = WeatherText.age(context, nowMillis - snap.fetchedAtMillis)
            Column(Modifier.weight(1f)) {
                Text(
                    when (freshness) {
                        Freshness.FRESH -> "Actualizado hace $age"
                        Freshness.STALE -> "Desactualizado · hace $age"
                        Freshness.EXPIRED -> "Datos antiguos · hace $age"
                    },
                    style = MaterialTheme.typography.bodySmall,
                    color = if (freshness == Freshness.FRESH) Aura.tokens.mutedText else Aura.tokens.stale,
                )
                if (error != null) {
                    Text("Última actualización fallida: $error", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
                }
            }
            if (refreshing) {
                CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp)
            } else {
                IconButton(onClick = onRefresh) { Icon(painterResource(R.drawable.ic_ui_refresh), contentDescription = "Actualizar ahora") }
            }
            IconButton(onClick = onOpenForecast) { Icon(painterResource(R.drawable.ic_ui_forecast), contentDescription = "Ver pronóstico") }
        }
    }
}

@Composable
private fun Metric(label: String, value: String, modifier: Modifier = Modifier) {
    Column(modifier) {
        Text(label, style = MaterialTheme.typography.labelSmall, color = Aura.tokens.mutedText)
        Text(value, style = MaterialTheme.typography.titleSmall)
    }
}
