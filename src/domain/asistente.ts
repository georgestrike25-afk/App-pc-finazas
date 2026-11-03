import { addMonths, formatDate, monthLabel, type MonthKey } from './dates';
import { cashStatus } from './cash';
import { savingsCapacity } from './capacity';
import { occurrencesForMonth, otherPerson, partnerBalance } from './expenses';
import { formatARS, sum, type Cents } from './money';
import { computeMonth, type DataSet } from './monthly';
import { debtByEntity, monthToPay } from './obligations';
import { goalProgress, projectGoal } from './savings';
import { normalizeText } from './text';
import type { SavingsGoal } from './types';

/**
 * "Preguntale a Brote": respuestas sin IA. Las preguntas de plata se responden con los números
 * cargados (la misma cuenta que usa cada pantalla) y el resto con la explicación de la app.
 * Todo se calcula en el dispositivo: nada sale a internet.
 */

export interface AnswerLine {
  label: string;
  amount?: Cents;
  /** Monto con signo: se muestra "−" para lo que se resta. */
  minus?: boolean;
  strong?: boolean;
}
export interface Answer {
  id: string;
  q: string;
  /** Respuesta corta, en una frase. */
  short: string;
  lines?: AnswerLine[];
  note?: string;
  href?: string;
  hrefLabel?: string;
  topic: string;
  keywords: string;
  /** Respuesta calculada con tus números. */
  live?: boolean;
}

const f = formatARS;

export function liveAnswers(data: DataSet & { goal: SavingsGoal }, today: MonthKey, todayIso: string): Answer[] {
  const out: Answer[] = [];
  const r = computeMonth(data, today, today);
  const get = (k: string) => r.sections.find((s) => s.key === k)!.total;
  const cash = cashStatus(data, todayIso);
  const debts = debtByEntity(data.obligations, today, data);
  const pay = monthToPay(debts, today, data.statements);
  const toPay = sum(pay.map((e) => e.total));
  const s = data.settings;
  const budget = s.dailyBudgetRange ?? { min: s.dailyBudgetDefault, max: s.dailyBudgetDefault };
  const dailyLeft = (b: Cents) => Math.max(0, b - r.info.dailyRegistered);
  const T = 'Tus números';

  // 1. Plata hasta cobrar
  out.push(
    cash
      ? {
          id: 'plata', topic: T, live: true, q: '¿Cuánta plata me queda hasta cobrar?', keywords: 'plata queda tengo bolsillo hasta cobrar sueldo dia disponible',
          short: `Te quedan ${f(cash.left)}${cash.perDay !== undefined && cash.days ? `: unos ${f(cash.perDay)} por día durante ${cash.days} días` : ''}.`,
          lines: [
            { label: 'Plata que anotaste', amount: cash.start },
            ...(cash.ingresos ? [{ label: 'Ingresos después de anotarla', amount: cash.ingresos }] : []),
            ...(cash.returned ? [{ label: 'Lo que te devolvieron', amount: cash.returned }] : []),
            { label: 'Gastado desde entonces (sin tarjeta de crédito)', amount: cash.spent, minus: true },
            { label: 'Te quedan', amount: cash.left, strong: true },
          ],
          note: 'Las compras con tarjeta de crédito no se restan acá: se pagan con el resumen.', href: '#/inicio', hrefLabel: 'Ir a Este mes',
        }
      : { id: 'plata', topic: T, live: true, q: '¿Cuánta plata me queda hasta cobrar?', keywords: 'plata queda tengo bolsillo hasta cobrar sueldo dia disponible', short: 'Todavía no anotaste cuánta plata tenés. Anotala en "Este mes" (¿Cuánta plata tenés hoy?) y te digo cuánto te queda por día hasta cobrar.', href: '#/inicio', hrefLabel: 'Anotar mi plata' },
  );

  // 2. Cuánto puedo juntar este mes
  {
    const base = cash ? cash.left : r.projectedAvailable + get('cotidiano') - r.info.dailyRegistered;
    // Con la plata anotada se resta lo que falta pagar; sin ella, la cuenta del mes ya descuenta las cuotas.
    const due = cash ? toPay : 0;
    const lo = base - due - dailyLeft(budget.max);
    const hi = base - due - dailyLeft(budget.min);
    const same = budget.min === budget.max;
    const short =
      hi <= 0
        ? `Este mes no te sobra: después de pagar lo que falta y el día a día quedás en ${f(same ? lo : hi)}${same ? '' : ` (gastando el mínimo) o ${f(lo)} (gastando el máximo)`}.`
        : same || lo === hi
          ? `Este mes podés juntar ${f(lo)}.`
          : lo <= 0
            ? `Este mes podés juntar hasta ${f(hi)}, si gastás el mínimo del día a día.`
            : `Este mes podés juntar entre ${f(lo)} y ${f(hi)}.`;
    out.push({
      id: 'juntar', topic: T, live: true, q: '¿Cuánto puedo juntar (ahorrar) este mes?', keywords: 'juntar ahorrar ahorro sobra reunir guardar este mes cuanto puedo',
      short,
      lines: [
        { label: cash ? 'Plata que te queda hoy' : 'Lo que te queda según lo cargado (ya con las cuotas del mes)', amount: base },
        ...(cash ? [{ label: 'Falta pagar este mes (resúmenes y cuotas)', amount: toPay, minus: true }] : []),
        { label: same ? 'Falta del día a día' : `Falta del día a día si gastás el máximo (${f(budget.max)})`, amount: dailyLeft(budget.max), minus: true },
        { label: same ? 'Te sobra' : 'Te sobra gastando el máximo', amount: lo, strong: true },
        ...(same ? [] : [{ label: `Te sobra gastando el mínimo (${f(budget.min)})`, amount: hi, strong: true }]),
      ],
      note: `Del día a día llevás gastado ${f(r.info.dailyRegistered)}. Es una estimación: si gastás más con la tarjeta, se paga en el próximo resumen.`,
      href: '#/viaje', hrefLabel: 'Ver ahorros',
    });
  }

  // 3. Qué pago este mes
  out.push({
    id: 'pagar', topic: T, live: true, q: '¿Qué tengo que pagar este mes y cuándo?', keywords: 'pagar pago vence vencimiento resumen tarjeta prestamo cuota este mes cuando',
    short: pay.length ? `Este mes pagás ${f(toPay)} en total.` : 'No tenés pagos pendientes cargados para este mes.',
    lines: pay.flatMap((e) => e.lines.map((l): AnswerLine => ({ label: `${e.group}: ${l.label}${l.due ? ` (vence ${formatDate(l.due).slice(0, 5)})` : ''}`, amount: l.amount }))).concat(pay.length ? [{ label: 'Total', amount: toPay, strong: true } as AnswerLine] : []),
    href: '#/entidades', hrefLabel: 'Ver Deudas',
  });

  // 4. Cuánto debo
  const total = sum(debts.map((d) => d.remaining));
  const end = debts.map((d) => d.lastMonth).filter(Boolean).sort().at(-1);
  out.push({
    id: 'deuda', topic: T, live: true, q: '¿Cuánto debo en total y a quién?', keywords: 'debo deuda total entidad banco patagonia naranja mercado pago prestamos cuanto',
    short: debts.length ? `Debés ${f(total)} en total${end ? ` y terminás de pagar en ${monthLabel(end)}` : ''}.` : 'No tenés deudas cargadas.',
    lines: debts.map((d) => ({ label: `${d.group}${d.lastMonth ? ` (hasta ${monthLabel(d.lastMonth)})` : ''}`, amount: d.remaining })),
    href: '#/entidades', hrefLabel: 'Ver Deudas',
  });

  // 5. Cuándo termino
  const ends = data.obligations
    .filter((o) => !o.deleted && o.status !== 'cancelada')
    .map((o) => ({ o, d: debts.find((x) => x.items.some((i) => i.ob.id === o.id))?.items.find((i) => i.ob.id === o.id)?.progress }))
    .filter((x) => x.d?.lastDueMonth)
    .sort((a, b) => a.d!.lastDueMonth!.localeCompare(b.d!.lastDueMonth!));
  out.push({
    id: 'termino', topic: T, live: true, q: '¿Cuándo termino de pagar cada deuda?', keywords: 'termino terminar fin ultima cuota libre deudas cuando',
    short: end ? `Quedás libre de deudas en ${monthLabel(end)}.` : 'No tenés deudas con fecha de fin.',
    lines: ends.map(({ o, d }) => ({ label: `${o.concept}: ${monthLabel(d!.lastDueMonth!)} (faltan ${d!.remainingCount})`, amount: d!.remainingTotal })),
    href: '#/deudas', hrefLabel: 'Ver préstamos y tarjetas',
  });

  // 6. Viaje
  const g = data.goal;
  if (g.estimatedCost > 0) {
    const p = projectGoal(data, g, today, g.scenarios.find((x) => x.key === 'intermedio') ?? g.scenarios[0]);
    const cap = savingsCapacity(data, today).months.filter((m) => m.month <= g.targetMonth);
    const avgLo = cap.length ? Math.round(sum(cap.map((m) => Math.max(0, m.saveLow))) / cap.length) : 0;
    const avgHi = cap.length ? Math.round(sum(cap.map((m) => Math.max(0, m.saveHigh))) / cap.length) : 0;
    const verdict = p.reachable ? 'Sí, llegás con lo que planeás ahorrar.' : avgLo >= p.requiredMonthly ? 'Podés llegar: te alcanza, pero planeaste ahorrar menos de lo necesario.' : avgHi >= p.requiredMonthly ? 'Podés llegar si gastás cerca del mínimo del día a día.' : 'Con tus números, no llegás.';
    out.push({
      id: 'viaje', topic: T, live: true, q: `¿Llego al viaje de ${monthLabel(g.targetMonth)}?`, keywords: 'viaje llego alcanza ahorro meta objetivo abril',
      short: verdict,
      lines: [
        { label: 'Cuesta', amount: g.estimatedCost },
        { label: 'Ya tenés', amount: goalProgress(g) },
        { label: 'Te faltan', amount: p.missing, strong: true },
        { label: `Necesitás por mes (${p.monthsRemaining} meses)`, amount: p.requiredMonthly },
        { label: avgLo === avgHi ? 'Podés ahorrar por mes' : `Podés ahorrar por mes (de ${f(avgLo)} a ${f(avgHi)})`, amount: avgLo },
        { label: 'Planeaste por mes', amount: g.plannedMonthlyContribution },
      ],
      href: '#/viaje', hrefLabel: 'Ver Viajes y ahorros',
    });
  }

  // 7. Gastos del mes
  const occ = occurrencesForMonth(data.expenses.filter((e) => !e.deleted), today);
  const byCat = new Map<string, Cents>();
  for (const o of occ) byCat.set(o.category, (byCat.get(o.category) ?? 0) + o.userShare);
  const cats = [...byCat.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  const spent = get('fijos') + get('personales') + get('cotidiano');
  out.push({
    id: 'gastos', topic: T, live: true, q: '¿Cuánto gasté este mes y en qué?', keywords: 'gaste gasto gastos categoria en que este mes cuanto',
    short: `Este mes gastaste ${f(spent)} (tu parte, sin contar cuotas).`,
    lines: cats.map(([c, v]) => ({ label: c, amount: v })),
    href: '#/gastos', hrefLabel: 'Ver Gastos',
  });

  // 8. Día a día
  out.push({
    id: 'diaadia', topic: T, live: true, q: '¿Cuánto llevo del día a día?', keywords: 'dia a dia presupuesto cotidiano comida super llevo me queda gastar',
    short: `Llevás ${f(r.info.dailyRegistered)} de ${budget.min === budget.max ? f(budget.max) : `${f(budget.min)} a ${f(budget.max)}`}.`,
    lines: [
      { label: 'Gastado del día a día', amount: r.info.dailyRegistered },
      { label: 'Te queda (hasta el máximo)', amount: dailyLeft(budget.max), strong: true },
    ],
    href: '#/presupuesto', hrefLabel: 'Ver Presupuesto',
  });

  // 9. Ingresos
  out.push({
    id: 'ingresos', topic: T, live: true, q: '¿Cuánto me entró este mes?', keywords: 'ingreso ingresos entro cobre sueldo transferencias recibidas',
    short: r.incomeStatus === 'sin_cargar' ? 'Todavía no hay ingresos cargados este mes.' : `Este mes te entraron ${f(get('ingresos'))}.`,
    lines: r.sections.find((x) => x.key === 'ingresos')!.lines.map((l) => ({ label: l.label, amount: l.amount })),
    href: '#/ingresos', hrefLabel: 'Ver Ingresos',
  });

  // 10. Compartidos y Sancor
  const bal = partnerBalance(occurrencesForMonth(data.expenses.filter((e) => !e.deleted && e.kind === 'hogar'), today));
  const who = otherPerson(s.partnerName);
  out.push({
    id: 'compartidos', topic: T, live: true, q: '¿Cuánto me deben de los compartidos y de Sancor?', keywords: 'compartidos medias deben debo sancor devolver reintegro mitad',
    short: `${bal === 0 ? 'Los compartidos de este mes están a mano' : bal > 0 ? `De los compartidos, ${who} te debe ${f(bal)}` : `De los compartidos, le debés ${f(-bal)} a ${who}`}${r.info.sancorPending ? `; de Sancor te tienen que devolver ${f(r.info.sancorPending)}` : ''}.`,
    href: '#/compartidos', hrefLabel: 'Ver Compartidos',
  });

  // 11. El mes que viene
  const next = savingsCapacity(data, today).months[0];
  if (next && next.income > 0)
    out.push({
      id: 'proximo', topic: T, live: true, q: `¿Cuánto voy a poder ahorrar en ${monthLabel(addMonths(today, 1))}?`, keywords: 'mes que viene proximo siguiente ahorrar sobra',
      short: next.saveLow === next.saveHigh ? `Unos ${f(Math.max(0, next.saveLow))}.` : `Entre ${f(Math.max(0, next.saveLow))} y ${f(Math.max(0, next.saveHigh))}.`,
      lines: [
        { label: 'Sueldo', amount: next.income },
        { label: 'Cuotas y deudas', amount: next.debts, minus: true },
        { label: `Gastos fijos${next.fixedEstimated ? ' (estimados)' : ''}`, amount: next.fixed, minus: true },
        { label: budget.min === budget.max ? 'Día a día' : `Día a día (${f(budget.min)} a ${f(budget.max)})`, amount: budget.max, minus: true },
      ],
      href: '#/viaje', hrefLabel: 'Ver Ahorros',
    });

  return out;
}

/** Cómo funciona cada cosa de la app. */
export const GUIDE: Answer[] = [
  // Este mes
  { id: 'g-quedan', topic: 'Este mes', q: '¿Qué es "Te quedan este mes"?', keywords: 'te quedan resultado mes cuenta', short: 'Es lo que entró en el mes menos lo que gastaste (tu parte) menos las cuotas y préstamos del mes. Solo cuenta lo ya cargado.', href: '#/resumen', hrefLabel: 'Ver Detalle del mes' },
  { id: 'g-plata', topic: 'Este mes', q: '¿Para qué sirve anotar "¿Cuánta plata tenés hoy?"', keywords: 'plata hasta cobrar anotar cuanta plata tenes hoy', short: 'Anotás lo que tenés en el bolsillo y en las cuentas. Desde ahí la app resta lo que gastás (menos lo de tarjeta de crédito, que va al resumen) y suma lo que te entra, y te dice cuánto podés gastar por día hasta cobrar. Volvé a anotarla cuando cobres.', href: '#/inicio', hrefLabel: 'Ir a Este mes' },
  { id: 'g-segun', topic: 'Este mes', q: '¿Qué es "Según lo cargado este mes" y por qué no coincide con mi plata?', keywords: 'segun lo cargado no coincide diferencia ajuste gastos sin detalle', short: 'Es la cuenta del mes con lo que cargaste. Si no coincide con tu plata real es porque falta anotar algún gasto. Podés tocar "Anotar la diferencia" para que se cargue como "gastos sin detalle".' },
  { id: 'g-pendientes', topic: 'Este mes', q: '¿Qué es la lista de Pendientes?', keywords: 'pendientes lista tilde check verde ya lo pague', short: 'Lo que falta hacer en el mes: cargar el sueldo, pagar resúmenes y cuotas, registrar lo de Sancor, hacer la copia. El círculo vacío es pendiente; la tilde verde es hecho o pagado. "Ya lo pagué" marca un pago sin subir comprobante.' },
  { id: 'g-flechas', topic: 'Este mes', q: '¿Cómo veo otro mes?', keywords: 'otro mes anterior flechas cambiar mes', short: 'Con las flechas de arriba (‹ ›) en Este mes, Gastos, Ingresos y Compartidos.' },
  // Gastos
  { id: 'g-anotar', topic: 'Gastos', q: '¿Cómo anoto un gasto?', keywords: 'anotar gasto cargar nuevo agregar efectivo transferencia', short: 'En Gastos tocá "+ Anotar gasto", o usá la anotación rápida (widget o el botón de la notificación). Lo que pagás con tarjeta de crédito no hace falta: llega solo con el resumen.', href: '#/gastos', hrefLabel: 'Ir a Gastos' },
  { id: 'g-tarjeta', topic: 'Gastos', q: '¿Tengo que anotar lo que pago con tarjeta?', keywords: 'tarjeta credito anotar resumen compra duplicado', short: 'No hace falta. Llega con el resumen. Si igual lo anotaste, cuando subís el resumen se vincula (mismo importe, ±5 días) y no se cuenta dos veces.' },
  { id: 'g-medias', topic: 'Gastos', q: '¿Qué hace el botón "½ a medias"?', keywords: 'medias mitad compartido boton dividir', short: 'Pasa el gasto a compartido 50 %: lo pagaste vos entero y te devuelven la mitad. Se cuenta solo tu parte. Tocándolo de nuevo vuelve a ser solo tuyo.', href: '#/gastos', hrefLabel: 'Ir a Gastos' },
  { id: 'g-repite', topic: 'Gastos', q: '¿Qué es un gasto que se repite?', keywords: 'repite fijo mensual alquiler internet recurrente', short: 'Para gastos fijos (alquiler, internet): se cargan solos todos los meses. Si un mes cambia el importe, lo corregís ese mes.' },
  { id: 'g-categorias', topic: 'Gastos', q: '¿Qué son "fijos", "personales" y "día a día"?', keywords: 'fijos personales cotidiano dia a dia tipo categoria', short: 'Fijos: los del hogar y los que se repiten. Personales: los tuyos que no son del día a día. Día a día: comida, transporte, salidas, súper; contra eso se compara el presupuesto.' },
  // Ingresos
  { id: 'g-sueldo', topic: 'Ingresos', q: '¿Cómo cargo el sueldo?', keywords: 'sueldo cargar ingreso cobrar acreditado', short: 'Subí la captura de los movimientos del banco (se detecta solo) o cargalo a mano en Ingresos. El sueldo no se anota solo con la notificación.', href: '#/ingresos', hrefLabel: 'Ir a Ingresos' },
  { id: 'g-transf', topic: 'Ingresos', q: '¿Las transferencias que me hacen se anotan solas?', keywords: 'transferencia recibida te entraron ingreso extra aviso notificacion', short: 'Sí: con el aviso del banco ("te transfirió $ X") se anotan como ingreso extra del mes y te llega "Te entraron $ X" con Deshacer. Si el aviso no dice el importe, te pregunta "¿Cuánto te entró?". Rendimientos y devoluciones no se anotan.' },
  // Deudas
  { id: 'g-entidad', topic: 'Deudas', q: '¿Qué es "Deuda por entidad"?', keywords: 'deuda por entidad banco total', short: 'Cuánto le debés en total a cada banco o billetera (préstamos, cuotas, planes, resúmenes sin pagar y consumos del próximo resumen) y cuándo terminás.', href: '#/entidades', hrefLabel: 'Ir a Deudas' },
  { id: 'g-estemes', topic: 'Deudas', q: '¿Qué es "Este mes pagás"?', keywords: 'este mes pagas total mes vencimiento', short: 'Lo que tenés que pagar este mes a cada entidad: el resumen de la tarjeta por su total (con las cuotas que trae adentro) y cada préstamo aparte con su vencimiento, más el total del mes.' },
  { id: 'g-sincuotas', topic: 'Deudas', q: '¿Por qué el resumen dice "sin contar sus cuotas"?', keywords: 'sin contar sus cuotas resumen restan duplicar', short: 'Las compras en cuotas de la tarjeta tienen su propio renglón. Para no contarlas dos veces, el renglón del resumen muestra el resto. Resumen + sus cuotas = total a pagar. Los préstamos personales no se restan: se pagan aparte.' },
  { id: 'g-ultpago', topic: 'Deudas', q: '¿Qué es "Último pago en…"?', keywords: 'ultimo pago fin termina libre', short: 'El mes de la última cuota que tenés cargada con esa entidad: desde el mes siguiente no le debés nada (salvo lo que compres nuevo).' },
  { id: 'g-yapague', topic: 'Deudas', q: '¿Cómo marco una cuota como pagada?', keywords: 'marcar pagada cuota ya la pague pago prestamo', short: 'En Este mes, en Pendientes, tocá "Ya la pagué". O subí la captura de los movimientos del banco: el débito marca la cuota sola. En "Préstamos y tarjetas" → "Ver cuotas" podés corregir una cuota marcada por error.' },
  { id: 'g-mensual', topic: 'Deudas', q: '¿Qué muestra "Cuotas por mes"?', keywords: 'cuotas por mes grafico futuras', short: 'Cuánto vas a pagar de cuotas cada mes que viene, por entidad. Cuando una deuda termina, la barra baja: esa plata te queda libre.', href: '#/cuotas', hrefLabel: 'Ver Cuotas por mes' },
  // Subir documentos
  { id: 'g-subir', topic: 'Subir documentos', q: '¿Qué documentos puedo subir?', keywords: 'subir importar documento pdf captura video resumen cronograma', short: 'Resúmenes de tarjeta (PDF), cronogramas de préstamos, capturas o video de los movimientos (Ualá, banco), capturas o video de "Tus consumos" de la app de la tarjeta, el plan de Mercado Pago y el historial de Mis Finanzas. Nada se guarda hasta que tocás Confirmar.', href: '#/importar', hrefLabel: 'Subir documento' },
  { id: 'g-duplicado', topic: 'Subir documentos', q: '¿Qué pasa si subo dos veces lo mismo?', keywords: 'duplicado dos veces repetido mismo resumen ya esta cargado', short: 'No se duplica. Las líneas que ya están se marcan "Ya está cargado" y no se importan. Si el resumen nuevo trae la cuota siguiente (por ejemplo 10 de 10), actualiza la misma deuda. Si quedó algo repetido de antes, la app lo limpia sola al abrir.' },
  { id: 'g-ual', topic: 'Subir documentos', q: '¿Cómo subo los movimientos de Ualá?', keywords: 'uala video captura movimientos billetera mis movimientos', short: 'Grabá un video (o sacá capturas) de "Mis movimientos" bajando despacio y subilo. Se proponen los movimientos de todos los meses que aparecen; lo ya cargado se omite y las transferencias que te hicieron se suman como ingreso.' },
  { id: 'g-compartir', topic: 'Subir documentos', q: '¿Puedo mandar un PDF desde otra app?', keywords: 'compartir share whatsapp gmail enviar pdf', short: 'Sí: en el celular usá "Compartir" desde el mail, WhatsApp o el banco y elegí Brote. Se abre directo para importarlo.' },
  // Viajes y ahorros
  { id: 'g-necesitas', topic: 'Viajes y ahorros', q: '¿Cómo se calcula cuánto necesito ahorrar por mes?', keywords: 'necesitas ahorrar por mes viaje calculo', short: 'Lo que falta para el costo del viaje (descontando lo que ya tenés) dividido por los meses desde el que viene hasta el del viaje, inclusive.', href: '#/viaje', hrefLabel: 'Ir a Viajes y ahorros' },
  { id: 'g-podes', topic: 'Viajes y ahorros', q: '¿Cómo se calcula cuánto puedo ahorrar cada mes?', keywords: 'podes ahorrar cada mes capacidad calculo sueldo fijos dia a dia', short: 'Sueldo − cuotas y deudas del mes − gastos fijos − día a día. Sale un rango: gastando el máximo y el mínimo del día a día.' },
  { id: 'g-liberan', topic: 'Viajes y ahorros', q: '¿Qué significa "se liberan"?', keywords: 'se liberan liberado plata libre deudas terminan', short: 'Cuánto menos pagás de deudas ese mes comparado con el primer mes de la lista, porque se terminaron cuotas o préstamos. Ya está incluido en lo que podés ahorrar: no se suma aparte.' },
  { id: 'g-aprox', topic: 'Viajes y ahorros', q: '¿Qué significa el "≈" al lado de un monto?', keywords: 'aproximado estimado simbolo promedio', short: 'Que es estimado: por ejemplo, los gastos fijos de un mes que todavía no está cargado salen del promedio de los últimos meses.' },
  { id: 'g-minmax', topic: 'Viajes y ahorros', q: '¿Dónde pongo el mínimo y el máximo del día a día?', keywords: 'minimo maximo dia a dia presupuesto cambiar datos', short: 'En Ahorros, en "Cuánto podés ahorrar cada mes", tocá "Cambiar datos": ahí están el sueldo y el mínimo y máximo del día a día. Después tocá "Calcular".', href: '#/viaje', hrefLabel: 'Ir a Ahorros' },
  { id: 'g-aporte', topic: 'Viajes y ahorros', q: '¿Cómo anoto que separé plata para el viaje?', keywords: 'aporte separar guardar viaje registrar ahorro', short: 'En Viajes y ahorros, en "Aportes", poné el importe y la fecha y tocá Agregar. Cuenta como ya ahorrado.', href: '#/viaje', hrefLabel: 'Ir a Viajes y ahorros' },
  // Compartidos
  { id: 'g-compart', topic: 'Compartidos', q: '¿Cómo funcionan los gastos compartidos?', keywords: 'compartidos hogar alquiler mitad quien pago debe', short: 'Son gastos que dividís con otra persona. En cada uno elegís qué parte es tuya (por defecto 50 %) y quién lo pagó; arriba ves quién le debe a quién. Solo se cuenta tu parte.', href: '#/compartidos', hrefLabel: 'Ir a Compartidos' },
  { id: 'g-sancor', topic: 'Compartidos', q: '¿Cómo funciona lo de Sancor Salud?', keywords: 'sancor salud cupon reintegro devolver', short: 'La tarjeta te cobra la cuota entera; te devuelven la parte que no es tuya. En Compartidos ves cuánto te tienen que devolver y anotás cuando te lo dan.' },
  // Celular y PC
  { id: 'g-sync', topic: 'Celular y PC', q: '¿Cómo conecto el celular con la PC?', keywords: 'sincronizar conectar pc celular qr frase wifi', short: 'En la PC, Copias y sincronización muestra un QR. En el celular, Copias → "Escanear el QR de la PC" y poné la misma frase. Con los dos en el mismo wifi se sincronizan solos.', href: '#/copias', hrefLabel: 'Ir a Copias' },
  { id: 'g-frase', topic: 'Celular y PC', q: 'Me olvidé la frase de sincronización', keywords: 'frase olvide contraseña mostrar frase', short: 'En Copias y sincronización tocá "Mostrar frase" (en la PC o en el celular que ya está conectado).' },
  { id: 'g-sinsync', topic: 'Celular y PC', q: '¿Qué significa "Sin sincronizar"?', keywords: 'sin sincronizar arriba amarillo estado', short: 'Que el celular no pudo hablar con la PC (la PC apagada o en otra red). No se pierde nada: cuando estén en el mismo wifi se ponen al día solos.' },
  { id: 'g-copia', topic: 'Celular y PC', q: '¿Cómo hago una copia de seguridad?', keywords: 'copia seguridad backup guardar archivo restaurar', short: 'En Copias y sincronización tocá "Descargar copia" (podés ponerle contraseña). Hacé una por mes. Con "Restaurar" la recuperás.', href: '#/copias', hrefLabel: 'Ir a Copias' },
  { id: 'g-actualizar', topic: 'Celular y PC', q: '¿Cómo actualizo la app sin perder datos?', keywords: 'actualizar apk instalar encima perder datos', short: 'Instalá el APK nuevo encima del que tenés, sin desinstalar (desinstalar borra los datos del celular). En la PC, el instalador nuevo se instala encima y usa la misma carpeta de datos.' },
  // Avisos
  { id: 'g-avisos', topic: 'Avisos', q: '¿Cómo lee la app las notificaciones del banco?', keywords: 'notificaciones avisos leer banco permiso automatico', short: 'Con el permiso de "Acceso a notificaciones", Brote lee los avisos de compras y transferencias y los anota (o te pregunta). Todo queda en el celular. Se configura en Más → Notificaciones.' },
  { id: 'g-widget', topic: 'Avisos', q: '¿Cómo uso el widget?', keywords: 'widget anotar rapido pantalla inicio', short: 'Agregá el widget de Brote a la pantalla de inicio del celular: tocás, ponés el importe y listo, sin abrir la app.' },
  { id: 'g-privado', topic: 'Avisos', q: '¿Mis datos salen del celular?', keywords: 'privacidad datos internet nube seguro', short: 'No. Todo se guarda en el celular y en tu PC; la sincronización va cifrada por tu wifi. Las preguntas de acá también se responden en el celular.' },
];

/** Busca las respuestas que mejor coinciden con lo que escribiste. */
export function searchAnswers(all: Answer[], text: string): Answer[] {
  const words = normalizeText(text).split(/[^a-z0-9ñ]+/).filter((w) => w.length >= 3 && !STOP.has(w));
  if (!words.length) return [];
  const scored = all.map((a) => {
    const hay = normalizeText(`${a.q} ${a.keywords} ${a.topic}`).split(/[^a-z0-9ñ]+/);
    let score = 0;
    for (const w of words) if (hay.some((h) => h === w)) score += 2;
    else if (hay.some((h) => h.length >= 4 && (h.startsWith(w.slice(0, 4)) || w.startsWith(h.slice(0, 4))))) score += 1;
    return { a, score: score + (a.live ? 0.5 : 0) };
  });
  return scored.filter((x) => x.score >= 1.5).sort((x, y) => y.score - x.score).map((x) => x.a).slice(0, 6);
}
const STOP = new Set(['que', 'como', 'cuanto', 'cuanta', 'para', 'por', 'con', 'los', 'las', 'del', 'una', 'uno', 'mis', 'esta', 'este', 'esto', 'donde', 'cual', 'puedo', 'tengo', 'hago', 'sirve', 'significa', 'cuando']);
