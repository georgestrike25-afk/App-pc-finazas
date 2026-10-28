package app.aura.ui

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.aura.ui.theme.AuraTheme

class MainActivity : ComponentActivity() {
    private val viewModel: AuraViewModel by viewModels()
    private val destination = mutableStateOf<String?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        destination.value = intent?.getStringExtra(EXTRA_DESTINATION)
        setContent {
            val settings by viewModel.settings.collectAsStateWithLifecycle()
            AuraTheme(settings.themeMode) {
                AuraNavHost(viewModel, destination.value, onDestinationConsumed = { destination.value = null })
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        destination.value = intent.getStringExtra(EXTRA_DESTINATION)
    }

    override fun onResume() {
        super.onResume()
        viewModel.onForeground()
    }

    companion object {
        const val EXTRA_DESTINATION = "app.aura.extra.DESTINATION"
    }
}
