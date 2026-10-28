package app.aura.ui.screens

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.aura.BuildConfig
import app.aura.core.openmeteo.OpenMeteoWeatherProvider
import app.aura.core.settings.AppSettings
import app.aura.core.settings.LocationMode
import app.aura.core.settings.ThemeMode
import app.aura.core.time.HourFormat
import app.aura.core.units.TemperatureUnit
import app.aura.ui.AuraViewModel
import app.aura.ui.components.AuraCard
import app.aura.ui.components.LabeledRow
import app.aura.ui.components.ScreenHeader
import app.aura.ui.components.SectionTitle
import app.aura.ui.components.Segmented
import app.aura.ui.theme.Aura

@Composable
fun SettingsScreen(viewModel: AuraViewModel, onOpenLocation: () -> Unit) {
    val settings by viewModel.settings.collectAsStateWithLifecycle()
    val context = LocalContext.current
    var confirmClear by remember { mutableStateOf(false) }
    val provider = OpenMeteoWeatherProvider.INFO

    Column(
        Modifier
            .fillMaxSize()
            .windowInsetsPadding(WindowInsets.statusBars)
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 20.dp),
    ) {
        ScreenHeader("Ajustes")

        SectionTitle("Unidades y hora")
        Segmented(listOf(TemperatureUnit.CELSIUS to "°C", TemperatureUnit.FAHRENHEIT to "°F"), settings.temperatureUnit, { u ->
            viewModel.updateSettings { it.copy(temperatureUnit = u) }
        })
        Spacer(Modifier.height(10.dp))
        Segmented(listOf(HourFormat.SYSTEM to "Sistema", HourFormat.H12 to "12 h", HourFormat.H24 to "24 h"), settings.hourFormat, { f ->
            viewModel.updateSettings { it.copy(hourFormat = f) }
        })

        SectionTitle("Actualización")
        Segmented(
            AppSettings.REFRESH_CHOICES.map { it to if (it < 60) "$it min" else "${it / 60} h" },
            settings.refreshIntervalMinutes,
            { m -> viewModel.updateSettings { it.copy(refreshIntervalMinutes = m) } },
        )
        Text(
            "Android decide el momento exacto según batería y red; el reloj de los widgets no depende de esto.",
            style = MaterialTheme.typography.bodySmall,
            color = Aura.tokens.mutedText,
            modifier = Modifier.padding(top = 6.dp),
        )
        LabeledRow("Solo con Wi-Fi", supporting = "Evita usar datos móviles en segundo plano") {
            Switch(settings.wifiOnly, { v -> viewModel.updateSettings { it.copy(wifiOnly = v) } })
        }

        SectionTitle("Ubicación")
        AuraCard(padding = 16) {
            LabeledRow(
                if (settings.locationMode == LocationMode.DEVICE) "Ubicación del dispositivo" else "Ciudad elegida",
                supporting = settings.activePlace?.name ?: "Sin definir",
            ) { TextButton(onClick = onOpenLocation) { Text("Cambiar") } }
        }

        SectionTitle("Apariencia de la app")
        Segmented(listOf(ThemeMode.SYSTEM to "Sistema", ThemeMode.LIGHT to "Claro", ThemeMode.DARK to "Oscuro"), settings.themeMode, { m ->
            viewModel.updateSettings { it.copy(themeMode = m) }
        })

        SectionTitle("Fuente meteorológica")
        AuraCard(padding = 16) {
            Text(provider.displayName, style = MaterialTheme.typography.titleMedium)
            Text(provider.attribution, style = MaterialTheme.typography.bodySmall, color = Aura.tokens.mutedText)
            Text(provider.termsSummary, style = MaterialTheme.typography.bodySmall, color = Aura.tokens.mutedText)
            TextButton(onClick = {
                runCatching { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(provider.attributionUrl)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
            }) { Text("open-meteo.com") }
        }

        SectionTitle("Privacidad")
        AuraCard(padding = 16) {
            Text(
                "Aura no tiene cuentas, anuncios ni analítica. Guarda tus ajustes y la última respuesta meteorológica solo en este teléfono. " +
                    "Para consultar el tiempo envía a Open-Meteo las coordenadas del lugar (redondeadas a ~1 km si usás tu ubicación). " +
                    "La ubicación se lee con permiso aproximado y únicamente con la app abierta.",
                style = MaterialTheme.typography.bodySmall,
            )
            TextButton(onClick = { confirmClear = true }) { Text("Borrar todos los datos de Aura") }
        }

        SectionTitle("Acerca de")
        AuraCard(padding = 16) {
            Text("Aura ${BuildConfig.VERSION_NAME}", style = MaterialTheme.typography.titleMedium)
            Text("El cielo y el tiempo, a tu manera.", style = MaterialTheme.typography.bodyMedium, color = Aura.tokens.mutedText)
            Spacer(Modifier.height(8.dp))
            Text(
                "Código abierto de terceros: AndroidX y Jetpack Compose (Apache 2.0), Kotlin y kotlinx (Apache 2.0). " +
                    "Iconografía e icono de Aura: diseño propio.",
                style = MaterialTheme.typography.bodySmall,
                color = Aura.tokens.mutedText,
            )
        }
        Spacer(Modifier.height(32.dp))
    }

    if (confirmClear) {
        AlertDialog(
            onDismissRequest = { confirmClear = false },
            title = { Text("¿Borrar todo?") },
            text = { Text("Se eliminan ajustes, perfiles, ciudades guardadas, configuración de widgets y caché meteorológica.") },
            confirmButton = { TextButton(onClick = { confirmClear = false; viewModel.clearAllData() }) { Text("Borrar") } },
            dismissButton = { TextButton(onClick = { confirmClear = false }) { Text("Cancelar") } },
        )
    }
}
