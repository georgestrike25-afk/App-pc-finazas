package app.aura.widget

import android.appwidget.AppWidgetManager
import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.aura.aura
import app.aura.ui.AuraViewModel
import app.aura.ui.screens.CustomizeRoute
import app.aura.ui.theme.AuraTheme

/**
 * Configuración de un widget concreto: se abre al colocarlo (si el launcher lo pide) o al
 * mantenerlo pulsado › Configuración. Cada appWidgetId guarda su propio estilo.
 */
class WidgetConfigActivity : ComponentActivity() {
    private val viewModel: AuraViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        val appWidgetId = intent?.extras?.getInt(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID)
            ?: AppWidgetManager.INVALID_APPWIDGET_ID
        val resultValue = Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId)
        // Si el usuario sale sin confirmar, el widget recién colocado se descarta (comportamiento estándar).
        setResult(RESULT_CANCELED, resultValue)
        val type = aura.widgets.typeOf(appWidgetId)
        if (appWidgetId == AppWidgetManager.INVALID_APPWIDGET_ID || type == null) {
            finish()
            return
        }
        setContent {
            val settings by viewModel.settings.collectAsStateWithLifecycle()
            AuraTheme(settings.themeMode) {
                // Surface fija el color de contenido del tema: sin ella el texto salía negro sobre fondo oscuro.
                androidx.compose.material3.Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
                    CustomizeRoute(
                        viewModel = viewModel,
                        type = type,
                        widgetId = appWidgetId,
                        onDone = { finish() },
                        onSavedToWidget = {
                            setResult(RESULT_OK, resultValue)
                            finish()
                        },
                    )
                }
            }
        }
    }
}
