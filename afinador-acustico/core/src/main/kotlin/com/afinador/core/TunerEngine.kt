package com.afinador.core

import com.afinador.core.dsp.Fft
import com.afinador.core.dsp.HighPassFilter
import com.afinador.core.dsp.LowPassFilter
import com.afinador.core.dsp.PitchStabilizer
import com.afinador.core.dsp.YinPitchDetector
import kotlin.math.abs
import kotlin.math.roundToInt

/**
 * Motor del afinador: recibe audio crudo del micrófono y produce lecturas de afinación.
 *
 * Mantiene una ventana deslizante de [frameSize] muestras y la analiza cada [hopSize] muestras.
 * Toda la lógica de audio vive aquí, sin dependencias de Android, para poder probarla con señales
 * sintéticas. Se usa desde un único hilo de audio; [config] puede cambiarse desde cualquier hilo.
 */
class TunerEngine(
    val sampleRate: Int,
    val frameSize: Int = defaultFrameSize(sampleRate),
    val hopSize: Int = frameSize / 4,
) {
    @Volatile
    var config: TunerConfig = TunerConfig()

    private val detector = YinPitchDetector(sampleRate, frameSize)
    private val highPass = HighPassFilter(sampleRate)
    private val lowPass = LowPassFilter(sampleRate, 2000.0)
    private var filterConfig: TunerConfig? = null
    private val stabilizer = PitchStabilizer(holdFrames = (HOLD_SECONDS * sampleRate / hopSize).roundToInt().coerceAtLeast(2))
    private val ring = FloatArray(frameSize)
    private val frame = FloatArray(frameSize)
    private var writePos = 0
    private var filled = 0
    private var sinceLastAnalysis = 0
    private var previousRmsDb = -120.0
    private var currentString = -1
    private var lastConfidence = 0.0

    init {
        require(hopSize in 1..frameSize) { "Salto de análisis inválido" }
    }

    /** Duración de la ventana de análisis en milisegundos. */
    val frameMillis: Double get() = frameSize * 1000.0 / sampleRate

    /** Intervalo entre lecturas en milisegundos. */
    val hopMillis: Double get() = hopSize * 1000.0 / sampleRate

    fun reset() {
        highPass.reset()
        lowPass.reset()
        stabilizer.reset()
        java.util.Arrays.fill(ring, 0f)
        writePos = 0
        filled = 0
        sinceLastAnalysis = 0
        previousRmsDb = -120.0
        currentString = -1
    }

    /** Agrega muestras en coma flotante (−1..1). Llama a [onReading] cada vez que hay una lectura nueva. */
    fun feed(samples: FloatArray, length: Int = samples.size, onReading: (TunerReading) -> Unit) {
        updateLowPass()
        highPass.process(samples, 0, length)
        lowPass.process(samples, 0, length)
        for (i in 0 until length) {
            ring[writePos] = samples[i]
            writePos = (writePos + 1) % frameSize
            if (filled < frameSize) filled++
            sinceLastAnalysis++
            if (filled == frameSize && sinceLastAnalysis >= hopSize) {
                sinceLastAnalysis = 0
                onReading(analyzeRing())
            }
        }
    }

    /** Agrega muestras PCM de 16 bits. [scratch] debe tener al menos [length] elementos. */
    fun feedPcm16(samples: ShortArray, length: Int, scratch: FloatArray, onReading: (TunerReading) -> Unit) {
        for (i in 0 until length) scratch[i] = samples[i] / 32768f
        feed(scratch, length, onReading)
    }

    /** En modo cuerdas el corte se ajusta a la cuerda más aguda; en cromático se deja amplio. */
    private fun updateLowPass() {
        val cfg = config
        if (cfg === filterConfig) return
        filterConfig = cfg
        val cutoff = if (cfg.mode == TunerMode.CHROMATIC) 2000.0 else LowPassFilter.cutoffFor(cfg.targets.maxOf { it.frequency })
        if (cutoff != lowPass.cutoffHz) lowPass.setCutoff(cutoff)
    }

    private fun analyzeRing(): TunerReading {
        val tail = frameSize - writePos
        System.arraycopy(ring, writePos, frame, 0, tail)
        System.arraycopy(ring, 0, frame, tail, writePos)
        return analyzeFrame(frame)
    }

    /** Analiza una ventana completa (ya filtrada) y devuelve la lectura resultante. */
    fun analyzeFrame(window: FloatArray): TunerReading {
        val cfg = config
        val rmsDb = YinPitchDetector.rmsDb(window, 0, frameSize)
        val onset = previousRmsDb < rmsDb - ONSET_JUMP_DB && stabilizer.current != null
        previousRmsDb = rmsDb

        val frequency: Double? = when {
            rmsDb < Sensitivity.thresholdDb(cfg.sensitivity) -> stabilizer.miss()
            // El ataque de una cuerda nueva mezcla la nota anterior con el golpe: se descarta ese bloque.
            onset -> stabilizer.skip()
            else -> {
                val estimate = detector.detect(window)
                if (estimate == null) {
                    stabilizer.miss()
                } else {
                    lastConfidence = estimate.confidence
                    stabilizer.update(estimate.frequency)
                }
            }
        }

        val level = quantize(((rmsDb + 70.0) / 60.0).toFloat())
        if (frequency == null) {
            currentString = -1
            return if (level == 0f) TunerReading.WAITING else TunerReading(hasPitch = false, signalLevel = level)
        }
        return buildReading(cfg, frequency, level, quantize(lastConfidence.toFloat()))
    }

    private fun buildReading(cfg: TunerConfig, frequency: Double, level: Float, quality: Float): TunerReading {
        val a4 = ReferencePitch.clamp(cfg.a4)
        val detected = NoteMath.nearestMidi(frequency, a4) ?: return TunerReading.WAITING
        val preferFlats = cfg.mode == TunerMode.STRINGS && cfg.tuning.preferFlats

        val targetMidi: Int
        val targetFrequency: Double
        val stringIndex: Int
        if (cfg.mode == TunerMode.CHROMATIC) {
            targetMidi = detected
            targetFrequency = NoteMath.midiToFrequency(detected, a4)
            stringIndex = -1
        } else {
            val targets = cfg.targets
            stringIndex = cfg.selectedString?.takeIf { it in targets.indices } ?: autoSelectString(targets, frequency)
            targetMidi = targets[stringIndex].midi
            targetFrequency = targets[stringIndex].frequency
        }
        val cents = NoteMath.cents(frequency, targetFrequency)
        return TunerReading(
            hasPitch = true,
            frequency = frequency,
            detectedMidi = detected,
            detectedName = NoteMath.noteName(detected, preferFlats),
            targetMidi = targetMidi,
            targetName = NoteMath.noteName(targetMidi, preferFlats),
            targetPitchName = NoteMath.pitchName(targetMidi, preferFlats),
            targetOctave = NoteMath.octave(targetMidi),
            targetFrequency = targetFrequency,
            cents = cents,
            stringIndex = stringIndex,
            status = TuningStatus.of(cents, cfg.toleranceCents),
            signalLevel = level,
            quality = quality,
        )
    }

    /** Elige la cuerda más cercana, con histéresis para no saltar entre cuerdas vecinas. */
    private fun autoSelectString(targets: List<StringTarget>, frequency: Double): Int {
        var best = 0
        var bestDistance = Double.MAX_VALUE
        for (t in targets) {
            val d = abs(NoteMath.cents(frequency, t.frequency))
            if (d < bestDistance) {
                bestDistance = d
                best = t.index
            }
        }
        val current = currentString
        if (current in targets.indices && current != best) {
            val currentDistance = abs(NoteMath.cents(frequency, targets[current].frequency))
            if (currentDistance - bestDistance < STRING_HYSTERESIS_CENTS) return current
        }
        currentString = best
        return best
    }

    private fun quantize(v: Float): Float = ((v.coerceIn(0f, 1f) * 20f).roundToInt() / 20f)

    companion object {
        private const val HOLD_SECONDS = 0.5
        private const val ONSET_JUMP_DB = 9.0
        private const val STRING_HYSTERESIS_CENTS = 30.0

        /** Ventana de ~85 ms: suficiente para varios períodos de la sexta cuerda incluso en Drop C. */
        fun defaultFrameSize(sampleRate: Int): Int = Fft.nextPowerOfTwo((sampleRate * 0.085).toInt())
    }
}
