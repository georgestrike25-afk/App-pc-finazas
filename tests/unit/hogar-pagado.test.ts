import { describe, expect, it } from 'vitest';
import { expense } from './helpers';
import { cashStatus } from '../../src/domain/cash';
import { householdPayment, payHousehold, unpayHousehold } from '../../src/domain/payments';
import { occurrenceFor, partnerLedger } from '../../src/domain/expenses';
import type { Expense, Settings } from '../../src/domain/types';

const settings = { cash: { amount: 1_000_000_00, setAt: '2026-11-05T10:00:00.000Z' } } as unknown as Settings;
const NOW = '2026-11-06T10:00:00.000Z';
const cash = (expenses: Expense[]) => cashStatus({ expenses, cardPayments: [], settings }, '2026-11-06')!.left;

describe('"Pagado" en los gastos del hogar (montos ficticios)', () => {
  it('lo que pagó la otra persona: tu parte baja la plata y lo que le debés', () => {
    const luz = expense({ kind: 'hogar', concept: 'Luz', month: '2026-11', date: '2026-11-01', totalAmount: 50_000_00, userPct: 50, paidBy: 'pareja', paymentMethod: 'transferencia', createdAt: '2026-11-01T10:00:00.000Z' });
    expect(cash([luz])).toBe(1_000_000_00);
    expect(partnerLedger([luz], '2026-11').net).toBe(-25_000_00);
    const r = payHousehold(luz, '2026-11', 25_000_00, true, 'Ana', '2026-11-06', NOW);
    expect(r.expense).toBeUndefined();
    const all = [luz, r.payment];
    expect(cash(all)).toBe(975_000_00);
    expect(partnerLedger(all, '2026-11').net).toBe(0);
    expect(householdPayment(all, luz.id, '2026-11')).toBe(r.payment);
    expect(householdPayment(all, luz.id, '2026-12')).toBeUndefined();
    // No es un gasto nuevo del mes.
    expect(occurrenceFor(r.payment, '2026-11')).toBeNull();
  });

  it('un gasto del hogar pendiente queda pagado ese mes y Deshacer lo vuelve atrás', () => {
    const gas = expense({ kind: 'hogar', concept: 'Gas', month: '2026-10', totalAmount: 8_000_00, userPct: 50, paid: false, frequency: 'mensual', paymentMethod: 'transferencia', createdAt: '2026-10-01T10:00:00.000Z' });
    expect(occurrenceFor(gas, '2026-11')!.paid).toBe(false);
    const r = payHousehold(gas, '2026-11', 4_000_00, false, 'Ana', '2026-11-06', NOW);
    expect(occurrenceFor(r.expense!, '2026-11')!.paid).toBe(true);
    expect(occurrenceFor(r.expense!, '2026-12')!.paid).toBe(false);
    expect(cash([r.expense!, r.payment])).toBe(996_000_00);
    const back = unpayHousehold(r.expense!, r.payment)!;
    expect(occurrenceFor(back, '2026-11')!.paid).toBe(false);
    expect(back.overrides?.['2026-11']).toBeUndefined();
  });

  it('el consultorio (solo tuyo, lo pagó la otra persona): se le paga entero', () => {
    const cons = expense({ kind: 'personal', concept: 'Alquiler de consultorio', month: '2026-11', date: '2026-11-01', totalAmount: 20_000_00, paidBy: 'pareja', paymentMethod: 'transferencia', createdAt: '2026-11-01T10:00:00.000Z' });
    expect(partnerLedger([cons], '2026-11').net).toBe(-20_000_00);
    const r = payHousehold(cons, '2026-11', 20_000_00, true, 'Ana', '2026-11-06', NOW);
    expect(r.payment.settlement).toBe('a_pareja');
    expect(partnerLedger([cons, r.payment], '2026-11').net).toBe(0);
    expect(cash([cons, r.payment])).toBe(980_000_00);
  });
});
