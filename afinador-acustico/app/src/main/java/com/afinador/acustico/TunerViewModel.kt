package com.afinador.acustico

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.afinador.acustico.audio.AudioInput
import com.afinador.acustico.data.AppSettings
import com.afinador.acustico.data.SettingsRepository
import com.afinador.acustico.data.ThemeMode
import com.afinador.core.CustomTunings
import com.afinador.core.TunerConfig
import com.afinador.core.TunerEngine
import com.afinador.core.TunerMode
import com.afinador.core.TunerReading
import com.afinador.core.Tuning
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.filterNotNull
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

sealed interface AudioStatus {
    data object Stopped : AudioStatus
    data class Running(val sampleRate: Int) : AudioStatus
    data class Failed(val message: String) : AudioStatus
}

/**
 * Une la captura de audio, el motor de afinación y los ajustes persistentes.
 * Las lecturas llegan desde el hilo de audio a un StateFlow que la interfaz observa.
 */
class TunerViewModel(application: Application) : AndroidViewModel(application) {
    private val repository = SettingsRepository(application)

    /** null mientras se leen los ajustes guardados (evita mostrar el tutorial por un instante). */
    val settings: StateFlow<AppSettings?> = repository.settings.stateIn(viewModelScope, SharingStarted.Eagerly, null)

    private val _reading = MutableStateFlow(TunerReading.WAITING)
    val reading: StateFlow<TunerReading> = _reading.asStateFlow()

    private val _selectedString = MutableStateFlow<Int?>(null)
    /** Cuerda elegida a mano (0 = sexta) o null para detección automática. */
    val selectedString: StateFlow<Int?> = _selectedString.asStateFlow()

    private val _mode = MutableStateFlow(TunerMode.STRINGS)
    private val _audioStatus = MutableStateFlow<AudioStatus>(AudioStatus.Stopped)
    val audioStatus: StateFlow<AudioStatus> = _audioStatus.asStateFlow()

    @Volatile private var config = TunerConfig()
    @Volatile private var engine: TunerEngine? = null
    private var scratch = FloatArray(0)

    private val audio = AudioInput(
        onAudio = { samples, length, sampleRate ->
            val e = engine?.takeIf { it.sampleRate == sampleRate } ?: TunerEngine(sampleRate).also {
                it.config = config
                engine = it
            }
            if (scratch.size < length) scratch = FloatArray(length)
            e.feedPcm16(samples, length, scratch) { _reading.value = it }
        },
        onStarted = { _audioStatus.value = AudioStatus.Running(it) },
        onError = { _audioStatus.value = AudioStatus.Failed(it) },
    )

    init {
        viewModelScope.launch {
            combine(settings.filterNotNull(), _selectedString, _mode) { s, string, mode ->
                TunerConfig(
                    a4 = s.a4,
                    transpose = s.transpose,
                    tuning = s.tuning,
                    mode = mode,
                    selectedString = string,
                    sensitivity = s.sensitivity,
                    toleranceCents = s.toleranceCents,
                )
            }.collect {
                config = it
                engine?.config = it
            }
        }
    }

    /** Abre o libera el micrófono según la pantalla visible y el ciclo de vida. */
    fun setListening(listen: Boolean) {
        if (listen) {
            if (!audio.isRunning) {
                engine?.reset()
                audio.start()
            }
        } else if (audio.isRunning) {
            audio.stop()
            engine?.reset()
            _reading.value = TunerReading.WAITING
            _audioStatus.value = AudioStatus.Stopped
        }
    }

    fun setMode(mode: TunerMode) {
        _mode.value = mode
    }

    fun selectString(index: Int?) {
        _selectedString.value = if (_selectedString.value == index) null else index
    }

    fun setA4(value: Double) = save { repository.setA4(value) }
    fun setTranspose(value: Int) = save { repository.setTranspose(value) }
    fun changeTranspose(delta: Int) = save { repository.changeTranspose(delta) }
    fun changeA4(delta: Double) = save { repository.changeA4(delta) }
    fun setSensitivity(value: Float) = save { repository.setSensitivity(value) }
    fun setTolerance(value: Double) = save { repository.setTolerance(value) }
    fun setTheme(mode: ThemeMode) = save { repository.setTheme(mode) }
    fun setShowCents(value: Boolean) = save { repository.setShowCents(value) }
    fun setKeepScreenOn(value: Boolean) = save { repository.setKeepScreenOn(value) }
    fun setOnboardingDone(value: Boolean) = save { repository.setOnboardingDone(value) }

    fun selectTuning(tuning: Tuning) {
        _selectedString.value = null
        save { repository.setTuning(tuning.id) }
    }

    /** Guarda una afinación personalizada nueva o editada y la deja seleccionada. */
    fun saveCustomTuning(existingId: String?, name: String, description: String, midiNotes: List<Int>) = save {
        var savedId = existingId
        repository.updateCustomTunings { list ->
            val tuning = if (existingId != null && list.any { it.id == existingId }) {
                list.first { it.id == existingId }.copy(
                    name = CustomTunings.cleanName(name),
                    description = CustomTunings.cleanDescription(description),
                    midiNotes = midiNotes,
                )
            } else {
                CustomTunings.create(list, name, description, midiNotes)
            }
            savedId = tuning.id
            CustomTunings.upsert(list, tuning)
        }
        savedId?.let { repository.setTuning(it) }
    }

    fun duplicateTuning(source: Tuning) = save {
        repository.updateCustomTunings { list -> CustomTunings.upsert(list, CustomTunings.duplicate(list, source)) }
    }

    fun deleteCustomTuning(id: String) = save {
        repository.updateCustomTunings { list -> CustomTunings.delete(list, id) }
    }

    private fun save(block: suspend () -> Unit) {
        viewModelScope.launch { block() }
    }

    override fun onCleared() {
        audio.stop()
        super.onCleared()
    }
}
