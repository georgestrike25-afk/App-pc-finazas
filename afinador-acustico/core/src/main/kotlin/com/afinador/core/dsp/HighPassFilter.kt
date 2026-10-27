package com.afinador.core.dsp

import kotlin.math.PI
import kotlin.math.exp

/**
 * Filtro pasa altos de un polo. Atenúa ruidos muy graves (golpes, viento, vibración de la mesa)
 * por debajo de la nota más grave que se quiere afinar. Mantiene estado entre bloques.
 */
class HighPassFilter(sampleRate: Int, cutoffHz: Double = 35.0) {
    private val a = exp(-2.0 * PI * cutoffHz / sampleRate)
    private var prevIn = 0.0
    private var prevOut = 0.0

    fun process(buffer: FloatArray, offset: Int = 0, length: Int = buffer.size - offset) {
        for (i in offset until offset + length) {
            val x = buffer[i].toDouble()
            val y = a * (prevOut + x - prevIn)
            prevIn = x
            prevOut = y
            buffer[i] = y.toFloat()
        }
    }

    fun reset() {
        prevIn = 0.0
        prevOut = 0.0
    }
}
