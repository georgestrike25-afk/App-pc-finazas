import { describe, expect, it } from 'vitest';
import { computeMonth } from '../../src/domain/monthly';
import { splitShared, occurrenceFor, partnerBalance, occurrencesForMonth } from '../../src/domain/expenses';
import { sancorSummary } from '../../src/domain/sancor';
import { emptyData, expense, income, obligation } from './helpers';
import type { CardPayment, SancorCharge, Statement } from '../../src/domain/types';

const T = '2026-01-01T00:00:00.000Z';

describe('gastos compartidos', () => {
  it('divide un gasto al 50 %', () => {
    expect(splitShared(10000000, 50)).toEqual({ user: 5000000, partner: 5000000 });
    expect(splitShared(1001, 50)).toEqual({ user: 501, partner: 500 });
    expect(splitShared(100000, 70)).toEqual({ user: 70000, partner: 30000 });
  });
  it('genera ocurrencias recurrentes y saldo con la pareja', () => {
    const rent = expense({ kind: 'hogar', month: '2026-08', totalAmount: 50000000, userPct: 50, frequency: 'mensual', paidBy: 'usuario' });
    expect(occurrenceFor(rent, '2026-07')).toBeNull();
    const oct = occurrenceFor(rent, '2026-10')!;
    expect(oct.userShare).toBe(25000000);
    expect(oct.estimated).toBe(true);
    expect(partnerBalance(occurrencesForMonth([rent], '2026-10'))).toBe(25000000);
  });
});

describe('Sancor Salud', () => {
  it('calcula reintegro sin reducir el importe de la tarjeta', () => {
    const c: SancorCharge = { id: 's1', createdAt: T, updatedAt: T, month: '2026-10', chargeAmount: 9800000, partnerPct: 50, received: [] };
    let s = sancorSummary(c);
    expect(s).toMatchObject({ cardAmount: 9800000, expected: 4900000, received: 0, pending: 4900000, netEstimated: 4900000, netWithReceived: 9800000 });
    c.received.push({ date: '2026-10-20', amount: 4900000 });
    s = sancorSummary(c);
    expect(s).toMatchObject({ cardAmount: 9800000, received: 4900000, pending: 0, netWithReceived: 4900000 });
  });

  it('en el cálculo mensual el reintegro se cuenta una sola vez', () => {
    const d = emptyData();
    d.incomes.push(income({ month: '2026-10', amountReceived: 100000000 }));
    const c: SancorCharge = { id: 's1', createdAt: T, updatedAt: T, month: '2026-10', chargeAmount: 9800000, partnerPct: 50, received: [] };
    d.sancor.push(c);
    d.settings.monthBudgets['2026-10'] = { amount: 0, mode: 'real' };
    let r = computeMonth(d, '2026-10', '2026-10');
    // Sin reintegro recibido: se resta el cargo completo y el esperado se muestra aparte
    expect(r.available).toBe(100000000 - 9800000);
    expect(r.info.sancorExpected).toBe(4900000);
    expect(r.info.sancorPending).toBe(4900000);
    c.received.push({ date: '2026-10-25', amount: 4900000 });
    r = computeMonth(d, '2026-10', '2026-10');
    expect(r.available).toBe(100000000 - 9800000 + 4900000);
    expect(r.info.sancorPending).toBe(0);
  });
});

describe('calculadora mensual', () => {
  it('base vacía: todo en cero y advierte ingreso sin cargar', () => {
    const r = computeMonth(emptyData(), '2026-10', '2026-10');
    expect(r.sections.find((s) => s.key === 'ingresos')!.total).toBe(0);
    expect(r.incomeStatus).toBe('sin_cargar');
    // El presupuesto de $700.000 es una estimación identificada, no un gasto real
    const cot = r.sections.find((s) => s.key === 'cotidiano')!;
    expect(cot.lines).toHaveLength(1);
    expect(cot.lines[0].estimated).toBe(true);
    expect(cot.total).toBe(70000000);
    expect(r.info.dailyRegistered).toBe(0);
    expect(r.info.dailyBudgetIsInitialValue).toBe(true);
  });

  it('el ingreso de un mes no se copia al siguiente', () => {
    const d = emptyData();
    d.incomes.push(income({ month: '2026-10', amountReceived: 100000000 }));
    expect(computeMonth(d, '2026-11', '2026-10').incomeStatus).toBe('sin_cargar');
  });

  it('separa consumo de tarjeta y pago del resumen (sin doble cómputo)', () => {
    const d = emptyData();
    d.incomes.push(income({ month: '2026-10', amountReceived: 100000000 }));
    d.settings.monthBudgets['2026-10'] = { amount: 0, mode: 'real' };
    d.expenses.push(expense({ kind: 'personal', month: '2026-10', totalAmount: 2000000, paymentMethod: 'tarjeta', paid: false }));
    const st: Statement = { id: 'st', createdAt: T, updatedAt: T, entity: 'Visa', month: '2026-10', total: 2000000, currency: 'ARS' };
    const pay: CardPayment = { id: 'p', createdAt: T, updatedAt: T, entity: 'Visa', date: '2026-10-06', month: '2026-10', amount: 2000000, source: 'manual' };
    d.statements.push(st);
    d.cardPayments.push(pay);
    const r = computeMonth(d, '2026-10', '2026-10');
    expect(r.available).toBe(100000000 - 2000000);
    expect(r.info.cardPaymentsTotal).toBe(2000000);
    expect(r.info.statementsTotal).toBe(2000000);
  });

  it('el presupuesto cotidiano solo completa lo no registrado', () => {
    const d = emptyData();
    d.expenses.push(expense({ kind: 'cotidiano', month: '2026-10', totalAmount: 30000000 }));
    const r = computeMonth(d, '2026-10', '2026-10');
    const cot = r.sections.find((s) => s.key === 'cotidiano')!;
    expect(cot.total).toBe(70000000);
    expect(r.info.dailyEstimatedRemainder).toBe(40000000);
    // Mes pasado en modo real: solo lo registrado
    const past = computeMonth(d, '2026-10', '2026-11');
    expect(past.sections.find((s) => s.key === 'cotidiano')!.total).toBe(30000000);
  });

  it('fórmula completa y cuotas del mes', () => {
    const d = emptyData();
    d.incomes.push(income({ month: '2026-10', amountReceived: 150000000, extras: [{ concept: 'Bono', amount: 10000000 }], deductions: [{ concept: 'Adelanto', amount: 5000000 }] }));
    d.expenses.push(expense({ kind: 'hogar', month: '2026-10', totalAmount: 60000000, userPct: 50 }));
    d.expenses.push(expense({ kind: 'personal', month: '2026-10', totalAmount: 5000000 }));
    d.settings.monthBudgets['2026-10'] = { amount: 70000000, mode: 'estimado' };
    d.obligations.push(obligation({ totalInstallments: 10, paidInstallments: 4, installmentAmount: 1000000, nextDueMonth: '2026-10' }));
    const r = computeMonth(d, '2026-10', '2026-10');
    expect(r.sections.map((s) => s.total)).toEqual([155000000, 30000000, 5000000, 70000000, 1000000]);
    expect(r.available).toBe(155000000 - 30000000 - 5000000 - 70000000 - 1000000);
    expect(r.hasEstimates).toBe(true);
  });
});
