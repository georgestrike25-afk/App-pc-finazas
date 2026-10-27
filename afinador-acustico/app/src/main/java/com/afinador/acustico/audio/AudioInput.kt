package com.afinador.acustico.audio

import android.annotation.SuppressLint
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.os.Process
import android.util.Log

/**
 * Captura del micrófono en un hilo dedicado de prioridad de audio.
 *
 * El audio se procesa en memoria, bloque a bloque, y se descarta: nunca se graba ni se guarda.
 * La interfaz sólo recibe las lecturas resultantes, por lo que el procesamiento nunca la bloquea.
 */
class AudioInput(
    /** Se llama en el hilo de audio con cada bloque PCM de 16 bits. */
    private val onAudio: (samples: ShortArray, length: Int, sampleRate: Int) -> Unit,
    private val onStarted: (sampleRate: Int) -> Unit,
    private val onError: (message: String) -> Unit,
) {
    @Volatile
    private var running = false
    private var thread: Thread? = null

    val isRunning: Boolean get() = running

    @Synchronized
    fun start() {
        if (running) return
        running = true
        thread = Thread(::captureLoop, "afinador-audio").also { it.start() }
    }

    @Synchronized
    fun stop() {
        running = false
        val t = thread ?: return
        thread = null
        t.interrupt()
        try {
            t.join(1000)
        } catch (_: InterruptedException) {
            Thread.currentThread().interrupt()
        }
    }

    @SuppressLint("MissingPermission") // El permiso se verifica antes de llamar a start().
    private fun captureLoop() {
        Process.setThreadPriority(Process.THREAD_PRIORITY_URGENT_AUDIO)
        var record: AudioRecord? = null
        try {
            record = openRecorder()
            if (record == null) {
                onError("No se pudo abrir el micrófono. Puede que otra app lo esté usando.")
                return
            }
            record.startRecording()
            if (record.recordingState != AudioRecord.RECORDSTATE_RECORDING) {
                onError("El micrófono no empezó a captar sonido. Cerrá otras apps que lo usen y probá de nuevo.")
                return
            }
            val sampleRate = record.sampleRate
            onStarted(sampleRate)
            val buffer = ShortArray(READ_SIZE)
            while (running) {
                val n = record.read(buffer, 0, buffer.size)
                if (n < 0) {
                    onError("Se interrumpió la lectura del micrófono (código $n).")
                    break
                }
                if (n > 0) onAudio(buffer, n, sampleRate)
            }
        } catch (e: SecurityException) {
            onError("Falta el permiso de micrófono.")
        } catch (e: Exception) {
            Log.e(TAG, "Error de audio", e)
            onError("Error del micrófono: ${e.message ?: e.javaClass.simpleName}")
        } finally {
            running = false
            try {
                record?.stop()
            } catch (_: IllegalStateException) {
            }
            record?.release()
        }
    }

    @SuppressLint("MissingPermission")
    private fun openRecorder(): AudioRecord? {
        // UNPROCESSED y VOICE_RECOGNITION evitan el control automático de ganancia y la supresión
        // de ruido pensados para llamadas, que deforman el sonido de la guitarra.
        val sources = listOf(
            MediaRecorder.AudioSource.UNPROCESSED,
            MediaRecorder.AudioSource.VOICE_RECOGNITION,
            MediaRecorder.AudioSource.MIC,
        )
        for (rate in SAMPLE_RATES) {
            val minBuffer = AudioRecord.getMinBufferSize(rate, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
            if (minBuffer <= 0) continue
            val bufferBytes = maxOf(minBuffer * 2, READ_SIZE * 2 * 4)
            for (source in sources) {
                val record = try {
                    AudioRecord(source, rate, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, bufferBytes)
                } catch (e: IllegalArgumentException) {
                    null
                }
                if (record != null && record.state == AudioRecord.STATE_INITIALIZED) return record
                record?.release()
            }
        }
        return null
    }

    private companion object {
        const val TAG = "AudioInput"
        const val READ_SIZE = 512
        val SAMPLE_RATES = intArrayOf(48000, 44100, 22050, 16000)
    }
}
