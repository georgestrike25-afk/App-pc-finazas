import { addMonths, monthDiff, type MonthKey } from './dates';
import { splitAmount, type Cents } from './money';
import { countsByCycle, cycleMonthOf } from './payday';
import { netOfRefund } from './refunds';
import type { Expense, Frequency, Settings } from './types';

export const FREQUENCY_LABEL: Record<Frequency, string> = {
  unica: 'Única vez',
  mensual: 'Mensual',
  bimestral: 'Bimestral',
  trimestral: 'Trimestral',
  anual: 'Anual',
};

const STEP: Record<Exclude<Frequency, 'unica'>, number> = { mensual: 1, bimestral: 2, trimestral: 3, anual: 12 };

export interface ExpenseOccurrence {
  expenseId: string;
  month: MonthKey;
  concept: string;
  category: string;
  kind: Expense['kind'];
  total: Cents;
  userShare: Cents;
  partnerShare: Cents;
  userPct: number;
  paid: boolean;
  /** Ocurrencia recurrente sin importe confirmado para ese mes. */
  estimated: boolean;
  paidBy?: Expense['paidBy'];
}

/** Reparto de un gasto compartido. El redondeo garantiza que user + partner = total. */
export function splitShared(total: Cents, userPct: number): { user: Cents; partner: Cents } {
  const pct = Math.min(100, Math.max(0, userPct));
  const [user, partner] = splitAmount(total, pct);
  return { user, partner };
}

export function occurrenceFor(e: Expense, month: MonthKey): ExpenseOccurrence | null {
  if (e.deleted || e.cashOnly) return null;
  if (e.frequency === 'unica') {
    if (e.month !== month) return null;
  } else {
    if (month < e.month) return null;
    if (e.endMonth && month > e.endMonth) return null;
    if (monthDiff(e.month, month) % STEP[e.frequency] !== 0) return null;
  }
  const ov = e.overrides?.[month];
  if (ov?.skip) return null;
  // Lo que te devuelve otra persona (p. ej. el hospital) no es un gasto tuyo.
  const total = netOfRefund(ov?.amount ?? e.totalAmount, e);
  const userPct = e.kind === 'hogar' ? e.userPct : 100;
  const { user, partner } = splitShared(total, userPct);
  const isFirst = month === e.month;
  return {
    expenseId: e.id,
    month,
    concept: e.concept,
    category: e.category,
    kind: e.kind,
    total,
    userShare: user,
    partnerShare: partner,
    userPct,
    paid: ov?.paid ?? (isFirst ? e.paid : false),
    estimated: e.frequency !== 'unica' && !isFirst && ov?.amount === undefined,
    paidBy: e.paidBy,
  };
}

export function occurrencesForMonth(expenses: Expense[], month: MonthKey): ExpenseOccurrence[] {
  const out: ExpenseOccurrence[] = [];
  for (const e of expenses) {
    const o = occurrenceFor(e, month);
    if (o) out.push(o);
  }
  return out;
}

/**
 * Gastos del día a día del ciclo de ese mes (del cobro de ese mes al cobro del siguiente).
 * Los de efectivo, débito o transferencia cuentan por su fecha; los de tarjeta, en el mes del resumen.
 */
export function dailyOccurrencesForMonth(expenses: Expense[], month: MonthKey, s: Pick<Settings, 'paydayNth' | 'paydays'>): ExpenseOccurrence[] {
  const out: ExpenseOccurrence[] = [];
  for (const e of expenses) {
    if (e.deleted || e.kind !== 'cotidiano') continue;
    const o = occurrenceFor(countsByCycle(e) ? { ...e, month: cycleMonthOf(e.date, s) } : e, month);
    if (o) out.push(o);
  }
  return out;
}

/** Con quién se comparten los gastos: su nombre si está configurado, o "la otra persona". */
export function otherPerson(partnerName?: string): string {
  const n = (partnerName ?? '').trim();
  return n && n.toLowerCase() !== 'pareja' ? n : 'la otra persona';
}
export const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Saldo entre la pareja para los gastos compartidos de un mes.
 * Positivo: la pareja le debe al usuario. Negativo: el usuario le debe a la pareja.
 */
export function partnerBalance(occ: ExpenseOccurrence[]): Cents {
  let bal = 0;
  for (const o of occ) {
    // Un gasto solo tuyo que pagó la otra persona (p. ej. el alquiler del consultorio) también se le debe.
    if (o.kind !== 'hogar' && o.paidBy !== 'pareja') continue;
    if (o.paidBy === 'usuario') bal += o.partnerShare;
    else if (o.paidBy === 'pareja') bal -= o.userShare;
  }
  return bal;
}

export interface PartnerLedger {
  /** Positivo: la otra persona te debe. Negativo: le debés vos. */
  net: Cents;
  /** Lo que le fuiste pagando (o te fue pagando) para saldar. */
  payments: Expense[];
}

/**
 * Saldo acumulado con la otra persona: lo que pagó ella (o vos) y se reparte, menos los pagos que se hicieron
 * para saldar. Un gasto cuenta como deuda solo si tiene quién pagó (`paidBy`); los demás se consideran ya saldados.
 */
export function partnerLedger(expenses: Expense[], today: MonthKey): PartnerLedger {
  const live = expenses.filter((e) => !e.deleted);
  const shared = live.filter((e) => !e.settlement && (e.paidBy === 'pareja' || e.paidBy === 'usuario'));
  let net = 0;
  if (shared.length) {
    const first = shared.map((e) => e.month).sort()[0];
    for (let m = first; m <= today; m = addMonths(m, 1)) net += partnerBalance(occurrencesForMonth(shared, m));
  }
  const payments = live.filter((e) => e.settlement).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  for (const p of payments) net += p.settlement === 'a_pareja' ? p.totalAmount : -p.totalAmount;
  return { net, payments };
}

/** Momento exacto (ms) en que llegó el aviso del que salió un gasto detectado; se guarda en su huella `notif|cuenta|ms|monto`. */
export function notifMs(e: Pick<Expense, 'linkedLineFingerprints'>): number | undefined {
  for (const f of e.linkedLineFingerprints ?? []) {
    const m = f.match(/^notif\|.*\|(\d{10,})\|-?\d+$/);
    if (m) return Number(m[1]);
  }
  return undefined;
}

/** Para ordenar gastos del mismo día: cuándo pasó de verdad (la hora del aviso) y, si no la hay, cuándo se anotó. */
export const happenedAt = (e: Expense): number => notifMs(e) ?? (Date.parse(e.createdAt) || 0);

/** Hora del aviso en 24 horas ("14:03"), o undefined si el gasto no vino de un aviso. */
export function noticeClock(e: Expense): string | undefined {
  const ms = notifMs(e);
  if (ms === undefined) return undefined;
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
