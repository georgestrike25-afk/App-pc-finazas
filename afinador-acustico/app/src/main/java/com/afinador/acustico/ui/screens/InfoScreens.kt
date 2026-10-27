package com.afinador.acustico.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.afinador.acustico.ui.brand.EnTonoAppIcon
import com.afinador.acustico.ui.brand.EnTonoWordmark
import com.afinador.acustico.ui.components.Panel
import com.afinador.acustico.ui.components.TuningMeter
import com.afinador.acustico.ui.theme.AppTheme
import com.afinador.core.TuningStatus

@Composable
private fun InfoPage(title: String, onBack: () -> Unit, content: @Composable () -> Unit) {
    val colors = AppTheme.colors
    Column(Modifier.fillMaxSize().padding(horizontal = 12.dp)) {
        Row(Modifier.fillMaxWidth().padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = onBack, modifier = Modifier.testTag("volver")) {
                Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Volver", tint = colors.text)
            }
            Text(title, color = colors.text, fontSize = 20.sp, fontWeight = FontWeight.SemiBold)
        }
        Column(Modifier.weight(1f).verticalScroll(rememberScrollState())) {
            content()
            Spacer(Modifier.height(16.dp))
        }
    }
}

@Composable
private fun Paragraph(title: String, body: String) {
    val colors = AppTheme.colors
    Panel(Modifier.fillMaxWidth().padding(bottom = 10.dp)) {
        Column(Modifier.padding(14.dp)) {
            Text(title, color = colors.accent, fontWeight = FontWeight.SemiBold, fontSize = 15.sp)
            Spacer(Modifier.height(4.dp))
            Text(body, color = colors.text, fontSize = 14.sp, lineHeight = 20.sp)
        }
    }
}

@Composable
fun PrivacyScreen(onBack: () -> Unit) = InfoPage("Privacidad y micrófono", onBack) {
    Paragraph(
        "Para qué se usa el micrófono",
        "El afinador escucha el sonido de tu guitarra para calcular la frecuencia de cada nota. " +
            "El micrófono sólo está activo mientras estás en las pantallas Afinador o Cromático (o calibrando) " +
            "y la app está a la vista. Al salir o pasar a otra app se libera de inmediato.",
    )
    Paragraph(
        "Qué pasa con el sonido",
        "El audio se analiza en la memoria del teléfono en bloques de unos 85 milisegundos y se descarta enseguida. " +
            "No se graba, no se guarda en archivos y no se envía a ningún servidor.",
    )
    Paragraph(
        "Sin Internet, sin cuentas, sin publicidad",
        "La app no tiene permiso de acceso a Internet: funciona completamente sin conexión. " +
            "No usa cuentas de usuario, publicidad ni servicios de analítica.",
    )
    Paragraph(
        "Qué se guarda",
        "Sólo tus ajustes (referencia A4, transposición, tema, sensibilidad) y tus afinaciones personalizadas, " +
            "en el almacenamiento privado de la app. Se borran al desinstalarla.",
    )
}

@Composable
fun AboutScreen(onBack: () -> Unit) {
    val context = LocalContext.current
    val version = runCatching { context.packageManager.getPackageInfo(context.packageName, 0).versionName }.getOrNull() ?: "—"
    InfoPage("Acerca de", onBack) {
        Column(Modifier.fillMaxWidth().padding(vertical = 12.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            EnTonoAppIcon(96.dp)
            Spacer(Modifier.height(14.dp))
            EnTonoWordmark(height = 34.dp)
            Text("AFINADOR DE GUITARRA", color = AppTheme.colors.textMuted, fontSize = 12.sp, letterSpacing = 2.5.sp, modifier = Modifier.padding(top = 6.dp))
        }
        Paragraph("EnTono", "Versión $version\nAfinador de guitarra acústica de seis cuerdas, libre de publicidad y sin conexión.")
        Paragraph(
            "Cómo detecta las notas",
            "Usa el algoritmo YIN (de Cheveigné y Kawahara, 2002) implementado desde cero, con autocorrelación por FFT, " +
                "filtros pasa altos y pasa bajos, y un estabilizador que evita saltos entre notas. " +
                "En pruebas con señales sintéticas el error típico es menor a 1 cent.",
        )
        Paragraph(
            "Referencia y escala",
            "Las frecuencias se calculan con la escala temperada de doce semitonos: f = A4 · 2^((n − 69) / 12). " +
                "Podés usar 440 Hz, 432 Hz u otro valor entre 400 y 480 Hz.",
        )
    }
}

/** Tutorial breve de primer uso (también accesible desde Ajustes). */
@Composable
fun OnboardingOverlay(onFinish: () -> Unit) {
    val colors = AppTheme.colors
    var page by rememberSaveable { mutableIntStateOf(0) }
    val pages = listOf(
        Triple("Te damos la bienvenida a EnTono", "Tocá una cuerda: el afinador reconoce solo qué cuerda estás tocando y la ilumina en el mástil. Si preferís, tocá el botón de una cuerda para fijarla.", 0),
        Triple("Seguí la aguja", "Grave a la izquierda, aguda a la derecha. Ajustá la clavija hasta que la aguja quede en el centro y todo se ponga verde: «¡Afinada!».", 1),
        Triple("Tu micrófono, sólo para afinar", "El sonido se analiza en el teléfono y no se graba ni se envía. Al tocar «Empezar» te vamos a pedir permiso para usar el micrófono.", 2),
    )
    val (title, body, kind) = pages[page]
    Box(
        Modifier
            .fillMaxSize()
            .background(colors.background)
            .statusBarsPadding()
            .navigationBarsPadding()
            .testTag("tutorial"),
    ) {
        Column(Modifier.fillMaxSize().padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                TextButton(onClick = onFinish, modifier = Modifier.testTag("tutorial_saltar")) { Text("Saltar") }
            }
            Spacer(Modifier.weight(1f))
            when (kind) {
                0 -> Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    EnTonoAppIcon(120.dp)
                    Spacer(Modifier.height(18.dp))
                    EnTonoWordmark(height = 40.dp)
                    Text("AFINADOR DE GUITARRA", color = colors.textMuted, fontSize = 12.sp, letterSpacing = 2.5.sp, modifier = Modifier.padding(top = 6.dp))
                }
                1 -> TuningMeter(cents = 0.0, hasPitch = true, toleranceCents = 3.0, status = TuningStatus.IN_TUNE, modifier = Modifier.height(130.dp))
                else -> Text("🎙️", fontSize = 72.sp)
            }
            Spacer(Modifier.height(28.dp))
            Text(title, color = colors.text, fontSize = 24.sp, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center)
            Spacer(Modifier.height(10.dp))
            Text(body, color = colors.textMuted, fontSize = 16.sp, textAlign = TextAlign.Center, lineHeight = 22.sp)
            Spacer(Modifier.weight(1f))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                pages.indices.forEach { i ->
                    Box(Modifier.size(if (i == page) 10.dp else 8.dp).clip(CircleShape).background(if (i == page) colors.accent else colors.outline))
                }
            }
            Spacer(Modifier.height(20.dp))
            Button(
                onClick = { if (page < pages.lastIndex) page++ else onFinish() },
                modifier = Modifier.fillMaxWidth().height(52.dp).testTag("tutorial_siguiente"),
            ) {
                Text(if (page < pages.lastIndex) "Siguiente" else "Empezar", fontSize = 16.sp)
            }
        }
    }
}
