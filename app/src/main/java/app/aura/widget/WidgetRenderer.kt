package app.aura.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.provider.AlarmClock
import android.text.format.DateFormat
import android.util.SizeF
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.widget.RemoteViews
import app.aura.R
import app.aura.core.settings.AppSettings
import app.aura.core.style.Alignment
import app.aura.core.style.ColorMath
import app.aura.core.style.IconStyle
import app.aura.core.style.WidgetStyle
import app.aura.core.time.ClockPatterns
import app.aura.core.time.HourFormat
import app.aura.core.units.TemperatureFormatter
import app.aura.core.weather.ForecastSlots
import app.aura.core.weather.Freshness
import app.aura.core.weather.WeatherCondition
import app.aura.core.weather.WeatherSnapshot
import app.aura.core.widget.SizeClass
import app.aura.core.widget.WidgetSizing
import app.aura.core.widget.WidgetType
import app.aura.ui.MainActivity
import app.aura.ui.WeatherText
import app.aura.ui.icons.WeatherIcons
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

/**
 * Construye los RemoteViews de cada widget.
 *
 * Transparencia real: la raíz del layout no tiene fondo, de modo que el launcher dibuja el fondo
 * de pantalla detrás. El panel opcional (cristal, oscuro, claro, personalizado) es un ImageView con
 * una forma blanca que se tiñe con setColorFilter y cuya opacidad se fija con setImageAlpha (0–255),
 * así que la opacidad cubre el rango completo 0–100 % en cualquier versión de Android.
 */
class WidgetRenderer(private val context: Context) {

    data class Request(
        val type: WidgetType,
        val style: WidgetStyle,
        val snapshot: WeatherSnapshot?,
        val settings: AppSettings,
        val nowMillis: Long,
        val appWidgetId: Int,
        val options: Bundle?,
    )

    fun render(request: Request): RemoteViews {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            // Android 12+: el launcher elige la composición adecuada sin despertar a la app al redimensionar.
            val layouts = WidgetSizing.breakpoints(request.type).associate { bp ->
                SizeF(bp.minWidthDp.toFloat(), bp.minHeightDp.toFloat()) to build(request, bp.sizeClass)
            }
            return RemoteViews(layouts)
        }
        val (w, h) = sizeFromOptions(request.options)
        return build(request, WidgetSizing.classify(request.type, w, h))
    }

    /** Composición concreta; la usan las pruebas instrumentadas para inflar cada tamaño. */
    fun renderSize(request: Request, size: SizeClass): RemoteViews = build(request, size)

    /** Ancho mínimo (vertical) y alto máximo (vertical), como recomienda la documentación de Android. */
    private fun sizeFromOptions(options: Bundle?): Pair<Int, Int> {
        val w = options?.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH) ?: 0
        val h = options?.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT) ?: 0
        return (if (w > 0) w else 250) to (if (h > 0) h else 110)
    }

    private fun build(r: Request, size: SizeClass): RemoteViews {
        val style = r.style.normalized()
        val views = RemoteViews(context.packageName, WidgetLayouts.layout(r.type, size, style.font, style.textShadow))
        applyPanel(views, style)
        applyScene(views, r, style)
        applyLayout(views, style, size)
        applyColors(views, style)
        if (r.type.showsClock) applyClock(views, r, style, size)
        if (r.type.showsWeather) applyWeather(views, r, style, size)
        applyClicks(views, r)
        return views
    }

    private fun applyPanel(v: RemoteViews, style: WidgetStyle) {
        val bg = style.backgroundArgb()
        if (bg == null) {
            v.setViewVisibility(R.id.w_bg, View.GONE)
            v.setViewVisibility(R.id.w_edge, View.GONE)
            return
        }
        v.setViewVisibility(R.id.w_bg, View.VISIBLE)
        v.setInt(R.id.w_bg, "setColorFilter", ColorMath.opaque(bg))
        v.setInt(R.id.w_bg, "setImageAlpha", ColorMath.alpha(bg))
        v.setViewVisibility(R.id.w_edge, if (style.showsGlassEdge) View.VISIBLE else View.GONE)
    }

    /**
     * Escena ilustrada del cielo según la condición actual. Sin datos todavía se usa la de nublado,
     * que es neutra. La opacidad del estilo se aplica a la imagen (0–100 %).
     */
    private fun applyScene(v: RemoteViews, r: Request, style: WidgetStyle) {
        if (!style.usesScene) {
            v.setViewVisibility(R.id.w_scene, View.GONE)
            return
        }
        val current = r.snapshot?.data?.current?.condition ?: WeatherCondition.CLOUDY
        val condition = if (r.type == WidgetType.NIGHT) nightVariant(current) else current
        v.setViewVisibility(R.id.w_scene, View.VISIBLE)
        v.setImageViewResource(R.id.w_scene, WeatherIcons.layers(condition).scene)
        v.setInt(R.id.w_scene, "setImageAlpha", ColorMath.alphaFromPercent(style.opacity))
    }

    private fun applyLayout(v: RemoteViews, style: WidgetStyle, size: SizeClass) {
        val paddingDp = if (size == SizeClass.SMALL) minOf(style.spacing.paddingDp, 10) else style.spacing.paddingDp
        val p = px(paddingDp)
        v.setViewPadding(R.id.w_content, p, p, p, p)
        val horizontal = when (style.alignment) {
            Alignment.START -> Gravity.START
            Alignment.CENTER -> Gravity.CENTER_HORIZONTAL
            Alignment.END -> Gravity.END
        }
        v.setInt(R.id.w_content, "setGravity", horizontal or Gravity.CENTER_VERTICAL)
        v.setInt(R.id.w_clock_col, "setGravity", horizontal)
    }

    private fun applyColors(v: RemoteViews, style: WidgetStyle) {
        val primary = ColorMath.opaque(style.textColor)
        val secondary = ColorMath.withOpacity(style.textColor, 80)
        PRIMARY_TEXT.forEach { v.setTextColor(it, primary) }
        val time = ColorMath.opaque(style.effectiveTimeColor)
        TIME_TEXT.forEach { v.setTextColor(it, time) }
        SECONDARY_TEXT.forEach { v.setTextColor(it, secondary) }
        HOUR_TIME.forEach { v.setTextColor(it, secondary) }
        HOUR_TEMP.forEach { v.setTextColor(it, primary) }
        DAY_NAME.forEach { v.setTextColor(it, secondary) }
        DAY_RANGE.forEach { v.setTextColor(it, primary) }
        v.setInt(R.id.w_divider, "setColorFilter", ColorMath.opaque(style.textColor))
        v.setInt(R.id.w_divider, "setImageAlpha", 70)
    }

    private fun applyClock(v: RemoteViews, r: Request, style: WidgetStyle, size: SizeClass) {
        val format = if (style.hourFormat != HourFormat.SYSTEM) style.hourFormat else r.settings.hourFormat
        when (format) {
            // Formato del sistema: TextClock elige 12/24 h por sí mismo y reacciona si el usuario lo cambia.
            HourFormat.SYSTEM -> {
                setClockFormat(v, R.id.w_time, ClockPatterns.TIME_12, ClockPatterns.TIME_24)
                // En 24 h el indicador AM/PM queda vacío; así no hay que re-renderizar si cambia el ajuste.
                setClockFormat(v, R.id.w_ampm, ClockPatterns.AM_PM, "")
                v.setViewVisibility(R.id.w_ampm, View.VISIBLE)
            }
            HourFormat.H24 -> {
                setClockFormat(v, R.id.w_time, ClockPatterns.TIME_24, ClockPatterns.TIME_24)
                v.setViewVisibility(R.id.w_ampm, View.GONE)
            }
            HourFormat.H12 -> {
                setClockFormat(v, R.id.w_time, ClockPatterns.TIME_12, ClockPatterns.TIME_12)
                setClockFormat(v, R.id.w_ampm, ClockPatterns.AM_PM, ClockPatterns.AM_PM)
                v.setViewVisibility(R.id.w_ampm, View.VISIBLE)
            }
        }
        val is24 = when (format) {
            HourFormat.SYSTEM -> null
            HourFormat.H12 -> false
            HourFormat.H24 -> true
        }
        // Horas en negrita: «HH» + «:mm» en dos TextClock; ambos siguen avanzando solos.
        setClockFormat(v, R.id.w_time_h, if (is24 == true) "HH" else "h", if (is24 == false) "h" else "HH")
        setClockFormat(v, R.id.w_time_m, ":mm", ":mm")
        v.setViewVisibility(R.id.w_time, if (style.boldHours) View.GONE else View.VISIBLE)
        v.setViewVisibility(R.id.w_time_h, if (style.boldHours) View.VISIBLE else View.GONE)
        v.setViewVisibility(R.id.w_time_m, if (style.boldHours) View.VISIBLE else View.GONE)

        val hero = WidgetSizing.heroSizes(r.type, size)
        val timeSp = WidgetSizing.scaled(hero.time, style.timeScale)
        TIME_TEXT.forEach { v.setTextViewTextSize(it, TypedValue.COMPLEX_UNIT_SP, timeSp) }
        v.setTextViewTextSize(R.id.w_ampm, TypedValue.COMPLEX_UNIT_SP, maxOf(11f, timeSp * 0.28f))

        val skeleton = if (size == SizeClass.LARGE) ClockPatterns.DATE_SKELETON_LONG else ClockPatterns.DATE_SKELETON_SHORT
        val datePattern = DateFormat.getBestDateTimePattern(Locale.getDefault(), skeleton)
        setClockFormat(v, R.id.w_date, datePattern, datePattern)
        v.setViewVisibility(R.id.w_date, if (style.showDate) View.VISIBLE else View.GONE)
    }

    private fun setClockFormat(v: RemoteViews, id: Int, format12: CharSequence, format24: CharSequence) {
        v.setCharSequence(id, "setFormat12Hour", format12)
        v.setCharSequence(id, "setFormat24Hour", format24)
    }

    private fun applyWeather(v: RemoteViews, r: Request, style: WidgetStyle, size: SizeClass) {
        val hero = WidgetSizing.heroSizes(r.type, size)
        v.setTextViewTextSize(R.id.w_temp, TypedValue.COMPLEX_UNIT_SP, WidgetSizing.scaled(hero.temperature, style.temperatureScale))
        val snap = r.snapshot
        val unit = r.settings.temperatureUnit
        if (snap == null || r.settings.activePlace == null) {
            v.setTextViewText(R.id.w_temp, "—°")
            v.setViewVisibility(R.id.w_icon, View.GONE)
            setTextOrGone(v, R.id.w_place, context.getString(if (r.settings.activePlace == null) R.string.widget_no_place else R.string.widget_no_data))
            listOf(R.id.w_hilo, R.id.w_condition, R.id.w_status, R.id.w_meta, R.id.w_hours, R.id.w_days, R.id.w_divider, R.id.w_tomorrow)
                .forEach { v.setViewVisibility(it, View.GONE) }
            return
        }

        val zone = snap.data.timeZoneId?.let { runCatching { ZoneId.of(it) }.getOrNull() } ?: ZoneId.systemDefault()
        val current = snap.data.current
        val condition = if (r.type == WidgetType.NIGHT) nightVariant(current.condition) else current.condition
        val label = WeatherText.condition(context, condition)
        setIcon(v, R.id.w_icon, R.id.w_icon_base, R.id.w_icon_accent, R.id.w_icon_3d, condition, style)
        // Las ilustraciones 3D piden más presencia: en Android 12+ el icono principal crece un 60 %.
        val iconDp = WidgetLayouts.iconDp(r.type, size)
        if (style.iconStyle == IconStyle.REALISTIC && iconDp > 0 && size != SizeClass.SMALL && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val big = iconDp * REALISTIC_ICON_SCALE
            v.setViewLayoutWidth(R.id.w_icon, big, TypedValue.COMPLEX_UNIT_DIP)
            v.setViewLayoutHeight(R.id.w_icon, big, TypedValue.COMPLEX_UNIT_DIP)
        }
        v.setContentDescription(R.id.w_icon, label)

        val freshness = Freshness.of(snap.fetchedAtMillis, r.nowMillis, r.settings.refreshIntervalMinutes)
        v.setTextViewText(R.id.w_temp, TemperatureFormatter.short(current.temperatureC, unit))
        if (freshness == Freshness.EXPIRED) {
            v.setTextColor(R.id.w_temp, ColorMath.withOpacity(style.textColor, 55))
        }

        val today = ForecastSlots.todayRange(snap.data.daily, LocalDate.now(zone))
        val hilo = today?.let { TemperatureFormatter.range(it.maxC, it.minC, unit) }
        setTextOrGone(v, R.id.w_place, snap.place.name.takeIf { style.showLocation })
        setTextOrGone(v, R.id.w_hilo, hilo.takeIf { style.showHighLow })
        if (today != null) {
            v.setContentDescription(
                R.id.w_hilo,
                context.getString(R.string.widget_hilo_cd, TemperatureFormatter.short(today.maxC, unit), TemperatureFormatter.short(today.minC, unit)),
            )
        }
        setTextOrGone(v, R.id.w_condition, label)
        val meta = listOfNotNull(snap.place.name.takeIf { style.showLocation }, hilo.takeIf { style.showHighLow }).joinToString(" · ")
        setTextOrGone(v, R.id.w_meta, meta.ifBlank { null })

        val status = when (freshness) {
            Freshness.FRESH -> null
            Freshness.STALE -> context.getString(R.string.widget_status_stale, WeatherText.age(context, r.nowMillis - snap.fetchedAtMillis))
            Freshness.EXPIRED -> context.getString(R.string.widget_status_expired, WeatherText.age(context, r.nowMillis - snap.fetchedAtMillis))
        }
        setTextOrGone(v, R.id.w_status, status.takeIf { size != SizeClass.SMALL })

        if (r.type == WidgetType.FORECAST) applyForecast(v, r, style, size, snap, zone)
        applyTomorrow(v, r, style, snap, zone)
    }

    private fun applyForecast(v: RemoteViews, r: Request, style: WidgetStyle, size: SizeClass, snap: WeatherSnapshot, zone: ZoneId) {
        val (hourCount, dayCount) = WidgetSizing.forecastSlots(size)
        val unit = r.settings.temperatureUnit
        val format = if (style.hourFormat != HourFormat.SYSTEM) style.hourFormat else r.settings.hourFormat
        val is24 = ClockPatterns.is24(format, DateFormat.is24HourFormat(context))
        val hourFormatter = DateTimeFormatter.ofPattern(if (is24) "H 'h'" else "h a", Locale.getDefault())
        val hours = ForecastSlots.upcomingHours(snap.data.hourly, r.nowMillis / 1000, hourCount)
        for (i in 0 until HOUR_CELL.size) {
            val point = hours.getOrNull(i)
            if (i >= hourCount || point == null) {
                v.setViewVisibility(HOUR_CELL[i], if (i < hourCount) View.INVISIBLE else View.GONE)
                continue
            }
            v.setViewVisibility(HOUR_CELL[i], View.VISIBLE)
            val label = if (i == 0) context.getString(R.string.widget_now)
            else hourFormatter.format(Instant.ofEpochSecond(point.time).atZone(zone))
            v.setTextViewText(HOUR_TIME[i], label)
            v.setTextViewText(HOUR_TEMP[i], TemperatureFormatter.short(point.temperatureC, unit))
            setIcon(v, HOUR_ICON[i], HOUR_BASE[i], HOUR_ACCENT[i], HOUR_3D[i], point.condition, style)
            v.setContentDescription(HOUR_ICON[i], WeatherText.condition(context, point.condition))
        }

        val today = LocalDate.now(zone)
        val days = ForecastSlots.upcomingDays(snap.data.daily, today, dayCount)
        val dayFormatter = DateTimeFormatter.ofPattern("EEE", Locale.getDefault())
        for (i in 0 until DAY_ROW.size) {
            val day = days.getOrNull(i)
            if (i >= dayCount || day == null) {
                v.setViewVisibility(DAY_ROW[i], View.GONE)
                continue
            }
            v.setViewVisibility(DAY_ROW[i], View.VISIBLE)
            val date = LocalDate.parse(day.date)
            val name = if (date == today) context.getString(R.string.widget_today)
            else dayFormatter.format(date).replaceFirstChar { it.titlecase(Locale.getDefault()) }
            v.setTextViewText(DAY_NAME[i], name)
            v.setTextViewText(DAY_RANGE[i], TemperatureFormatter.range(day.maxC, day.minC, unit))
            setIcon(v, DAY_ICON[i], DAY_BASE[i], DAY_ACCENT[i], DAY_3D[i], day.condition, style)
            v.setContentDescription(DAY_ICON[i], WeatherText.condition(context, day.condition))
        }
        v.setViewVisibility(R.id.w_days, if (days.isEmpty() || dayCount == 0) View.GONE else View.VISIBLE)
        v.setViewVisibility(R.id.w_divider, if (days.isEmpty() || dayCount == 0) View.GONE else View.VISIBLE)
    }

    /** Bloque «Mañana»: condición, máxima y mínima del día siguiente (solo donde la composición lo incluye). */
    private fun applyTomorrow(v: RemoteViews, r: Request, style: WidgetStyle, snap: WeatherSnapshot, zone: ZoneId) {
        val tomorrow = ForecastSlots.tomorrow(snap.data.daily, LocalDate.now(zone))
        if (!style.showTomorrow || tomorrow == null) {
            v.setViewVisibility(R.id.w_tomorrow, View.GONE)
            return
        }
        val unit = r.settings.temperatureUnit
        v.setViewVisibility(R.id.w_tomorrow, View.VISIBLE)
        v.setTextViewText(R.id.w_tomorrow_label, context.getString(R.string.widget_tomorrow))
        v.setTextViewText(R.id.w_tomorrow_range, TemperatureFormatter.range(tomorrow.maxC, tomorrow.minC, unit))
        setIcon(v, R.id.w_tom_icon, R.id.w_tom_icon_base, R.id.w_tom_icon_accent, R.id.w_tom_icon_3d, tomorrow.condition, style)
        v.setContentDescription(
            R.id.w_tomorrow,
            context.getString(R.string.widget_tomorrow_cd, WeatherText.condition(context, tomorrow.condition),
                TemperatureFormatter.short(tomorrow.maxC, unit), TemperatureFormatter.short(tomorrow.minC, unit)),
        )
    }

    private fun setIcon(v: RemoteViews, container: Int, base: Int, accent: Int, realistic: Int, condition: WeatherCondition, style: WidgetStyle) {
        val layers = WeatherIcons.layers(condition)
        v.setViewVisibility(container, View.VISIBLE)
        if (style.iconStyle == IconStyle.REALISTIC) {
            v.setViewVisibility(base, View.GONE)
            v.setViewVisibility(accent, View.GONE)
            v.setViewVisibility(realistic, View.VISIBLE)
            v.setImageViewResource(realistic, layers.realistic)
            return
        }
        v.setViewVisibility(realistic, View.GONE)
        v.setImageViewResource(base, layers.base)
        v.setImageViewResource(accent, layers.accent)
        v.setViewVisibility(base, if (layers.hasBase) View.VISIBLE else View.GONE)
        v.setViewVisibility(accent, if (layers.hasAccent) View.VISIBLE else View.GONE)
        val ink = ColorMath.opaque(style.iconColor)
        v.setInt(base, "setColorFilter", ink)
        val accentTint = when {
            style.iconStyle == IconStyle.MONO -> ink
            ColorMath.luminance(style.textColor) < DARK_INK_LUMINANCE -> layers.accentOnLight
            else -> 0 // sin tinte: SRC_ATOP con color transparente conserva los colores originales
        }
        v.setInt(accent, "setColorFilter", accentTint)
    }

    private fun setTextOrGone(v: RemoteViews, id: Int, text: CharSequence?) {
        if (text.isNullOrBlank()) {
            v.setViewVisibility(id, View.GONE)
        } else {
            v.setViewVisibility(id, View.VISIBLE)
            v.setTextViewText(id, text)
        }
    }

    private fun applyClicks(v: RemoteViews, r: Request) {
        val flags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        val open = Intent(context, MainActivity::class.java)
            .setFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
            .putExtra(MainActivity.EXTRA_DESTINATION, if (r.type == WidgetType.FORECAST) "forecast" else "home")
        v.setOnClickPendingIntent(
            android.R.id.background,
            PendingIntent.getActivity(context, r.appWidgetId, open, flags),
        )
        if (r.type.showsClock) {
            val alarms = Intent(AlarmClock.ACTION_SHOW_ALARMS).setFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            v.setOnClickPendingIntent(R.id.w_time_row, PendingIntent.getActivity(context, REQUEST_CLOCK, alarms, flags))
        }
        if (r.type.showsWeather) {
            val refresh = Intent(context, WidgetActionReceiver::class.java).setAction(WidgetActionReceiver.ACTION_REFRESH)
            v.setOnClickPendingIntent(R.id.w_status, PendingIntent.getBroadcast(context, REQUEST_REFRESH, refresh, flags))
        }
    }

    private fun px(dp: Int): Int = (dp * context.resources.displayMetrics.density).toInt()

    companion object {
        private const val REQUEST_CLOCK = -1
        private const val REQUEST_REFRESH = -2
        private const val DARK_INK_LUMINANCE = 0.35
        const val REALISTIC_ICON_SCALE = 1.6f

        fun nightVariant(c: WeatherCondition) = when (c) {
            WeatherCondition.CLEAR_DAY -> WeatherCondition.CLEAR_NIGHT
            WeatherCondition.PARTLY_CLOUDY_DAY -> WeatherCondition.PARTLY_CLOUDY_NIGHT
            else -> c
        }

        private val PRIMARY_TEXT = intArrayOf(R.id.w_temp, R.id.w_tomorrow_range)
        private val TIME_TEXT = intArrayOf(R.id.w_time, R.id.w_time_h, R.id.w_time_m)
        private val SECONDARY_TEXT = intArrayOf(
            R.id.w_ampm, R.id.w_tomorrow_label, R.id.w_date, R.id.w_place, R.id.w_hilo, R.id.w_condition, R.id.w_meta, R.id.w_status,
        )
        private val HOUR_CELL = intArrayOf(R.id.w_h0, R.id.w_h1, R.id.w_h2, R.id.w_h3, R.id.w_h4, R.id.w_h5)
        private val HOUR_TIME = intArrayOf(R.id.w_h0_time, R.id.w_h1_time, R.id.w_h2_time, R.id.w_h3_time, R.id.w_h4_time, R.id.w_h5_time)
        private val HOUR_TEMP = intArrayOf(R.id.w_h0_temp, R.id.w_h1_temp, R.id.w_h2_temp, R.id.w_h3_temp, R.id.w_h4_temp, R.id.w_h5_temp)
        private val HOUR_ICON = intArrayOf(R.id.w_h0_icon, R.id.w_h1_icon, R.id.w_h2_icon, R.id.w_h3_icon, R.id.w_h4_icon, R.id.w_h5_icon)
        private val HOUR_BASE = intArrayOf(
            R.id.w_h0_icon_base, R.id.w_h1_icon_base, R.id.w_h2_icon_base, R.id.w_h3_icon_base, R.id.w_h4_icon_base, R.id.w_h5_icon_base,
        )
        private val HOUR_ACCENT = intArrayOf(
            R.id.w_h0_icon_accent, R.id.w_h1_icon_accent, R.id.w_h2_icon_accent, R.id.w_h3_icon_accent, R.id.w_h4_icon_accent, R.id.w_h5_icon_accent,
        )
        private val HOUR_3D = intArrayOf(
            R.id.w_h0_icon_3d, R.id.w_h1_icon_3d, R.id.w_h2_icon_3d, R.id.w_h3_icon_3d, R.id.w_h4_icon_3d, R.id.w_h5_icon_3d,
        )
        private val DAY_3D = intArrayOf(R.id.w_d0_icon_3d, R.id.w_d1_icon_3d, R.id.w_d2_icon_3d, R.id.w_d3_icon_3d, R.id.w_d4_icon_3d)
        private val DAY_ROW = intArrayOf(R.id.w_d0, R.id.w_d1, R.id.w_d2, R.id.w_d3, R.id.w_d4)
        private val DAY_NAME = intArrayOf(R.id.w_d0_name, R.id.w_d1_name, R.id.w_d2_name, R.id.w_d3_name, R.id.w_d4_name)
        private val DAY_RANGE = intArrayOf(R.id.w_d0_range, R.id.w_d1_range, R.id.w_d2_range, R.id.w_d3_range, R.id.w_d4_range)
        private val DAY_ICON = intArrayOf(R.id.w_d0_icon, R.id.w_d1_icon, R.id.w_d2_icon, R.id.w_d3_icon, R.id.w_d4_icon)
        private val DAY_BASE = intArrayOf(R.id.w_d0_icon_base, R.id.w_d1_icon_base, R.id.w_d2_icon_base, R.id.w_d3_icon_base, R.id.w_d4_icon_base)
        private val DAY_ACCENT = intArrayOf(
            R.id.w_d0_icon_accent, R.id.w_d1_icon_accent, R.id.w_d2_icon_accent, R.id.w_d3_icon_accent, R.id.w_d4_icon_accent,
        )
    }
}
