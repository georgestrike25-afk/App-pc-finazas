# Compilar e instalar Aura

## Requisitos

- JDK 17 o superior.
- Android SDK con la plataforma 35 (Android Studio Ladybug o posterior lo instala solo).
- Acceso a Google Maven (`dl.google.com`) y Maven Central.

## Compilar

```bash
./gradlew :core:test :app:testDebugUnitTest   # pruebas unitarias
./gradlew :app:assembleDebug                  # app/build/outputs/apk/debug/app-debug.apk
./gradlew :app:assembleRelease                # APK minificado, firmado con la clave de depuración
```

El módulo `:core` (dominio, Open-Meteo, estilos, tamaños) es Kotlin puro y se puede probar sin Android SDK:

```bash
gradle -p core test
```

Los iconos y los layouts de los widgets se generan con:

```bash
python3 tools/aura_icons.py
python3 tools/aura_widgets.py
```

(CI comprueba que los recursos del repositorio coinciden con lo que generan estos scripts.)

## APK sin compilar nada

Enlace fijo, siempre con la última compilación:
**https://github.com/georgestrike25-afk/App-pc-finazas/releases/download/aura-latest/Aura.apk**
(versión «Aura (última versión)» del repositorio; también queda en `dist/Aura.apk`).

Cada push ejecuta `.github/workflows/android.yml`. En la pestaña **Actions** del repositorio, abrí la última ejecución de «Android» y descargá el artefacto **aura-apk** (`app-debug.apk` y `app-release.apk`). El artefacto **widget-screenshots** tiene las capturas del emulador.

## Instalar en el Galaxy S24+

1. Pasá el APK al teléfono (o usá `adb install -r app-release.apk`).
2. Ajustes › Seguridad y privacidad › Instalar apps desconocidas › permitilo para la app con la que abrís el APK.
3. Abrí Aura, elegí una ciudad o «Usar mi ubicación».
4. Añadí widgets desde Aura › Widgets › **Añadir** (One UI muestra el diálogo de colocación) o manteniendo pulsada la pantalla de inicio › Widgets › Aura.
5. Para editar un widget colocado: mantenelo pulsado › Configuración, o Aura › Widgets › En tu pantalla de inicio › Editar.

### Recomendación para One UI

One UI puede restringir apps en segundo plano. Para que el clima se actualice con regularidad: Ajustes › Batería › Límites de uso en segundo plano › asegurate de que Aura no esté en «Apps en suspensión profunda». La hora de los widgets no se ve afectada (la dibuja el sistema).

## Firmar para distribución

`app/build.gradle.kts` firma el release con la clave de depuración para que sea instalable directamente. Para publicar, creá un keystore propio y definí un `signingConfigs { create("release") { … } }`; no subas el keystore al repositorio.
