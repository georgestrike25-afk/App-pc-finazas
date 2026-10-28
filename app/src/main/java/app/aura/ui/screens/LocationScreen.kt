package app.aura.ui.screens

import android.Manifest
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.aura.R
import app.aura.core.settings.LocationMode
import app.aura.core.weather.Place
import app.aura.ui.AuraViewModel
import app.aura.ui.SearchState
import app.aura.ui.components.AuraCard
import app.aura.ui.components.ScreenHeader
import app.aura.ui.components.SectionTitle
import app.aura.ui.theme.Aura

@Composable
fun LocationScreen(viewModel: AuraViewModel, onBack: () -> Unit) {
    val settings by viewModel.settings.collectAsStateWithLifecycle()
    val query by viewModel.searchQuery.collectAsStateWithLifecycle()
    val search by viewModel.search.collectAsStateWithLifecycle()
    val locating by viewModel.locating.collectAsStateWithLifecycle()
    val permission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) viewModel.useDeviceLocation()
    }

    Column(Modifier.fillMaxSize().windowInsetsPadding(WindowInsets.statusBars).imePadding().padding(horizontal = 16.dp)) {
        ScreenHeader("Ubicación", onBack = onBack)
        LazyColumn(Modifier.fillMaxSize()) {
            item {
                AuraCard(padding = 16) {
                    Row(
                        Modifier.fillMaxWidth().clickable {
                            if (viewModel.hasLocationPermission) viewModel.useDeviceLocation()
                            else permission.launch(Manifest.permission.ACCESS_COARSE_LOCATION)
                        },
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Icon(painterResource(R.drawable.ic_ui_gps), null, tint = Aura.tokens.accent)
                        Spacer(Modifier.width(14.dp))
                        Column(Modifier.weight(1f)) {
                            Text("Usar mi ubicación", style = MaterialTheme.typography.titleMedium)
                            Text(
                                when {
                                    settings.locationMode == LocationMode.DEVICE && settings.devicePlace != null -> "Activa · ${settings.devicePlace?.name}"
                                    else -> "Aproximada (~1 km), solo con la app abierta"
                                },
                                style = MaterialTheme.typography.bodySmall,
                                color = Aura.tokens.mutedText,
                            )
                        }
                        if (locating) CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp)
                    }
                }
                Spacer(Modifier.height(16.dp))
                OutlinedTextField(
                    value = query,
                    onValueChange = viewModel::setQuery,
                    leadingIcon = { Icon(painterResource(R.drawable.ic_ui_search), null) },
                    placeholder = { Text("Buscar ciudad") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
            when (val s = search) {
                SearchState.Idle -> Unit
                SearchState.Loading -> item { CircularProgressIndicator(Modifier.padding(16.dp)) }
                is SearchState.Error -> item {
                    Text("No se pudo buscar: ${s.message}", color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(16.dp))
                }
                is SearchState.Results -> {
                    if (s.places.isEmpty()) item { Text("Sin resultados", color = Aura.tokens.mutedText, modifier = Modifier.padding(16.dp)) }
                    items(s.places, key = { "r" + it.id }) { place ->
                        PlaceRow(place, selected = false, onClick = { viewModel.selectPlace(place) })
                        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
                    }
                }
            }
            if (settings.savedPlaces.isNotEmpty()) {
                item { SectionTitle("Tus ciudades") }
                items(settings.savedPlaces, key = { "s" + it.id }) { place ->
                    val active = settings.locationMode == LocationMode.MANUAL && settings.manualPlace?.id == place.id
                    PlaceRow(place, selected = active, onClick = { viewModel.selectPlace(place) }, onRemove = { viewModel.removeSavedPlace(place) })
                }
            }
            item {
                Text(
                    "Búsqueda de ciudades: Open-Meteo Geocoding (datos GeoNames, CC BY 4.0). " +
                        "Aura no guarda tu historial de ubicaciones fuera del teléfono.",
                    style = MaterialTheme.typography.bodySmall,
                    color = Aura.tokens.mutedText,
                    modifier = Modifier.padding(vertical = 20.dp, horizontal = 4.dp),
                )
            }
        }
    }
}

@Composable
private fun PlaceRow(place: Place, selected: Boolean, onClick: () -> Unit, onRemove: (() -> Unit)? = null) {
    Row(
        Modifier.fillMaxWidth().clickable(onClick = onClick).padding(horizontal = 8.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Icon(painterResource(R.drawable.ic_ui_location), null, tint = if (selected) Aura.tokens.accent else Aura.tokens.mutedText)
        Column(Modifier.weight(1f)) {
            Text(place.name, style = MaterialTheme.typography.bodyLarge)
            if (place.subtitle.isNotBlank()) Text(place.subtitle, style = MaterialTheme.typography.bodySmall, color = Aura.tokens.mutedText)
        }
        if (selected) Icon(painterResource(R.drawable.ic_ui_check), contentDescription = "Seleccionada", tint = Aura.tokens.accent)
        if (onRemove != null) {
            IconButton(onClick = onRemove) { Icon(painterResource(R.drawable.ic_ui_close), contentDescription = "Quitar ${place.name}") }
        }
    }
}
