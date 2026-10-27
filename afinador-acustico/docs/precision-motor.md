# Informe de precisión del motor de afinación

Generado automáticamente por `AudioAccuracyTest` con señales sintéticas de frecuencia conocida,
procesadas por el mismo `TunerEngine` que usa la app (bloques de 512 muestras, ventana de
4096 muestras a 44,1/48 kHz y 2048 a 22,05 kHz, salto de ¼ de ventana). Error = mediana de
(medido − real) en cents descartando los primeros 250 ms; σ = desviación estándar de las lecturas.

| Caso | fs (Hz) | Real (Hz) | Error (c) | σ (c) | Detección | 1.ª lectura (ms) | Nota | Criterio | Resultado |
|---|---|---|---|---|---|---|---|---|---|
| Cuerda 6 (E2) pulsada | 44100 | 82.41 | 0.33 | 0.82 | 100 % | 116 | E2 | |err| ≤ 1 c, σ ≤ 1 c, ≥ 95 % y cuerda correcta | ✅ |
| Cuerda 5 (A2) pulsada | 44100 | 110.00 | 0.31 | 0.57 | 100 % | 116 | A2 | |err| ≤ 1 c, σ ≤ 1 c, ≥ 95 % y cuerda correcta | ✅ |
| Cuerda 4 (D3) pulsada | 44100 | 146.83 | 0.28 | 0.37 | 100 % | 116 | D3 | |err| ≤ 1 c, σ ≤ 1 c, ≥ 95 % y cuerda correcta | ✅ |
| Cuerda 3 (G3) pulsada | 44100 | 196.00 | 0.27 | 0.22 | 100 % | 116 | G3 | |err| ≤ 1 c, σ ≤ 1 c, ≥ 95 % y cuerda correcta | ✅ |
| Cuerda 2 (B3) pulsada | 44100 | 246.94 | 0.24 | 0.14 | 100 % | 116 | B3 | |err| ≤ 1 c, σ ≤ 1 c, ≥ 95 % y cuerda correcta | ✅ |
| Cuerda 1 (E4) pulsada | 44100 | 329.63 | 0.23 | 0.07 | 100 % | 116 | E4 | |err| ≤ 1 c, σ ≤ 1 c, ≥ 95 % y cuerda correcta | ✅ |
| Cuerda 6 (E2) pulsada | 48000 | 82.41 | 0.31 | 0.77 | 100 % | 107 | E2 | |err| ≤ 1 c, σ ≤ 1 c, ≥ 95 % y cuerda correcta | ✅ |
| Cuerda 5 (A2) pulsada | 48000 | 110.00 | 0.28 | 0.54 | 100 % | 107 | A2 | |err| ≤ 1 c, σ ≤ 1 c, ≥ 95 % y cuerda correcta | ✅ |
| Cuerda 4 (D3) pulsada | 48000 | 146.83 | 0.28 | 0.35 | 100 % | 107 | D3 | |err| ≤ 1 c, σ ≤ 1 c, ≥ 95 % y cuerda correcta | ✅ |
| Cuerda 3 (G3) pulsada | 48000 | 196.00 | 0.27 | 0.21 | 100 % | 107 | G3 | |err| ≤ 1 c, σ ≤ 1 c, ≥ 95 % y cuerda correcta | ✅ |
| Cuerda 2 (B3) pulsada | 48000 | 246.94 | 0.24 | 0.14 | 100 % | 107 | B3 | |err| ≤ 1 c, σ ≤ 1 c, ≥ 95 % y cuerda correcta | ✅ |
| Cuerda 1 (E4) pulsada | 48000 | 329.63 | 0.21 | 0.07 | 100 % | 107 | E4 | |err| ≤ 1 c, σ ≤ 1 c, ≥ 95 % y cuerda correcta | ✅ |
| Cuerda 6 (E2) pulsada | 22050 | 82.41 | 0.33 | 0.81 | 100 % | 116 | E2 | |err| ≤ 1 c, σ ≤ 1 c, ≥ 95 % y cuerda correcta | ✅ |
| Cuerda 5 (A2) pulsada | 22050 | 110.00 | 0.32 | 0.56 | 100 % | 116 | A2 | |err| ≤ 1 c, σ ≤ 1 c, ≥ 95 % y cuerda correcta | ✅ |
| Cuerda 4 (D3) pulsada | 22050 | 146.83 | 0.31 | 0.37 | 100 % | 116 | D3 | |err| ≤ 1 c, σ ≤ 1 c, ≥ 95 % y cuerda correcta | ✅ |
| Cuerda 3 (G3) pulsada | 22050 | 196.00 | 0.27 | 0.22 | 100 % | 116 | G3 | |err| ≤ 1 c, σ ≤ 1 c, ≥ 95 % y cuerda correcta | ✅ |
| Cuerda 2 (B3) pulsada | 22050 | 246.94 | 0.32 | 0.14 | 100 % | 116 | B3 | |err| ≤ 1 c, σ ≤ 1 c, ≥ 95 % y cuerda correcta | ✅ |
| Cuerda 1 (E4) pulsada | 22050 | 329.63 | 0.36 | 0.07 | 100 % | 116 | E4 | |err| ≤ 1 c, σ ≤ 1 c, ≥ 95 % y cuerda correcta | ✅ |
| E2 pulsada ideal (sin inarmonicidad) | 44100 | 82.41 | 0.02 | 0.02 | 100 % | 116 | E2 | |err| ≤ 0,5 c, σ ≤ 0,5 c | ✅ |
| E4 pulsada ideal (sin inarmonicidad) | 44100 | 329.63 | 0.04 | 0.00 | 100 % | 116 | E4 | |err| ≤ 0,5 c, σ ≤ 0,5 c | ✅ |
| E2 -25 c (informa -24.49 c) | 44100 | 81.23 | 0.51 | 0.91 | 100 % | 116 | E2 | cents informados ±1 c y estado «Demasiado grave» | ✅ |
| E2 -10 c (informa -9.51 c) | 44100 | 81.93 | 0.49 | 0.90 | 100 % | 116 | E2 | cents informados ±1 c y estado «Un poco grave» | ✅ |
| E2 -5 c (informa -4.50 c) | 44100 | 82.17 | 0.50 | 0.90 | 100 % | 116 | E2 | cents informados ±1 c y estado «Un poco grave» | ✅ |
| E2 +5 c (informa 5.52 c) | 44100 | 82.65 | 0.52 | 0.89 | 100 % | 116 | E2 | cents informados ±1 c y estado «Un poco aguda» | ✅ |
| E2 +10 c (informa 10.52 c) | 44100 | 82.88 | 0.52 | 0.88 | 100 % | 116 | E2 | cents informados ±1 c y estado «Un poco aguda» | ✅ |
| E2 +25 c (informa 25.51 c) | 44100 | 83.61 | 0.51 | 0.87 | 100 % | 116 | E2 | cents informados ±1 c y estado «Demasiado aguda» | ✅ |
| G3 -25 c (informa -24.63 c) | 44100 | 193.19 | 0.37 | 0.22 | 100 % | 116 | G3 | cents informados ±1 c y estado «Demasiado grave» | ✅ |
| G3 -10 c (informa -9.63 c) | 44100 | 194.87 | 0.37 | 0.22 | 100 % | 116 | G3 | cents informados ±1 c y estado «Un poco grave» | ✅ |
| G3 -5 c (informa -4.64 c) | 44100 | 195.43 | 0.36 | 0.21 | 100 % | 116 | G3 | cents informados ±1 c y estado «Un poco grave» | ✅ |
| G3 +5 c (informa 5.37 c) | 44100 | 196.56 | 0.37 | 0.21 | 100 % | 116 | G3 | cents informados ±1 c y estado «Un poco aguda» | ✅ |
| G3 +10 c (informa 10.37 c) | 44100 | 197.13 | 0.37 | 0.21 | 100 % | 116 | G3 | cents informados ±1 c y estado «Un poco aguda» | ✅ |
| G3 +25 c (informa 25.37 c) | 44100 | 198.85 | 0.37 | 0.20 | 100 % | 116 | G3 | cents informados ±1 c y estado «Demasiado aguda» | ✅ |
| E4 -25 c (informa -24.74 c) | 44100 | 324.90 | 0.26 | 0.07 | 100 % | 116 | E4 | cents informados ±1 c y estado «Demasiado grave» | ✅ |
| E4 -10 c (informa -9.76 c) | 44100 | 327.73 | 0.24 | 0.07 | 100 % | 116 | E4 | cents informados ±1 c y estado «Un poco grave» | ✅ |
| E4 -5 c (informa -4.73 c) | 44100 | 328.68 | 0.27 | 0.07 | 100 % | 116 | E4 | cents informados ±1 c y estado «Un poco grave» | ✅ |
| E4 +5 c (informa 5.25 c) | 44100 | 330.58 | 0.25 | 0.07 | 100 % | 116 | E4 | cents informados ±1 c y estado «Un poco aguda» | ✅ |
| E4 +10 c (informa 10.27 c) | 44100 | 331.54 | 0.27 | 0.07 | 100 % | 116 | E4 | cents informados ±1 c y estado «Un poco aguda» | ✅ |
| E4 +25 c (informa 25.27 c) | 44100 | 334.42 | 0.27 | 0.06 | 100 % | 116 | E4 | cents informados ±1 c y estado «Demasiado aguda» | ✅ |
| E2 con fundamental débil | 44100 | 82.41 | 0.82 | 0.93 | 100 % | 116 | E2 | sin error de octava, |err| ≤ 1,5 c | ✅ |
| A2 con fundamental débil | 44100 | 110.00 | 0.78 | 0.64 | 100 % | 116 | A2 | sin error de octava, |err| ≤ 1,5 c | ✅ |
| D3 con fundamental débil | 44100 | 146.83 | 0.72 | 0.38 | 100 % | 116 | D3 | sin error de octava, |err| ≤ 1,5 c | ✅ |
| E2 con ruido SNR 20 dB | 44100 | 82.41 | 0.53 | 0.86 | 100 % | 116 | E2 | |err| ≤ 1.50 c, ≥ 80 % | ✅ |
| D3 con ruido SNR 20 dB | 44100 | 146.83 | 0.60 | 0.37 | 100 % | 116 | D3 | |err| ≤ 1.50 c, ≥ 80 % | ✅ |
| E4 con ruido SNR 20 dB | 44100 | 329.63 | 0.32 | 0.07 | 100 % | 116 | E4 | |err| ≤ 1.50 c, ≥ 80 % | ✅ |
| E2 con ruido SNR 10 dB | 44100 | 82.41 | 1.44 | 0.84 | 100 % | 116 | E2 | |err| ≤ 3.00 c, ≥ 80 % | ✅ |
| D3 con ruido SNR 10 dB | 44100 | 146.83 | 0.77 | 1.45 | 100 % | 116 | D3 | |err| ≤ 3.00 c, ≥ 80 % | ✅ |
| E4 con ruido SNR 10 dB | 44100 | 329.63 | 0.49 | 0.27 | 100 % | 116 | E4 | |err| ≤ 3.00 c, ≥ 80 % | ✅ |
| A2 débil (-44.95 dBFS) | 44100 | 110.00 | 0.01 | 0.01 | 100 % | 116 | A2 | detecta con sensibilidad media | ✅ |
| A2 muy débil (-56.99 dBFS), sensibilidad alta | 44100 | 110.00 | 0.01 | 0.01 | 100 % | 116 | A2 | detecta con sensibilidad alta | ✅ |
| A2 muy débil, sensibilidad baja | 44100 | 110.00 | — | — | 0 % | — | — | se ignora (sin lecturas) | ✅ |
| Silencio | 44100 | 0.00 | — | — | 0 % | — | — | sin lecturas | ✅ |
| Ruido blanco sin nota | 44100 | 0.00 | — | — | 0 % | — | — | ≤ 2 % de lecturas | ✅ |
| Cromático F#4 | 44100 | 369.99 | 0.43 | 0.24 | 100 % | 116 | F#4 | nota F#4, |err| ≤ 1 c | ✅ |
| A2 con A4 = 432 Hz | 44100 | 108.00 | 0.47 | 0.61 | 100 % | 116 | A2 | afinada respecto de 432 Hz | ✅ |
| C2 (Drop C, sexta cuerda) | 44100 | 65.41 | 0.35 | 0.91 | 100 % | 116 | C2 | |err| ≤ 1 c, cuerda 6 | ✅ |

### Cambio rápido entre cuerdas

| Caso | fs (Hz) | Real (Hz) | Error (c) | σ (c) | Detección | 1.ª lectura (ms) | Nota | Criterio | Resultado |
|---|---|---|---|---|---|---|---|---|---|
| Cambio rápido entre 7 cuerdas (latencia máx. 116.10 ms, media 97.40 ms) | 44100 | 0.00 | — | — | 100 % | 116 | — | latencia ≤ 250 ms | ✅ |

10000 ms de audio a 48000 Hz procesados en 57.4 ms (465 lecturas, 0.124 ms por lectura, 0.57 % del tiempo real).
