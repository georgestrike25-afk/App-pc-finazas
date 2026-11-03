# CLAUDE.md — Memoria del proyecto

App para controlar lo que el usuario (médico de guardias, Córdoba capital) debería cobrar por guardias, horas extra, nocturnas y pasivas, y compararlo con el recibo de sueldo.

## Documentos
- `REGLAS.md`: reglas de liquidación confirmadas. **Fuente de verdad del cálculo.**
- `DUDAS.md`: preguntas pendientes (numeradas). Al resolverse, marcar `[x]` y pasar la regla a `REGLAS.md`.

## Estado actual
- Fase: **análisis terminado, sin código todavía.**
- Esperando el primer recibo de sueldo para cerrar valores y conceptos (ver `DUDAS.md`).

## Decisiones tomadas
- Plataforma: **PWA** (Android + PC), hosting en GitHub Pages.
- Fuente de datos: **Google Calendar** (eventos `Guardia`, `Extra`, `Pasiva`, `Vacaciones`, `Licencia`).
- Persistencia y sincronización: Google Drive del usuario (login Google).
- Moneda: ARS, formato `$ 1.234.567,89`.
- Valores con **historial por fecha de vigencia** (paritarias).
- Mientras no haya valores, calcular en horas y días.

## Plan por etapas
1. Configuración + importación de Calendar + cálculo esperado por mes de cobro.
2. Importación del recibo (PDF/ofimática) y comparación.
3. Historial y alertas de diferencias.

## Stack / comandos
- Sin definir todavía (se decide al iniciar la etapa 1).

## Convenciones
- Idioma de la UI, los documentos y los commits: español.
- Rama de trabajo: `claude/app-control-cobros-horas-5fgm2u`.
