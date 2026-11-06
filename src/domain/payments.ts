import { monthOf, type MonthKey } from './dates';
import type { Cents } from './money';
import { uid } from './text';
import type { Expense, Obligation } from './types';

/** Cuánto vale la cuota n de una deuda (el importe propio de esa cuota o el general). */
export const installmentAmountFor = (ob: Obligation, n: number): Cents => ob.installmentOverrides?.[n] ?? ob.installmentAmount ?? 0;

/**
 * Pago de una deuda (cuota, ARCA…) para descontarlo de "Plata hasta cobrar". No es un gasto del mes:
 * la cuota ya está en las cuotas del mes, por eso no aparece en Gastos ni en el presupuesto (`cashOnly`).
 */
export function debtPaymentExpense(concept: string, amount: Cents, date: string, nowIso: string, deviceId?: string): Expense {
  return {
    id: uid(),
    createdAt: nowIso,
    updatedAt: nowIso,
    deviceId,
    kind: 'personal',
    category: 'Pago de deudas',
    concept,
    date,
    month: monthOf(date),
    totalAmount: amount,
    userPct: 100,
    paid: true,
    frequency: 'unica',
    paymentMethod: 'transferencia',
    source: 'manual',
    cashOnly: true,
  };
}

/** El pago ("Pagado") de un gasto del hogar en un mes, si ya se marcó. */
export function householdPayment(expenses: Expense[], expenseId: string, month: MonthKey): Expense | undefined {
  return expenses.find((x) => !x.deleted && x.settles?.expenseId === expenseId && x.settles.month === month);
}

/**
 * "Pagado" en un gasto del hogar: anota tu parte como pago (baja la plata hasta cobrar, no es un gasto nuevo).
 * Si lo había pagado la otra persona (planilla), es un pago a ella: también baja lo que le debés.
 * Si ese mes estaba pendiente, queda pagado.
 */
export function payHousehold(e: Expense, month: MonthKey, userShare: Cents, wasPaid: boolean, partner: string, date: string, nowIso: string, deviceId?: string): { payment: Expense; expense?: Expense } {
  const label = `${month.slice(5)}/${month.slice(0, 4)}`;
  const toPartner = e.paidBy === 'pareja';
  const payment: Expense = {
    ...debtPaymentExpense(toPartner ? `Pago a ${partner}: ${e.concept} (${label})` : `${e.concept} (${label})`, userShare, date, nowIso, deviceId),
    category: toPartner ? 'Pago a pareja' : e.category,
    ...(toPartner ? { settlement: 'a_pareja' as const } : {}),
    settles: { expenseId: e.id, month, ...(wasPaid ? {} : { markedPaid: true }) },
  };
  if (wasPaid) return { payment };
  return { payment, expense: { ...e, overrides: { ...(e.overrides ?? {}), [month]: { ...(e.overrides?.[month] ?? {}), paid: true } } } };
}

/** Deshace el "Pagado": si ese mes había quedado pagado por este pago, vuelve a pendiente. */
export function unpayHousehold(e: Expense, payment: Expense): Expense | undefined {
  const month = payment.settles?.month;
  if (!month || !payment.settles?.markedPaid || !e.overrides?.[month]?.paid) return undefined;
  const { paid: _paid, ...rest } = e.overrides[month];
  const overrides = { ...e.overrides };
  if (Object.keys(rest).length) overrides[month] = rest;
  else delete overrides[month];
  return { ...e, overrides };
}
