import { sum, type Cents } from './money';
import type { Expense, Refund } from './types';

/** Cuánto de un gasto te lo devuelven (o te lo devolvieron): eso no es un gasto tuyo. */
export function refundedPart(e: Pick<Expense, 'refund'>): Cents {
  const r = e.refund;
  if (!r) return 0;
  return r.status === 'devuelto' ? (r.receivedAmount ?? r.amount) : r.amount;
}

/** Lo que de verdad cuesta: el importe menos lo que te devuelven. */
export const netOfRefund = (total: Cents, e: Pick<Expense, 'refund'>): Cents => (e.refund ? Math.max(0, total - refundedPart(e)) : total);

export const isRefundPending = (e: Expense) => !e.deleted && e.refund?.status === 'pendiente';
export const isRefundDone = (e: Expense) => !e.deleted && e.refund?.status === 'devuelto';

/** Marca un gasto como "me lo devuelven". Por defecto, el importe entero. */
export function markRefund(e: Expense, from: string, amount?: Cents): Expense {
  const refund: Refund = { from: from.trim() || 'Hospital', amount: amount ?? e.totalAmount, status: 'pendiente' };
  return { ...e, refund };
}

/** El gasto vuelve a ser tuyo. */
export function undoRefund(e: Expense): Expense {
  const { refund: _quitado, ...rest } = e;
  return rest;
}

/**
 * Registra que te devolvieron plata por varios gastos juntos (el hospital suele pagar de a muchos).
 * Si lo recibido es distinto de la suma, se reparte en proporción al importe de cada uno.
 */
export function receiveRefunds(items: Expense[], received: Cents, date: string, nowIso: string): Expense[] {
  const pending = items.filter((e) => e.refund?.status === 'pendiente');
  const expected = sum(pending.map((e) => e.refund!.amount));
  let left = received;
  return pending.map((e, i) => {
    const last = i === pending.length - 1;
    const share = last ? left : expected > 0 ? Math.round((received * e.refund!.amount) / expected) : Math.round(received / pending.length);
    left -= share;
    return { ...e, refund: { ...e.refund!, status: 'devuelto' as const, receivedAmount: Math.max(0, share), receivedDate: date, receivedAt: nowIso } };
  });
}

/** Vuelve a "pendiente" lo que se había marcado como devuelto por error. */
export function reopenRefund(e: Expense): Expense {
  if (!e.refund) return e;
  const { receivedAmount: _a, receivedDate: _d, receivedAt: _t, ...r } = e.refund;
  return { ...e, refund: { ...r, status: 'pendiente' } };
}

export interface RefundSummary {
  pending: Expense[];
  done: Expense[];
  pendingTotal: Cents;
  byFrom: Array<{ from: string; total: Cents; items: Expense[] }>;
}

export function refundSummary(expenses: Expense[]): RefundSummary {
  const live = expenses.filter((e) => !e.deleted && e.refund);
  const pending = live.filter((e) => e.refund!.status === 'pendiente').sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  const done = live.filter((e) => e.refund!.status === 'devuelto').sort((a, b) => (b.refund!.receivedDate ?? '').localeCompare(a.refund!.receivedDate ?? '') || b.date.localeCompare(a.date));
  const groups = new Map<string, Expense[]>();
  for (const e of pending) groups.set(e.refund!.from, [...(groups.get(e.refund!.from) ?? []), e]);
  return {
    pending,
    done,
    pendingTotal: sum(pending.map((e) => e.refund!.amount)),
    byFrom: [...groups.entries()].map(([from, items]) => ({ from, items, total: sum(items.map((e) => e.refund!.amount)) })).sort((a, b) => b.total - a.total),
  };
}
