package com.afinador.core

import java.io.File
import java.util.Locale
import kotlin.math.abs
import kotlin.math.sqrt
import kotlin.test.Test
import kotlin.test.assertTrue

/**
 * Pruebas de precisión de extremo a extremo: las señales sintéticas pasan por el mismo
 * [TunerEngine] que usa la app (filtro, ventana deslizante, YIN, estabilizador, selección de cuerda).
 *
 * Además de verificar los criterios de aceptación, genera un informe en Markdown con las mediciones
 * (build/reports/afinador/precision.md).
 */
class AudioAccuracyTest {

    private data class Row(
        val case: String,
        val sampleRate: Int,
        val expectedHz: Double,
        val medianErrorCents: Double,
        val stdCents: Double,
        val detectionRate: Double,
        val firstReadingMs: Double,
        val note: String,
        val criterion: String,
        val passed: Boolean,
    )

    private val rows = mutableListOf<Row>()
    private val failures = mutableListOf<String>()

    private data class Stats(
        val medianError: Double,
        val std: Double,
        val detectionRate: Double,
        val firstReadingMs: Double,
        val dominantNote: String,
        val dominantString: Int,
        val medianReportedCents: Double,
        val statuses: Set<TuningStatus>,
    )

    /** Pasa la señal por el motor en bloques de 512 muestras, como llega del micrófono. */
    private fun run(
        signal: FloatArray,
        sampleRate: Int,
        expectedHz: Double,
        config: TunerConfig = TunerConfig(),
        settleMs: Double = 250.0,
    ): Stats {
        val engine = TunerEngine(sampleRate)
        engine.config = config
        val readings = mutableListOf<Pair<Double, TunerReading>>()
        var samples = 0
        val chunk = 512
        var pos = 0
        while (pos < signal.size) {
            val n = minOf(chunk, signal.size - pos)
            val block = signal.copyOfRange(pos, pos + n)
            pos += n
            engine.feed(block, n) { r -> readings += (pos * 1000.0 / sampleRate) to r }
            samples += n
        }
        val first = readings.firstOrNull { it.second.hasPitch }?.first ?: Double.NaN
        val steady = readings.filter { it.first >= settleMs }
        val voiced = steady.filter { it.second.hasPitch }
        val errors = voiced.map { NoteMath.cents(it.second.frequency, expectedHz) }.sorted()
        val median = if (errors.isEmpty()) Double.NaN else errors[errors.size / 2]
        val mean = errors.average()
        val std = if (errors.isEmpty()) Double.NaN else sqrt(errors.sumOf { (it - mean) * (it - mean) } / errors.size)
        val note = voiced.groupingBy { it.second.detectedName }.eachCount().maxByOrNull { it.value }?.key ?: "—"
        val string = voiced.groupingBy { it.second.stringIndex }.eachCount().maxByOrNull { it.value }?.key ?: -1
        val reported = voiced.map { it.second.cents }.sorted()
        return Stats(
            medianError = median,
            std = std,
            detectionRate = if (steady.isEmpty()) 0.0 else voiced.size.toDouble() / steady.size,
            firstReadingMs = first,
            dominantNote = note,
            dominantString = string,
            medianReportedCents = if (reported.isEmpty()) Double.NaN else reported[reported.size / 2],
            statuses = voiced.map { it.second.status }.toSet(),
        )
    }

    private fun record(case: String, sr: Int, hz: Double, s: Stats, criterion: String, passed: Boolean) {
        rows += Row(case, sr, hz, s.medianError, s.std, s.detectionRate, s.firstReadingMs, s.dominantNote, criterion, passed)
        if (!passed) failures += "$case @ $sr Hz: error ${fmt(s.medianError)} c, σ ${fmt(s.std)} c, detección ${pct(s.detectionRate)}"
    }

    @Test
    fun `precision del motor con señales sinteticas`() {
        val standard = TuningPresets.STANDARD.targets(440.0, 0)

        // 1) Las seis cuerdas, cuerda pulsada realista, tres frecuencias de muestreo.
        for (sr in listOf(44100, 48000, 22050)) {
            for (t in standard) {
                val s = run(SignalGenerator.pluckedString(t.frequency, sr, 2.0), sr, t.frequency)
                val ok = abs(s.medianError) <= 1.0 && s.std <= 1.0 && s.detectionRate >= 0.95 &&
                    s.dominantNote == t.name && s.dominantString == t.index
                record("Cuerda ${t.stringNumber} (${t.name}) pulsada", sr, t.frequency, s, "|err| ≤ 1 c, σ ≤ 1 c, ≥ 95 % y cuerda correcta", ok)
            }
        }

        // 1b) Cuerda ideal sin inarmonicidad: separa el error del algoritmo del efecto físico de la cuerda.
        for (t in listOf(standard[0], standard[5])) {
            val s = run(SignalGenerator.pluckedString(t.frequency, 44100, 2.0, inharmonicity = 0.0), 44100, t.frequency)
            record("${t.name} pulsada ideal (sin inarmonicidad)", 44100, t.frequency, s, "|err| ≤ 0,5 c, σ ≤ 0,5 c", abs(s.medianError) <= 0.5 && s.std <= 0.5)
        }

        // 2) Desviaciones conocidas de ±5, ±10 y ±25 cents en la sexta y la primera cuerda.
        for (t in listOf(standard[0], standard[3], standard[5])) {
            for (dev in listOf(-25.0, -10.0, -5.0, 5.0, 10.0, 25.0)) {
                val f = NoteMath.shiftByCents(t.frequency, dev)
                val s = run(SignalGenerator.pluckedString(f, 44100, 1.5), 44100, f)
                val expectedStatus = TuningStatus.of(dev, 3.0)
                val ok = abs(s.medianReportedCents - dev) <= 1.0 && s.dominantString == t.index && expectedStatus in s.statuses
                record("${t.name} ${if (dev > 0) "+" else ""}${dev.toInt()} c (informa ${fmt(s.medianReportedCents)} c)", 44100, f, s,
                    "cents informados ±1 c y estado «${expectedStatus.label}»", ok)
            }
        }

        // 3) Armónicos fuertes: fundamental cuatro veces más débil que el segundo armónico.
        for (t in standard.take(3)) {
            val s = run(SignalGenerator.pluckedString(t.frequency, 44100, 1.5, weakFundamental = true), 44100, t.frequency)
            val ok = abs(s.medianError) <= 1.5 && s.dominantNote == t.name && s.detectionRate >= 0.9
            record("${t.name} con fundamental débil", 44100, t.frequency, s, "sin error de octava, |err| ≤ 1,5 c", ok)
        }

        // 4) Ruido de fondo.
        for (snr in listOf(20.0, 10.0)) {
            for (t in listOf(standard[0], standard[2], standard[5])) {
                val signal = SignalGenerator.addNoise(SignalGenerator.pluckedString(t.frequency, 44100, 1.5), snr)
                val s = run(signal, 44100, t.frequency)
                val limit = if (snr >= 20) 1.5 else 3.0
                val ok = abs(s.medianError) <= limit && s.dominantNote == t.name && s.detectionRate >= 0.8
                record("${t.name} con ruido SNR ${snr.toInt()} dB", 44100, t.frequency, s, "|err| ≤ ${fmt(limit)} c, ≥ 80 %", ok)
            }
        }

        // 5) Señal débil (≈ −45 dBFS) con sensibilidad media (umbral −50 dBFS) y alta.
        run {
            val t = standard[1]
            val quiet = SignalGenerator.scale(SignalGenerator.sine(t.frequency, 44100, 44100), 0.008 / 0.5)
            val s = run(quiet, 44100, t.frequency)
            record("${t.name} débil (${fmt(SignalGenerator.dbfs(quiet))} dBFS)", 44100, t.frequency, s, "detecta con sensibilidad media", abs(s.medianError) <= 1.0 && s.detectionRate >= 0.95)
            val veryQuiet = SignalGenerator.scale(quiet, 0.25)
            val s2 = run(veryQuiet, 44100, t.frequency, TunerConfig(sensitivity = 1f))
            record("${t.name} muy débil (${fmt(SignalGenerator.dbfs(veryQuiet))} dBFS), sensibilidad alta", 44100, t.frequency, s2, "detecta con sensibilidad alta", abs(s2.medianError) <= 1.0 && s2.detectionRate >= 0.95)
            val s3 = run(veryQuiet, 44100, t.frequency, TunerConfig(sensitivity = 0f))
            record("${t.name} muy débil, sensibilidad baja", 44100, t.frequency, s3, "se ignora (sin lecturas)", s3.detectionRate == 0.0)
        }

        // 6) Silencio y ruido sin nota.
        run {
            val s = run(FloatArray(44100), 44100, 100.0)
            record("Silencio", 44100, 0.0, s, "sin lecturas", s.detectionRate == 0.0)
            val noise = SignalGenerator.whiteNoise(44100, 0.2)
            val s2 = run(noise, 44100, 100.0)
            record("Ruido blanco sin nota", 44100, 0.0, s2, "≤ 2 % de lecturas", s2.detectionRate <= 0.02)
        }

        // 7) Modo cromático y referencia 432 Hz.
        run {
            val f = NoteMath.midiToFrequency(66, 440.0) // F#4
            val s = run(SignalGenerator.pluckedString(f, 44100, 1.5), 44100, f, TunerConfig(mode = TunerMode.CHROMATIC))
            record("Cromático F#4", 44100, f, s, "nota F#4, |err| ≤ 1 c", s.dominantNote == "F#4" && abs(s.medianError) <= 1.0)
            val f432 = NoteMath.midiToFrequency(45, 432.0)
            val s2 = run(SignalGenerator.pluckedString(f432, 44100, 1.5), 44100, f432, TunerConfig(a4 = 432.0))
            record("A2 con A4 = 432 Hz", 44100, f432, s2, "afinada respecto de 432 Hz", abs(s2.medianReportedCents) <= 1.0 && s2.dominantNote == "A2")
            val fLow = NoteMath.midiToFrequency(36, 440.0) // C2 (Drop C)
            val s3 = run(SignalGenerator.pluckedString(fLow, 44100, 2.0), 44100, fLow, TunerConfig(tuning = TuningPresets.DROP_C))
            record("C2 (Drop C, sexta cuerda)", 44100, fLow, s3, "|err| ≤ 1 c, cuerda 6", abs(s3.medianError) <= 1.0 && s3.dominantString == 0)
        }

        writeReport("precision.md")
        assertTrue(failures.isEmpty(), "Casos fuera de criterio:\n" + failures.joinToString("\n"))
    }

    @Test
    fun `cambios rapidos entre cuerdas`() {
        val sr = 44100
        val standard = TuningPresets.STANDARD.targets(440.0, 0)
        val segmentSeconds = 0.6
        val order = listOf(0, 1, 2, 3, 4, 5, 0)
        val signal = SignalGenerator.concat(*order.map { SignalGenerator.pluckedString(standard[it].frequency, sr, segmentSeconds, seed = it) }.toTypedArray())
        val engine = TunerEngine(sr)
        val readings = mutableListOf<Pair<Double, TunerReading>>()
        var pos = 0
        while (pos < signal.size) {
            val n = minOf(512, signal.size - pos)
            val block = signal.copyOfRange(pos, pos + n)
            pos += n
            engine.feed(block, n) { readings += (pos * 1000.0 / sr) to it }
        }
        val latencies = mutableListOf<Double>()
        order.forEachIndexed { i, stringIndex ->
            val start = i * segmentSeconds * 1000
            val end = start + segmentSeconds * 1000
            val segment = readings.filter { it.first >= start && it.first < end }
            val firstCorrect = segment.firstOrNull { it.second.hasPitch && it.second.stringIndex == stringIndex }
            assertTrue(firstCorrect != null, "No se detectó la cuerda ${6 - stringIndex} en el segmento $i")
            latencies += firstCorrect.first - start
            // Una vez detectada, la cuerda no debe saltar a otra dentro del mismo segmento.
            val after = segment.filter { it.first >= firstCorrect.first && it.second.hasPitch }
            val wrong = after.count { it.second.stringIndex != stringIndex }
            assertTrue(wrong <= 1, "Saltos a otra cuerda en el segmento $i: $wrong")
        }
        val max = latencies.max()
        rows += Row("Cambio rápido entre 7 cuerdas (latencia máx. ${fmt(max)} ms, media ${fmt(latencies.average())} ms)",
            sr, 0.0, Double.NaN, Double.NaN, 1.0, latencies.first(), "—", "latencia ≤ 250 ms", max <= 250.0)
        writeReport("latencia.md")
        assertTrue(max <= 250.0, "Latencia de cambio de cuerda demasiado alta: $max ms")
    }

    @Test
    fun `la señal perdida vuelve a esperando una cuerda`() {
        val sr = 44100
        val engine = TunerEngine(sr)
        val signal = SignalGenerator.concat(SignalGenerator.pluckedString(110.0, sr, 0.5), FloatArray(sr))
        val readings = mutableListOf<Pair<Double, TunerReading>>()
        var pos = 0
        while (pos < signal.size) {
            val n = minOf(512, signal.size - pos)
            val block = signal.copyOfRange(pos, pos + n)
            pos += n
            engine.feed(block, n) { readings += (pos * 1000.0 / sr) to it }
        }
        assertTrue(readings.any { it.second.hasPitch })
        val last = readings.last().second
        assertTrue(!last.hasPitch && last.status == TuningStatus.WAITING, "Debe volver a esperar: $last")
        val lostAt = readings.first { it.first > 500 && !it.second.hasPitch }.first
        assertTrue(lostAt - 500 <= 700, "Tarda demasiado en soltar la nota: ${lostAt - 500} ms")
    }

    private fun writeReport(fileName: String) {
        val dir = File(System.getProperty("afinador.reportDir") ?: "build/reports/afinador")
        dir.mkdirs()
        val file = File(dir, fileName)
        val sb = StringBuilder()
        run {
            sb.appendLine("# Informe de precisión del motor de afinación")
            sb.appendLine()
            sb.appendLine("Generado automáticamente por `AudioAccuracyTest` con señales sintéticas de frecuencia conocida,")
            sb.appendLine("procesadas por el mismo `TunerEngine` que usa la app (bloques de 512 muestras, ventana de")
            sb.appendLine("4096 muestras a 44,1/48 kHz y 2048 a 22,05 kHz, salto de ¼ de ventana). Error = mediana de")
            sb.appendLine("(medido − real) en cents descartando los primeros 250 ms; σ = desviación estándar de las lecturas.")
            sb.appendLine()
            sb.appendLine("| Caso | fs (Hz) | Real (Hz) | Error (c) | σ (c) | Detección | 1.ª lectura (ms) | Nota | Criterio | Resultado |")
            sb.appendLine("|---|---|---|---|---|---|---|---|---|---|")
        }
        for (r in rows) {
            sb.appendLine("| ${r.case} | ${r.sampleRate} | ${fmt(r.expectedHz, 2)} | ${fmt(r.medianErrorCents)} | ${fmt(r.stdCents)} | ${pct(r.detectionRate)} | ${fmt(r.firstReadingMs, 0)} | ${r.note} | ${r.criterion} | ${if (r.passed) "✅" else "❌"} |")
        }
        file.writeText(sb.toString())
        print(sb)
    }

    private fun fmt(v: Double, decimals: Int = 2): String = if (v.isNaN()) "—" else String.format(Locale.ROOT, "%.${decimals}f", v)
    private fun pct(v: Double): String = String.format(Locale.ROOT, "%.0f %%", v * 100)
}
