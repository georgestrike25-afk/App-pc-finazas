# Sistema de diseño de Aura

> «El cielo y el tiempo, a tu manera».

## Marca

- **Símbolo:** sol geométrico. Disco dorado y 12 rayos finos (trazo 2,6/108) de extremos redondeados, simétricos, sobre azul noche con un halo radial muy suave (`#1F4560 → transparente`). Sin texto.
- **Icono adaptativo:** `ic_launcher_background` (fondo), `ic_launcher_foreground` (sol) y `ic_launcher_monochrome` (iconos temáticos de Android 13+). El sol ocupa un radio de 22,9 dp dentro de la zona segura de 33 dp del lienzo de 108 dp, así que sobrevive a cualquier máscara (círculo, squircle de One UI, lágrima).
- Recursos para revisión: `docs/assets/brand/aura_icon.svg`, `aura_icon_square.svg`, `aura_mark.svg`.
- Todo se genera desde `tools/aura_icons.py` (una sola fuente de geometría para SVG y VectorDrawable).

## Paleta

| Token | Hex | Uso |
|---|---|---|
| Azul noche | `#101D2B` | Fondo oscuro, panel «Oscuro», texto sobre claro |
| Azul profundo | `#18364A` | Superficies elevadas oscuras, primario en tema claro |
| Azul petróleo | `#244B5B` | Iconos sobre claro, fondo «Personalizado» por defecto |
| Dorado solar | `#FFC857` | **Acento**: sol, rayo, botón principal, indicador de navegación |
| Blanco | `#FFFFFF` | Texto de widgets, superficies claras |
| Gris suave | `#DCE3E8` | Texto secundario sobre oscuro, Aura Night |
| Fondo claro | `#F5F7F8` | Fondo del tema claro, panel «Claro» |

Derivados de iconografía (no de marca): lluvia `#8CC8EB`, luna `#F3DFA2`. Para widgets con tinta oscura los acentos se profundizan (`#F0A93A`, `#D69E2E`, `#2F86BF`) para no perder contraste.

Tokens en código: `core/.../style/Brand.kt` (widgets) y `app/.../ui/theme/Theme.kt` (`AuraPalette`, `AuraTokens`, esquemas Material 3 claro y oscuro). El tema de la app puede seguir al sistema o fijarse en claro/oscuro.

El dorado es acento: aparece en el sol, el botón principal y los indicadores de selección, nunca como fondo de pantalla completa.

## Tipografía

Solo fuentes del sistema (Roboto/SamsungOne según el teléfono), sin fuentes incrustadas:

- Hora y temperatura: `sans-serif-light` por defecto, números tabulares (`tnum`) en la app.
- Escala Material 3 ajustada: `displayLarge` 88 sp para la hora de Inicio, `displayMedium` 64 sp para la temperatura.
- Datos secundarios en 12–14 sp y al 80 % de opacidad del color de texto, para no competir con los protagonistas.
- Widgets: cuatro familias seleccionables (Ligera, Normal, Media, Estrecha).

## Iconografía meteorológica

11 iconos vectoriales (24/48 dp), trazo uniforme 2,5/48 con extremos redondeados: despejado (día/noche), parcialmente nublado (día/noche), nublado, llovizna, lluvia, tormenta, nieve, niebla y viento. Variantes de color, monocromo y para superficies claras: `docs/assets/icons/`.

Cada icono tiene **dos capas** (`ic_wx_*_base` neutra, `ic_wx_*_accent` color). En los widgets la capa base se tiñe con el color de icono elegido y el acento mantiene el dorado de marca, sin rasterizar nada. Las nubes que tapan al sol o a la luna se recortan con un *clip-path* complementario, de modo que no se cruzan líneas.

**Variante 3D** (`tools/aura_3d.py`): el mismo catálogo con volumen (sol con degradado radial y halo, nubes con sombreado y brillos, gotas translúcidas, rayo luminoso, luna con cráteres), más 11 **escenas de cielo** con un velo oscuro del lado del texto para mantener el contraste. Se dibujan en SVG con filtros de desenfoque, se renderizan con Playwright y se exportan a WebP (≈260 KB en total). Fuentes SVG en `docs/assets/3d/`.

Iconos de interfaz (`ic_ui_*`, 24 dp, trazo 1,8) siguen el mismo lenguaje de línea.

## Forma y espaciado

- Radios: 8/12/20/28/36 dp (Material 3 `Shapes`). El panel de los widgets usa el radio del sistema en Android 12+ (`system_app_widget_background_radius`), 24 dp antes.
- Espaciado de widgets: Compacto 8 dp, Normal 14 dp, Amplio 20 dp (en tamaños pequeños el relleno se limita a 10 dp).

## Investigación de herramientas

| Herramienta | Estado | Uso |
|---|---|---|
| UI UX Pro Max (nicohodt/claude-code-ui-ux-skill, MIT) | Clonada y consultada | Guías de Jetpack Compose (estado elevado, UDF, `collectAsStateWithLifecycle`, `key` en listas) y la recomendación «Minimalism + Glassmorphism» para apps de clima, con contraste WCAG obligatorio. Aplicadas. |
| Better Design (marvkr/better-design, MIT) | Revisada, no instalada | Funciona como servidor MCP con clave de su servicio y orientado a componentes web; no aporta tokens nativos Android. |
| REA (morluto/rea, MIT) | Revisada, no usada | No hizo falta analizar apps de referencia. |
| Frontend Design (Anthropic) | Disponible | Solo pertinente para tareas web; Aura es nativa. |
| Playwright | Preinstalado (biblioteca, no MCP) | Renderizado de hojas de iconos y del icono de marca para revisión visual. Las pantallas y widgets nativos no se pueden validar con él. |
