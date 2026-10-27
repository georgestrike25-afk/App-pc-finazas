package com.afinador.acustico.ui.screens

import androidx.compose.animation.animateColorAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.min
import androidx.compose.ui.unit.sp
import com.afinador.acustico.AudioStatus
import com.afinador.acustico.data.AppSettings
import com.afinador.acustico.ui.Format
import com.afinador.acustico.ui.MicPermission
import com.afinador.acustico.ui.components.AppIcons
import com.afinador.acustico.ui.components.GuitarHeadstock
import com.afinador.acustico.ui.components.Panel
import com.afinador.acustico.ui.components.RoundTextButton
import com.afinador.acustico.ui.components.SignalBars
import com.afinador.acustico.ui.components.StatusPill
import com.afinador.acustico.ui.components.TuningMeter
import com.afinador.acustico.ui.theme.AppTheme
import com.afinador.core.Transpose
import com.afinador.core.TunerReading
import com.afinador.core.NoteMath

/** Pantalla principal: clavijero y mástil, nota detectada, medidor y controles rápidos. */
@Composable
fun TunerScreen(
    settings: AppSettings,
    reading: TunerReading,
    selectedString: Int?,
    permission: MicPermission,
    audioStatus: AudioStatus,
    onRequestMic: () -> Unit,
    onSelectString: (Int) -> Unit,
    onAuto: () -> Unit,
    onOpenTunings: () -> Unit,
    onOpenSettings: () -> Unit,
    onTranspose: (Int) -> Unit,
    onResetTranspose: () -> Unit,
) {
    val colors = AppTheme.colors
    val tuning = settings.tuning
    val targets = remember(tuning, settings.a4, settings.transpose) { tuning.targets(settings.a4, settings.transpose) }
    val active = when {
        reading.hasPitch -> reading.stringIndex
        else -> selectedString ?: -1
    }
    val statusColor = if (reading.hasPitch) colors.forStatus(reading.status) else colors.accent

    val compact = LocalConfiguration.current.screenHeightDp < 720
    Column(Modifier.fillMaxSize().padding(horizontal = 12.dp)) {
        TopBar(
            title = "Afinador de Guitarra",
            subtitle = "Acústica · ${tuning.name}",
            level = reading.signalLevel,
            quality = reading.quality,
            onSettings = onOpenSettings,
        )

        // Medidor con la nota en el centro del arco (la aguja sale del círculo de la nota).
        when {
            permission != MicPermission.GRANTED -> MicRequestCard(permission, onRequestMic)
            audioStatus is AudioStatus.Failed -> ErrorCard(audioStatus.message)
            else -> {
                val badge = if (compact) 98.dp else 124.dp
                Box(Modifier.fillMaxWidth().height(if (compact) 156.dp else 196.dp)) {
                    TuningMeter(
                        cents = reading.cents,
                        hasPitch = reading.hasPitch,
                        toleranceCents = settings.toleranceCents,
                        status = reading.status,
                        hubRadius = badge / 2,
                        modifier = Modifier.fillMaxSize(),
                    )
                    NoteBadge(
                        reading = reading,
                        waitingName = selectedString?.let { targets[it].pitchName },
                        waitingOctave = selectedString?.let { NoteMath.octave(targets[it].midi).toString() },
                        waitingHz = selectedString?.let { targets[it].frequency },
                        size = badge,
                        showCents = settings.showCents,
                        modifier = Modifier.align(Alignment.BottomCenter),
                    )
                }
                Box(Modifier.fillMaxWidth().padding(top = 6.dp), contentAlignment = Alignment.Center) {
                    StatusPill(reading.status, reading.hasPitch)
                }
            }
        }

        // Clavijero y mástil: ocupan todo el espacio restante.
        Box(Modifier.weight(1f).fillMaxWidth().padding(top = 4.dp)) {
            GuitarHeadstock(
                targets = targets,
                activeString = active,
                statusColor = statusColor,
                hasPitch = reading.hasPitch,
                selectedString = selectedString,
                onSelectString = onSelectString,
                modifier = Modifier.testTag("mastil"),
            ) { _, _ ->
                Chip(
                    text = if (selectedString == null) "Automático" else "Manual: cuerda ${6 - selectedString}",
                    selected = selectedString == null,
                    onClick = onAuto,
                    modifier = Modifier.align(Alignment.BottomStart).padding(bottom = 4.dp).testTag("modo_auto"),
                )
            }
        }

        Spacer(Modifier.height(6.dp))
        QuickControls(
            settings = settings,
            onOpenTunings = onOpenTunings,
            onOpenSettings = onOpenSettings,
            onTranspose = onTranspose,
            onResetTranspose = onResetTranspose,
        )
        Spacer(Modifier.height(6.dp))
    }
}

/** Círculo central con la nota, la frecuencia medida y la desviación. */
@Composable
fun NoteBadge(
    reading: TunerReading,
    waitingName: String?,
    waitingOctave: String?,
    waitingHz: Double?,
    size: Dp,
    modifier: Modifier = Modifier,
    showCents: Boolean = true,
) {
    val colors = AppTheme.colors
    val ring by animateColorAsState(if (reading.hasPitch) colors.forStatus(reading.status) else colors.outline, label = "anillo")
    val big = (size.value * 0.36f).sp
    Box(
        modifier
            .size(size)
            .shadow(if (reading.hasPitch) 18.dp else 6.dp, CircleShape, ambientColor = ring, spotColor = ring)
            .clip(CircleShape)
            .background(colors.surface)
            .border(4.dp, ring, CircleShape)
            .semantics {
                contentDescription = if (reading.hasPitch) {
                    "Nota ${reading.targetName}, ${Format.hz(reading.frequency)}, ${Format.cents(reading.cents)}"
                } else {
                    "Esperando una cuerda"
                }
            }
            .testTag("nota"),
        contentAlignment = Alignment.Center,
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            if (reading.hasPitch) {
                Row(verticalAlignment = Alignment.Bottom) {
                    Text(reading.targetPitchName, color = colors.text, fontSize = big, fontWeight = FontWeight.Bold, lineHeight = big)
                    Text("${reading.targetOctave}", color = colors.textMuted, fontSize = (big.value * 0.4f).sp, modifier = Modifier.padding(bottom = 4.dp))
                }
                Text(Format.hz(reading.frequency), color = colors.text, fontSize = 12.sp, lineHeight = 13.sp, fontWeight = FontWeight.Medium)
                if (showCents) {
                    Text(Format.cents(reading.cents), color = ring, fontSize = 11.sp, lineHeight = 12.sp, fontWeight = FontWeight.SemiBold)
                }
            } else if (waitingName != null && waitingHz != null) {
                Row(verticalAlignment = Alignment.Bottom) {
                    Text(waitingName, color = colors.textMuted, fontSize = big, fontWeight = FontWeight.Bold, lineHeight = big)
                    Text(waitingOctave ?: "", color = colors.textMuted, fontSize = (big.value * 0.4f).sp, modifier = Modifier.padding(bottom = 4.dp))
                }
                Text("objetivo", color = colors.textMuted, fontSize = 10.sp, lineHeight = 11.sp)
                Text(Format.hz(waitingHz), color = colors.textMuted, fontSize = 11.sp, lineHeight = 12.sp)
            } else {
                Text("♪", color = colors.textMuted, fontSize = (big.value * 0.8f).sp, lineHeight = big)
                Text("Tocá una\ncuerda", color = colors.textMuted, fontSize = 11.sp, lineHeight = 13.sp, textAlign = TextAlign.Center)
            }
        }
    }
}

@Composable
private fun QuickControls(
    settings: AppSettings,
    onOpenTunings: () -> Unit,
    onOpenSettings: () -> Unit,
    onTranspose: (Int) -> Unit,
    onResetTranspose: () -> Unit,
) {
    val colors = AppTheme.colors
    Panel(Modifier.fillMaxWidth()) {
        Row(Modifier.fillMaxWidth().padding(6.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(
                Modifier.weight(1f).clip(RoundedCornerShape(12.dp)).clickable(onClick = onOpenTunings).padding(6.dp).testTag("selector_afinacion"),
            ) {
                Text(settings.tuning.name + " ▾", color = colors.text, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(settings.tuning.noteNames(settings.transpose).joinToString(" ") { it.dropLast(1) }, color = colors.textMuted, fontSize = 11.sp, maxLines = 1)
            }
            Column(
                Modifier.clip(RoundedCornerShape(12.dp)).clickable(onClick = onOpenSettings).padding(6.dp).testTag("a4_actual"),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Text("A4", color = colors.textMuted, fontSize = 11.sp)
                Text(Format.a4(settings.a4), color = if (settings.a4 == 440.0) colors.text else colors.accent, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
            }
            Spacer(Modifier.width(6.dp))
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text("Tono", color = colors.textMuted, fontSize = 11.sp)
                Row(verticalAlignment = Alignment.CenterVertically) {
                    RoundTextButton("−", { onTranspose(-1) }, size = 32.dp, description = "Bajar un semitono", tag = "tono_menos")
                    Text(
                        if (settings.transpose > 0) "+${settings.transpose}" else if (settings.transpose < 0) "−${-settings.transpose}" else "0",
                        color = if (settings.transpose == 0) colors.text else colors.accent,
                        fontSize = 15.sp,
                        fontWeight = FontWeight.Bold,
                        textAlign = TextAlign.Center,
                        modifier = Modifier
                            .width(34.dp)
                            .clickable(onClick = onResetTranspose)
                            .semantics { contentDescription = "${Transpose.label(settings.transpose)}. Tocar para volver a cero" }
                            .testTag("tono_valor"),
                    )
                    RoundTextButton("+", { onTranspose(1) }, size = 32.dp, description = "Subir un semitono", tag = "tono_mas")
                }
            }
        }
    }
}

@Composable
fun TopBar(title: String, subtitle: String?, level: Float, quality: Float, onSettings: (() -> Unit)?) {
    val colors = AppTheme.colors
    Row(Modifier.fillMaxWidth().padding(top = 6.dp, bottom = 4.dp), verticalAlignment = Alignment.CenterVertically) {
        Box(
            Modifier.size(36.dp).clip(CircleShape).background(colors.accentSoft),
            contentAlignment = Alignment.Center,
        ) {
            Icon(AppIcons.Headstock, contentDescription = null, tint = colors.accent, modifier = Modifier.size(22.dp))
        }
        Spacer(Modifier.width(10.dp))
        Column(Modifier.weight(1f)) {
            Text(title, color = colors.accent, fontSize = 18.sp, fontWeight = FontWeight.SemiBold, maxLines = 1)
            if (subtitle != null) Text(subtitle, color = colors.textMuted, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        SignalBars(level, quality)
        if (onSettings != null) {
            IconButton(onClick = onSettings, modifier = Modifier.testTag("abrir_ajustes")) {
                Icon(AppIcons.Settings, contentDescription = "Ajustes", tint = colors.text)
            }
        }
    }
}

@Composable
fun Chip(text: String, selected: Boolean, onClick: () -> Unit, modifier: Modifier = Modifier) {
    val colors = AppTheme.colors
    Box(
        modifier
            .clip(RoundedCornerShape(50))
            .background(if (selected) colors.accentSoft else colors.panel)
            .border(1.dp, if (selected) colors.accent else colors.outline, RoundedCornerShape(50))
            .clickable(onClick = onClick)
            .padding(horizontal = 14.dp, vertical = 7.dp),
    ) {
        Text(text, color = if (selected) colors.accent else colors.text, fontSize = 13.sp, fontWeight = FontWeight.Medium, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

@Composable
fun MicRequestCard(permission: MicPermission, onRequest: () -> Unit) {
    val colors = AppTheme.colors
    Panel(Modifier.fillMaxWidth().testTag("pedir_microfono")) {
        Column(Modifier.padding(16.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Text("Para afinar necesitamos el micrófono", color = colors.text, fontWeight = FontWeight.SemiBold, textAlign = TextAlign.Center)
            Text(
                if (permission == MicPermission.BLOCKED) {
                    "El permiso está bloqueado. Habilitalo en los ajustes del sistema → Permisos → Micrófono."
                } else {
                    "El sonido se analiza en tiempo real dentro del teléfono. No se graba ni se envía a ningún lado."
                },
                color = colors.textMuted, fontSize = 13.sp, textAlign = TextAlign.Center,
                modifier = Modifier.padding(vertical = 8.dp),
            )
            Button(onClick = onRequest) {
                Text(if (permission == MicPermission.BLOCKED) "Abrir ajustes del sistema" else "Permitir micrófono")
            }
        }
    }
}

@Composable
fun ErrorCard(message: String) {
    val colors = AppTheme.colors
    Panel(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Text(message, color = colors.red, textAlign = TextAlign.Center)
            Spacer(Modifier.height(8.dp))
            Text("Probá cerrar otras apps que usen el micrófono y volver a esta pantalla.", color = colors.textMuted, fontSize = 13.sp, textAlign = TextAlign.Center)
        }
    }
}
