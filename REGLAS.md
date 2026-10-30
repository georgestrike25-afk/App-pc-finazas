# Reglas de liquidación — Control de cobros y horas

Documento base para la app. Resume cómo se calcula lo que debería cobrar cada mes.
Los puntos marcados con ❓ están pendientes de confirmar con el primer recibo.

## 1. Plataforma

- PWA (app web instalable): una sola app para **Android y PC**.
- Login con cuenta de Google: lee **Google Calendar** (fuente de las guardias) y guarda configuración, valores y recibos en el **Google Drive** del usuario.
- Todos los montos en **pesos argentinos** (`$ 1.234.567,89`).
- Hosting gratuito (GitHub Pages).

## 2. Guardias

- Todas son de **24 h, de 07:00 a 07:00** del día siguiente.
- **6 guardias por mes = 144 h = sueldo básico.** Siempre.
- Un mes con más de 6 guardias (ej.: 5 martes): la **última guardia del mes** es la extra (7.ª guardia).
- Una guardia pertenece al mes en que **empieza** (ej.: martes 31 → cuenta en ese mes).

| Día | Activa | Pasiva (simultánea) |
|---|---|---|
| Martes | Núñez 07–19, Naciones Unidas 19–07 | Núñez 19–07 |
| Sábado / domingo | Núñez 07–14, otro hospital 14–07 | Núñez 14–07 |

## 3. Horas extra (7.ª guardia)

Valor hora + recargo según el tramo:

| Tramo | Recargo |
|---|---|
| Lunes 00:00 → sábado 13:00 | +50% |
| Sábado 13:00 → lunes 00:00 | +100% |
| Feriado (todo el día) | +100% (el doble) |

Más las nocturnas (ver 5).

Ejemplos:
- 7.ª guardia martes (no feriado): 24 h al 50%.
- 7.ª guardia sábado 07 → domingo 07: 6 h al 50% + 18 h al 100%.
- 7.ª guardia domingo 07 → lunes 07: 17 h al 100% + 7 h al 50% (lunes 00–07), salvo que el lunes sea feriado.

## 4. Feriados

- Cuentan los **nacionales** y los **provinciales de Córdoba** (Córdoba capital).
- Si una guardia del **básico** cae en feriado, también se paga el **100%**.
- Nacionales: lista pública automática. Provinciales: precargados. Extraordinarios (por decreto, ej. visita del Papa): se agregan a mano desde la app.
- ❓ Feriados municipales de Córdoba capital (ej. 6 de julio): ¿se pagan?

## 5. Nocturnas

- Horario: **22:00 a 07:00** (9 h por guardia de 24 h).
- Se pagan en las guardias del básico y en las extras.
- Se pagan aparte (a confirmar con el recibo).
- ❓ Valor.
- ❓ Cuándo se cobran.

## 6. Guardias pasivas

- **No se pagan por hora:** son un **monto fijo que cubre 7 días** de pasiva en el mes.
- Pasado de 7 días, cada día de más se paga a `monto fijo / 7`.
  - Ej.: si el fijo / 7 = $1.000 y en el mes hubo 9 días de pasiva → fijo + 2 × $1.000 = fijo + $2.000.
- Las horas de pasiva (19–07 los martes, 14–07 los fines de semana) quedan registradas, pero no cambian el monto.
- ❓ ¿Puede haber días de pasiva sin guardia activa? (Con 6–7 guardias por mes no se llega a 9 días.)
- ❓ Con menos de 7 días en el mes, ¿se cobra igual el fijo completo?

## 7. Cuándo se cobra

El sueldo se cobra el **día 4** de cada mes. Para algo hecho en el mes M:

| Concepto | Se cobra |
|---|---|
| Básico (6 guardias) | 4 del mes M+1 |
| Pasivas | 4 del mes M+1 |
| 7.ª guardia (extra) | **Siempre** el 4 del mes M+2 |
| Otras horas extra sueltas (no guardia completa): hechas del 1 al 16 | 4 del mes M+1 |
| Otras horas extra sueltas: hechas del 17 en adelante | 4 del mes M+2 |
| ❓ Nocturnas | A definir |
| ❓ 100% por feriado en guardia del básico | A definir |

Ejemplo, octubre:
- Básico + pasivas de octubre → 4 de noviembre.
- 7.ª guardia de octubre (cualquier día) → 4 de diciembre.

## 8. Valores (configurables, con historial)

Cada valor se carga con una **fecha de vigencia**, para no recalcular meses viejos cuando cambia:

- Básico / valor hora: cambia con las **paritarias**.
- **Antigüedad:** 2% por año. En 0% hasta confirmar con el recibo (5 años como monotributista; primer sueldo en relación de dependencia).
- Nocturna: ❓
- Monto fijo de pasiva (7 días): ❓

Mientras no haya valores, la app calcula **en horas y días**, que ya permite controlar el recibo.

## 9. Anotación en Google Calendar

- `Guardia`: evento de 07:00 a 07:00. Los martes, como evento repetido; los fines de semana, a medida que se asignan.
- La app cuenta las guardias del mes y marca la última como extra si hay más de 6 (se puede cambiar a mano).
- Horas extra sueltas: evento `Extra` con su hora real de inicio y fin.

## 10. Recibo

- Se descarga de la web (PDF u otro formato de oficina).
- La app lo importa, reconoce los conceptos y los compara con lo calculado: debería cobrar / cobré / diferencia.
- ❓ Nombres y códigos de los conceptos: se definen con el primer recibo.
