package com.afinador.acustico

import android.Manifest
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.ExperimentalTestApi
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.assertTextContains
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performTextReplacement
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.rule.GrantPermissionRule
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Pruebas de interfaz en emulador. Usan la app real (micrófono, motor y DataStore reales).
 * Cada prueba deja los ajustes como los encontró para no depender del orden de ejecución.
 */
@OptIn(ExperimentalTestApi::class)
@RunWith(AndroidJUnit4::class)
class AppUiTest {

    @get:Rule(order = 0)
    val microphone: GrantPermissionRule = GrantPermissionRule.grant(Manifest.permission.RECORD_AUDIO)

    @get:Rule(order = 1)
    val rule = createAndroidComposeRule<MainActivity>()

    @Before
    fun setUp() = startFresh()

    private fun startFresh() {
        rule.waitUntil(10_000) {
            rule.onAllNodes(hasTestTag("tutorial")).fetchSemanticsNodes().isNotEmpty() ||
                rule.onAllNodes(hasTestTag("tab_tuner")).fetchSemanticsNodes().isNotEmpty()
        }
        if (rule.onAllNodes(hasTestTag("tutorial")).fetchSemanticsNodes().isNotEmpty()) {
            rule.onNodeWithTag("tutorial_saltar").performClick()
        }
        rule.waitUntilExactlyOneExists(hasTestTag("tab_tuner"), 5_000)
    }

    private fun tab(name: String) {
        rule.onNodeWithTag("tab_$name").performClick()
        rule.waitForIdle()
    }

    private fun recreate() {
        rule.activityRule.scenario.recreate()
        startFresh()
    }

    @Test
    fun pantallaPrincipalSinDesplazarYEsperandoCuerda() {
        tab("tuner")
        rule.onNodeWithTag("mastil").assertIsDisplayed()
        for (n in 1..6) rule.onNodeWithTag("cuerda_$n").assertIsDisplayed()
        rule.onNodeWithTag("nota").assertIsDisplayed()
        rule.onNodeWithTag("medidor").assertIsDisplayed()
        rule.onNodeWithTag("tono_mas").assertIsDisplayed()
        rule.onNodeWithTag("a4_actual").assertIsDisplayed()
        rule.onNodeWithTag("abrir_ajustes").assertIsDisplayed()
        // Con el micrófono del emulador en silencio, el motor real informa que espera una cuerda.
        rule.onNodeWithTag("estado").assertTextContains("Esperando una cuerda")
        rule.onNodeWithTag("cuerda_6").assert(SemanticsMatcher.expectValue(SemanticsProperties.ContentDescription, listOf("Cuerda 6, E2")))
        rule.onNodeWithTag("cuerda_1").assert(SemanticsMatcher.expectValue(SemanticsProperties.ContentDescription, listOf("Cuerda 1, E4")))
    }

    @Test
    fun seleccionManualDeCuerdaYVueltaAutomatico() {
        tab("tuner")
        rule.onNodeWithTag("cuerda_5").performClick()
        rule.onNodeWithTag("modo_auto").assertTextContains("Manual: cuerda 5")
        rule.onNodeWithTag("cuerda_5").assertIsSelected()
        rule.onNodeWithTag("modo_auto").performClick()
        rule.onNodeWithTag("modo_auto").assertTextContains("Automático")
    }

    @Test
    fun cambiarAfinacionActualizaLasCuerdas() {
        tab("tunings")
        rule.onNodeWithTag("pestana_predefinidas").performClick()
        rule.onNodeWithTag("lista_afinaciones").assertIsDisplayed()
        rule.onNodeWithTag("afinacion_drop_d").performClick()
        tab("tuner")
        rule.onNodeWithTag("cuerda_6").assert(SemanticsMatcher.expectValue(SemanticsProperties.ContentDescription, listOf("Cuerda 6, D2")))
        rule.onNodeWithTag("cuerda_5").assert(SemanticsMatcher.expectValue(SemanticsProperties.ContentDescription, listOf("Cuerda 5, A2")))
        // Volver a la estándar.
        tab("tunings")
        rule.onNodeWithTag("afinacion_estandar").performScrollTo().performClick()
        tab("tuner")
        rule.onNodeWithTag("cuerda_6").assert(SemanticsMatcher.expectValue(SemanticsProperties.ContentDescription, listOf("Cuerda 6, E2")))
    }

    @Test
    fun referenciaA4YTransposicionCambianLosObjetivos() {
        tab("settings")
        rule.onNodeWithTag("a4_432").performClick()
        rule.onNodeWithTag("a4_valor").assertTextContains("432 Hz")
        rule.onNodeWithTag("objetivo_sexta").performScrollTo().assertTextContains("E2 (80,91 Hz)", substring = true)

        rule.onNodeWithTag("a4_440").performScrollTo().performClick()
        rule.onNodeWithTag("objetivo_sexta").performScrollTo().assertTextContains("E2 (82,41 Hz)", substring = true)

        // Valor personalizado válido e inválido.
        rule.onNodeWithTag("a4_personalizada").performScrollTo().performTextReplacement("500")
        rule.onNodeWithTag("a4_aplicar").assertIsNotEnabled()
        rule.onNodeWithTag("a4_personalizada").performTextReplacement("445,5")
        rule.onNodeWithTag("a4_aplicar").performClick()
        rule.onNodeWithTag("a4_valor").assertTextContains("445,5 Hz")
        rule.onNodeWithTag("a4_reset").performScrollTo().performClick()
        rule.onNodeWithTag("a4_valor").assertTextContains("440 Hz")

        // Transposición: +1 semitono convierte E2 en F2 (87,31 Hz) y vuelve a cero con un toque.
        rule.onNodeWithTag("ajustes_tono_mas").performScrollTo().performClick()
        rule.onNodeWithTag("ajustes_tono_valor").assertTextContains("+1 semitono")
        rule.onNodeWithTag("objetivo_sexta").performScrollTo().assertTextContains("F2 (87,31 Hz)", substring = true)
        rule.onNodeWithTag("ajustes_tono_menos").performScrollTo().performClick()
        rule.onNodeWithTag("ajustes_tono_menos").performClick()
        rule.onNodeWithTag("ajustes_tono_valor").assertTextContains("−1 semitono")
        rule.onNodeWithTag("tono_reset").performScrollTo().performClick()
        rule.onNodeWithTag("ajustes_tono_valor").assertTextContains("0 semitonos")

        // La transposición rápida desde la pantalla principal también cambia las cuerdas.
        tab("tuner")
        rule.onNodeWithTag("tono_mas").performClick()
        rule.onNodeWithTag("cuerda_6").assert(SemanticsMatcher.expectValue(SemanticsProperties.ContentDescription, listOf("Cuerda 6, F2")))
        rule.onNodeWithTag("tono_valor").performClick() // volver a cero
        rule.onNodeWithTag("cuerda_6").assert(SemanticsMatcher.expectValue(SemanticsProperties.ContentDescription, listOf("Cuerda 6, E2")))
    }

    @Test
    fun temaElegidoPersisteAlReabrir() {
        tab("settings")
        rule.onNodeWithTag("tema_light").performScrollTo().performClick()
        rule.onNodeWithTag("tema_light").assertIsSelected()
        recreate()
        tab("settings")
        rule.onNodeWithTag("tema_light").performScrollTo().assertIsSelected()
        rule.onNodeWithTag("tema_dark").performClick()
        recreate()
        tab("settings")
        rule.onNodeWithTag("tema_dark").performScrollTo().assertIsSelected()
        rule.onNodeWithTag("tema_system").performClick()
        rule.onNodeWithTag("tema_system").assertIsSelected()
    }

    @Test
    fun afinacionPersonalizadaSeGuardaEditaYElimina() {
        tab("tunings")
        rule.onNodeWithTag("pestana_predefinidas").performClick()
        rule.onNodeWithTag("afinacion_estandar").performScrollTo().performClick()
        rule.onNodeWithTag("crear_afinacion").performClick()
        rule.onNodeWithTag("editor_nombre").performTextReplacement("Prueba UI")
        rule.onNodeWithTag("editor_menos_6").performClick()
        rule.onNodeWithTag("editor_menos_6").performClick()
        rule.onNodeWithTag("editor_nota_6").assertTextContains("D2")
        rule.onNodeWithTag("editor_guardar").performClick()
        rule.waitUntilExactlyOneExists(hasText("Prueba UI"), 5_000)

        // Persiste tras recrear la actividad y queda seleccionada.
        recreate()
        tab("tuner")
        rule.onNodeWithTag("cuerda_6").assert(SemanticsMatcher.expectValue(SemanticsProperties.ContentDescription, listOf("Cuerda 6, D2")))
        tab("tunings")
        rule.onNodeWithTag("pestana_personalizadas").performClick()
        rule.onNodeWithText("Prueba UI").assertIsDisplayed()

        // Eliminar: vuelve a la afinación estándar.
        val id = rule.onAllNodes(SemanticsMatcher("tag empieza con menu_custom_") {
            it.config.getOrNull(SemanticsProperties.TestTag)?.startsWith("menu_custom_") == true
        }).fetchSemanticsNodes().first().config[SemanticsProperties.TestTag]
        rule.onNodeWithTag(id).performClick()
        rule.onNodeWithTag("eliminar").performClick()
        rule.onNodeWithTag("confirmar_eliminar").performClick()
        rule.waitUntil(5_000) { rule.onAllNodes(hasText("Prueba UI")).fetchSemanticsNodes().isEmpty() }
        tab("tuner")
        rule.onNodeWithTag("cuerda_6").assert(SemanticsMatcher.expectValue(SemanticsProperties.ContentDescription, listOf("Cuerda 6, E2")))
    }

    @Test
    fun modoCromaticoYPantallasDeInformacion() {
        tab("chromatic")
        rule.onNodeWithText("Modo cromático").assertIsDisplayed()
        rule.onNodeWithText("Tocá o cantá cualquier nota").assertIsDisplayed()
        rule.onNodeWithTag("medidor").assertIsDisplayed()
        tab("settings")
        rule.onNodeWithText("Privacidad y micrófono").performScrollTo().performClick()
        rule.onNodeWithText("Qué pasa con el sonido").assertIsDisplayed()
        rule.onNodeWithTag("volver").performClick()
        rule.onNodeWithText("Tutorial").performScrollTo().performClick()
        rule.onNodeWithTag("tutorial").assertIsDisplayed()
        rule.onNodeWithTag("tutorial_siguiente").performClick()
        rule.onNodeWithTag("tutorial_siguiente").performClick()
        rule.onNodeWithTag("tutorial_siguiente").performClick()
        rule.waitUntil(5_000) { rule.onAllNodes(hasTestTag("tutorial")).fetchSemanticsNodes().isEmpty() }
    }
}
