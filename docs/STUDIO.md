# Aura Studio

Editor de fondos de pantalla con reloj digital 3D, integrado en Aura (pestaña **Studio** y tarjeta en Inicio). Mismo repositorio, misma app, misma identidad: azul noche, blanco y acentos dorados.

Mockups previos a la implementación: [`docs/mockups/`](mockups/).

## Funciones

| Función | Implementación |
|---|---|
| Importar foto | Selector oficial de fotos de Android (`PickVisualMedia`): sin permiso de galería; Aura solo recibe la imagen elegida y guarda una copia reducida (lado mayor ≤ 3200 px) |
| Recortar y encuadrar | Ajuste «cubrir» a la resolución real de la pantalla + zoom (1–5×) y desplazamiento con gestos; nunca deja bordes vacíos (`Framing`) |
| Fuentes para números | 20 tipografías abiertas incluidas (Bebas Neue, Anton, Oswald, Teko, Rajdhani, Orbitron, Audiowide, Michroma, Russo One, Black Ops, Monoton, Bungee, Righteous, Share Tech, Major Mono, Poiret One, Comfortaa, Abril Fatface, Playfair, Pacifico), recortadas a los caracteres del reloj (≈100 KB en total), más las 8 del sistema |
| Ancho, alto y rotación | Estiramiento independiente (50–250 %), giro de −45° a 45° (deslizador, botones de 0,5° o dos dedos) |
| Separar desde el centro | Las horas se alejan hacia el borde izquierdo y los minutos hacia el derecho (0–100 %); botón «Llenar el ancho» |
| Deformación libre | Pestaña Deformar: 4 esquinas arrastrables (perspectiva, inclinación); atajos de perspectiva; el camaleón sigue la deformación |
| Ajuste fino | Posición con deslizadores y flechas de 0,25 % de la pantalla, para encajar los números en la foto |
| Modo camaleón | La cara de los números toma la foto que tienen detrás, alineada píxel a píxel aunque el reloj esté girado o estirado; el canto toma el tono medio del fondo. Intensidad y aclarar/oscurecer ajustables. Se adapta solo al mover el reloj |
| Reloj editable | Paramétrico (no hay imágenes prediseñadas): 8 tipografías del sistema de Aura, horas en negrita, color, tamaño, espaciado, opacidad, posición con arrastre y pellizco |
| Efectos 3D | Sombra difusa, profundidad (extrusión), bisel, reflejo especular y brillo, con dirección de la luz ajustable |
| Materiales | Metal (degradado cromado con tinte), vidrio (cara translúcida y filo claro), neón (resplandor multicapa), piedra (textura procedural), minimal |
| Clima y hora de Aura | Formato 12/24 h de Aura, fecha localizada y temperatura y ciudad en caché del sistema meteorológico existente |
| Deshacer / rehacer | Historial único del proyecto (reloj, encuadre, máscara y trazos); un gesto = un paso |
| Proyectos | Guardar, abrir, duplicar, eliminar; miniatura; todo en almacenamiento interno privado |
| Exportar | PNG en la resolución real de la pantalla, en Imágenes › Aura (MediaStore) |
| Aplicar | Fondo estático con `WallpaperManager` (inicio, bloqueo o ambos) o fondo animado con el selector oficial |

## Profundidad (sujeto delante del reloj)

Composición en tres capas: **foto → reloj 3D → sujeto recortado por la máscara**.

- **Automático:** al abrir un diseño nuevo se intenta segmentar el sujeto principal sin intervención (ML Kit Subject Segmentation, en el dispositivo). La confianza por píxel se convierte en máscara con una rampa suave alrededor del umbral.
- **Manual:** pincel, borrador, tamaño del pincel, zoom y desplazamiento con dos dedos, invertir, suavizado de bordes, deshacer y rehacer. Los trazos se guardan como datos (no píxeles): el proyecto sigue editable.
- Si la detección automática falla o no está disponible, la edición manual funciona igual.

### Evaluación de visión artificial local

| Opción | Licencia / costo | Alcance | Peso en el APK | Decisión |
|---|---|---|---|---|
| **ML Kit Subject Segmentation** (Play Services) | Gratis, términos de ML Kit; sin clave ni nube | Personas, mascotas y objetos principales | ≈200 KB (el modelo lo descarga Play Services) | **Elegida** |
| ML Kit Selfie Segmentation | Gratis | Solo personas | ≈4,5 MB empaquetado | Descartada: limitada a personas |
| MediaPipe Image Segmenter | Apache 2.0 | Según el modelo (DeepLab, selfie) | 3–10 MB + modelo | Descartada: más peso y trabajo de modelos |
| U²-Net / ONNX Runtime | Apache 2.0 / MIT | Sujeto general | 40–170 MB | Descartada: tamaño y memoria |

Memoria: la segmentación trabaja a 1024 px de lado mayor; la máscara se guarda a ≤ 1600 px (ALPHA_8, ~2,5 MB). Las fotos nunca se transmiten.

**Limitación:** el modelo depende de Google Play Services (presente en el Galaxy S24+). En dispositivos sin Play Services, o mientras el modelo se descarga, queda solo el modo manual.

## Fondo animado

`AuraWallpaperService` muestra el diseño activo con la hora en tiempo real:

- **Una activación por minuto**, programada para el instante exacto del cambio de minuto del reloj del sistema. Unos 2,5 s antes se compone el fotograma siguiente fuera de pantalla; en el cambio solo se copia a la superficie, sin destellos y en sincronía. Si el sistema lo despierta antes de tiempo, se reprograma en lugar de mostrar la hora vieja.
- Cuando Android pide la imagen (al crear o mostrar el fondo), se entrega de forma síncrona: nunca queda la pantalla en negro.
- Foto encuadrada y sujeto se guardan en caché en disco por diseño y resolución, así recrear el fondo (p. ej. al encender la pantalla) no vuelve a procesar la foto.
- Todo el dibujo ocurre en un hilo propio; cambios manuales de hora o zona horaria redibujan al instante.
- Solo mientras es visible: al ocultarse se desregistra y no procesa nada.
- La foto y la capa del sujeto se componen una vez y se reutilizan; cada minuto solo se pinta el reloj.

**Restricciones reales de Android y One UI:**
- Android permite fondos animados en la pantalla de inicio. Que se usen también en la de bloqueo depende del fabricante. En **One UI (Samsung)**, la pantalla de bloqueo normalmente no admite fondos animados de otras apps y además dibuja su propio reloj del sistema. Por eso Aura ofrece **«Bloqueo»** como imagen estática de alta calidad.
- Un fondo **estático** muestra la hora en que se exportó (queda fija en la imagen). Para la hora real se usa el fondo animado.
- El selector de fondos animados es del sistema: Aura no puede activarlo en silencio (requiere permiso de sistema).

## Arquitectura

```
core/studio/      ClockDesign, PhotoFrame, Framing, MaskSettings, MaskStroke, StudioProject, History (JVM, con pruebas)
studio/render/    ClockPainter (reloj 3D), StudioCompositor (capas), ClockExtrasBuilder (reutiliza hora y clima de Aura)
studio/mask/      SubjectSegmenter (ML Kit), MaskRenderer (trazos → máscara)
studio/data/      ProjectRepository (proyectos en filesDir/studio)
studio/wallpaper/ WallpaperApplier (WallpaperManager, MediaStore, selector), AuraWallpaperService
studio/ui/        StudioViewModel, StudioHomeScreen, StudioEditorScreen, MaskEditorScreen
```

La vista previa, la exportación y el fondo animado usan el mismo `ClockPainter` sobre un Canvas de software, así los tres coinciden píxel a píxel en efectos (los desenfoques de `BlurMaskFilter` no dependen de la aceleración por hardware).

Responsabilidades separadas: reloj y clima (Aura existente), widgets (sin cambios), editor gráfico (`render`, `mask`), proyectos (`data`) y aplicación de fondos (`wallpaper`).

## Permisos añadidos

- `SET_WALLPAPER`: permiso normal, sin diálogo. Necesario para aplicar el fondo.
- `WRITE_EXTERNAL_STORAGE` con `maxSdkVersion=28`: solo Android 8 y 9, para guardar en la Galería. Desde Android 10 se usa MediaStore sin permiso.
- Ninguno para leer fotos (el selector del sistema no lo necesita).

## Dependencia añadida

- `com.google.android.gms:play-services-mlkit-subject-segmentation:16.0.0-beta1`: segmentación local del sujeto. Sin costo ni clave. Única dependencia nueva.
