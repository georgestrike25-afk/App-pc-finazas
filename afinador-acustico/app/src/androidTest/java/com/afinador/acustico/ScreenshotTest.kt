package com.afinador.acustico

import android.Manifest
import android.graphics.Bitmap
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.test.captureToImage
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.rule.GrantPermissionRule
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File
import java.io.FileOutputStream

/** Guarda capturas de cada pantalla en ambos temas para revisar el diseño (las descarga el CI). */
@RunWith(AndroidJUnit4::class)
class ScreenshotTest {

    @get:Rule(order = 0)
    val microphone: GrantPermissionRule = GrantPermissionRule.grant(Manifest.permission.RECORD_AUDIO)

    @get:Rule(order = 1)
    val rule = createAndroidComposeRule<MainActivity>()

    private fun save(name: String) {
        rule.waitForIdle()
        val bitmap = rule.onRoot().captureToImage().asAndroidBitmap()
        val dir = File(InstrumentationRegistry.getInstrumentation().targetContext.getExternalFilesDir(null), "capturas")
        dir.mkdirs()
        FileOutputStream(File(dir, "$name.png")).use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
    }

    private fun tab(name: String) {
        rule.onNodeWithTag("tab_$name").performClick()
        rule.waitForIdle()
    }

    @Test
    fun capturasDeTodasLasPantallas() {
        rule.waitUntil(10_000) {
            rule.onAllNodes(hasTestTag("tutorial")).fetchSemanticsNodes().isNotEmpty() ||
                rule.onAllNodes(hasTestTag("tab_tuner")).fetchSemanticsNodes().isNotEmpty()
        }
        if (rule.onAllNodes(hasTestTag("tutorial")).fetchSemanticsNodes().isNotEmpty()) {
            save("00_tutorial")
            rule.onNodeWithTag("tutorial_saltar").performClick()
            // El cierre del tutorial se guarda en DataStore de forma asíncrona: esperar a que desaparezca.
            rule.waitUntil(10_000) { rule.onAllNodes(hasTestTag("tutorial")).fetchSemanticsNodes().isEmpty() }
        }
        for (theme in listOf("dark", "light")) {
            tab("settings")
            rule.onNodeWithTag("tema_$theme").performScrollTo().performClick()
            tab("tuner")
            save("01_afinador_$theme")
            rule.onNodeWithTag("cuerda_5").performClick()
            save("02_afinador_cuerda_manual_$theme")
            rule.onNodeWithTag("modo_auto").performClick()
            tab("chromatic")
            save("03_cromatico_$theme")
            tab("tunings")
            save("04_afinaciones_$theme")
            tab("settings")
            save("05_ajustes_$theme")
            rule.onNodeWithText("Acerca de").performScrollTo().performClick()
            save("06_acerca_de_$theme")
            rule.onNodeWithTag("volver").performClick()
        }
        tab("settings")
        rule.onNodeWithTag("tema_system").performScrollTo().performClick()
    }
}
