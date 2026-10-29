# Pruebas y resultados

Última ejecución completa: GitHub Actions, workflow **Android**, run `40869153700` (commit `eb09a5b`): ✅ compilación, ✅ pruebas unitarias, ✅ APK debug y release, ✅ lint, ✅ 10/10 pruebas instrumentadas en emulador Android 14 (API 34, x86_64, perfil Pixel 7, 1080×2400).

Las capturas de cada ejecución se guardan automáticamente en [`docs/capturas/`](capturas/).

## Qué se ejecutó de verdad

| Área | Cómo | Resultado |
|---|---|---|
| Compilación real | `assembleDebug` + `assembleRelease` (R8, recursos reducidos) en CI | ✅ |
| Lint de Android | `lintDebug` | ✅ sin errores |
| Dominio / Open-Meteo / estilos / tamaños | 41 pruebas JVM en `:core` (también locales, `gradle -p core test`) | ✅ 41/41 |
| Instalación y apertura | El emulador instala el APK y abre `MainActivity` (`AppScreensTest`) | ✅ |
| Datos meteorológicos reales | `weatherDataIsAvailableFromProvider`: descarga de Open-Meteo para Madrid | ✅ (p. ej. 19 °C, parcialmente nublado, máx. 21° / mín. 8°) |
| Todos los widgets y tamaños | `everyWidgetAndSize…`: se inflan los RemoteViews reales de 5 widgets × 3 tamaños | ✅ |
| Transparencia real | Píxel a píxel: >50 % del área con alfa 0 en modo transparente, sobre fondos claros y oscuros con franjas | ✅ |
| Opacidad 0–100 % | `opacityControlsPanelAlpha…`: 0, 25, 50, 75, 100 % → alfa medido del panel ±3 | ✅ |
| Perfiles | Glass, Dark, Light, Custom y Sky renderizados | ✅ |
| Escena del clima + iconos 3D + horas en negrita | `skyProfileShows…`: escena visible, icono 3D visible, `TextClock` de horas/minutos activos; también 3D sobre fondo transparente | ✅ |
| Proveedores registrados | 5 proveedores de widget con actividad de configuración | ✅ |
| Widgets en el launcher real | `LauncherWidgetTest`: `requestPinAppWidget` + confirmación con UiAutomator; `dumpsys appwidget` confirma Duo, Clock, Weather y Forecast alojados por Pixel Launcher | ✅ anclados (ver nota) |
| Pantallas de la app | Capturas de Inicio, Pronóstico, Widgets, Personalizar y Ajustes | ✅ revisadas |

**Nota sobre el launcher:** la captura `launcher_*.png` muestra la primera página; el launcher colocó los widgets de 4×2 en otra página por falta de hueco, así que en esa imagen no se ven. Su presencia se verificó con `dumpsys appwidget`. Los renders de `minimal_*`, `sky_*`, `opacity_*` y `profile_*` son los RemoteViews reales inflados sobre fondos de prueba.

## Defectos encontrados y corregidos gracias a las capturas

- La escena de cielo traía su propio sol y se duplicaba con el icono 3D (y se cortaba en widgets altos) → las escenas son ahora solo cielo y luz.
- El icono 3D quedaba pequeño frente a la referencia → en Android 12+ el icono principal crece un 60 % (salvo en tamaño pequeño).
- Las pruebas de interfaz eran inestables por avisos «no responde» del emulador → se ocultan esos avisos y se amplían las esperas.
- Forecast pequeño no tiene reloj por diseño; la prueba se ajustó a esa composición.

## Lo que NO se pudo probar

- **Samsung Galaxy S24+ / One UI:** no había dispositivo físico. Se probó en emulador Android 14 con Pixel Launcher. Conviene verificar en el teléfono el aspecto con el radio de esquinas y la cuadrícula de One UI.
- **Consumo de batería real:** no se midió. El diseño lo minimiza (`TextClock`, sin servicios, WorkManager con restricciones), pero no hay cifras.
- **Comportamiento sin conexión de extremo a extremo en dispositivo:** la lógica (caché, frescura, datos desactualizados) está cubierta por pruebas unitarias, no por una prueba con la red cortada.
- **Ubicación automática:** requiere conceder permiso de ubicación en un dispositivo; las pruebas usan una ciudad fija.
- **Cambio de zona horaria en vivo:** lo gestiona `TextClock` del sistema y el receptor `SystemChangeReceiver`; no se automatizó un cambio de zona en el emulador.
