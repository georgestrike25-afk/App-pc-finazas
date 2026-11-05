import { monthOf } from './dates';
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
