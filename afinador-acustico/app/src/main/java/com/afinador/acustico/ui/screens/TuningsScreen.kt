package com.afinador.acustico.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.afinador.acustico.data.AppSettings
import com.afinador.acustico.ui.components.RoundTextButton
import com.afinador.acustico.ui.theme.AppTheme
import com.afinador.core.CustomTunings
import com.afinador.core.NoteMath
import com.afinador.core.Transpose
import com.afinador.core.Tuning
import com.afinador.core.TuningPresets

private data class EditorState(val existing: Tuning?, val base: Tuning)

/** Explorar, elegir y administrar afinaciones. */
@Composable
fun TuningsScreen(
    settings: AppSettings,
    onSelect: (Tuning) -> Unit,
    onSave: (existingId: String?, name: String, description: String, notes: List<Int>) -> Unit,
    onDuplicate: (Tuning) -> Unit,
    onDelete: (String) -> Unit,
    onResetTranspose: () -> Unit,
) {
    val colors = AppTheme.colors
    var customTab by rememberSaveable { mutableStateOf(settings.tuning.isCustom) }
    var editor by remember { mutableStateOf<EditorState?>(null) }
    var toDelete by remember { mutableStateOf<Tuning?>(null) }
    val list = if (customTab) settings.customTunings else TuningPresets.ALL

    Column(Modifier.fillMaxSize().padding(horizontal = 12.dp)) {
        TopBar(title = "Afinaciones alternativas", subtitle = "Elegí cómo querés afinar", level = 0f, quality = 0f, onSettings = null)
        Segmented(
            options = listOf("Predefinidas", "Personalizadas (${settings.customTunings.size})"),
            selected = if (customTab) 1 else 0,
            onSelect = { customTab = it == 1 },
            tags = listOf("pestana_predefinidas", "pestana_personalizadas"),
        )
        if (settings.transpose != 0) {
            Row(
                Modifier
                    .fillMaxWidth()
                    .padding(top = 8.dp)
                    .clip(RoundedCornerShape(12.dp))
                    .background(colors.accentSoft)
                    .padding(horizontal = 12.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    "Transposición global activa: ${Transpose.label(settings.transpose)}. Se aplica sobre la afinación que elijas.",
                    color = colors.text, fontSize = 12.sp, modifier = Modifier.weight(1f),
                )
                TextButton(onClick = onResetTranspose) { Text("Volver a 0") }
            }
        }
        LazyColumn(
            Modifier.weight(1f).fillMaxWidth().testTag("lista_afinaciones"),
            verticalArrangement = Arrangement.spacedBy(8.dp),
            contentPadding = androidx.compose.foundation.layout.PaddingValues(vertical = 10.dp),
        ) {
            if (list.isEmpty()) {
                item {
                    Text(
                        "Todavía no creaste afinaciones. Tocá «Crear afinación personalizada» o duplicá una predefinida desde su menú.",
                        color = colors.textMuted, fontSize = 13.sp, textAlign = TextAlign.Center,
                        modifier = Modifier.fillMaxWidth().padding(24.dp),
                    )
                }
            }
            items(list, key = { it.id }) { tuning ->
                TuningCard(
                    tuning = tuning,
                    transpose = settings.transpose,
                    selected = tuning.id == settings.tuning.id,
                    onClick = { onSelect(tuning) },
                    onEdit = if (tuning.isCustom) ({ editor = EditorState(tuning, tuning) }) else null,
                    onDuplicate = { onDuplicate(tuning); customTab = true },
                    onDelete = if (tuning.isCustom) ({ toDelete = tuning }) else null,
                )
            }
        }
        OutlinedButton(
            onClick = { editor = EditorState(null, settings.tuning) },
            modifier = Modifier.fillMaxWidth().padding(bottom = 10.dp).testTag("crear_afinacion"),
        ) {
            Text("+  Crear afinación personalizada")
        }
    }

    editor?.let { state ->
        TuningEditorDialog(
            initial = state.existing,
            base = state.base,
            onDismiss = { editor = null },
            onSave = { name, description, notes ->
                onSave(state.existing?.id, name, description, notes)
                customTab = true
                editor = null
            },
        )
    }
    toDelete?.let { tuning ->
        AlertDialog(
            onDismissRequest = { toDelete = null },
            title = { Text("¿Eliminar «${tuning.name}»?") },
            text = { Text("Esta afinación personalizada se borrará del teléfono.") },
            confirmButton = {
                TextButton(onClick = { onDelete(tuning.id); toDelete = null }, modifier = Modifier.testTag("confirmar_eliminar")) { Text("Eliminar") }
            },
            dismissButton = { TextButton(onClick = { toDelete = null }) { Text("Cancelar") } },
        )
    }
}

@Composable
fun Segmented(options: List<String>, selected: Int, onSelect: (Int) -> Unit, tags: List<String>? = null, modifier: Modifier = Modifier) {
    val colors = AppTheme.colors
    Row(
        modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(50))
            .background(colors.panel)
            .border(1.dp, colors.outline, RoundedCornerShape(50))
            .padding(3.dp),
    ) {
        options.forEachIndexed { i, label ->
            val isSelected = i == selected
            Box(
                Modifier
                    .weight(1f)
                    .clip(RoundedCornerShape(50))
                    .background(if (isSelected) colors.accentSoft else colors.panel)
                    .border(if (isSelected) 1.dp else 0.dp, if (isSelected) colors.accent else colors.panel, RoundedCornerShape(50))
                    .clickable { onSelect(i) }
                    .semantics {
                        role = Role.Tab
                        this.selected = isSelected
                    }
                    .let { m -> tags?.getOrNull(i)?.let { m.testTag(it) } ?: m }
                    .padding(vertical = 9.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text(label, color = if (isSelected) colors.accent else colors.textMuted, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, maxLines = 1)
            }
        }
    }
}

@Composable
private fun TuningCard(
    tuning: Tuning,
    transpose: Int,
    selected: Boolean,
    onClick: () -> Unit,
    onEdit: (() -> Unit)?,
    onDuplicate: () -> Unit,
    onDelete: (() -> Unit)?,
) {
    val colors = AppTheme.colors
    var menu by remember { mutableStateOf(false) }
    Row(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(if (selected) colors.accentSoft else colors.surface)
            .border(if (selected) 2.dp else 1.dp, if (selected) colors.accent else colors.outline, RoundedCornerShape(16.dp))
            .clickable(onClick = onClick)
            .semantics { this.selected = selected }
            .testTag("afinacion_${tuning.id}")
            .padding(start = 14.dp, top = 10.dp, bottom = 10.dp, end = 2.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text(tuning.name, color = colors.text, fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
            Text(
                tuning.noteNames().joinToString("  "),
                color = colors.accent, fontSize = 13.sp, fontWeight = FontWeight.Medium, letterSpacing = 0.5.sp,
            )
            if (transpose != 0 && selected) {
                Text(
                    "Con ${Transpose.label(transpose)}: " + tuning.noteNames(transpose).joinToString(" "),
                    color = colors.textMuted, fontSize = 11.sp,
                )
            }
            if (tuning.description.isNotBlank()) {
                Text(tuning.description, color = colors.textMuted, fontSize = 12.sp)
            }
        }
        Box(
            Modifier.size(24.dp).clip(CircleShape)
                .background(if (selected) colors.accent else colors.surface)
                .border(2.dp, if (selected) colors.accent else colors.outline, CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            if (selected) Icon(Icons.Filled.Check, contentDescription = "Seleccionada", tint = colors.background, modifier = Modifier.size(16.dp))
        }
        Box {
            IconButton(onClick = { menu = true }, modifier = Modifier.testTag("menu_${tuning.id}")) {
                Icon(Icons.Filled.MoreVert, contentDescription = "Opciones de ${tuning.name}", tint = colors.textMuted)
            }
            DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                if (onEdit != null) DropdownMenuItem(text = { Text("Editar") }, onClick = { menu = false; onEdit() })
                DropdownMenuItem(
                    text = { Text(if (tuning.isCustom) "Duplicar" else "Duplicar como personalizada") },
                    onClick = { menu = false; onDuplicate() },
                    modifier = Modifier.testTag("duplicar"),
                )
                if (onDelete != null) DropdownMenuItem(text = { Text("Eliminar") }, onClick = { menu = false; onDelete() }, modifier = Modifier.testTag("eliminar"))
            }
        }
    }
}

/** Editor de afinaciones: nombre, descripción y la nota de cada cuerda (por semitonos). */
@Composable
private fun TuningEditorDialog(
    initial: Tuning?,
    base: Tuning,
    onDismiss: () -> Unit,
    onSave: (name: String, description: String, notes: List<Int>) -> Unit,
) {
    val colors = AppTheme.colors
    var name by rememberSaveable { mutableStateOf(initial?.name ?: "Mi afinación") }
    var description by rememberSaveable { mutableStateOf(initial?.description ?: "") }
    val notes = remember { mutableStateListOf(*(initial ?: base).midiNotes.toTypedArray()) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(if (initial == null) "Nueva afinación" else "Editar afinación") },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState())) {
                OutlinedTextField(
                    value = name,
                    onValueChange = { name = it.take(CustomTunings.MAX_NAME_LENGTH) },
                    label = { Text("Nombre") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth().testTag("editor_nombre"),
                )
                Spacer(Modifier.height(6.dp))
                OutlinedTextField(
                    value = description,
                    onValueChange = { description = it.take(CustomTunings.MAX_DESCRIPTION_LENGTH) },
                    label = { Text("Descripción (opcional)") },
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(10.dp))
                notes.forEachIndexed { i, midi ->
                    Row(Modifier.fillMaxWidth().padding(vertical = 3.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text("Cuerda ${6 - i}", color = colors.textMuted, fontSize = 13.sp, modifier = Modifier.width(72.dp))
                        RoundTextButton("−", { if (midi > Tuning.MIN_MIDI) notes[i] = midi - 1 }, size = 34.dp, description = "Bajar cuerda ${6 - i}", tag = "editor_menos_${6 - i}")
                        Column(Modifier.weight(1f), horizontalAlignment = Alignment.CenterHorizontally) {
                            Text(NoteMath.noteName(midi), color = colors.text, fontSize = 17.sp, fontWeight = FontWeight.Bold, modifier = Modifier.testTag("editor_nota_${6 - i}"))
                            Text(NoteMath.solfegeName(midi), color = colors.textMuted, fontSize = 11.sp)
                        }
                        RoundTextButton("+", { if (midi < Tuning.MAX_MIDI) notes[i] = midi + 1 }, size = 34.dp, description = "Subir cuerda ${6 - i}", tag = "editor_mas_${6 - i}")
                    }
                }
                Text(
                    "Cada toque sube o baja un semitono. Rango permitido: ${NoteMath.noteName(Tuning.MIN_MIDI)} a ${NoteMath.noteName(Tuning.MAX_MIDI)}.",
                    color = colors.textMuted, fontSize = 11.sp, modifier = Modifier.padding(top = 6.dp),
                )
            }
        },
        confirmButton = {
            TextButton(onClick = { onSave(name, description, notes.toList()) }, modifier = Modifier.testTag("editor_guardar")) { Text("Guardar") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancelar") } },
    )
}
