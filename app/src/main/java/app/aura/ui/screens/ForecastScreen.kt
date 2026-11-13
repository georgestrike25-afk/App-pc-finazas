package app.aura.ui.screens

import android.app.Activity
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.view.WindowCompat
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.aura.R
import app.aura.core.settings.AppSettings
import app.aura.core.time.ClockPatterns
import app.aura.core.units.TemperatureFormatter
import app.aura.core.weather.DailyPoint
import app.aura.core.weather.ForecastSlots
import app.aura.core.weather.WeatherCondition
import app.aura.core.weather.WeatherInsights
import app.aura.core.weather.WeatherSnapshot
import app.aura.ui.AuraViewModel
import app.aura.ui.WeatherText
import app.aura.ui.components.WeatherIcon
import app.aura.ui.components.WeatherSky
import app.aura.ui.components.rememberNow
import app.aura.ui.theme.AuraPalette
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.roundToInt
import kotlin.math.sin

/**
 * Pantalla Clima (pestaña Pronóstico, y la que abre el toque en un widget): cielo animado según el
 * clima y la hora, temperatura grande, próximas 48 h con curva de temperatura y probabilidad de
 * lluvia por hora, aviso de cuándo va a llover, 14 días y detalles (UV, sol, humedad, viento).
 */
@Composable
fun ForecastScreen(viewModel: AuraViewModel, onOpenLocation: () -> Unit) {
    val settings by viewModel.settings.collectAsStateWithLifecycle()
    val snapshot by viewModel.snapshot.collectAsStateWithLifecycle()
    val refreshing by viewModel.refreshing.collectAsStateWithLifecycle()
    LightStatusBarIcons()
    val snap = snapshot
    if (snap == null) {
        Box(Modifier.fillMaxSize().background(AuraPalette.Night), contentAlignment = Alignment.Center) {
            Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(32.dp)) {
                Text("Todavía no hay pronóstico.", color = Color.White, style = MaterialTheme.typography.titleMedium)
                Spacer(Modifier.height(12.dp))
                Button(onClick = onOpenLocation) { Text("Elegir ubicación") }
            }
        }
        return
    }
    WeatherDetail(snap, settings, refreshing, onOpenLocation, onRefresh = viewModel::refresh)
}

/** Íconos claros en la barra de estado mientras se ve el cielo (fondo siempre oscuro o saturado). */
@Composable
private fun LightStatusBarIcons() {
    val view = LocalView.current
    DisposableEffect(view) {
        val window = (view.context as? Activity)?.window
        val controller = window?.let { WindowCompat.getInsetsController(it, view) }
        val before = controller?.isAppearanceLightStatusBars
        controller?.isAppearanceLightStatusBars = false
        onDispose { if (before != null) controller.isAppearanceLightStatusBars = before }
    }
}

private val Glass = Color(0xFF0B1424).copy(alpha = 0.42f)
private val GlassBorder = Color.White.copy(alpha = 0.10f)
private val Soft = Color.White.copy(alpha = 0.72f)
private val RainBlue = Color(0xFF8CC8FF)

@Composable
internal fun WeatherDetail(snap: WeatherSnapshot, settings: AppSettings, refreshing: Boolean, onOpenLocation: () -> Unit, onRefresh: () -> Unit) {
    val context = LocalContext.current
    val now by rememberNow()
    val nowSec = remember(now) { System.currentTimeMillis() / 1000 }
    val unit = settings.temperatureUnit
    val zone = snap.data.timeZoneId?.let { runCatching { ZoneId.of(it) }.getOrNull() } ?: ZoneId.systemDefault()
    val today = LocalDate.now(zone)
    val todayPoint = ForecastSlots.todayRange(snap.data.daily, today)
    val current = snap.data.current
    val phase = WeatherInsights.phase(nowSec, todayPoint?.sunrise, todayPoint?.sunset, current.isDay)
    val sun = WeatherInsights.sunProgress(nowSec, todayPoint?.sunrise, todayPoint?.sunset)
    val is24 = ClockPatterns.is24(settings.hourFormat, android.text.format.DateFormat.is24HourFormat(context))
    val hm = DateTimeFormatter.ofPattern(if (is24) "HH:mm" else "h:mm a", Locale.getDefault())
    fun clock(epoch: Long) = hm.format(Instant.ofEpochSecond(epoch).atZone(zone))
    val rain = WeatherInsights.nextRain(snap.data.hourly, nowSec)
    val scroll = rememberScrollState()

    BoxWithConstraints(Modifier.fillMaxSize().testTag("weather_detail")) {
        val heightPx = constraints.maxHeight.toFloat()
        val horizon = 0.46f
        WeatherSky(
            condition = current.condition,
            phase = phase,
            sunProgress = sun,
            horizon = horizon,
            dim = (scroll.value / (heightPx * 0.5f)).coerceIn(0f, 1f),
            scroll = scroll.value.toFloat(),
            modifier = Modifier.fillMaxSize(),
        )
        Column(
            Modifier
                .fillMaxSize()
                .verticalScroll(scroll)
                .windowInsetsPadding(WindowInsets.statusBars)
                .padding(horizontal = 16.dp),
        ) {
            // Barra superior: lugar y actualizar.
            Row(Modifier.fillMaxWidth().padding(top = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                Surface(onClick = onOpenLocation, shape = RoundedCornerShape(50), color = Color.Black.copy(alpha = 0.22f)) {
                    Row(Modifier.padding(horizontal = 14.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                        Icon(painterResource(R.drawable.ic_ui_location), null, tint = Color.White, modifier = Modifier.size(18.dp))
                        Spacer(Modifier.width(6.dp))
                        Text(snap.place.name, color = Color.White, style = MaterialTheme.typography.titleMedium, maxLines = 1)
                    }
                }
                Spacer(Modifier.weight(1f))
                if (refreshing) {
                    CircularProgressIndicator(Modifier.size(22.dp), color = Color.White, strokeWidth = 2.dp)
                } else {
                    IconButton(onClick = onRefresh) { Icon(painterResource(R.drawable.ic_ui_refresh), "Actualizar", tint = Color.White) }
                }
            }

            // Héroe sobre el cielo.
            val heroHeight = with(LocalDensity.current) { (heightPx * horizon).toDp() } - 120.dp
            Column(Modifier.fillMaxWidth().height(heroHeight.coerceAtLeast(220.dp)).padding(start = 8.dp, top = 12.dp)) {
                Text(
                    TemperatureFormatter.short(current.temperatureC, unit),
                    color = Color.White, fontSize = 92.sp, fontWeight = FontWeight.Light, lineHeight = 96.sp,
                    modifier = Modifier.testTag("weather_temp"),
                )
                Text(WeatherText.condition(context, current.condition), color = Color.White, style = MaterialTheme.typography.headlineSmall)
                Spacer(Modifier.weight(1f))
                todayPoint?.let { d ->
                    Text("↑ ${TemperatureFormatter.short(d.maxC, unit)}  ↓ ${TemperatureFormatter.short(d.minC, unit)}", color = Color.White, style = MaterialTheme.typography.titleMedium)
                }
                current.apparentTemperatureC?.let {
                    Text("Sensación térmica ${TemperatureFormatter.short(it, unit)}", color = Soft, style = MaterialTheme.typography.bodyMedium)
                }
                Spacer(Modifier.height(18.dp))
            }

            // Resumen + próximas 48 horas.
            GlassCard {
                Text(summary(context, current.condition, todayPoint, rain?.let { if (it.start <= nowSec) "ahora" else "las ${clock(it.start)}" }, unit), color = Color.White, style = MaterialTheme.typography.bodyLarge)
                Spacer(Modifier.height(12.dp))
                HourlyStrip(snap, nowSec, unit, ::clock, is24, zone)
            }

            Spacer(Modifier.height(12.dp))
            RainCard(snap, nowSec, rain, ::clock, zone, is24)

            Spacer(Modifier.height(12.dp))
            DailyCard(snap, today, unit)

            Spacer(Modifier.height(12.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                DetailTile("Sensación térmica", current.apparentTemperatureC?.let { TemperatureFormatter.short(it, unit) } ?: "—", feelsLikeNote(current.apparentTemperatureC, current.temperatureC), Modifier.weight(1f))
                DetailTile("Humedad", current.humidityPercent?.let { "$it %" } ?: "—", humidityNote(current.humidityPercent), Modifier.weight(1f))
            }
            Spacer(Modifier.height(12.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                DetailTile("Viento", current.windSpeedKmh?.let { "${it.roundToInt()} km/h" } ?: "—", windNote(current.windSpeedKmh), Modifier.weight(1f))
                val uv = todayPoint?.uvIndexMax
                DetailTile("Índice UV máx.", uv?.let { "${it.roundToInt()}" } ?: "—", uvNote(uv), Modifier.weight(1f))
            }
            Spacer(Modifier.height(12.dp))
            SunCard(todayPoint, nowSec, ::clock)

            val age = System.currentTimeMillis() - snap.fetchedAtMillis
            Text(
                "Actualizado hace ${WeatherText.age(context, age)} · Fuente: Open-Meteo.com (CC BY 4.0)",
                color = Soft, style = MaterialTheme.typography.bodySmall, textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth().padding(vertical = 20.dp),
            )
        }
    }
}

@Composable
private fun GlassCard(modifier: Modifier = Modifier, content: @Composable ColumnScope.() -> Unit) {
    Surface(modifier.fillMaxWidth(), shape = RoundedCornerShape(24.dp), color = Glass, border = BorderStroke(1.dp, GlassBorder)) {
        Column(Modifier.padding(16.dp), content = content)
    }
}

private fun summary(context: android.content.Context, c: WeatherCondition, today: DailyPoint?, rainFrom: String?, unit: app.aura.core.units.TemperatureUnit): String = buildString {
    append(WeatherText.condition(context, c))
    today?.let { append(". Máxima de ${TemperatureFormatter.short(it.maxC, unit)}, mínima de ${TemperatureFormatter.short(it.minC, unit)}") }
    append(".")
    if (rainFrom != null) append(" Lluvia probable desde $rainFrom.")
}

// ------------------------------------------------------------------ próximas horas

private class Slot(val time: Long, val label: String, val temp: Double, val condition: WeatherCondition, val pop: Int?, val sunEvent: Boolean? = null)

private val SLOT_WIDTH = 58.dp

@Composable
private fun HourlyStrip(snap: WeatherSnapshot, nowSec: Long, unit: app.aura.core.units.TemperatureUnit, clock: (Long) -> String, is24: Boolean, zone: ZoneId) {
    val context = LocalContext.current
    val hours = ForecastSlots.upcomingHours(snap.data.hourly, nowSec, 48)
    if (hours.isEmpty()) return
    val hourOnly = DateTimeFormatter.ofPattern(if (is24) "HH:mm" else "h a", Locale.getDefault())
    val slots = remember(hours, snap.data.daily) {
        val base = hours.mapIndexed { i, h ->
            Slot(h.time, if (i == 0) "Ahora" else hourOnly.format(Instant.ofEpochSecond(h.time).atZone(zone)), h.temperatureC, h.condition, h.precipitationProbability)
        }
        val events = WeatherInsights.sunEvents(snap.data.daily, hours.first().time + 1, hours.last().time).map { (t, rise) ->
            val before = hours.lastOrNull { it.time <= t } ?: hours.first()
            val after = hours.firstOrNull { it.time > t } ?: hours.last()
            val k = if (after.time == before.time) 0.0 else (t - before.time).toDouble() / (after.time - before.time)
            Slot(t, clock(t), before.temperatureC + (after.temperatureC - before.temperatureC) * k, if (rise) WeatherCondition.CLEAR_DAY else WeatherCondition.CLEAR_NIGHT, null, sunEvent = rise)
        }
        (base + events).sortedBy { it.time }
    }
    val min = slots.minOf { it.temp }
    val max = slots.maxOf { it.temp }
    val span = (max - min).takeIf { it > 0.5 } ?: 1.0
    val curveHeight = 46.dp
    Row(Modifier.horizontalScroll(rememberScrollState()).testTag("hourly_strip")) {
        Column {
            Row {
                slots.forEach { s ->
                    Column(Modifier.width(SLOT_WIDTH), horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(s.label, color = Soft, style = MaterialTheme.typography.labelMedium, maxLines = 1)
                        Spacer(Modifier.height(8.dp))
                        if (s.sunEvent != null) {
                            SunGlyph(rise = s.sunEvent, size = 30.dp)
                        } else {
                            WeatherIcon(s.condition, 30.dp, Color.White, realistic = true, contentDescription = WeatherText.condition(context, s.condition))
                        }
                        Spacer(Modifier.height(6.dp))
                        if (s.sunEvent != null) {
                            Text(if (s.sunEvent) "Amanecer" else "Atardecer", color = Color(0xFFFFC857), style = MaterialTheme.typography.labelSmall, maxLines = 1)
                        } else {
                            RainChip(s.pop)
                        }
                    }
                }
            }
            Spacer(Modifier.height(6.dp))
            Box(Modifier.width(SLOT_WIDTH * slots.size).height(curveHeight + 22.dp)) {
                val density = LocalDensity.current
                Canvas(Modifier.fillMaxSize()) {
                    val slotPx = SLOT_WIDTH.toPx()
                    val top = 22.dp.toPx()
                    val h = curveHeight.toPx() - 8.dp.toPx()
                    val pts = slots.mapIndexed { i, s -> Offset(slotPx * (i + 0.5f), top + h * (1f - ((s.temp - min) / span).toFloat())) }
                    val path = Path().apply {
                        moveTo(pts.first().x, pts.first().y)
                        for (i in 1 until pts.size) {
                            val a = pts[i - 1]
                            val b = pts[i]
                            cubicTo((a.x + b.x) / 2, a.y, (a.x + b.x) / 2, b.y, b.x, b.y)
                        }
                    }
                    drawPath(path, Color.White.copy(alpha = 0.75f), style = Stroke(width = 2.dp.toPx(), cap = StrokeCap.Round))
                    pts.forEachIndexed { i, p -> drawCircle(if (slots[i].sunEvent != null) Color(0xFFFFC857) else Color.White, radius = 3.dp.toPx(), center = p) }
                }
                slots.forEachIndexed { i, s ->
                    val y = with(density) { (22.dp.toPx() + (curveHeight.toPx() - 8.dp.toPx()) * (1f - ((s.temp - min) / span).toFloat())).toDp() }
                    Text(
                        TemperatureFormatter.short(s.temp, unit),
                        color = Color.White, style = MaterialTheme.typography.labelLarge, textAlign = TextAlign.Center,
                        modifier = Modifier.width(SLOT_WIDTH).offset(x = SLOT_WIDTH * i, y = y - 22.dp),
                    )
                }
            }
        }
    }
}

@Composable
private fun RainChip(pop: Int?) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Drop(10.dp, if ((pop ?: 0) >= WeatherInsights.RAIN_THRESHOLD) RainBlue else Soft)
        Spacer(Modifier.width(3.dp))
        Text(pop?.let { "$it %" } ?: "–", color = if ((pop ?: 0) >= WeatherInsights.RAIN_THRESHOLD) RainBlue else Soft, style = MaterialTheme.typography.labelSmall, maxLines = 1)
    }
}

@Composable
private fun Drop(size: Dp, color: Color) {
    Canvas(Modifier.size(size)) {
        val w = this.size.width
        val h = this.size.height
        val p = Path().apply {
            moveTo(w / 2, 0f)
            cubicTo(w * 0.95f, h * 0.45f, w, h * 0.62f, w / 2, h)
            cubicTo(0f, h * 0.62f, w * 0.05f, h * 0.45f, w / 2, 0f)
        }
        drawPath(p, color)
    }
}

/** Medio sol sobre el horizonte con una flecha hacia arriba (amanecer) o hacia abajo (atardecer). */
@Composable
private fun SunGlyph(rise: Boolean, size: Dp) {
    Canvas(Modifier.size(size)) {
        val w = this.size.width
        val h = this.size.height
        val c = Offset(w / 2, h * 0.70f)
        val r = w * 0.26f
        val stroke = 1.6.dp.toPx()
        drawArc(Color(0xFFFFB347), 180f, 180f, useCenter = true, topLeft = c - Offset(r, r), size = androidx.compose.ui.geometry.Size(r * 2, r * 2))
        drawLine(Color.White.copy(alpha = 0.8f), Offset(w * 0.05f, c.y), Offset(w * 0.95f, c.y), strokeWidth = stroke)
        val top = h * 0.04f
        val bottom = h * 0.30f
        val tip = if (rise) top else bottom
        val dir = if (rise) 1f else -1f
        val arm = w * 0.12f
        drawLine(Color(0xFFFFC857), Offset(w / 2, top), Offset(w / 2, bottom), strokeWidth = stroke, cap = StrokeCap.Round)
        drawLine(Color(0xFFFFC857), Offset(w / 2, tip), Offset(w / 2 - arm, tip + dir * arm), strokeWidth = stroke, cap = StrokeCap.Round)
        drawLine(Color(0xFFFFC857), Offset(w / 2, tip), Offset(w / 2 + arm, tip + dir * arm), strokeWidth = stroke, cap = StrokeCap.Round)
    }
}

// ------------------------------------------------------------------ lluvia

@Composable
private fun RainCard(snap: WeatherSnapshot, nowSec: Long, rain: app.aura.core.weather.RainWindow?, clock: (Long) -> String, zone: ZoneId, is24: Boolean) {
    val hours = ForecastSlots.upcomingHours(snap.data.hourly, nowSec, 24)
    GlassCard(Modifier.testTag("rain_card")) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Drop(14.dp, RainBlue)
            Spacer(Modifier.width(8.dp))
            Text("Lluvia en las próximas 24 h", color = Soft, style = MaterialTheme.typography.labelLarge)
        }
        Spacer(Modifier.height(8.dp))
        if (rain == null) {
            Text("Sin lluvia prevista", color = Color.White, style = MaterialTheme.typography.titleLarge)
            Text("Ninguna hora supera el ${WeatherInsights.RAIN_THRESHOLD} % de probabilidad.", color = Soft, style = MaterialTheme.typography.bodyMedium)
        } else {
            // «Lloviendo» solo si el modelo prevé precipitación ahora; si no, es una probabilidad.
            val wetNow = (snap.data.current.precipitationMm ?: 0.0) >= app.aura.core.weather.WmoCodes.WET_MM
            val starts = when {
                rain.start > nowSec -> "Desde las ${clock(rain.start)}"
                wetNow -> "Lloviendo ahora"
                else -> "Probable desde ahora"
            }
            Text("$starts hasta las ${clock(rain.end)}", color = Color.White, style = MaterialTheme.typography.titleLarge, modifier = Modifier.testTag("rain_window"))
            Text(
                "Hasta ${rain.peakProbability} % de probabilidad" + if (rain.totalMm >= 0.1) " · ${"%.1f".format(rain.totalMm)} mm" else "",
                color = RainBlue, style = MaterialTheme.typography.bodyMedium,
            )
        }
        Spacer(Modifier.height(14.dp))
        // Barras: probabilidad de lluvia de cada hora.
        Row(Modifier.fillMaxWidth().height(64.dp), verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(2.dp)) {
            hours.forEach { h ->
                val p = (h.precipitationProbability ?: 0) / 100f
                Box(
                    Modifier
                        .weight(1f)
                        .fillMaxHeight(p.coerceAtLeast(0.04f))
                        .clip(RoundedCornerShape(topStart = 3.dp, topEnd = 3.dp))
                        .background(if (p * 100 >= WeatherInsights.RAIN_THRESHOLD) RainBlue else Color.White.copy(alpha = 0.25f)),
                )
            }
        }
        val fmt = DateTimeFormatter.ofPattern(if (is24) "HH" else "h a", Locale.getDefault())
        Row(Modifier.fillMaxWidth().padding(top = 4.dp)) {
            hours.forEachIndexed { i, h ->
                Text(
                    if (i % 6 == 0) fmt.format(Instant.ofEpochSecond(h.time).atZone(zone)) else "",
                    color = Soft, style = MaterialTheme.typography.labelSmall, maxLines = 1, softWrap = false,
                    modifier = Modifier.weight(1f),
                )
            }
        }
    }
}

// ------------------------------------------------------------------ próximos días

@Composable
private fun DailyCard(snap: WeatherSnapshot, today: LocalDate, unit: app.aura.core.units.TemperatureUnit) {
    val context = LocalContext.current
    val days = ForecastSlots.upcomingDays(snap.data.daily, today, 14)
    if (days.isEmpty()) return
    val lo = days.minOf { it.minC }
    val hi = days.maxOf { it.maxC }
    val dayFmt = DateTimeFormatter.ofPattern("EEE d", Locale.getDefault())
    GlassCard(Modifier.testTag("daily_card")) {
        Text("Próximos ${days.size} días", color = Soft, style = MaterialTheme.typography.labelLarge)
        days.forEachIndexed { i, d ->
            val date = LocalDate.parse(d.date)
            Row(Modifier.fillMaxWidth().padding(vertical = 9.dp), verticalAlignment = Alignment.CenterVertically) {
                Text(
                    when (date) {
                        today -> "Hoy"
                        today.plusDays(1) -> "Mañana"
                        else -> dayFmt.format(date).replaceFirstChar { it.titlecase(Locale.getDefault()) }
                    },
                    color = Color.White, style = MaterialTheme.typography.bodyLarge, maxLines = 1, modifier = Modifier.width(78.dp),
                )
                Box(Modifier.width(52.dp)) { if ((d.precipitationProbabilityMax ?: 0) >= 10) RainChip(d.precipitationProbabilityMax) }
                WeatherIcon(d.condition, 30.dp, Color.White, realistic = true, contentDescription = WeatherText.condition(context, d.condition))
                Spacer(Modifier.width(10.dp))
                Text(TemperatureFormatter.short(d.minC, unit), color = Soft, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.width(34.dp), textAlign = TextAlign.End)
                Range(d.minC, d.maxC, lo, hi, Modifier.weight(1f).padding(horizontal = 8.dp))
                Text(TemperatureFormatter.short(d.maxC, unit), color = Color.White, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.width(34.dp))
            }
            if (i < days.lastIndex) HorizontalDivider(color = Color.White.copy(alpha = 0.08f))
        }
    }
}

@Composable
private fun Range(min: Double, max: Double, lo: Double, hi: Double, modifier: Modifier) {
    val span = (hi - lo).takeIf { it > 0.1 } ?: 1.0
    val a = ((min - lo) / span).toFloat().coerceIn(0f, 1f)
    val b = ((max - lo) / span).toFloat().coerceIn(a, 1f)
    Canvas(modifier.height(6.dp)) {
        val r = size.height / 2
        drawLine(Color.White.copy(alpha = 0.15f), Offset(r, r), Offset(size.width - r, r), strokeWidth = size.height, cap = StrokeCap.Round)
        drawLine(
            Brush.horizontalGradient(listOf(Color(0xFF7FD6FF), Color(0xFFFFC857), Color(0xFFFF8A5B))),
            Offset(r + (size.width - 2 * r) * a, r), Offset(r + (size.width - 2 * r) * b, r),
            strokeWidth = size.height, cap = StrokeCap.Round,
        )
    }
}

// ------------------------------------------------------------------ detalles

@Composable
private fun DetailTile(title: String, value: String, note: String, modifier: Modifier) {
    Surface(modifier, shape = RoundedCornerShape(24.dp), color = Glass, border = BorderStroke(1.dp, GlassBorder)) {
        Column(Modifier.padding(16.dp).height(96.dp)) {
            Text(title, color = Soft, style = MaterialTheme.typography.labelLarge, maxLines = 1)
            Spacer(Modifier.height(6.dp))
            Text(value, color = Color.White, style = MaterialTheme.typography.headlineMedium, maxLines = 1)
            Spacer(Modifier.weight(1f))
            Text(note, color = Soft, style = MaterialTheme.typography.bodySmall, maxLines = 2)
        }
    }
}

private fun feelsLikeNote(feels: Double?, real: Double): String = when {
    feels == null -> ""
    feels - real >= 2 -> "Se siente más calor que lo que marca"
    real - feels >= 2 -> "Se siente más frío que lo que marca"
    else -> "Parecida a la temperatura real"
}

private fun humidityNote(h: Int?): String = when {
    h == null -> ""
    h >= 80 -> "Muy húmedo"
    h >= 60 -> "Húmedo"
    h >= 35 -> "Agradable"
    else -> "Aire seco"
}

private fun windNote(w: Double?): String = when {
    w == null -> ""
    w < 12 -> "Calma o brisa suave"
    w < 29 -> "Brisa moderada"
    w < 50 -> "Viento fuerte"
    else -> "Ráfagas muy fuertes"
}

private fun uvNote(uv: Double?): String = when {
    uv == null -> ""
    uv < 3 -> "Bajo"
    uv < 6 -> "Moderado · usá protector"
    uv < 8 -> "Alto · evitá el sol del mediodía"
    uv < 11 -> "Muy alto · protegé tu piel"
    else -> "Extremo · evitá exponerte"
}

@Composable
private fun SunCard(today: DailyPoint?, nowSec: Long, clock: (Long) -> String) {
    val rise = today?.sunrise ?: return
    val set = today.sunset ?: return
    val progress = WeatherInsights.sunProgress(nowSec, rise, set)
    GlassCard(Modifier.testTag("sun_card")) {
        Text("Sol", color = Soft, style = MaterialTheme.typography.labelLarge)
        Spacer(Modifier.height(8.dp))
        Canvas(Modifier.fillMaxWidth().height(90.dp)) {
            val w = size.width
            val baseY = size.height - 6.dp.toPx()
            val r = minOf(w * 0.42f, size.height - 12.dp.toPx())
            val c = Offset(w / 2, baseY)
            drawLine(Color.White.copy(alpha = 0.25f), Offset(0f, baseY), Offset(w, baseY), strokeWidth = 1.dp.toPx())
            drawArc(
                Color.White.copy(alpha = 0.35f), 180f, 180f, useCenter = false,
                topLeft = c - Offset(r, r), size = androidx.compose.ui.geometry.Size(r * 2, r * 2),
                style = Stroke(width = 1.5.dp.toPx(), pathEffect = PathEffect.dashPathEffect(floatArrayOf(8f, 8f))),
            )
            if (progress != null) {
                drawArc(
                    Color(0xFFFFC857), 180f, 180f * progress, useCenter = false,
                    topLeft = c - Offset(r, r), size = androidx.compose.ui.geometry.Size(r * 2, r * 2),
                    style = Stroke(width = 2.5.dp.toPx(), cap = StrokeCap.Round),
                )
                val a = PI * (1 - progress)
                val p = Offset(c.x + (r * cos(a)).toFloat(), c.y - (r * sin(a)).toFloat())
                drawCircle(Color(0xFFFFC857).copy(alpha = 0.35f), radius = 12.dp.toPx(), center = p)
                drawCircle(Color(0xFFFFE08A), radius = 6.dp.toPx(), center = p)
            }
        }
        Row(Modifier.fillMaxWidth().padding(top = 6.dp)) {
            Column(Modifier.weight(1f)) {
                Text("Amanecer", color = Soft, style = MaterialTheme.typography.labelMedium)
                Text(clock(rise), color = Color.White, style = MaterialTheme.typography.titleMedium)
            }
            Column(horizontalAlignment = Alignment.End) {
                Text("Atardecer", color = Soft, style = MaterialTheme.typography.labelMedium)
                Text(clock(set), color = Color.White, style = MaterialTheme.typography.titleMedium)
            }
        }
        val daylight = (set - rise) / 60
        Text("${daylight / 60} h ${daylight % 60} min de luz", color = Soft, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(top = 6.dp))
    }
}
