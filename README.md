# Finanzas Personales — PWA local, gratuita y sin conexión

Aplicación para **Android (APK)**, **Windows** y navegador (PWA) para gestionar ingresos variables, gastos personales y cotidianos, gastos compartidos en pareja, Sancor Salud, tarjetas, préstamos, compras en cuotas y el objetivo de ahorro del **viaje de abril de 2027**. Funciona en **Windows (PC)** y **Android**, sin servicios pagos, sin telemetría y con los datos guardados **solo en el dispositivo**.

> La aplicación inicia **vacía**: $0 de ingresos, deudas, gastos y ahorro. El único valor precargado es el **presupuesto cotidiano orientativo de $700.000**, identificado en pantalla como "valor inicial editable" y nunca contado como gasto real.

---

## Índice

1. [Funciones](#funciones)
2. [APK de Android (sin Play Store, gratis)](#apk-de-android-sin-play-store-gratis)
3. [Instalación y ejecución en Windows](#instalación-y-ejecución-en-windows)
4. [Instalar la PWA en Android](#instalar-la-pwa-en-android)
5. [Reglas de cálculo](#reglas-de-cálculo)
6. [Importación de documentos y OCR](#importación-de-documentos-y-ocr)
7. [Sincronización entre PC y celular](#sincronización-entre-pc-y-celular)
8. [Seguridad y privacidad](#seguridad-y-privacidad)
9. [Pruebas](#pruebas)
10. [Arquitectura](#arquitectura)
11. [Limitaciones conocidas](#limitaciones-conocidas)

---

## Funciones

| Módulo | Qué hace |
|---|---|
| **Resumen** | Indicadores del mes (ingresos cobrados, gastos, cuotas, saldo disponible, deudas pendientes, avance del ahorro), calculadora desplegable con el detalle de cada operación, advertencias y gráfico de 6 meses. |
| **Ingresos** | Registro por mes: ingreso cobrado, fecha, adicionales, deducciones, observaciones y neto. Estado *confirmado* / *estimado* / *sin cargar*. Nunca se copia al mes siguiente. Las ediciones guardan el historial de versiones. |
| **Gastos** | Gastos cotidianos (contra el presupuesto) y personales (no se dividen); únicos o recurrentes, con ajuste por mes. |
| **Gastos compartidos** | Alquiler, servicios, supermercado compartido, etc. Reparto 50/50 por defecto, editable por gasto; quién pagó y saldo con la pareja. |
| **Sancor Salud** | Detección automática en resúmenes de Visa o asociación manual; total que exige la tarjeta, reintegro esperado (% configurable), reintegros recibidos (por separado), pendiente y costo neto. |
| **Tarjetas y deudas** | Compras en cuotas, Plan V, préstamos, financiaciones y refinanciaciones: entidad, tipo, importes, saldo conocido, cuotas, vencimiento, frecuencia, estado, documento de origen. Pagar cuota, editar con vigencia desde un mes, cancelar desde un mes, calendario e historial. Resúmenes (total, mínimo, cierre, vencimiento) y pagos de resumen. |
| **Cuotas futuras** | Calendario por mes (6 a 36 meses), cuotas vencidas sin pago y gráfico. |
| **Presupuesto mensual** | Presupuesto por mes y por defecto, modo *real* o *estimado*, gastos por categoría, consumos con tarjeta pendientes. |
| **Importar documentos** | PDF con texto, PDF escaneado, JPG/PNG/capturas, CSV, XLS y XLSX; pantalla de revisión editable con confianza, advertencias y prevención de duplicados. |
| **Objetivo de viaje** | Costo, ahorro inicial, aportes previstos y reales, dinero reservado, faltante, fecha objetivo, % de reinversión del dinero liberado por cuotas finalizadas; escenarios conservador/intermedio/optimista configurables; proyección mes a mes y aporte mensual necesario. |
| **Historial** | Registro de cambios y documentos importados (descarga del original). |
| **Configuración** | Reparto por defecto, % de Sancor, nombre de la pareja, categorías, ingreso estimado para proyecciones, bloqueo con PIN, OCR sin conexión, estado del almacenamiento y borrado total con doble confirmación. |
| **Copias y sincronización** | Copias JSON (opcionalmente cifradas), restauración por reemplazo o fusión, sincronización con servidor autohospedado. |

---

## APK de Android (sin Play Store, gratis)

El APK se compila **gratis en GitHub Actions** (`.github/workflows/android.yml`) cada vez que se suben cambios, y se publica en la página **Releases** del repositorio:

**<https://github.com/georgestrike25-afk/App-pc-finazas/releases/latest>**

### Instalar en el celular

1. Abra el enlace de arriba **desde el celular** (Chrome).
2. En *Assets*, toque `FinanzasPersonales-1.1.N.apk` para descargarlo.
3. Abra el archivo descargado. Android pedirá permitir **"Instalar apps desconocidas"** para Chrome (o para "Archivos"): actívelo y vuelva atrás.
4. Toque **Instalar**. Si aparece *Play Protect* ("app no reconocida"), elija **Más detalles → Instalar de todas formas**. Es normal en apps que no están en Play Store.
5. Abra **Finanzas Personales** desde el ícono.

**Actualizar**: instale el APK más nuevo encima del anterior; los datos se conservan (misma firma).

### Diferencias con la versión web

- Funciona sin internet desde el primer momento (todo viene dentro del APK, incluido el OCR).
- Las copias de seguridad se **guardan o envían** con el menú Compartir (Drive, WhatsApp, correo) o en *Documentos/FinanzasPersonales*.
- Puede sincronizar con la PC por la red Wi-Fi de su casa (`http://192.168.x.x:8787`) sin HTTPS.
- Se desactivó la copia automática de Android a Google (`allowBackup=false`) para que los datos financieros no salgan del teléfono; use las copias de la app.

### Firma del APK

- Mientras no se configure una clave propia, el APK se firma con la **clave de prueba** pública `android/test-signing/prueba.jks`: alcanza para probar y actualizar sin perder datos, pero cualquiera podría firmar un APK con ella. **Instale solo APK de la página de Releases de este repositorio.**
- **Firma definitiva (gratis, recomendada antes de cargar datos reales)**:
  1. Genere una clave (en cualquier PC con Java): `keytool -genkeypair -keystore finanzas.jks -alias finanzas -keyalg RSA -keysize 2048 -validity 10000`
  2. Conviértala a texto: `base64 -w0 finanzas.jks` (Linux) o `[Convert]::ToBase64String([IO.File]::ReadAllBytes("finanzas.jks"))` (PowerShell).
  3. En GitHub → *Settings → Secrets and variables → Actions* cree los secretos `ANDROID_KEYSTORE_B64` (el texto), `ANDROID_KEYSTORE_PASSWORD` y `ANDROID_KEY_ALIAS` (`finanzas`).
  4. Guarde `finanzas.jks` y la contraseña en un lugar seguro: sin ellos no se puede actualizar la app.
  5. Al pasar de la clave de prueba a la definitiva hay que **desinstalar** la versión de prueba una vez: exporte antes una copia de seguridad y restáurela después.

### Compilar el APK localmente (opcional)

Requiere Android Studio (gratuito) o el SDK de Android + Java 21:
```bash
npm ci && npm run build && npx cap sync android
cd android && ./gradlew assembleDebug   # APK en android/app/build/outputs/apk/debug/
```

---

## Instalación y ejecución en Windows

### Requisitos

- **Node.js 20 o superior** (recomendado 22 LTS): <https://nodejs.org/es> → instalador `.msi` para Windows.
- Navegador **Chrome** o **Edge** actualizado.

### Pasos

1. Descomprima `finanzas-personales-fuente.zip` (por ejemplo en `C:\finanzas-personales`).
2. Abra **PowerShell** o **Símbolo del sistema** en esa carpeta (en el Explorador: escriba `cmd` en la barra de direcciones).
3. Instale dependencias (una sola vez, requiere internet):
   ```powershell
   npm install
   ```
4. Compile y abra la aplicación:
   ```powershell
   npm start
   ```
   Abra <http://localhost:4173> en Chrome o Edge.
5. **Instalar como aplicación de escritorio**: en la barra de direcciones toque el ícono de instalar (⊕) o use el botón **"Instalar app"** de la barra superior. Queda en el menú Inicio y funciona sin conexión.

> `npm start` debe estar ejecutándose para abrir la app desde `localhost` la primera vez. Una vez instalada, el service worker la sirve desde la caché aunque el servidor esté detenido.

Otros comandos:

| Comando | Uso |
|---|---|
| `npm run dev` | Modo desarrollo (sin service worker). |
| `npm run build` | Compilación de producción en `dist/`. |
| `npm run preview` | Sirve `dist/` en <http://localhost:4173>. |
| `npm test` | Pruebas unitarias e integración (Vitest). |
| `npm run test:e2e` | Pruebas de extremo a extremo en Chromium (Playwright; ejecute antes `npm run build`). Si no tiene el navegador: `npx playwright install chromium`. |
| `npm run sync-server` | Servidor de sincronización autohospedado (ver más abajo). |
| `npm run package` | Genera `release/finanzas-personales-fuente.zip`. |

---

## Instalar la PWA en Android

Android exige que la PWA se sirva por **HTTPS** para instalarla y usarla sin conexión. Opciones gratuitas:

**Opción 1 — Publicar `dist/` en un hosting estático gratuito con HTTPS** (recomendada)
- **GitHub Pages**: el repositorio incluye `.github/workflows/pages.yml`. En GitHub → *Settings → Pages → Source: GitHub Actions*, luego *Actions → "Publicar en GitHub Pages" → Run workflow*. (En repositorios privados, Pages puede requerir un plan pago de GitHub.)
- **Cloudflare Pages** o **Netlify** (planes gratuitos): suba la carpeta `dist/` generada con `npm run build`.

La aplicación publicada **no envía datos a ese hosting**: solo descarga el código; todos los datos quedan en el teléfono.

**Opción 2 — Desde su PC por la red local con Tailscale** (gratuito para uso personal)
1. Instale Tailscale en la PC y en el teléfono, con la misma cuenta.
2. En la PC: `npm run build`, luego `SERVE_APP=1 SYNC_TOKEN=<token> npm run sync-server` (sirve la app y la sincronización en el puerto 8787).
3. En la PC: `tailscale serve --bg 8787` → obtiene una dirección `https://<pc>.<tailnet>.ts.net`.
4. Abra esa dirección en Chrome del teléfono.

**Instalación en el teléfono**
1. Abra la dirección HTTPS en **Chrome para Android**.
2. Toque **"Instalar app"** (barra superior) o el menú ⋮ → **"Instalar aplicación"** / **"Agregar a la pantalla principal"**.
3. Abra la app desde el ícono. Para OCR sin conexión: *Configuración → Preparar OCR sin conexión*.

> Por `http://192.168.x.x` (sin HTTPS) la app abre en el navegador, pero Chrome no permite instalarla ni usar el modo sin conexión.

**Actualizaciones**: cuando hay una versión nueva aparece el aviso *"Hay una nueva versión disponible → Actualizar"*. No se actualiza sola en medio del uso.

---

## Reglas de cálculo

Todos los importes se guardan como **enteros en centavos** (sin errores de redondeo) y se muestran en formato argentino (`$ 1.234,56`). Los valores estimados se marcan con **≈** y la etiqueta *estimado*.

### Resultado mensual

```
  Ingresos cobrados (confirmados) + reintegros de Sancor efectivamente recibidos
− gastos fijos atribuibles al usuario (su % de los gastos del hogar + cargo de Sancor)
− gastos personales
− gastos cotidianos imputados (registrados + parte no registrada del presupuesto, si el mes está en modo "estimado")
− cuotas y obligaciones que vencen en el mes
= saldo mensual disponible antes del ahorro
```

Toque cada renglón en **Resumen** para ver las operaciones que lo componen.

### Cómo se evitan los dobles cómputos

1. **Consumo con tarjeta vs. pago del resumen**: la compra se computa **una vez**, como gasto en su mes de imputación. El **pago del resumen no es un gasto**: se registra aparte como información ("cancela consumos ya imputados").
2. **Total del resumen**: es informativo (lo que exige la tarjeta). **Nunca** se convierte en una deuda nueva.
3. **Compras en cuotas**: se computan cuota por cuota en el mes de vencimiento, no por el total.
4. **Presupuesto cotidiano**: en modo *estimado* solo se suma la parte **todavía no registrada** (`presupuesto − registrado`), identificada como estimación. En modo *real* solo cuenta lo registrado. Por defecto: meses actuales y futuros en *estimado*, meses pasados en *real*.
5. **Gasto manual + línea importada**: al importar, una línea con el mismo importe y fecha ±5 días que un gasto manual pagado con tarjeta se **vincula** (no se crea otro gasto).
6. **Sancor Salud**: se resta el cargo completo (lo que efectivamente cobra la tarjeta). El reintegro esperado se muestra aparte; solo el reintegro **recibido** suma, en el mes en que se cobra. El total de la tarjeta nunca se reduce por un reintegro pendiente.
7. **Ingresos**: los estimados no se suman como cobrados; el ingreso de un mes no se copia al siguiente.

### Imputación de consumos importados

Los consumos y cuotas de un resumen se imputan al **mes de vencimiento** del resumen (editable en la revisión). Los gastos cargados a mano se imputan al mes de su fecha (editable).

### Cuotas

- Una obligación con *N* cuotas, *P* pagadas y la cuota *P+1* venciendo en el mes *M* genera exactamente *N − P* cuotas desde *M* según la frecuencia. Ejemplo verificado en pruebas: **10 cuotas con 4 pagadas → 6 cuotas futuras**.
- Si falta el total de cuotas o el importe, solo se proyecta la próxima cuota, marcada como **estimada**, y se pide completar el dato.
- *Importe variable* (intereses, ajustes): las cuotas futuras se marcan como estimadas; los importes reales de cada cuota pueden registrarse por separado.
- **Editar** con "rige desde": las cuotas de meses anteriores conservan su importe. **Cancelar** desde un mes elimina solo las cuotas desde ese mes. Cada cambio queda en el historial.
- **Resúmenes sucesivos**: la cuota 5/10 del resumen siguiente se reconoce como la misma compra (entidad, concepto, total de cuotas, importe ±15 % y mes de inicio implícito) y se **vincula** sin duplicar cuotas.

### Objetivo de ahorro

- Proyección desde el mes actual hasta el **mes anterior** a la fecha objetivo (para abril de 2027: aportes hasta marzo de 2027).
- Ingreso por mes: confirmado si existe; si no, el estimado del mes o el *ingreso mensual estimado* de configuración (afectado por el factor del escenario). Si no hay ningún dato se advierte (no se inventa).
- Las cuotas se restan solo en los meses que corresponden. El **dinero liberado** por cuotas finalizadas **no se ahorra automáticamente**: solo se suma el % de reinversión configurado (0 % por defecto).
- El aporte proyectado nunca supera el saldo disponible proyectado del mes (se marca *limitado*).
- Escenarios (editables): conservador ×0,9 ingresos / ×1,1 gastos; intermedio ×1 / ×1; optimista ×1,05 / ×0,95. Son **estimaciones, no resultados garantizados**.

---

## Importación de documentos y OCR

| Formato | Cómo se lee |
|---|---|
| PDF con texto | `pdfjs-dist` 4.10 (Mozilla), con `isEvalSupported: false` y XFA desactivado. |
| PDF escaneado | Las páginas sin texto se rasterizan y se procesan con OCR (máx. 10 páginas por documento). |
| JPG, PNG, WEBP, capturas | OCR local. |
| CSV | `papaparse` (detecta separador; UTF-8 o Windows-1252). |
| XLS / XLSX | SheetJS 0.20.3 (paquete `@e965/xlsx`, réplica en npm de la versión corregida de SheetJS; la versión 0.18.5 de npm tiene vulnerabilidades conocidas). |

**Interpretación** (genérica, no atada a un banco): fechas (`05/10/26`, `05-Oct-26`, `5 dic 2026`, sin año → inferido y marcado), importes con coma o punto decimal (detección automática por documento), signo negativo y paréntesis, moneda (ARS/USD), cuotas (`C.04/10`, `Cuota 3 de 12`, `04/10`), total a pagar, pago mínimo, saldo anterior, cierre y vencimiento, pagos (`SU PAGO`), intereses/impuestos/comisiones, Sancor Salud, préstamos, Plan V, refinanciaciones, créditos y devoluciones. Entidades reconocidas: Visa Banco Patagonia, Mercado Pago, Mercado Crédito, Naranja X, Plan V, Visa/Mastercard genéricas. Categoría sugerida por palabras clave.

**Revisión**: antes de incorporar se muestran documento de origen, hash SHA-256, campos detectados y no determinados, cada movimiento con acción (gasto, cuota, pago, Sancor, vincular, no importar), fecha, concepto, importe, mes, cuota/total, categoría, **nivel de confianza** y advertencias, más el texto de origen. Las líneas con lectura dudosa (OCR < 60 %, separador ambiguo, dólares, sin concepto) quedan **"Pendiente de corrección"** y el botón *Confirmar* se bloquea hasta corregirlas o marcarlas como revisadas. Nada se incorpora sin confirmación.

**Verificación de la lectura**: cuando el resumen informa el saldo anterior y el saldo actual, la revisión comprueba que *saldo anterior − pagos − créditos + consumos + cuotas + cargos + Sancor − bonificaciones = total del resumen*. Si coincide se muestra ✓ ("no falta ni sobra ninguna línea"); si no, se indica la diferencia. Si el resumen trae el cuadro **"Cuotas a vencer"**, también se compara con las cuotas leídas.

**Visa Banco Patagonia** (probado con un resumen real, que no se guarda en el repositorio): datos en columnas (vencimiento, saldo y pago mínimo debajo de su etiqueta), fechas `dd.mm.aa`, créditos con el signo al final (`493.391,53-`), Plan V `5-05` / `1-03`, Sancor como `ASOC MUTUAL SANC`, comisiones `COMIS. PROD. PAT.`, bonificaciones y crédito de IVA. El crédito `CR.$ PLAN V` (saldo anterior refinanciado) no se importa porque esa deuda continúa como cuotas del Plan V; las bonificaciones se registran **restando** del gasto correspondiente.

**Cronogramas de préstamos** (p. ej. "Cronograma – Préstamo PERSONAL" de Banco Patagonia, probado con cronogramas reales que no se guardan en el repositorio): se reconoce la tabla *Cuota · Vencimiento · Capital · Total · Estado* y se crea **un préstamo** con el importe exacto de cada cuota, su capital y su fecha. Las cuotas "PAGA" quedan pagadas y "NO VENCIDA" pendientes. La ficha del préstamo (*Tarjetas y deudas → Calendario*) muestra en qué cuota va, la próxima cuota y su vencimiento, cuotas pagadas, total que falta pagar, capital adeudado, intereses e impuestos que faltan, % de capital pagado y fecha de la última cuota. Al importar un cronograma más nuevo del mismo préstamo (mismo número) **se actualiza** sin duplicarlo. Si el cronograma no indica la entidad, se sugiere y debe confirmarse.

**Movimientos de cuenta bancaria** (capturas de pantalla de home banking, p. ej. caja de ahorro de Banco Patagonia; probado con una captura real que no se guarda en el repositorio): se reconoce el formato *concepto · ± $ importe · fecha*. Cada línea se imputa al mes de su fecha y por defecto **solo se incluye el mes más reciente**.
- *Acreditación de sueldo/haberes* → ingreso cobrado del mes (si ya hay un ingreso confirmado, se suma como adicional; si es el mismo importe, se detecta como ya registrado).
- *Pago Visa / tarjeta* → pago de resumen, vinculado al resumen cargado con ese total (no es un gasto nuevo).
- *Amortización de préstamo* → se identifica la cuota por importe y fecha y se marca como pagada (no se resta dos veces).
- *Otorgamiento/cancelación de adelanto*, *transferencias entre cuentas propias*, *intereses* y créditos → no se importan por defecto (no son ingreso ni gasto; se explica en cada línea).
- Otros débitos → gasto pagado con débito (revisable).

**Duplicados**: cada documento se identifica por SHA-256 y cada línea por una huella estable (entidad, fecha, concepto, importe, cuota). Al reimportar se advierte y se puede **cancelar**, **revisar** o **importar deliberadamente** (las líneas ya registradas quedan desmarcadas).

### OCR: requisitos y límites

- Motor: **Tesseract.js 6** (WebAssembly) con el modelo de **español** `best_int` (2,1 MB). Recursos totales ≈ 10 MB, servidos desde `/ocr` de la propia app (copiados desde `node_modules` por `scripts/copy-ocr-assets.mjs` en cada `dev`/`build`). **Ningún documento sale del dispositivo.**
- Se descargan la primera vez que se usa OCR o con *Configuración → Preparar OCR sin conexión*; luego funcionan sin internet.
- Compatibilidad: Chrome/Edge de escritorio y Chrome para Android recientes (WebAssembly y Web Workers). En teléfonos de gama baja una página puede tardar de 10 a 60 s.
- Precisión: muy buena con capturas nítidas y PDF digitales; menor con fotos torcidas, con poca luz o tablas complejas. Por eso todo pasa por la revisión.
- PDF con contraseña: no se abren; exporte una copia sin contraseña.

---

## Sincronización entre PC y celular

Una PWA guarda su base (IndexedDB) **por navegador y por dispositivo**: dos dispositivos no se ven entre sí sin un canal compartido. Se implementaron y probaron dos mecanismos gratuitos:

### A. Copia con fusión (sin servidor, siempre disponible)

1. Dispositivo 1: *Copias → Descargar copia* (recomendado con contraseña).
2. Pase el archivo (USB, Drive, correo propio…).
3. Dispositivo 2: *Restaurar o fusionar → modo Fusionar*.

La fusión es registro por registro: gana la modificación más reciente; las eliminaciones viajan como "lápidas" y se propagan. Repita en el otro sentido para dejar ambos iguales.

### B. Servidor en la PC (`sync-server/server.mjs`) — sincronización automática

- Node.js puro, **sin dependencias**, gratuito; corre en su PC.
- **Cifrado de extremo a extremo**: la app cifra con la *frase de sincronización* (AES-GCM 256, PBKDF2-SHA-256 600.000 iteraciones) antes de enviar; el servidor solo guarda un bloque ilegible y **rechaza datos sin cifrar**.
- Token de acceso (comparación en tiempo constante), control de versiones (`If-Match`) para no perder cambios concurrentes, escritura atómica, límite de 30 MB, CORS configurable.

```powershell
# Windows (PowerShell)
$env:SYNC_TOKEN = "un-token-largo-y-aleatorio-de-al-menos-16-caracteres"
npm run sync-server
```
```bash
# Linux / macOS
SYNC_TOKEN=un-token-largo-y-aleatorio npm run sync-server
```

Variables: `PORT` (8787), `HOST` (0.0.0.0), `DATA_DIR` (`sync-server/data`), `ALLOWED_ORIGINS` (`*` o lista separada por comas), `SERVE_APP=1` (sirve también `dist/`), `TLS_CERT`/`TLS_KEY` (HTTPS con certificados PEM).

En cada dispositivo: *Copias y sincronización → Sincronizar con la PC* → pegue el **código de emparejamiento** (o complete dirección, espacio y token), escriba la **frase de sincronización** (la misma en todos) y toque *Sincronizar ahora*. Con **"Sincronizar automáticamente"** la app sincroniza sola al abrirse, al volver a ella, 15 s después de cada cambio y cada 5 minutos (la frase queda guardada en ese dispositivo). La barra superior muestra el estado (⟳ hora de la última sincronización).

Desde el celular use la dirección de la PC en la red local, por ejemplo `http://192.168.0.10:8787` (vea la IP con `ipconfig` en Windows). Si Windows pregunta por el Firewall al iniciar el servidor, permita el acceso en **redes privadas**.

**Requisitos y límites**
- La sincronización corre mientras la app está abierta (no en segundo plano con la app cerrada).
- Solo se transfieren datos cuando hubo cambios (el servidor responde "sin cambios" a quien ya está al día).
- Si la app se abrió por HTTPS, el servidor también debe ser HTTPS (el navegador bloquea contenido mixto). Lo más simple: `tailscale serve --bg 8787` (HTTPS gratuito dentro de su red privada Tailscale). Si usa la opción 2 de Android (la app servida por el mismo servidor), app y servidor comparten dirección.
- La PC debe estar encendida y accesible al sincronizar.
- Los documentos originales (PDF/imágenes) no se sincronizan; sí sus datos extraídos.
- Conflicto en el mismo registro: gana la última modificación.
- Si se pierde la frase de sincronización, el contenido del servidor no se puede recuperar (las copias locales siguen intactas).

---

## Seguridad y privacidad

- **Datos locales**: IndexedDB del navegador; se solicita almacenamiento persistente. Sin cuentas, sin servidores de terceros, sin telemetría, sin claves en el código.
- **No se piden ni se guardan credenciales bancarias.**
- **Archivos importados**: validación por extensión **y** firma binaria, límite de 25 MB, 60 páginas PDF, 5.000 filas; rechazo de HTML/scripts disfrazados de CSV; PDF sin `eval` ni XFA; el texto de los documentos se trata solo como datos (nunca como instrucciones) y se muestra escapado.
- **Copias**: validación de estructura y tipos de cada registro, protección contra contaminación de prototipos, límite de tamaño; cifrado opcional con **Web Crypto API** (AES-GCM 256 + PBKDF2-SHA-256, 600.000 iteraciones). No se usan algoritmos propios.
- **Content Security Policy** estricta (solo recursos propios; `wasm-unsafe-eval` únicamente para el OCR).
- **Bloqueo opcional con PIN** (hash PBKDF2 con sal) y bloqueo automático tras inactividad en segundo plano.
- **Confirmaciones** antes de eliminar; borrado total con doble confirmación.
- Los errores en consola no incluyen datos financieros.

**Límites del almacenamiento local (importante)**
- El PIN bloquea la **interfaz**, pero **no cifra** IndexedDB: alguien con acceso a su sesión de Windows/Android y conocimientos técnicos podría leer la base. Use el bloqueo del sistema operativo y cifrado de disco (BitLocker / cifrado de Android).
- Borrar los datos del sitio, desinstalar el navegador o el modo incógnito eliminan la información: **haga copias periódicas**.
- Una extensión maliciosa del navegador podría acceder a los datos de la página.

---

## Pruebas

### Unitarias e integración (`npm test`, Vitest + fake-indexeddb)

| Archivo | Cubre |
|---|---|
| `money.test.ts` | Importes (formatos AR/US, signos, paréntesis), detección de formato decimal, fechas, división sin perder centavos. |
| `parser.test.ts` | Entidad, cierre, vencimiento, total, mínimo, saldo anterior, clasificación, cuotas, USD, baja confianza OCR, campos no inventados. |
| `obligations.test.ts` | **10 cuotas / 4 pagadas → 6 futuras**, importes variables, sin total, cancelación, edición sin alterar meses previos, vencidas, pago, resúmenes sucesivos sin duplicar. |
| `monthly.test.ts` | Reparto 50 %, recurrencias, saldo con la pareja, **Sancor sin doble descuento**, base vacía, ingreso no copiado, **consumo vs. pago del resumen**, presupuesto sin doble cómputo, fórmula completa. |
| `savings.test.ts` | Objetivo inicial en $0 y abril 2027, proyección mes a mes, dinero liberado y reinversión, tope por saldo, aportes reales. |
| `import.test.ts` | Validación de archivos, PDF dañado, **PDF con texto real** (generado con pdf-lib y leído con pdf.js), **corrección de importe**, **reimportación sin duplicados**, resumen siguiente, vínculo con gasto manual, bloqueo de datos dudosos, CSV, XLSX y XLS. |
| `backup.test.ts` | Base inicial vacía, exportación/restauración simple y cifrada, contraseña incorrecta, copias malformadas, fusión y propagación de eliminaciones. |
| `sync.test.ts` | Servidor real: token inválido, rechazo de datos sin cifrar, **convergencia de dos dispositivos**, el servidor solo guarda datos cifrados, frase incorrecta, conflicto de versión. |

### Extremo a extremo (`npm run build && npm run test:e2e`, Playwright + Chromium, sobre la compilación de producción)

| Prueba | Caso del pedido |
|---|---|
| Apertura sin datos, manifiesto, íconos y service worker | 1 |
| Ingreso variable y persistencia al cerrar y reabrir | 2, 3 |
| PDF con texto, corrección de importe, reimportación sin duplicar, Sancor | 4, 6, 7, 10 |
| Imagen con OCR local | 5 |
| PDF escaneado con OCR local | 5 |
| Compra en cuotas (4/10 → 6 pendientes) y gasto compartido 50 % | 8, 9 |
| Proyección del ahorro hasta abril de 2027 | 12 |
| Copia cifrada: exportar, borrar todo y restaurar | 13 |
| Sin conexión: recargar offline y registrar un gasto | 14 |
| Sincronización entre dos navegadores con el servidor | 15 |
| Android (Pixel 7): sin desplazamiento horizontal, navegación inferior | Diseño |

El caso 11 (consumo de tarjeta vs. pago del resumen) se verifica en `monthly.test.ts` e `import.test.ts`.

---

## Arquitectura

- **React 18 + TypeScript 5.8 + Vite 6.4**; PWA con **vite-plugin-pwa 1.0 / Workbox 7** (precaché de la app, caché a demanda del OCR, actualización a pedido del usuario).
- **Dexie 4 (IndexedDB)** para la base local.
- **Motor financiero independiente de la interfaz** en `src/domain/` (funciones puras, probadas por separado).

```
src/
  domain/      dinero, fechas, ingresos, gastos, cuotas, Sancor, calculadora mensual, ahorro
  importers/   validación, PDF, OCR, CSV/Excel, intérprete de resúmenes, revisión e incorporación
  db/          base IndexedDB, valores iniciales, repositorio con historial
  backup/      copias, cifrado, validación, fusión
  sync/        cliente de sincronización
  ui/          interfaz (páginas y componentes)
sync-server/   servidor de sincronización autohospedado (sin dependencias)
tests/         unit/ (Vitest), e2e/ (Playwright), fixtures/
scripts/       copia de recursos OCR, íconos, ZIP
```

---

## Limitaciones conocidas

- **Sincronización**: funciona con la app abierta y la PC encendida en la misma red (o con Tailscale fuera de casa); la versión web por HTTPS requiere servidor HTTPS. Sin servidor, use copia + fusión.
- **PWA en Android**: requiere HTTPS. El **APK** no tiene esa limitación.
- **APK**: no está en Play Store; Android muestra avisos de "app desconocida" (es normal y gratuito evitar la tienda).
- **OCR**: depende de la calidad de la imagen; máximo 10 páginas escaneadas por PDF; la primera vez descarga ≈10 MB de la propia app.
- **Formatos de bancos**: el intérprete es genérico; con diseños de resumen muy particulares algunas líneas pueden no detectarse o quedar con confianza baja. Siempre se revisan antes de incorporar y se pueden cargar a mano.
- **Moneda**: la app trabaja en pesos; los movimientos en dólares se detectan pero deben convertirse manualmente.
- **Créditos/devoluciones** detectados en documentos no se importan solos: regístrelos en Ingresos si corresponde.
- **Instalador de Windows (.exe)**: en preparación (próxima etapa).
