package app.aura.studio.ui

import android.graphics.BitmapFactory
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.aura.R
import app.aura.aura
import app.aura.core.studio.StudioProject
import app.aura.ui.components.ScreenHeader
import app.aura.ui.components.SectionTitle
import app.aura.ui.theme.Aura
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

@Composable
fun StudioHomeScreen(viewModel: StudioViewModel, onOpen: (String) -> Unit) {
    val projects by viewModel.projects.collectAsStateWithLifecycle()
    val activeId by viewModel.activeId.collectAsStateWithLifecycle()
    val busy by viewModel.busy.collectAsStateWithLifecycle()
    // Selector oficial de fotos: sin permisos de almacenamiento, solo la imagen elegida.
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        if (uri != null) viewModel.createFromPhoto(uri, onOpen)
    }
    val ratio = viewModel.screen.width / viewModel.screen.height.toFloat()

    LazyVerticalGrid(
        columns = GridCells.Fixed(2),
        modifier = Modifier.fillMaxSize().windowInsetsPadding(WindowInsets.statusBars).padding(horizontal = 20.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item(span = { GridItemSpan(2) }) {
            Column {
                ScreenHeader("Aura Studio")
                Text("Fondos con reloj 3D, hechos con tus fotos. Todo se procesa en el teléfono.", style = MaterialTheme.typography.bodyMedium, color = Aura.tokens.mutedText)
                Spacer(Modifier.height(16.dp))
                Button(
                    onClick = { picker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) },
                    enabled = busy == null,
                    modifier = Modifier.fillMaxWidth().height(54.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = Aura.tokens.accent, contentColor = Aura.tokens.onAccent),
                ) {
                    if (busy != null) CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp, color = Aura.tokens.onAccent)
                    else Icon(painterResource(R.drawable.ic_ui_add), null, Modifier.size(18.dp))
                    Spacer(Modifier.width(8.dp))
                    Text(busy ?: "Nuevo diseño desde una foto")
                }
                if (projects.isNotEmpty()) SectionTitle("Tus diseños")
            }
        }
        if (projects.isEmpty()) {
            item(span = { GridItemSpan(2) }) {
                Text(
                    "Elegí una foto: Aura detecta el sujeto principal para que quede delante del reloj, y podés ajustar todo después.",
                    style = MaterialTheme.typography.bodySmall,
                    color = Aura.tokens.mutedText,
                    modifier = Modifier.padding(top = 20.dp),
                )
            }
        }
        items(projects, key = { it.id }) { p ->
            ProjectTile(p, active = p.id == activeId, ratio = ratio, viewModel = viewModel, onOpen = { onOpen(p.id) })
        }
        item(span = { GridItemSpan(2) }) { Spacer(Modifier.height(24.dp)) }
    }
}

@Composable
private fun ProjectTile(p: StudioProject, active: Boolean, ratio: Float, viewModel: StudioViewModel, onOpen: () -> Unit) {
    val context = LocalContext.current
    var thumb by remember(p.id, p.updatedAt) { mutableStateOf<androidx.compose.ui.graphics.ImageBitmap?>(null) }
    LaunchedEffect(p.id, p.updatedAt) {
        thumb = withContext(Dispatchers.IO) {
            BitmapFactory.decodeFile(context.aura.studio.thumbFile(p.id).path)?.asImageBitmap()
        }
    }
    var menu by remember { mutableStateOf(false) }
    val shape = RoundedCornerShape(20.dp)
    Box(
        Modifier
            .fillMaxWidth()
            .aspectRatio(ratio)
            .clip(shape)
            .background(MaterialTheme.colorScheme.surfaceVariant)
            .then(if (active) Modifier.border(2.dp, Aura.tokens.accent, shape) else Modifier)
            .clickable(onClick = onOpen),
    ) {
        thumb?.let { Image(it, contentDescription = p.name, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize()) }
        Row(
            Modifier
                .align(Alignment.BottomStart)
                .fillMaxWidth()
                .background(Brush.verticalGradient(listOf(Color.Transparent, Color(0xAA000000))))
                .padding(horizontal = 10.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(p.name, color = Color.White, style = MaterialTheme.typography.labelMedium, maxLines = 1, modifier = Modifier.weight(1f))
            if (active) {
                Surface(color = Aura.tokens.accent, shape = RoundedCornerShape(6.dp)) {
                    Text("Activo", color = Aura.tokens.onAccent, style = MaterialTheme.typography.labelSmall, modifier = Modifier.padding(horizontal = 6.dp, vertical = 1.dp))
                }
            }
            Box {
                Text("⋮", color = Color.White, modifier = Modifier.clickable { menu = true }.padding(horizontal = 8.dp))
                DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                    DropdownMenuItem(text = { Text("Abrir") }, onClick = { menu = false; onOpen() })
                    DropdownMenuItem(text = { Text("Duplicar") }, onClick = { menu = false; viewModel.duplicate(p.id) })
                    DropdownMenuItem(text = { Text("Usar en el fondo animado") }, onClick = { menu = false; viewModel.setActive(p.id) })
                    DropdownMenuItem(text = { Text("Eliminar") }, onClick = { menu = false; viewModel.delete(p.id) })
                }
            }
        }
    }
}
