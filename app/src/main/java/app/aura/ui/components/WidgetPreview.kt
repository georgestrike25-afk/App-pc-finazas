package app.aura.ui.components

import android.content.Context
import android.graphics.Typeface
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shadow
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.aura.R
import app.aura.core.settings.AppSettings
import app.aura.core.style.Alignment as StyleAlignment
import app.aura.core.style.ColorMath
import app.aura.core.style.FontChoice
import app.aura.core.style.IconStyle
import app.aura.core.style.WidgetStyle
import app.aura.core.time.ClockPatterns
import app.aura.core.time.HourFormat
import app.aura.core.units.TemperatureFormatter
import app.aura.core.weather.ForecastSlots
import app.aura.core.weather.WeatherCondition
import app.aura.core.weather.WeatherSnapshot
import app.aura.core.widget.SizeClass
import app.aura.core.widget.WidgetSizing
import app.aura.core.widget.WidgetType
import app.aura.ui.WeatherText
import app.aura.ui.icons.WeatherIcons
import app.aura.widget.WidgetLayouts
import app.aura.widget.WidgetRenderer
import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

/** Contenido que muestra la vista previa: datos reales en caché o, si no hay, un ejemplo rotulado. */
data class PreviewContent(
    val temperature: String,
    val condition: WeatherCondition,
    val conditionLabel: String,
    val place: String,
    val hilo: String?,
    val hours: List<Triple<String, WeatherCondition, String>>,
    val days: List<Triple<String, WeatherCondition, String>>,
    val isSample: Boolean,
    /** Condición y «máx. / mín.» de mañana, si hay datos. */
    val tomorrow: Pair<WeatherCondition, String>? = null,
) {
    companion object {
        fun from(context: Context, snapshot: WeatherSnapshot?, settings: AppSettings, nowMillis: Long): PreviewContent {
            val unit = settings.temperatureUnit
            if (snapshot == null) {
                val c = WeatherCondition.PARTLY_CLOUDY_DAY
                return PreviewContent(
                    temperature = "21°", condition = c, conditionLabel = WeatherText.condition(context, c), place = "Ciudad",
                    hilo = "24° / 14°",
                    hours = listOf(
                        Triple(context.getString(R.string.widget_now), c, "21°"), Triple("15 h", WeatherCondition.CLEAR_DAY, "22°"),
                        Triple("16 h", WeatherCondition.CLEAR_DAY, "22°"), Triple("17 h", WeatherCondition.CLOUDY, "20°"),
                        Triple("18 h", WeatherCondition.RAIN, "18°"), Triple("19 h", WeatherCondition.RAIN, "17°"),
                    ),
                    days = listOf(
                        Triple(context.getString(R.string.widget_today), c, "24° / 14°"), Triple("Jue", WeatherCondition.RAIN, "19° / 12°"),
                        Triple("Vie", WeatherCondition.CLOUDY, "20° / 11°"), Triple("Sáb", WeatherCondition.CLEAR_DAY, "23° / 12°"),
                        Triple("Dom", WeatherCondition.CLEAR_DAY, "25° / 13°"),
                    ),
                    isSample = true,
                    tomorrow = WeatherCondition.RAIN to "19° / 12°",
                )
            }
            val zone = snapshot.data.timeZoneId?.let { runCatching { ZoneId.of(it) }.getOrNull() } ?: ZoneId.systemDefault()
            val today = LocalDate.now(zone)
            val range = ForecastSlots.todayRange(snapshot.data.daily, today)
            val is24 = ClockPatterns.is24(settings.hourFormat, android.text.format.DateFormat.is24HourFormat(context))
            val hf = DateTimeFormatter.ofPattern(if (is24) "H 'h'" else "h a", Locale.getDefault())
            val df = DateTimeFormatter.ofPattern("EEE", Locale.getDefault())
            return PreviewContent(
                temperature = TemperatureFormatter.short(snapshot.data.current.temperatureC, unit),
                condition = snapshot.data.current.condition,
                conditionLabel = WeatherText.condition(context, snapshot.data.current.condition),
                place = snapshot.place.name,
                hilo = range?.let { TemperatureFormatter.range(it.maxC, it.minC, unit) },
                hours = ForecastSlots.upcomingHours(snapshot.data.hourly, nowMillis / 1000, 6).mapIndexed { i, h ->
                    Triple(
                        if (i == 0) context.getString(R.string.widget_now) else hf.format(Instant.ofEpochSecond(h.time).atZone(zone)),
                        h.condition, TemperatureFormatter.short(h.temperatureC, unit),
                    )
                },
                days = ForecastSlots.upcomingDays(snapshot.data.daily, today, 5).map { d ->
                    val date = LocalDate.parse(d.date)
                    Triple(
                        if (date == today) context.getString(R.string.widget_today) else df.format(date).replaceFirstChar { it.titlecase() },
                        d.condition, TemperatureFormatter.range(d.maxC, d.minC, unit),
                    )
                },
                isSample = false,
                tomorrow = ForecastSlots.tomorrow(snapshot.data.daily, today)?.let { it.condition to TemperatureFormatter.range(it.maxC, it.minC, unit) },
            )
        }
    }
}

/** Fondos de prueba para comprobar transparencia y contraste en la vista previa. */
enum class PreviewWallpaper(val label: String) { NIGHT("Noche"), DAWN("Amanecer"), LIGHT("Claro"), FOREST("Bosque"), DEVICE("Tu fondo") }

@Composable
fun WallpaperBackdrop(wallpaper: PreviewWallpaper, deviceColors: List<Color>, modifier: Modifier = Modifier) {
    val colors = when (wallpaper) {
        PreviewWallpaper.NIGHT -> listOf(Color(0xFF0B1622), Color(0xFF1B3A55), Color(0xFF3B5E7A))
        PreviewWallpaper.DAWN -> listOf(Color(0xFF2E3A66), Color(0xFFC0687A), Color(0xFFF4B67A))
        PreviewWallpaper.LIGHT -> listOf(Color(0xFFF7F4EE), Color(0xFFE4ECF1), Color(0xFFCFDCE6))
        PreviewWallpaper.FOREST -> listOf(Color(0xFF1E3326), Color(0xFF4F6B45), Color(0xFFA7B67C))
        PreviewWallpaper.DEVICE -> deviceColors.ifEmpty { listOf(Color(0xFF233142), Color(0xFF455D7A), Color(0xFFE3E3E3)) }
            .let { if (it.size == 1) it + it else it }
    }
    Canvas(modifier.fillMaxSize()) {
        drawRect(Brush.linearGradient(colors, start = Offset.Zero, end = Offset(size.width, size.height)))
        // Formas suaves: si el widget es transparente deben verse a través de él.
        drawCircle(Brush.radialGradient(listOf(Color.White.copy(alpha = 0.22f), Color.Transparent), center = Offset(size.width * 0.78f, size.height * 0.28f), radius = size.minDimension * 0.55f), radius = size.minDimension * 0.55f, center = Offset(size.width * 0.78f, size.height * 0.28f))
        drawCircle(Brush.radialGradient(listOf(Color.Black.copy(alpha = 0.18f), Color.Transparent), center = Offset(size.width * 0.15f, size.height * 0.85f), radius = size.minDimension * 0.6f), radius = size.minDimension * 0.6f, center = Offset(size.width * 0.15f, size.height * 0.85f))
    }
}

fun previewSize(type: WidgetType, size: SizeClass): Pair<Dp, Dp> = when (type) {
    WidgetType.CLOCK -> when (size) { SizeClass.SMALL -> 160.dp to 86.dp; SizeClass.MEDIUM -> 320.dp to 96.dp; SizeClass.LARGE -> 320.dp to 180.dp }
    WidgetType.WEATHER -> when (size) { SizeClass.SMALL -> 86.dp to 96.dp; SizeClass.MEDIUM -> 200.dp to 96.dp; SizeClass.LARGE -> 320.dp to 110.dp }
    WidgetType.DUO -> when (size) { SizeClass.SMALL -> 170.dp to 100.dp; SizeClass.MEDIUM -> 320.dp to 100.dp; SizeClass.LARGE -> 320.dp to 190.dp }
    WidgetType.FORECAST -> when (size) { SizeClass.SMALL -> 320.dp to 96.dp; SizeClass.MEDIUM -> 320.dp to 190.dp; SizeClass.LARGE -> 320.dp to 340.dp }
    WidgetType.NIGHT -> when (size) { SizeClass.SMALL -> 170.dp to 96.dp; SizeClass.MEDIUM -> 320.dp to 96.dp; SizeClass.LARGE -> 320.dp to 190.dp }
}

private fun fontFamily(choice: FontChoice): FontFamily = FontFamily(Typeface.create(choice.androidFamily, Typeface.NORMAL))

/**
 * Réplica en Compose de las composiciones RemoteViews (mismos tamaños base, tipografías del sistema
 * y reglas de color). Sirve para decidir antes de colocar el widget; no sustituye a probar el real.
 */
@Composable
fun WidgetPreview(
    type: WidgetType,
    size: SizeClass,
    style: WidgetStyle,
    content: PreviewContent,
    now: LocalDateTime,
    system24h: Boolean,
    settings: AppSettings,
    modifier: Modifier = Modifier,
) {
    val s = style.normalized()
    val (w, h) = previewSize(type, size)
    val hero = WidgetSizing.heroSizes(type, size)
    val heroFamily = remember(s.font) { fontFamily(s.font) }
    val text = Color(ColorMath.opaque(s.textColor))
    val timeColor = Color(ColorMath.opaque(s.effectiveTimeColor))
    val secondary = Color(ColorMath.withOpacity(s.textColor, 80))
    val shadow = if (s.textShadow) Shadow(Color(0x66000000), Offset(0f, 2f), 12f) else null
    val ink = Color(ColorMath.opaque(s.iconColor))
    val condition = if (type == WidgetType.NIGHT) WidgetRenderer.nightVariant(content.condition) else content.condition
    val format = if (s.hourFormat != HourFormat.SYSTEM) s.hourFormat else settings.hourFormat
    val is24 = ClockPatterns.is24(format, system24h)
    val time = now.format(DateTimeFormatter.ofPattern(if (is24) ClockPatterns.TIME_24 else ClockPatterns.TIME_12))
    val hoursPart = now.format(DateTimeFormatter.ofPattern(if (is24) "HH" else "h"))
    val minutesPart = now.format(DateTimeFormatter.ofPattern(":mm"))
    val ampm = if (is24) null else now.format(DateTimeFormatter.ofPattern(ClockPatterns.AM_PM, Locale.getDefault()))
    val dateSkeleton = if (size == SizeClass.LARGE) ClockPatterns.DATE_SKELETON_LONG else ClockPatterns.DATE_SKELETON_SHORT
    val date = now.format(DateTimeFormatter.ofPattern(android.text.format.DateFormat.getBestDateTimePattern(Locale.getDefault(), dateSkeleton), Locale.getDefault()))
    val pad = (if (size == SizeClass.SMALL) minOf(s.spacing.paddingDp, 10) else s.spacing.paddingDp).dp
    val horizontal = when (s.alignment) {
        StyleAlignment.START -> Alignment.Start
        StyleAlignment.CENTER -> Alignment.CenterHorizontally
        StyleAlignment.END -> Alignment.End
    }
    val rowArrangement = when (s.alignment) {
        StyleAlignment.START -> Arrangement.Start
        StyleAlignment.CENTER -> Arrangement.Center
        StyleAlignment.END -> Arrangement.End
    }
    val accent: Color? = when {
        s.iconStyle == IconStyle.MONO -> ink
        ColorMath.luminance(s.textColor) < 0.35 -> Color(WeatherIcons.layers(condition).accentOnLight)
        else -> null
    }

    fun ts(sp: Float, family: FontFamily = FontFamily.SansSerif, color: Color = text) =
        TextStyle(fontFamily = family, fontSize = sp.sp, color = color, shadow = shadow, fontFeatureSettings = "tnum", lineHeight = (sp * 1.12f).sp)

    val timeSp = WidgetSizing.scaled(hero.time, s.timeScale)
    val tempSp = WidgetSizing.scaled(hero.temperature, s.temperatureScale)

    @Composable
    fun Clock() {
        Row(verticalAlignment = Alignment.Bottom) {
            if (s.boldHours) {
                Text(hoursPart, style = ts(timeSp, FontFamily.SansSerif, timeColor).copy(fontWeight = FontWeight.Bold), maxLines = 1)
                Text(minutesPart, style = ts(timeSp, heroFamily, timeColor), maxLines = 1)
            } else {
                Text(time, style = ts(timeSp, heroFamily, timeColor), maxLines = 1)
            }
            if (ampm != null) Text(ampm, style = ts(maxOf(11f, timeSp * 0.28f), color = secondary), modifier = Modifier.padding(start = 4.dp, bottom = (timeSp * 0.12f).dp))
        }
    }

    @Composable
    fun DateLine(sp: Float, top: Dp = 4.dp) {
        if (s.showDate) Text(date, style = ts(sp, color = secondary), modifier = Modifier.padding(top = top), maxLines = 1)
    }

    @Composable
    fun Icon(dp: Dp, c: WeatherCondition = condition) {
        val realistic = s.iconStyle == IconStyle.REALISTIC
        // Igual que el widget en Android 12+: el icono principal 3D crece; los de horas/días no.
        val main = size != SizeClass.SMALL && c == condition && dp == WidgetLayouts.iconDp(type, size).dp
        WeatherIcon(c, if (realistic && main) dp * WidgetRenderer.REALISTIC_ICON_SCALE else dp, ink, accentTint = accent, realistic = realistic)
    }

    @Composable
    fun Temp(sp: Float = tempSp) = Text(content.temperature, style = ts(sp, heroFamily), maxLines = 1)

    @Composable
    fun Secondary(value: String?, sp: Float = 13f, top: Dp = 0.dp) {
        if (!value.isNullOrBlank()) Text(value, style = ts(sp, color = secondary), maxLines = 1, modifier = Modifier.padding(top = top))
    }

    val place = content.place.takeIf { s.showLocation }
    val hilo = content.hilo.takeIf { s.showHighLow }

    val tomorrow = content.tomorrow.takeIf { s.showTomorrow }

    @Composable
    fun Tomorrow(labelSp: Float = 11f, iconDp: Dp = 24.dp, rangeSp: Float = 12f, modifier: Modifier = Modifier) {
        val t = tomorrow ?: return
        Column(modifier, horizontalAlignment = Alignment.CenterHorizontally) {
            Text("Mañana", style = ts(labelSp, color = secondary), maxLines = 1)
            Spacer(Modifier.height(4.dp))
            WeatherIcon(t.first, iconDp, ink, accentTint = accent, realistic = s.iconStyle == IconStyle.REALISTIC)
            Spacer(Modifier.height(4.dp))
            Text(t.second, style = ts(rangeSp), maxLines = 1)
        }
    }

    @Composable
    fun Hours(n: Int, labelSp: Float = 12f, iconDp: Dp = 24.dp, tempSpH: Float = 13f, withTomorrow: Boolean = false) {
        Row(Modifier.fillMaxWidth()) {
            content.hours.take(n).forEach { (label, c, t) ->
                Column(Modifier.weight(1f), horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(label, style = ts(labelSp, color = secondary), maxLines = 1)
                    Spacer(Modifier.height(4.dp))
                    Icon(iconDp, c)
                    Spacer(Modifier.height(4.dp))
                    Text(t, style = ts(tempSpH), maxLines = 1)
                }
            }
            if (withTomorrow && tomorrow != null) Tomorrow(labelSp, iconDp, tempSpH - 1, Modifier.weight(1f))
        }
    }

    val bg = s.backgroundArgb()
    val shape = RoundedCornerShape(24.dp)
    Box(
        modifier
            .size(w, h)
            .clip(shape)
            .then(if (bg != null) Modifier.background(Color(bg)) else Modifier)
            .then(if (s.showsGlassEdge) Modifier.border(1.dp, Color(0x47FFFFFF), shape) else Modifier),
    ) {
        if (s.usesScene) {
            Image(
                painter = painterResource(WeatherIcons.layers(condition).scene),
                contentDescription = null,
                contentScale = ContentScale.Crop,
                alpha = s.opacity / 100f,
                modifier = Modifier.fillMaxSize(),
            )
        }
        val inner = Modifier.fillMaxSize().padding(pad)
        when (type) {
            WidgetType.CLOCK -> Column(inner, verticalArrangement = Arrangement.Center, horizontalAlignment = horizontal) {
                Clock()
                if (size != SizeClass.SMALL) DateLine(if (size == SizeClass.LARGE) 17f else 14f, if (size == SizeClass.LARGE) 6.dp else 4.dp)
            }
            WidgetType.WEATHER -> when (size) {
                SizeClass.SMALL -> Column(inner, verticalArrangement = Arrangement.Center, horizontalAlignment = horizontal) {
                    Icon(30.dp); Temp()
                }
                else -> Row(inner, verticalAlignment = Alignment.CenterVertically, horizontalArrangement = rowArrangement) {
                    Icon(if (size == SizeClass.LARGE) 52.dp else 34.dp)
                    Spacer(Modifier.width(if (size == SizeClass.LARGE) 12.dp else 6.dp))
                    Temp()
                    Column(Modifier.padding(start = if (size == SizeClass.LARGE) 14.dp else 8.dp)) {
                        if (size == SizeClass.LARGE) {
                            DateLine(13f, 0.dp)
                            Text(content.conditionLabel, style = ts(13f), maxLines = 1, modifier = Modifier.padding(top = 2.dp))
                            Secondary(listOfNotNull(place, hilo).joinToString(" · "), 12f, 2.dp)
                        } else {
                            Secondary(place, 12f, 0.dp)
                            Secondary(hilo, 12f, 2.dp)
                            DateLine(12f, 2.dp)
                        }
                    }
                    if (size == SizeClass.LARGE) {
                        Spacer(Modifier.weight(1f))
                        Tomorrow(iconDp = 26.dp)
                    }
                }
            }
            WidgetType.DUO -> when (size) {
                SizeClass.SMALL -> Column(inner, verticalArrangement = Arrangement.Center, horizontalAlignment = horizontal) {
                    Clock()
                    Row(Modifier.padding(top = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                        Icon(20.dp); Spacer(Modifier.width(6.dp)); Temp(); Secondary(place?.let { "  $it" })
                    }
                }
                SizeClass.MEDIUM -> Row(inner, verticalAlignment = Alignment.CenterVertically, horizontalArrangement = rowArrangement) {
                    Column(horizontalAlignment = horizontal) { Clock(); DateLine(13f) }
                    Box(Modifier.padding(horizontal = 16.dp).width(1.dp).height(40.dp).background(text.copy(alpha = 0.27f)))
                    Column {
                        Row(verticalAlignment = Alignment.CenterVertically) { Icon(30.dp); Spacer(Modifier.width(8.dp)); Temp() }
                        Secondary(place, top = 4.dp)
                    }
                    Tomorrow(iconDp = 22.dp, modifier = Modifier.padding(start = 14.dp))
                }
                SizeClass.LARGE -> Column(inner, verticalArrangement = Arrangement.Center, horizontalAlignment = horizontal) {
                    Clock(); DateLine(15f)
                    Row(Modifier.padding(top = 14.dp), verticalAlignment = Alignment.CenterVertically) {
                        Icon(32.dp); Spacer(Modifier.width(10.dp)); Temp()
                        Column(Modifier.padding(start = 12.dp)) {
                            Text(content.conditionLabel, style = ts(13f), maxLines = 1)
                            Secondary(listOfNotNull(place, hilo).joinToString(" · "), 12f, 2.dp)
                        }
                        tomorrow?.let { t ->
                            Row(Modifier.padding(start = 18.dp), verticalAlignment = Alignment.CenterVertically) {
                                WeatherIcon(t.first, 24.dp, ink, accentTint = accent, realistic = s.iconStyle == IconStyle.REALISTIC)
                                Column(Modifier.padding(start = 6.dp)) {
                                    Text("Mañana", style = ts(11f, color = secondary), maxLines = 1)
                                    Text(t.second, style = ts(12f), maxLines = 1)
                                }
                            }
                        }
                    }
                }
            }
            WidgetType.FORECAST -> when (size) {
                SizeClass.SMALL -> Row(inner, verticalAlignment = Alignment.CenterVertically) {
                    Icon(34.dp); Spacer(Modifier.width(8.dp)); Temp(); Spacer(Modifier.width(14.dp))
                    Box(Modifier.weight(1f)) { Hours(3, 11f, 20.dp, 12f) }
                }
                else -> Column(inner, verticalArrangement = Arrangement.Center) {
                    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                        Column { Clock(); if (size == SizeClass.LARGE) DateLine(13f) }
                        Spacer(Modifier.weight(1f))
                        Column(horizontalAlignment = Alignment.End) {
                            Row(verticalAlignment = Alignment.CenterVertically) { Icon(30.dp); Spacer(Modifier.width(8.dp)); Temp() }
                            Secondary(place, 12f, 2.dp)
                        }
                    }
                    Spacer(Modifier.height(if (size == SizeClass.LARGE) 14.dp else 10.dp))
                    if (size == SizeClass.LARGE) Hours(6) else Hours(4, withTomorrow = true)
                    if (size == SizeClass.LARGE) {
                        Box(Modifier.padding(top = 10.dp, bottom = 8.dp).fillMaxWidth().height(1.dp).background(text.copy(alpha = 0.27f)))
                        content.days.take(5).forEach { (name, c, range) ->
                            Row(Modifier.fillMaxWidth().padding(top = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                                Text(name, style = ts(14f, color = secondary), modifier = Modifier.weight(1f), maxLines = 1)
                                Box(Modifier.padding(start = 8.dp, end = 12.dp)) { Icon(22.dp, c) }
                                Text(range, style = ts(14f), maxLines = 1)
                            }
                        }
                    }
                }
            }
            WidgetType.NIGHT -> when (size) {
                SizeClass.SMALL -> Column(inner, verticalArrangement = Arrangement.Center, horizontalAlignment = horizontal) {
                    Clock()
                    Row(Modifier.padding(top = 4.dp), verticalAlignment = Alignment.CenterVertically) { Icon(18.dp); Spacer(Modifier.width(6.dp)); Temp() }
                }
                SizeClass.MEDIUM -> Row(inner, verticalAlignment = Alignment.CenterVertically) {
                    Clock(); Spacer(Modifier.weight(1f))
                    Column(horizontalAlignment = Alignment.End) {
                        Row(verticalAlignment = Alignment.CenterVertically) { Icon(24.dp); Spacer(Modifier.width(6.dp)); Temp() }
                        DateLine(12f)
                    }
                }
                SizeClass.LARGE -> Column(inner, verticalArrangement = Arrangement.Center, horizontalAlignment = horizontal) {
                    Clock(); DateLine(15f)
                    Row(Modifier.padding(top = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                        Icon(22.dp); Spacer(Modifier.width(8.dp)); Temp()
                        Text(content.conditionLabel, style = ts(13f, color = secondary), modifier = Modifier.padding(start = 10.dp), maxLines = 1)
                    }
                }
            }
        }
    }
}
