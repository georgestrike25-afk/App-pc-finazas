package app.aura.work

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import androidx.work.workDataOf
import app.aura.aura
import app.aura.core.settings.AppSettings
import app.aura.data.RefreshResult
import java.util.concurrent.TimeUnit

/**
 * Actualizaciones meteorológicas mediante WorkManager: sin servicios permanentes, respetando Doze
 * y el modo de ahorro de batería. El reloj de los widgets no depende de esto (lo dibuja TextClock).
 */
object RefreshScheduler {
    private const val PERIODIC = "aura-weather-periodic"
    private const val NOW = "aura-weather-now"

    fun schedule(context: Context, settings: AppSettings, replace: Boolean) {
        val request = PeriodicWorkRequestBuilder<WeatherRefreshWorker>(
            settings.refreshIntervalMinutes.coerceAtLeast(15).toLong(), TimeUnit.MINUTES,
        )
            .setConstraints(constraints(settings, periodic = true))
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 10, TimeUnit.MINUTES)
            .build()
        WorkManager.getInstance(context).enqueueUniquePeriodicWork(
            PERIODIC,
            if (replace) ExistingPeriodicWorkPolicy.UPDATE else ExistingPeriodicWorkPolicy.KEEP,
            request,
        )
    }

    /** Actualización puntual (al colocar un widget, cambiar de ciudad o pedirla a mano). */
    fun refreshNow(context: Context, manual: Boolean, wifiOnly: Boolean = false) {
        val request = OneTimeWorkRequestBuilder<WeatherRefreshWorker>()
            .setInputData(workDataOf(WeatherRefreshWorker.KEY_MANUAL to manual))
            .setConstraints(
                Constraints.Builder()
                    .setRequiredNetworkType(if (wifiOnly) NetworkType.UNMETERED else NetworkType.CONNECTED)
                    .build(),
            )
            .build()
        WorkManager.getInstance(context).enqueueUniqueWork(NOW, ExistingWorkPolicy.REPLACE, request)
    }

    private fun constraints(settings: AppSettings, periodic: Boolean) = Constraints.Builder()
        .setRequiredNetworkType(if (settings.wifiOnly) NetworkType.UNMETERED else NetworkType.CONNECTED)
        .setRequiresBatteryNotLow(periodic)
        .build()
}

class WeatherRefreshWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        val app = applicationContext.aura
        val result = app.weather.refresh(manual = inputData.getBoolean(KEY_MANUAL, false))
        // Siempre se re-renderiza: aunque no haya datos nuevos, la antigüedad mostrada cambia.
        app.widgets.updateAll()
        return when (result) {
            is RefreshResult.Failed -> if (runAttemptCount < MAX_RETRIES) Result.retry() else Result.success()
            else -> Result.success()
        }
    }

    companion object {
        const val KEY_MANUAL = "manual"
        private const val MAX_RETRIES = 3
    }
}
