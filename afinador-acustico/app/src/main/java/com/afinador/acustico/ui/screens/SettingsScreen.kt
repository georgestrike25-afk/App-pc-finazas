package com.afinador.acustico.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Slider
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.afinador.acustico.TunerViewModel
import com.afinador.acustico.data.AppSettings
import com.afinador.acustico.data.ThemeMode
import com.afinador.acustico.ui.Format
import com.afinador.acustico.ui.MicPermission
import com.afinador.acustico.ui.components.Panel
import com.afinador.acustico.ui.components.RoundTextButton
import com.afinador.acustico.ui.components.SectionTitle
import com.afinador.acustico.ui.components.SettingRow
import com.afinador.acustico.ui.theme.AppTheme
import com.afinador.core.ReferencePitch
import com.afinador.core.Sensitivity
import com.afinador.core.Transpose
import com.afinador.core.TunerReading

@Composable
fun SettingsScreen(
    settings: AppSettings,
    reading: TunerReading,
    permission: MicPermission,
    onRequestMic: () -> Unit,
    viewModel: TunerViewModel,
    onCalibratingChange: (Boolean) -> Unit,
    onOpenTunings: () -> Unit,
    onOpenPrivacy: () -> Unit,
    onOpenAbout: () -> Unit,
    onOpenTutorial: () -> Unit,
) {
    val colors = AppTheme.colors
    var calibrating by rememberSaveable { mutableStateOf(false) }

    Column(Modifier.fillMaxSize().padding(horizontal = 12.dp)) {
        TopBar(title = "Ajustes", subtitle = "Personalizá el afinador", level = 0f, quality = 0f, onSettings = null)
        Column(Modifier.weight(1f).verticalScroll(rememberScrollState()).testTag("lista_ajustes")) {
            SectionTitle("Tono de referencia (A4)")
            Panel(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(12.dp)) {
                    Text("Frecuencia base para todas las cuerdas y el modo cromático.", color = colors.textMuted, fontSize = 12.sp)
                    Spacer(Modifier.height(8.dp))
                    Segmented(
                        options = listOf("440 Hz", "432 Hz"),
                        selected = when (settings.a4) {
                            440.0 -> 0
                            432.0 -> 1
                            else -> -1
                        },
                        onSelect = { viewModel.setA4(if (it == 0) 440.0 else 432.0) },
                        tags = listOf("a4_440", "a4_432"),
                    )
                    Spacer(Modifier.height(10.dp))
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        RoundTextButton("−", { viewModel.setA4(settings.a4 - 1.0) }, description = "Bajar A4 1 Hz", tag = "a4_menos")
                        Text(
                            Format.a4(settings.a4),
                            color = colors.text, fontSize = 20.sp, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center,
                            modifier = Modifier.weight(1f).testTag("a4_valor"),
                        )
                        RoundTextButton("+", { viewModel.setA4(settings.a4 + 1.0) }, description = "Subir A4 1 Hz", tag = "a4_mas")
                    }
                    CustomA4Field(current = settings.a4, onApply = viewModel::setA4)
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        if (settings.a4 != ReferencePitch.DEFAULT) {
                            TextButton(onClick = { viewModel.setA4(ReferencePitch.DEFAULT) }, modifier = Modifier.testTag("a4_reset")) { Text("Volver a 440 Hz") }
                        }
                        TextButton(onClick = { calibrating = true }, modifier = Modifier.testTag("calibrar")) { Text("Calibrar con un instrumento") }
                    }
                }
            }

            SectionTitle("Desplazar tono")
            Panel(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(12.dp)) {
                    Text(
                        "Sube o baja el objetivo de todas las cuerdas en semitonos. Se combina con la referencia A4 y se aplica sobre la afinación elegida.",
                        color = colors.textMuted, fontSize = 12.sp,
                    )
                    Spacer(Modifier.height(8.dp))
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        RoundTextButton("−", { viewModel.changeTranspose(-1) }, description = "Bajar un semitono", tag = "ajustes_tono_menos")
                        Text(
                            Transpose.label(settings.transpose),
                            color = if (settings.transpose == 0) colors.text else colors.accent,
                            fontSize = 17.sp, fontWeight = FontWeight.SemiBold, textAlign = TextAlign.Center,
                            modifier = Modifier.weight(1f).testTag("ajustes_tono_valor"),
                        )
                        RoundTextButton("+", { viewModel.changeTranspose(1) }, description = "Subir un semitono", tag = "ajustes_tono_mas")
                    }
                    if (settings.transpose != 0) {
                        TextButton(onClick = { viewModel.setTranspose(0) }, modifier = Modifier.testTag("tono_reset")) { Text("Volver a 0 semitonos") }
                    }
                    Text(
                        "Rango: ${Transpose.MIN} a +${Transpose.MAX} semitonos. Objetivo actual de la sexta cuerda: " +
                            settings.tuning.targets(settings.a4, settings.transpose).first().let { "${it.name} (${Format.hz(it.frequency, 2)})" },
                        color = colors.textMuted, fontSize = 11.sp, modifier = Modifier.padding(top = 4.dp).testTag("objetivo_sexta"),
                    )
                }
            }

            SectionTitle("Afinación")
            Panel(Modifier.fillMaxWidth()) {
                Column {
                    SettingRow("Afinación actual", subtitle = settings.tuning.name + " · " + settings.tuning.noteNames().joinToString(" "), onClick = onOpenTunings) {
                        Text("›", color = colors.textMuted, fontSize = 22.sp)
                    }
                    HorizontalDivider(color = colors.outline)
                    Column(Modifier.padding(horizontal = 16.dp, vertical = 12.dp)) {
                        Text("Margen para «Afinada»", color = colors.text, fontSize = 15.sp)
                        Text("Qué tan cerca del objetivo tiene que estar la cuerda.", color = colors.textMuted, fontSize = 12.sp)
                        Spacer(Modifier.height(8.dp))
                        Segmented(
                            options = AppSettings.TOLERANCE_OPTIONS.map { "±${it.toInt()} c" },
                            selected = AppSettings.TOLERANCE_OPTIONS.indexOf(settings.toleranceCents),
                            onSelect = { viewModel.setTolerance(AppSettings.TOLERANCE_OPTIONS[it]) },
                        )
                    }
                }
            }

            SectionTitle("Micrófono")
            Panel(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(horizontal = 16.dp, vertical = 12.dp)) {
                    var slider by remember(settings.sensitivity) { mutableFloatStateOf(settings.sensitivity) }
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text("Sensibilidad", color = colors.text, fontSize = 15.sp)
                            Text(
                                "Alta capta cuerdas suaves; baja ignora ruido de fondo. Umbral: ${Format.number(Sensitivity.thresholdDb(slider), 0)} dBFS",
                                color = colors.textMuted, fontSize = 12.sp,
                            )
                        }
                        Text(Sensitivity.label(slider), color = colors.accent, fontWeight = FontWeight.SemiBold)
                    }
                    Slider(
                        value = slider,
                        onValueChange = { slider = it },
                        onValueChangeFinished = { viewModel.setSensitivity(slider) },
                        steps = 3,
                        modifier = Modifier.testTag("sensibilidad"),
                    )
                    if (permission != MicPermission.GRANTED) {
                        TextButton(onClick = onRequestMic) { Text("Permitir el uso del micrófono") }
                    }
                }
            }

            SectionTitle("Interfaz")
            Panel(Modifier.fillMaxWidth()) {
                Column {
                    Column(Modifier.padding(horizontal = 16.dp, vertical = 12.dp)) {
                        Text("Tema", color = colors.text, fontSize = 15.sp)
                        Spacer(Modifier.height(8.dp))
                        Segmented(
                            options = ThemeMode.entries.map { it.label },
                            selected = settings.themeMode.ordinal,
                            onSelect = { viewModel.setTheme(ThemeMode.entries[it]) },
                            tags = ThemeMode.entries.map { "tema_${it.name.lowercase()}" },
                        )
                    }
                    HorizontalDivider(color = colors.outline)
                    SettingRow("Mostrar cents", subtitle = "Desviación numérica junto a la nota") {
                        Switch(checked = settings.showCents, onCheckedChange = viewModel::setShowCents, modifier = Modifier.testTag("mostrar_cents"))
                    }
                    HorizontalDivider(color = colors.outline)
                    SettingRow("Mantener pantalla encendida", subtitle = "Sólo mientras estás afinando") {
                        Switch(checked = settings.keepScreenOn, onCheckedChange = viewModel::setKeepScreenOn, modifier = Modifier.testTag("pantalla_encendida"))
                    }
                }
            }

            SectionTitle("Información")
            Panel(Modifier.fillMaxWidth()) {
                Column {
                    SettingRow("Tutorial", subtitle = "Cómo usar el afinador", onClick = onOpenTutorial) { Text("›", color = colors.textMuted, fontSize = 22.sp) }
                    HorizontalDivider(color = colors.outline)
                    SettingRow("Privacidad y micrófono", subtitle = "Qué hace la app con el sonido", onClick = onOpenPrivacy) { Text("›", color = colors.textMuted, fontSize = 22.sp) }
                    HorizontalDivider(color = colors.outline)
                    SettingRow("Acerca de", onClick = onOpenAbout) { Text("›", color = colors.textMuted, fontSize = 22.sp) }
                }
            }
            Spacer(Modifier.height(16.dp))
        }
    }

    if (calibrating) {
        DisposableEffect(Unit) {
            onCalibratingChange(true)
            onDispose { onCalibratingChange(false) }
        }
        CalibrationDialog(
            reading = reading,
            currentA4 = settings.a4,
            permission = permission,
            onRequestMic = onRequestMic,
            onApply = { viewModel.setA4(it); calibrating = false },
            onDismiss = { calibrating = false },
        )
    }
}

@Composable
private fun CustomA4Field(current: Double, onApply: (Double) -> Unit) {
    var text by rememberSaveable { mutableStateOf("") }
    val parsed = text.replace(',', '.').toDoubleOrNull()
    val valid = parsed != null && ReferencePitch.isValid(parsed)
    Row(Modifier.fillMaxWidth().padding(top = 10.dp), verticalAlignment = Alignment.CenterVertically) {
        OutlinedTextField(
            value = text,
            onValueChange = { v -> text = v.filter { it.isDigit() || it == ',' || it == '.' }.take(6) },
            label = { Text("Otro valor (Hz)") },
            placeholder = { Text(Format.number(current, 1)) },
            isError = text.isNotEmpty() && !valid,
            supportingText = {
                if (text.isNotEmpty() && !valid) {
                    Text("Ingresá un valor entre ${ReferencePitch.MIN.toInt()} y ${ReferencePitch.MAX.toInt()} Hz")
                }
            },
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal, imeAction = ImeAction.Done),
            modifier = Modifier.weight(1f).testTag("a4_personalizada"),
        )
        Spacer(Modifier.width(8.dp))
        Button(
            onClick = { parsed?.let { onApply(Math.round(it * 10.0) / 10.0); text = "" } },
            enabled = valid,
            modifier = Modifier.testTag("a4_aplicar"),
        ) { Text("Aplicar") }
    }
}

/** Mide una nota de un instrumento de referencia y propone la A4 correspondiente. */
@Composable
private fun CalibrationDialog(
    reading: TunerReading,
    currentA4: Double,
    permission: MicPermission,
    onRequestMic: () -> Unit,
    onApply: (Double) -> Unit,
    onDismiss: () -> Unit,
) {
    val colors = AppTheme.colors
    val suggestion = if (reading.hasPitch) ReferencePitch.calibrateFrom(reading.frequency, currentA4) else null
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Calibrar la referencia") },
        text = {
            Column {
                Text(
                    "Tocá una nota sostenida en el instrumento de referencia (piano, diapasón u otra guitarra). " +
                        "El afinador calcula qué A4 hace que esa nota quede exactamente afinada.",
                    color = colors.textMuted, fontSize = 13.sp,
                )
                Spacer(Modifier.height(12.dp))
                if (permission != MicPermission.GRANTED) {
                    TextButton(onClick = onRequestMic) { Text("Permitir micrófono") }
                } else {
                    Box(
                        Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(colors.panel)
                            .border(1.dp, colors.outline, RoundedCornerShape(12.dp)).padding(12.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        if (reading.hasPitch) {
                            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                Text("${reading.detectedName} · ${Format.hz(reading.frequency, 2)}", color = colors.text, fontWeight = FontWeight.SemiBold)
                                Text(
                                    suggestion?.let { "A4 sugerida: ${Format.a4(it)}" } ?: "Fuera del rango 400–480 Hz",
                                    color = if (suggestion != null) colors.accent else colors.red, fontSize = 18.sp, fontWeight = FontWeight.Bold,
                                )
                            }
                        } else {
                            Text("Escuchando…", color = colors.textMuted)
                        }
                    }
                }
            }
        },
        confirmButton = {
            TextButton(onClick = { suggestion?.let(onApply) }, enabled = suggestion != null) {
                Text(suggestion?.let { "Usar ${Format.a4(it)}" } ?: "Usar")
            }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancelar") } },
    )
}
