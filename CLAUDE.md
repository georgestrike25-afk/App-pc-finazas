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
- Pruebas: `tests/unit` (Vitest), `tests/e2e` (Playwright sobre la compilación). `tests/local/` está en .gitignore (pruebas con datos reales / Electron con xvfb).

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
- Ideas: `docs/ideas-pendientes.md`.
