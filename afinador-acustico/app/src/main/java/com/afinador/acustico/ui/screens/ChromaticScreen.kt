package com.afinador.acustico.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.min
import androidx.compose.ui.unit.sp
import com.afinador.acustico.AudioStatus
import com.afinador.acustico.data.AppSettings
import com.afinador.acustico.ui.Format
import com.afinador.acustico.ui.MicPermission
import com.afinador.acustico.ui.components.Panel
import com.afinador.acustico.ui.components.StatusPill
import com.afinador.acustico.ui.components.TuningMeter
import com.afinador.acustico.ui.theme.AppTheme
import com.afinador.core.NoteMath
import com.afinador.core.TunerReading

private val CHROMATIC_NAMES = listOf("C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B")

/** Modo cromático: detecta cualquier nota con el mismo motor de audio real. */
@Composable
fun ChromaticScreen(
    settings: AppSettings,
    reading: TunerReading,
    permission: MicPermission,
    audioStatus: AudioStatus,
    onRequestMic: () -> Unit,
    onOpenSettings: () -> Unit,
) {
    val colors = AppTheme.colors
    Column(Modifier.fillMaxSize().padding(horizontal = 12.dp)) {
        TopBar(
            title = "Modo cromático",
            subtitle = "Cualquier nota · A4 = ${Format.a4(settings.a4)}",
            level = reading.signalLevel,
            quality = reading.quality,
            onSettings = onOpenSettings,
        )
        BoxWithConstraints(Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.Center) {
            val size = min(min(maxWidth * 0.62f, maxHeight * 0.92f), 230.dp)
            NoteBadge(
                reading = reading,
                waitingName = null,
                waitingOctave = null,
                waitingHz = null,
                size = size,
                showCents = settings.showCents,
            )
        }
        if (reading.hasPitch) {
            Row(Modifier.fillMaxWidth().padding(bottom = 4.dp), horizontalArrangement = Arrangement.SpaceEvenly) {
                Measure("Medida", Format.hz(reading.frequency, 2))
                Measure("Objetivo", Format.hz(reading.targetFrequency, 2), "objetivo")
                Measure("Nota", reading.targetName, "nota_cromatica")
            }
        } else {
            Text(
                "Tocá o cantá cualquier nota",
                color = colors.textMuted, fontSize = 13.sp, textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth().padding(bottom = 4.dp),
            )
        }
        when {
            permission != MicPermission.GRANTED -> MicRequestCard(permission, onRequestMic)
            audioStatus is AudioStatus.Failed -> ErrorCard(audioStatus.message)
            else -> {
                TuningMeter(
                    cents = reading.cents,
                    hasPitch = reading.hasPitch,
                    toleranceCents = settings.toleranceCents,
                    status = reading.status,
                    modifier = Modifier.height(120.dp),
                )
                Box(Modifier.fillMaxWidth().padding(top = 4.dp), contentAlignment = Alignment.Center) {
                    StatusPill(reading.status, reading.hasPitch)
                }
            }
        }
        Spacer(Modifier.height(10.dp))
        NoteStrip(if (reading.hasPitch) NoteMath.pitchClass(reading.targetMidi) else -1)
        Spacer(Modifier.height(10.dp))
    }
}

@Composable
private fun Measure(label: String, value: String, tag: String? = null) {
    val colors = AppTheme.colors
    Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = if (tag != null) Modifier.testTag(tag) else Modifier) {
        Text(label, color = colors.textMuted, fontSize = 11.sp)
        Text(value, color = colors.text, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
    }
}

/** Las doce notas, con la detectada resaltada. */
@Composable
private fun NoteStrip(activePitchClass: Int) {
    val colors = AppTheme.colors
    Panel(Modifier.fillMaxWidth()) {
        Row(Modifier.fillMaxWidth().padding(6.dp), horizontalArrangement = Arrangement.spacedBy(3.dp)) {
            CHROMATIC_NAMES.forEachIndexed { i, name ->
                val active = i == activePitchClass
                Box(
                    Modifier
                        .weight(1f)
                        .height(34.dp)
                        .clip(RoundedCornerShape(8.dp))
                        .background(if (active) colors.accent else if (name.length > 1) colors.panel else colors.surface)
                        .border(1.dp, if (active) colors.accent else colors.outline, RoundedCornerShape(8.dp)),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        name,
                        color = if (active) colors.background else colors.text,
                        fontSize = if (name.length > 1) 10.sp else 13.sp,
                        fontWeight = if (active) FontWeight.Bold else FontWeight.Medium,
                    )
                }
            }
        }
    }
}
