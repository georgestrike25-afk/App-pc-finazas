# Informe de compilación y pruebas — EnTono 1.0.9

Todo lo que figura acá se ejecutó de verdad, en este entorno o en GitHub Actions. Ningún resultado es simulado.

## Entregable

| | |
|---|---|
| APK de lanzamiento | `EnTono-1.0.9.apk` (1.402.614 bytes) |
| Descarga | https://github.com/georgestrike25-afk/App-pc-finazas/releases/download/entono-v1.0.9/EnTono-1.0.9.apk |
| Página del release | https://github.com/georgestrike25-afk/App-pc-finazas/releases/tag/entono-v1.0.9 |
| SHA-256 | `b6b1ff6f161b9dd402058a696107c20f5e5611329a822dfb5d6eb003d0067e0e` |
| Paquete | `com.afinador.acustico` (nombre visible «EnTono»), versionCode 9, minSdk 26 (Android 8.0), targetSdk 35 |
| Firma | APK Signature Scheme v2, verificada con `apksigner verify` (1 firmante). Clave generada en la compilación (ver «Limitaciones»). |
| Permisos | Sólo `RECORD_AUDIO`. Ni Internet ni ningún otro (lo comprueba el CI y falla si aparece `INTERNET`). |
| Código fuente | rama `ccr-f6019910-wn0a74`, carpeta `afinador-acustico/` |

También se publica una variante `-debug.apk` como versión de prueba. Para usar la app, instalá la de lanzamiento.

Verificación de la descarga hecha en este entorno: el SHA-256 coincide con `SHA256SUMS.txt`, el zip está íntegro y contiene `classes.dex`, `AndroidManifest.xml` y `resources.arsc`.

## Identidad visual EnTono (versión 1.0.9)

- Nombre visible **EnTono**; el identificador de paquete `com.afinador.acustico` no cambió (las instalaciones previas siguen siendo la misma app).
- Ícono adaptable vectorial (fondo + primer plano + monocromo), pantalla de inicio con `core-splashscreen` (logotipo «EnTono» en Android 12+), logotipo en la barra superior, el tutorial y Acerca de.
- Paleta: grafito `#1E1E1E`, verde `#00C853` (tema oscuro) y `#0A6B45` (verdes del tema claro, por contraste).
- Los recursos se generan con `branding/generar_marca.py`; las piezas para tiendas y redes están en [`marca/`](marca/).
- Verificado en CI: `aapt2 dump badging` informa `application-label:'EnTono'`; las pruebas de interfaz pasaron en API 34 y API 29. La primera ejecución del job de API 34 falló **antes de correr pruebas** porque el runner no pudo descargar el emulador («Error on ZipFile unknown archive»); la ejecución siguiente pasó.

## Entorno

- Este contenedor tiene Linux x86_64, JDK 21 y Gradle 8.14.3, pero **no tiene Android SDK**. La política de red bloquea `dl.google.com`, que es de donde se descargan el SDK y las bibliotecas AndroidX.
- Por eso, en este contenedor se compiló y probó el motor `:core` (Kotlin puro).
- La app Android se compila y prueba en GitHub Actions (`ubuntu-latest`, JDK 17, Android SDK del runner), con el workflow `.github/workflows/afinador-android.yml`.

## Resultados

### 1. Motor de afinación (`:core:test`): 35 pruebas, 0 fallas

Se ejecutó en este entorno y otra vez en CI.

- **Matemática musical**: las frecuencias de las 6 cuerdas (±0,0005 Hz), el paso de 440 a 432 Hz (E2 = 80,9086 Hz), el cálculo de cents y los límites de A4 (400–480 Hz). También se comprobó que entradas inválidas (0, negativo, NaN, infinito) no rompen nada, que no hay problemas con notas muy graves o agudas, y que los nombres de notas se convierten en ambos sentidos (MIDI 24–96, con sostenidos y bemoles).
- **Afinaciones**: las notas y octavas de los 10 presets, comprobadas de dos maneras independientes (por nombre y por semitonos respecto de la estándar).
- **Transposición y A4**: la transposición recalcula los objetivos reales y se combina con la A4 sin contradicciones. Los valores fuera de rango se limitan.
- **Afinaciones personalizadas**: crear, editar, duplicar, eliminar y guardar/leer, incluso con líneas dañadas.
- **YIN por FFT**: coincide con el cálculo directo; la ida y vuelta de la FFT es exacta.
- **Precisión con señales sintéticas**: 55 de 55 casos dentro de criterio. La tabla completa está en [`precision-motor.md`](precision-motor.md). Resumen:

| Caso | Resultado medido |
|---|---|
| 6 cuerdas, cuerda pulsada realista, a 44,1, 48 y 22,05 kHz | error mediano ≈ 0,3 cents, σ ≈ 1 cent, 100 % de detección, cuerda correcta |
| Cuerda ideal sin inarmonicidad (E2, E4) | error ≤ 0,04 cents, σ ≤ 0,02 cents |
| Desvíos conocidos de ±5, ±10 y ±25 cents (E2, G3, E4) | cents informados con ±0,6 de diferencia y estado correcto |
| Fundamental débil (segundo armónico 4× más fuerte) | sin errores de octava; error ≈ 0,8 cents |
| Ruido blanco SNR 20 dB | error ≤ 0,6 cents |
| Ruido blanco SNR 10 dB | error ≤ 1,5 cents |
| Señal débil (−45 dBFS con sensibilidad media; −57 dBFS con sensibilidad alta) | detectada; con sensibilidad baja se ignora, como corresponde |
| Silencio y ruido sin nota | 0 lecturas |
| Cromático F#4, A2 con A4 = 432 Hz, C2 en Drop C | correctos |
| Cambio rápido entre las 6 cuerdas | latencia máxima 116 ms (media 97 ms), sin saltos a otra cuerda |
| Pérdida de señal | vuelve a «Esperando una cuerda» en menos de 0,7 s |
| Rendimiento | 10 s de audio procesados en ≈ 60–70 ms en la JVM (< 1 % del tiempo real) |

El ≈ 0,3 cent de error con la cuerda pulsada viene de la inarmonicidad física de una cuerda real, que está incluida en la señal de prueba. Con una cuerda ideal el error del algoritmo es menor a 0,05 cents.

**Fallas encontradas y corregidas:** la primera versión fallaba con ruido fuerte. Tenía errores de octava (−1201 cents) con SNR 10 dB y una dispersión de 17 cents con SNR 20 dB en E2. Se corrigió agregando un pasa bajos Butterworth antes de YIN y eligiendo el primer mínimo cercano al global cuando hay ruido.

### 2. App Android (CI, ejecución 40562792777, commit `594dc3d`): todo correcto

- `:app:testDebugUnitTest`, `:app:lintDebug` (sin errores), `assembleDebug`, `assembleRelease` (R8 activado) y `assembleDebugAndroidTest`: correctos.
- **Pruebas de interfaz en emulador**, 9 de 9 en dos dispositivos: API 34 (Pixel 6) y API 29 (Nexus 5, pantalla chica de 360×640 dp). Usan el micrófono, el motor y DataStore reales:
  - La pantalla principal muestra el mástil, las 6 cuerdas, la nota, el medidor y los controles sin desplazar, incluso en la pantalla chica.
  - Con el micrófono del emulador en silencio, el motor real informa «Esperando una cuerda».
  - La cuerda se selecciona a mano y se vuelve al modo automático.
  - Al cambiar a Drop D, las cuerdas pasan a D2 A2…, y se puede volver a la Estándar.
  - Con A4 = 432 Hz, el objetivo de la sexta cuerda es E2 (80,91 Hz). El valor personalizado 445,5 Hz se acepta y 500 Hz se rechaza. Hay botón para volver a 440.
  - Con transposición +1, el objetivo es F2 (87,31 Hz). Se probaron −1 y volver a 0, y también desde la pantalla principal.
  - El tema Claro u Oscuro elegido sigue igual después de recrear la actividad.
  - Una afinación personalizada se crea, se guarda, sigue después de recrear la actividad y se elimina.
  - Se recorrieron el modo cromático, la privacidad y el tutorial.
  - La marca EnTono (logotipo y «Afinador de guitarra») se ve en la pantalla principal y en Acerca de.
  - Se tomaron capturas de todas las pantallas en los dos temas (adjuntas al release).

**Fallas encontradas por estas pruebas y corregidas:**
- En pantallas bajas, los botones de cuerda se superponían.
- En pantallas chicas, el círculo de la nota tapaba el mástil. Se rediseñó la pantalla principal.
- Los toques rápidos en «−/+» se perdían. Se corrigió con actualización atómica.
- El teclado quedaba abierto y tapaba botones después de «Aplicar».
- La píldora de estado no exponía su texto a la accesibilidad.

## Lo que no se pudo probar

- **Una guitarra real tocada en un teléfono real.** El emulador no tiene micrófono con sonido. Las pruebas de audio usan señales sintéticas que pasan por el mismo motor que usa la app. Falta confirmarlo con tu guitarra.
- **Captura de audio en hardware real** (AudioRecord con las fuentes UNPROCESSED, VOICE_RECOGNITION o MIC). En el emulador sí se abrió el micrófono y se leyó silencio sin errores.
- **Instalación automática en tu teléfono.** Desde este entorno no es posible: el APK queda listo para instalar a mano.

## Limitaciones conocidas

1. **Firma.** El repositorio no tiene los secretos de una clave permanente, así que cada compilación de CI firma con una clave nueva que no se guarda. El APK es válido, pero para instalar una versión futura vas a tener que desinstalar la anterior. El README explica cómo cargar una clave permanente.
2. El análisis usa una ventana de unos 85 ms. La primera lectura aparece unos 110 ms después de pulsar la cuerda.
3. Afinaciones muy graves: el detector funciona desde unos 40 Hz (E1). Combinaciones extremas de afinación y transposición por debajo de ese límite no se detectan.
4. En lugares muy ruidosos (SNR menor a unos 10 dB) la lectura se vuelve menos estable. Bajar la sensibilidad ayuda.
5. La pantalla está fija en vertical.
