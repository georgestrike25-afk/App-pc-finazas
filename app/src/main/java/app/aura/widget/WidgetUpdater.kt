package app.aura.widget

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import app.aura.core.widget.WidgetType
import app.aura.data.SettingsRepository
import app.aura.data.WeatherRepository

class WidgetUpdater(
    context: Context,
    private val settings: SettingsRepository,
    private val weather: WeatherRepository,
) {
    private val appContext = context.applicationContext
    private val manager = AppWidgetManager.getInstance(appContext)
    private val renderer = WidgetRenderer(appContext)

    fun component(type: WidgetType) = ComponentName(appContext, providerClass(type))

    fun ids(type: WidgetType): IntArray = manager.getAppWidgetIds(component(type))

    fun placed(): Map<Int, WidgetType> = WidgetType.entries.flatMap { t -> ids(t).map { it to t } }.toMap()

    fun typeOf(appWidgetId: Int): WidgetType? {
        val className = manager.getAppWidgetInfo(appWidgetId)?.provider?.className ?: return null
        return WidgetType.entries.firstOrNull { providerClass(it).name == className }
    }

    suspend fun updateAll() {
        WidgetType.entries.forEach { update(it, ids(it)) }
    }

    suspend fun updateById(appWidgetId: Int) {
        typeOf(appWidgetId)?.let { update(it, intArrayOf(appWidgetId)) }
    }

    suspend fun update(type: WidgetType, appWidgetIds: IntArray) {
        if (appWidgetIds.isEmpty()) return
        val appSettings = settings.current()
        val snapshot = if (type.showsWeather) weather.cached() else null
        val now = System.currentTimeMillis()
        appWidgetIds.forEach { id ->
            val config = settings.widgetConfig(id, type)
            val views = renderer.render(
                WidgetRenderer.Request(
                    type = type,
                    style = config.style,
                    snapshot = snapshot,
                    settings = appSettings,
                    nowMillis = now,
                    appWidgetId = id,
                    options = manager.getAppWidgetOptions(id),
                ),
            )
            manager.updateAppWidget(id, views)
        }
    }

    companion object {
        fun providerClass(type: WidgetType): Class<out AppWidgetProvider> = when (type) {
            WidgetType.CLOCK -> ClockWidgetReceiver::class.java
            WidgetType.WEATHER -> WeatherWidgetReceiver::class.java
            WidgetType.DUO -> DuoWidgetReceiver::class.java
            WidgetType.FORECAST -> ForecastWidgetReceiver::class.java
            WidgetType.NIGHT -> NightWidgetReceiver::class.java
        }
    }
}
