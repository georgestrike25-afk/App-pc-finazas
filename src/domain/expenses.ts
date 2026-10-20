import { monthDiff, type MonthKey } from './dates';
import { splitAmount, type Cents } from './money';
import type { Expense, Frequency } from './types';

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
  if (e.deleted) return null;
  if (e.frequency === 'unica') {
    if (e.month !== month) return null;
  } else {
    if (month < e.month) return null;
    if (e.endMonth && month > e.endMonth) return null;
    if (monthDiff(e.month, month) % STEP[e.frequency] !== 0) return null;
  }
  const ov = e.overrides?.[month];
  if (ov?.skip) return null;
  const total = ov?.amount ?? e.totalAmount;
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
 * Saldo entre la pareja para los gastos compartidos de un mes.
 * Positivo: la pareja le debe al usuario. Negativo: el usuario le debe a la pareja.
 */
export function partnerBalance(occ: ExpenseOccurrence[]): Cents {
  let bal = 0;
  for (const o of occ) {
    if (o.kind !== 'hogar') continue;
    if (o.paidBy === 'usuario') bal += o.partnerShare;
    else if (o.paidBy === 'pareja') bal -= o.userShare;
  }
  return bal;
}
