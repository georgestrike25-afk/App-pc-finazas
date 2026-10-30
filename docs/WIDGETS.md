# Widgets de Aura

## Tecnología: RemoteViews (no Glance)

| Necesidad | RemoteViews | Jetpack Glance |
|---|---|---|
| Fondo 100 % transparente | Sí: raíz sin fondo | Sí |
| Reloj que avanza sin despertar la app | **Sí: `TextClock`** (lo actualiza el launcher) | No hay `TextClock`; habría que re-renderizar cada minuto |
| Opacidad 0–100 % de un panel | Sí: `setImageAlpha` + `setColorFilter` | Parcial |
| Tipografías del sistema | Por layout (generados) | Limitado |
| Peso añadido al APK | Ninguno | Librería extra |

Se eligió **RemoteViews**: el reloj es lo más importante y `TextClock` permite mostrar la hora exacta minuto a minuto, con cambio de zona horaria y formato 12/24 h del sistema, **sin consumir batería** ni procesos en segundo plano.

## Transparencia real

- La raíz del layout (`@android:id/background`) no tiene fondo: el launcher dibuja el fondo de pantalla del teléfono detrás de los textos e iconos.
- El panel opcional es un `ImageView` con una forma blanca que se tiñe (`setColorFilter`) y cuya opacidad se fija con `setImageAlpha` en 256 pasos, lo que cubre de 0 a 100 % en todas las versiones desde Android 8.
- En modo Transparente el panel está en `GONE`: no es negro semitransparente ni una captura.
- Modos: Transparente, Cristal (blanco translúcido + filo de 1 dp), Oscuro (`#101D2B`), Claro (`#F5F7F8`), Personalizado (color + opacidad).
- **Escena del clima:** ilustración del cielo que cambia sola con la condición real (despejado, parcialmente nublado, nublado, llovizna, lluvia, tormenta, nieve, niebla, viento; variantes de noche). Es un `ImageView` con `centerCrop` y opacidad 0–100 %; en Android 12+ se recorta con las esquinas del sistema.
- **Limitación:** RemoteViews no permite desenfoque del fondo real (*blur*). «Cristal» es translúcido, no esmerilado.

## Iconos 3D y hora

- Estilos de icono: **3D** (ilustraciones con volumen, `drawable-nodpi/ic3d_*.webp`), **Línea** (vectorial con acentos de marca) y **Mono**. Los iconos 3D funcionan también sobre fondo transparente.
- Tipografías del sistema: Fina, Ligera, Normal, Media, Negra, Estrecha, Serif y Mono.
- **Horas en negrita:** dos `TextClock` (`HH` en negrita + `:mm` con la tipografía elegida), así la hora sigue avanzando sin despertar la app.
- **Color de la hora** independiente del resto del texto.
- Perfil **Aura Sky**: escena del clima + iconos 3D + horas en negrita + tipografía fina.

## Catálogo y composiciones

Cada tamaño tiene su propia composición (no se encoge lo mismo):

| Widget | Pequeño | Mediano | Grande |
|---|---|---|---|
| Clock | Hora | Hora + fecha | Hora grande + fecha larga |
| Weather | Icono + temperatura | Icono, temperatura, ubicación, máx./mín. y **fecha** | **Fecha**, condición, ubicación · máx./mín., estado y **mañana** |
| Duo | Hora + icono, temperatura, ubicación | Hora y fecha │ clima │ **mañana** | Hora grande, fecha, clima con condición y meta, **mañana** |
| Forecast | Clima actual + 3 horas | Hora, clima, 4 horas + **mañana** | + 6 horas y 5 días |
| Night | Hora + clima mínimo | Hora │ clima y fecha | Hora grande, fecha, condición |

En Android 12+ se entrega un mapa de tamaños (`RemoteViews(Map<SizeF, RemoteViews>)`), así el launcher cambia de composición al redimensionar sin despertar la app. En Android 8–11 se elige en `onAppWidgetOptionsChanged`. Los umbrales están en `WidgetSizing` (probado en `WidgetSizingTest`).

Aura Night muestra la variante nocturna del icono para cielos despejados o parcialmente nublados (es un estilo del widget; la condición no cambia).

## Personalización

Por widget (clave `widget_<appWidgetId>` en DataStore): fondo y opacidad, color de texto y de iconos, iconos a color o monocromo, tamaño de hora y temperatura (70–140 %), tipografía, alineación, espaciado, sombra suave, fecha/ubicación/máx.-mín. visibles, formato de la fecha (palabras, dd/mm/aaaa o día + dd/mm/aaaa), formato horario. Las unidades son globales (Ajustes).

RemoteViews no deja cambiar la familia tipográfica ni la sombra en ejecución, por eso `tools/aura_widgets.py` genera 240 layouts (5 widgets × 3 tamaños × 8 tipografías × con/sin sombra). El resto se aplica en ejecución.

Perfiles: Aura Minimal, Glass, Dark, Light, Custom y Sky (editables y restablecibles).

## Actualización

- Hora y fecha: `TextClock`, sin actualizaciones de la app.
- Clima: WorkManager periódico (30 min – 6 h, 1 h por defecto, con red y batería no baja) y actualización puntual al colocar un widget, cambiar de ciudad o tocar el texto «Actualizado hace…».
- Cambios de zona horaria/hora/idioma: `SystemChangeReceiver` re-renderiza las etiquetas de horas y días.
- `updatePeriodMillis=0`: no hay sondeo de Android.
- Sin conexión: se muestran los últimos datos válidos; a partir de 2× el intervalo (mín. 90 min) aparece «Actualizado hace X»; a partir de 12 h la temperatura se atenúa y se indica «Sin actualizar».
