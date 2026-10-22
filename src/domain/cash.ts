import { daysBetween } from './dates';
import { splitShared } from './expenses';
import { sum, type Cents } from './money';
import type { DataSet } from './monthly';
import type { Expense } from './types';

export interface CashStatus {
  start: Cents;
  spent: Cents;
  left: Cents;
  /** Gastos que se descontaron (para mostrarlos). */
  items: Array<{ concept: string; amount: Cents; date: string }>;
  /** Días que faltan contando hoy (si se indicó hasta cuándo). */
  days?: number;
  perDay?: Cents;
}

/** Lo que sale de tu bolsillo por un gasto: tu parte si es compartido. */
const outOfPocket = (e: Expense) => (e.kind === 'hogar' ? splitShared(e.totalAmount, e.userPct).user : e.totalAmount);

/**
 * "Plata hasta cobrar": desde el momento en que el usuario anotó cuánto tenía, se descuentan
 * los gastos que anota o que detecta la app (efectivo, débito, transferencias, billeteras) y
 * los pagos de resumen. Las compras con tarjeta de crédito no: se pagan con el resumen.
 */
export function cashStatus(data: Pick<DataSet, 'expenses' | 'cardPayments' | 'settings'>, todayIso: string): CashStatus | null {
  const c = data.settings.cash;
  if (!c) return null;
  const since = c.setAt.slice(0, 10);
  const counted = data.expenses.filter((e) => !e.deleted && e.createdAt > c.setAt && e.date >= since && e.paymentMethod !== 'tarjeta' && !e.provisional && !e.cashAdjust);
  const payments = data.cardPayments.filter((p) => !p.deleted && p.createdAt > c.setAt && p.date >= since);
  const items = [
    ...counted.map((e) => ({ concept: e.concept, amount: outOfPocket(e), date: e.date })),
    ...payments.map((p) => ({ concept: `Pago del resumen de ${p.entity}`, amount: p.amount, date: p.date })),
  ].sort((a, b) => b.date.localeCompare(a.date));
  const spent = sum(items.map((i) => i.amount));
  const left = c.amount - spent;
  const days = c.until && c.until >= todayIso ? daysBetween(todayIso, c.until) + 1 : undefined;
  return { start: c.amount, spent, left, items, days, perDay: days ? Math.floor(Math.max(0, left) / days) : undefined };
}
