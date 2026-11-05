import type { MonthKey } from './dates';
import { sum, type Cents } from './money';
import type { DataSet } from './monthly';
import { buildSchedule, debtByEntity, monthToPay } from './obligations';

/** Huella de la deuda con ARCA (monotributo): una sola, que se actualiza con cada PDF. */
export const ARCA_FINGERPRINT = 'arca|monotributo';

/** Cuánto se piensa pagar a ARCA por mes si no se indicó otra cosa ($ 100.000). */
export const ARCA_DEFAULT_MONTHLY: Cents = 10_000_000;

export interface NeedLine {
  label: string;
  detail?: string;
  /** Vencimiento ('YYYY-MM-DD'), si se conoce. */
  due?: string;
  amount: Cents;
  /** Venció en un mes anterior y sigue sin pagarse. */
  overdue?: boolean;
  estimated?: boolean;
}
export interface NeedGroup {
  group: string;
  total: Cents;
  lines: NeedLine[];
}
export interface Need {
  month: MonthKey;
  groups: NeedGroup[];
  /** Todo lo que hay que pagar ese mes, sin ARCA. */
  total: Cents;
  /** Parte del total que venció antes y sigue sin pagar. */
  overdue: Cents;
  /** Deuda con ARCA (monotributo): opcional, va aparte. */
  arca?: { balance: Cents; plan: Cents; paid: Cents };
  totalWithArca: Cents;
}

/**
 * Cuánto hay que tener en un mes para pagar todas las deudas: resúmenes de tarjeta por su total (con las
 * cuotas que traen), préstamos y planes aparte, facturas de servicios sin pagar y lo vencido que quedó
 * de antes. La deuda con ARCA (monotributo) es opcional y se muestra aparte, con el monto que se piensa pagar.
 */
const key = (l: NeedLine) => (l.overdue ? '0' : l.due ?? '9');

export function needForMonth(data: DataSet, month: MonthKey, today: MonthKey): Need {
  const debts = debtByEntity(data.obligations, today, data);
  const byGroup = new Map<string, NeedLine[]>();
  const push = (g: string, l: NeedLine) => byGroup.set(g, [...(byGroup.get(g) ?? []), l]);
  for (const e of monthToPay(debts, month, data.statements)) for (const l of e.lines) push(e.group, { label: l.label, detail: l.detail, due: l.due, amount: l.amount, estimated: l.estimated });

  if (month === today) {
    // Cuotas de meses anteriores que nunca se marcaron como pagadas.
    for (const d of debts)
      for (const { ob } of d.items)
        for (const i of buildSchedule(ob, today))
          if (i.status === 'vencida' && i.month < month) push(d.group, { label: ob.concept, detail: `Cuota ${i.n}${i.total ? ` de ${i.total}` : ''} (venció en ${i.month.split('-').reverse().join('/')})`, amount: i.amount ?? 0, overdue: true, estimated: i.estimated });
  }

  // Facturas de servicios subidas (Claro…) sin pagar.
  for (const e of data.expenses) {
    if (e.deleted || e.paid || e.source !== 'importado' || !/^Factura /.test(e.notes ?? '')) continue;
    if (e.month === month || (month === today && e.month < month))
      push('Facturas de servicios', { label: e.concept, detail: e.month < month ? 'Venció en un mes anterior' : undefined, due: e.date, amount: e.totalAmount, overdue: e.month < month });
  }

  const groups: NeedGroup[] = [...byGroup.entries()]
    // Lo vencido primero; después por fecha de vencimiento.
    .map(([group, lines]) => ({ group, lines: [...lines].sort((a, b) => key(a).localeCompare(key(b))) }))
    .map((g) => ({ ...g, total: sum(g.lines.map((l) => l.amount)) }))
    .sort((a, b) => key(a.lines[0]).localeCompare(key(b.lines[0])));
  const total = sum(groups.map((g) => g.total));
  const overdue = sum(groups.flatMap((g) => g.lines.filter((l) => l.overdue).map((l) => l.amount)));

  const arcaDebt = data.obligations.find((o) => !o.deleted && o.fingerprint === ARCA_FINGERPRINT && (o.knownBalance ?? 0) > 0);
  const arca = arcaDebt ? { balance: arcaDebt.knownBalance!, plan: Math.min(arcaDebt.knownBalance!, data.settings.arcaMonthly ?? ARCA_DEFAULT_MONTHLY), paid: data.settings.arcaPaid?.[month] ?? 0 } : undefined;
  return { month, groups, total, overdue, arca, totalWithArca: total + (arca ? Math.max(0, arca.plan - arca.paid) : 0) };
}
