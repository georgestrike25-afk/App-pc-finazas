package app.aura.widget

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Bundle
import app.aura.aura
import app.aura.core.style.WidgetConfig
import app.aura.core.widget.WidgetType
import app.aura.work.RefreshScheduler
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json

/** Ejecuta trabajo suspendido dentro del margen de tiempo que Android concede a un receptor. */
internal fun BroadcastReceiver.launchAsync(block: suspend () -> Unit) {
    val pending = goAsync()
    CoroutineScope(SupervisorJob() + Dispatchers.Default).launch {
        try {
            block()
        } finally {
            pending.finish()
        }
    }
}

abstract class AuraWidgetProvider(private val type: WidgetType) : AppWidgetProvider() {

    override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
        launchAsync { context.aura.widgets.update(type, appWidgetIds) }
    }

    override fun onAppWidgetOptionsChanged(context: Context, appWidgetManager: AppWidgetManager, appWidgetId: Int, newOptions: Bundle) {
        // En Android 11 y anteriores la composición se elige según el tamaño informado aquí.
        launchAsync { context.aura.widgets.update(type, intArrayOf(appWidgetId)) }
    }

    override fun onDeleted(context: Context, appWidgetIds: IntArray) {
        launchAsync { context.aura.settings.deleteWidgetConfigs(appWidgetIds) }
    }

    override fun onEnabled(context: Context) {
        if (type.showsWeather) RefreshScheduler.refreshNow(context, manual = false)
    }
}

class ClockWidgetReceiver : AuraWidgetProvider(WidgetType.CLOCK)
class WeatherWidgetReceiver : AuraWidgetProvider(WidgetType.WEATHER)
class DuoWidgetReceiver : AuraWidgetProvider(WidgetType.DUO)
class ForecastWidgetReceiver : AuraWidgetProvider(WidgetType.FORECAST)
class NightWidgetReceiver : AuraWidgetProvider(WidgetType.NIGHT)

/** Re-renderiza los widgets cuando cambian la zona horaria, la hora o el idioma del sistema. */
class SystemChangeReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        when (intent.action) {
            Intent.ACTION_TIMEZONE_CHANGED, Intent.ACTION_TIME_CHANGED, Intent.ACTION_LOCALE_CHANGED ->
                launchAsync { context.aura.widgets.updateAll() }
        }
    }
}

class WidgetActionReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        when (intent.action) {
            ACTION_REFRESH -> launchAsync {
                val settings = context.aura.settings.current()
                RefreshScheduler.refreshNow(context, manual = true, wifiOnly = settings.wifiOnly)
            }
            ACTION_PINNED -> {
                val id = intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID)
                val raw = intent.getStringExtra(EXTRA_CONFIG)
                if (id == AppWidgetManager.INVALID_APPWIDGET_ID || raw == null) return
                launchAsync {
                    val config = runCatching { Json.decodeFromString<WidgetConfig>(raw) }.getOrNull() ?: return@launchAsync
                    val app = context.aura
                    app.settings.saveWidgetConfig(id, config)
                    app.widgets.updateById(id)
                }
            }
        }
    }

    companion object {
        const val ACTION_REFRESH = "app.aura.action.REFRESH"
        const val ACTION_PINNED = "app.aura.action.WIDGET_PINNED"
        const val EXTRA_CONFIG = "app.aura.extra.CONFIG"
    }
}
