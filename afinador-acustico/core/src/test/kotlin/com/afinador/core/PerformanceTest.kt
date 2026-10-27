package com.afinador.core

import java.io.File
import java.util.Locale
import kotlin.test.Test
import kotlin.test.assertTrue

/**
 * Comprueba que el análisis es mucho más rápido que el audio que llega: si procesar un salto tarda
 * menos que su duración, el hilo de audio nunca se atrasa ni bloquea la interfaz.
 * La medición es en la JVM de escritorio; en un teléfono el margen es menor pero sigue siendo amplio.
 */
class PerformanceTest {
    @Test
    fun `el motor procesa en tiempo real con margen amplio`() {
        val sr = 48000
        val signal = SignalGenerator.pluckedString(82.41, sr, 10.0)
        val engine = TunerEngine(sr)
        // Calentamiento del JIT.
        repeat(3) { engine.feed(signal.copyOf(), signal.size) {} }
        engine.reset()
        val copy = signal.copyOf()
        var readings = 0
        val start = System.nanoTime()
        engine.feed(copy, copy.size) { readings++ }
        val elapsedMs = (System.nanoTime() - start) / 1e6
        val audioMs = signal.size * 1000.0 / sr
        val realTimeFactor = elapsedMs / audioMs
        val perReading = elapsedMs / readings
        val text = String.format(
            Locale.ROOT,
            "# Rendimiento\n\n%.0f ms de audio a %d Hz procesados en %.1f ms (%d lecturas, %.3f ms por lectura, %.2f %% del tiempo real).\n",
            audioMs, sr, elapsedMs, readings, perReading, realTimeFactor * 100,
        )
        val dir = File(System.getProperty("afinador.reportDir") ?: "build/reports/afinador").apply { mkdirs() }
        File(dir, "rendimiento.md").writeText(text)
        print(text)
        assertTrue(realTimeFactor < 0.2, "El análisis usa demasiado tiempo: ${realTimeFactor * 100} % del tiempo real")
    }
}
