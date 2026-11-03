# Aura — memoria del proyecto

App Android de clima, hora y widgets transparentes + editor de fondos «Aura Studio 3D».
Kotlin, Jetpack Compose (Material 3), minSdk 26, target/compile 35. UI en español.
Optimizada para Samsung Galaxy S24+ (1080×2340). Sin servicios pagos, sin claves de API,
sin telemetría; las fotos se procesan solo en el teléfono.

## Módulos
- `core/` (JVM puro, probado con JUnit): clima (Open-Meteo, WMO, frescura, `ForecastSlots`),
  estilos de widget (`style/WidgetStyle`, perfiles), tiempo (`time/HourFormat.kt`: `ClockPatterns`,
  `DateStyle`), Studio (`studio/ClockDesign.kt`: diseño del reloj, `ClockLayout`, `History`, encuadre).
- `app/src/main/java/app/aura/`
  - `widget/`: widgets con RemoteViews (no Glance). `WidgetRenderer` aplica estilo; hora y fecha con
    `TextClock` (el sistema las actualiza, sin gasto de batería). Transparencia real.
  - `ui/`: pantallas Compose (Inicio, Widgets, Personalizar, Pronóstico, Ubicación, Ajustes);
    `ui/components/WidgetPreview.kt` replica en Compose el widget (mantener sincronizado con los layouts).
  - `studio/`: `render/ClockPainter` (reloj 3D en Canvas: sombra, extrusión, brillo, material,
    bisel, reflejo, camaleón, deformación, separación, vertical/horizontal), `StudioCompositor`,
    `mask/` (ML Kit Subject Segmentation + pincel manual), `data/ProjectRepository`,
    `wallpaper/` (`WallpaperApplier`, `AuraWallpaperService`: una actualización por minuto, prerender).
  - `work/`: WorkManager (refresco periódico del clima). `data/`: DataStore.
- `tools/aura_widgets.py`: GENERA los layouts XML de widgets (240: tipo × tamaño × fuente × sombra).
  No editar los XML a mano: cambiar el script y regenerar. `tools/aura_icons.py`, `tools/aura_3d.py`: iconos.

## Compilación y entrega
- Se compila en GitHub Actions (`.github/workflows/android.yml`): pruebas unitarias, APK firmado,
  lint, y job de emulador (API 34) con pruebas instrumentadas que guardan capturas en `docs/capturas/`.
- La CI publica `dist/Aura.apk` (commit «APK de Aura (sha) [skip ci]») y la versión `aura-latest`.
- Firma: clave generada una vez y guardada en la caché de Actions (nunca en el repo).
  Huella SHA-256 esperada del certificado: empieza con `c38d31f89125687b6`; verificarla antes de entregar.
- En el contenedor local Gradle no tiene dependencias en caché: validar en la CI.
- Rama de trabajo: `ccr-f0c1968f-5qd93l`.

## Preferencias del usuario
- Después de cada cambio en la app, enviar el APK por el chat (archivo, no enlace) y capturas reales.
- Respuestas en español rioplatense, breves.

## Estado (2026-11)
Hecho: widgets Clock/Weather/Duo/Forecast/Night en 3 tamaños, iconos 3D y escenas, 8 fuentes,
pronóstico de mañana, fecha en Weather y formato de fecha (palabras, dd/mm/aaaa, día + dd/mm/aaaa);
Aura Studio con 41 fuentes, dos puntos opcionales (también en widgets), estirar, deformar, separar (con «:» fijo al medio), orientación vertical,
camaleón, máscara de sujeto, proyectos, exportar, fondo estático y animado.

## Pendiente / conocido
- Confirmar en un S24+ real la sincronización del fondo animado y que no haya parpadeo negro.
- La segmentación automática de ML Kit no está disponible en el emulador (se usa el modo manual).
- Docs detallados en `docs/` (DISENO, WIDGETS, STUDIO, COMPILACION, PRUEBAS, PERMISOS_Y_LICENCIAS).
