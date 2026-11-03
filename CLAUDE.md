# Brote — memoria del proyecto

App de finanzas personales de Jorge (es-AR). Una sola base web que se publica como PWA, APK de Android y EXE de Windows. Solo la usa Jorge (el modo pareja se quitó el 03/11/2026).

## Tecnologías
- React 18 + TypeScript + Vite (PWA con vite-plugin-pwa). Estilos: CSS propio en `src/ui/styles.css` (tokens `:root` claro / `[data-theme='dark']`), sin Tailwind/Bootstrap. Íconos lucide-react, letra Inter.
- Datos locales: Dexie/IndexedDB (`src/db`). Montos en centavos enteros; meses `'YYYY-MM'`.
- Android: Capacitor 7 + plugin Java `Notificaciones` (`android/app/src/main/java/ar/finanzas/personales/`): lectura de notificaciones, avisos de Brote, widget, anotación rápida, compartir → importar.
- Windows: Electron 33 (`desktop/main.mjs`) que sirve `dist` y trae el servidor de sincronización (`sync-server/server.mjs`, puerto 8787). userData fijo en la carpeta "Finanzas Personales".
- QR: `qrcode` (generar) y `jsqr` (leer con la cámara) en `src/ui/components/Qr.tsx`.

## Estructura
- `src/domain/` lógica pura (cálculo mensual, plata hasta cobrar `cash.ts`, Sancor, deudas). `src/importers/` lectura de PDFs/capturas/planillas. `src/notifications/` análisis de avisos, anotación rápida, widget. `src/sync/` sincronización celular ↔ PC (cifrada, frase ≥ 8). `src/ui/pages/` pantallas.
- Pruebas: `tests/unit` (Vitest), `tests/e2e` (Playwright sobre la compilación). `tests/local/` está en .gitignore (pruebas con datos reales / Electron con xvfb / comparación visual antes-después `visual.spec.ts`).
- Rendimiento: "Este mes" se carga con la app y el resto de las pantallas con `React.lazy` (`src/ui/App.tsx`); `qrcode` se importa recién al dibujar un QR. Mantener así lo pesado (lectores de PDF/OCR/planillas) fuera del arranque.
- `@capacitor/app` no se importa en JS pero se deja: el plugin nativo maneja el botón Atrás de Android.

## Comandos
- `npx tsc --noEmit -p .` · `npx vitest run` · `npm run build && npx playwright test`
- App de escritorio local: `npm run build && node scripts/build-desktop.mjs <versión>`; probar con `xvfb-run -a npx playwright test -c tests/local/escritorio.config.ts`.
- Java sin SDK: compilar contra `android-all` + stubs de Capacitor (CI compila de verdad).

## Publicación
- Rama de trabajo: `ccr-d0ab1290-u3vi9s`. Cada push compila en GitHub Actions: `android.yml` → release `v1.1.N` (`Brote-1.1.N.apk`), `windows.yml` → `pc-v1.2.M` (Instalador y Portable). Cambios solo en `.md` no compilan.
- Siempre publicar APK y EXE juntos. El APK se firma con la llave de prueba: se instala encima (desinstalar borra los datos del celular).

## Reglas del usuario
- No commitear documentos ni datos reales; montos ficticios en pruebas. No mandar documentos financieros a servicios externos ni usar APIs pagas.
- Mostrar el diseño (capturas) y pedir aprobación antes de pantallas nuevas. Preguntar antes de cambios que alteren cómo funciona algo.
- No afirmar que algo funciona sin probarlo. Respuestas en español rioplatense, simples.

## Estado (03/11/2026)
- Hecho: rediseño "Forest Finance"/Brote, widget y anotación rápida, avisos, compartir → importar, QR + "Mostrar frase" para conectar celular ↔ PC, Gastos del más nuevo al más viejo, ingresos anotados suman a "Plata hasta cobrar", pestaña "Viajes y ahorros".
- Transferencias recibidas ("te transfirió $ X"): se anotan solas como ingreso extra del mes (aviso "Te entraron $ X" con Deshacer); si el aviso no trae el importe, aviso "¿Cuánto te entró?" (Anotar / No registrar) y queda en "Detectados para revisar". El sueldo acreditado, rendimientos y devoluciones NO se anotan solos (el sueldo va con los movimientos del banco). Lógica en `analyzer.ts`/`ingest.ts`/`quick.ts`; espejo nativo en `Analisis.java`/`LectorNotificaciones.java`/`Avisos.java`.
- Quitado: modo pareja (sincronización con Antonella, planilla compartida, celular de prueba). Compartidos volvió a gastos del hogar con ½ y Sancor.
- Limpieza 03/11/2026: código muerto, scripts de íconos rotos, `jsdom`, zip viejo y maquetas del modo pareja eliminados; arranque 671 KB → 389 KB.
- Duplicados (03/11/2026): `repararDuplicados` (`src/db/repo.ts`) corre al abrir la app y después de cada sincronización. Junta el mismo documento subido dos veces (mismo hash), la misma compra en cuotas o el mismo préstamo (`samePlan` en `obligations.ts`: misma entidad, cantidad de cuotas, mes de inicio ±1, concepto parecido e importe ±15 %; nunca dos líneas del mismo documento) y el mismo resumen de tarjeta (entidad, mes y total). Queda la copia con más cuotas pagadas; las demás se marcan como eliminadas, sin borrarse. Al importar, "Considerar pagadas las cuotas anteriores" viene tildado: el resumen nuevo deja la deuda en la cuota que figura.
- Capturas/extractos de cuenta (Ualá, banco): una línea con el mismo importe y fecha (±2 días) que un gasto ya cargado de cualquier forma (otra captura, widget, aviso, a mano) se marca "Ya está cargado" y no se importa. Cada ingreso ya anotado (sueldo o extra) cubre una sola línea del mismo importe en el mes.
- Video/capturas de Ualá (`walletMovements.ts`, `allMonths`): se proponen los movimientos de todos los meses que muestra; las transferencias recibidas de terceros se anotan como ingreso extra del mes (con `at` = fecha de la transferencia), salvo las que ya estaban anotadas. Rendimientos, devoluciones y movimientos entre cuentas propias no.
- Deudas: al resumen de la tarjeta se le restan solo las cuotas de la tarjeta (`onCardOf`: vinieron en un resumen o no son préstamos), nunca los préstamos personales. Cuadro "Este mes pagás" (`monthToPay`, Entidades.tsx): por entidad, el resumen por su total ("Incluye …" sus cuotas) y cada préstamo aparte con su vencimiento, más el total del mes.
- Textos neutros (sin "pareja"): `otherPerson(partnerName)` en `expenses.ts` devuelve el nombre configurado o "la otra persona"; botón "½ a medias". Lista de "Este mes": la cuota de un préstamo que todavía no venció queda pendiente ("Pagar la cuota … — Vence el …" con "Ya la pagué"); la tilde verde es solo para lo pagado.
- Viajes y ahorros: la proyección y "Cuánto podés ahorrar" cuentan desde el mes que viene hasta el mes del viaje inclusive (abril cuenta: ese sueldo se cobra antes); lo aportado en el mes en curso ya cuenta como ahorrado. Cuadro de respuesta unificado: te faltan / necesitás por mes / podés ahorrar por mes (promedio, mín–máx del día a día) / planeaste, con botón "Planear $ X por mes". Si mínimo = máximo se muestra un solo número.
- "Preguntale a Brote" (Más → `#/preguntas`, `src/domain/asistente.ts` + `Asistente.tsx`): sin IA ni internet. `liveAnswers` responde con tus números (misma lógica de cada pantalla) y `GUIDE` explica cada parte de la app; `searchAnswers` busca por palabras. Al agregar o cambiar una función, sumar/actualizar su entrada en `GUIDE`.
- Subir documento: la explicación de formatos y la opción de OCR se muestran hasta tocar "Entendido, no mostrar más" (localStorage `brote.importar.intro`); después quedan en "Formatos y opciones".
- Consumos de la app de la tarjeta ("Tus consumos") subidos después del resumen: lo que ya vino en un resumen (pagado con tarjeta, mismo importe, ±2 días) se marca "Ya está cargado". `repararDuplicados` también quita provisorios que coinciden con un gasto de tarjeta ya confirmado (mismo importe, ±3 días, misma tarjeta).
- Captura "Tarjeta de crédito → Saldo a pagar" (Ualá y similares; `cardBalance.ts`, antes de los demás lectores salvo "Tus consumos"): se carga como resumen del mes con el total, cierre y vencimiento, sin consumos. Si solo se ve la marca (Visa/Mastercard), la entidad sale del nombre del archivo o queda Ualá.
- ARCA y facturas (`src/importers/facturas.ts`, `BillImport.tsx`): el PDF "Cuenta corriente monotributistas" (CCMA) carga/actualiza la deuda "ARCA · Monotributo" (fingerprint `arca|monotributo`) como saldo sin cuotas (`isBalanceOnly`: suma en Deudas, no en "Este mes pagás"); un PDF con fecha anterior no pisa el saldo. La factura de Claro se anota como gasto personal (Telefonía) del mes del vencimiento, sin repetirse (huella por N.º de factura), y si no está pagada aparece en Pendientes con "Ya lo pagué". El usuario sube los dos cada mes.
- Ciclo del día a día (`src/domain/payday.ts`): va de cobro a cobro; el cobro es el N-ésimo día hábil (Configuración, por defecto 4.º; feriados nacionales fijos + Carnaval y Semana Santa) o la fecha cargada para ese mes (Presupuesto → "Cobré el"). Solo los gastos `cotidiano` de efectivo/débito/transferencia van por fecha de ciclo (`dailyOccurrencesForMonth`); tarjeta, fijos y cuotas siguen por mes. Este mes muestra el ciclo activo (hasta cobrar, el anterior).
- "Cuánto necesito" (Deudas → `#/necesito`, `src/domain/necesito.ts`): resúmenes por su total, préstamos, facturas sin pagar y lo vencido; ARCA aparte y opcional (`settings.arcaMonthly`, por defecto $ 100.000, nunca más que el saldo); compara con la plata anotada.
- Devoluciones (Gastos → `#/devoluciones`, `src/domain/refunds.ts`, `Devoluciones.tsx`): `Expense.refund` = gasto que te devuelven (el hospital, en efectivo). Pendiente: no cuenta en el mes ni en el presupuesto (`netOfRefund` en `occurrenceFor`) y sale de la lista de Gastos, pero sí baja la plata hasta cobrar; "Me devolvieron" (en lote, reparte si pagan distinto) lo devuelve a la plata (`cash.returned`), nunca como ingreso. Botón "Me devuelven" en Gastos (un toque con `settings.refundFrom`), ticket a mano con foto (solo local, no se lee) y "Me lo devuelven" en Detectados para revisar.
- Ideas: `docs/ideas-pendientes.md`.
