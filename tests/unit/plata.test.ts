import { describe, expect, it } from 'vitest';
import { cashStatus } from '../../src/domain/cash';
import { computeMonth } from '../../src/domain/monthly';
import { debtPaymentExpense, installmentAmountFor } from '../../src/domain/payments';
import { occurrencesForMonth } from '../../src/domain/expenses';
import { emptyData, expense, income, obligation } from './helpers';

const SET = '2026-11-01T10:00:00.000Z';
const base = () => {
  const d = emptyData();
  d.settings = { ...d.settings, cash: { amount: 5000000, setAt: SET, until: '2026-11-04' } }; // tenía $ 50.000
  return d;
};
const sueldo = (extra: object = {}) => ({ ...income({ month: '2026-11', amountReceived: 200000000 }), receivedDate: '2026-11-05', salaryAt: '2026-11-05T09:00:00.000Z', ...extra });

describe('plata hasta cobrar con el sueldo entero', () => {
  it('el sueldo cargado después de anotar tu plata entra una sola vez y estira el "hasta cuándo" al próximo cobro', () => {
    const d = base();
    d.incomes = [sueldo()];
    const c = cashStatus(d, '2026-11-05')!;
    expect(c.salary).toBe(200000000);
    expect(c.left).toBe(5000000 + 200000000);
    expect(c.until).toBe('2026-12-04'); // cuarto día hábil de diciembre
    expect(c.days).toBe(30);
  });

  it('si ya corregiste la plata después de cargar el sueldo, no se cuenta de nuevo; un sueldo viejo sin marca tampoco', () => {
    const d = base();
    d.settings = { ...d.settings, cash: { amount: 190000000, setAt: '2026-11-06T10:00:00.000Z' } };
    d.incomes = [sueldo()];
    expect(cashStatus(d, '2026-11-07')!.salary).toBe(0);
    const v = base();
    v.incomes = [sueldo({ salaryAt: undefined })];
    expect(cashStatus(v, '2026-11-07')!.salary).toBe(0);
  });

  it('lo que vas pagando baja: cuota, ARCA y ahorro; no son gasto del mes', () => {
    const d = base();
    d.incomes = [sueldo()];
    const ob = obligation({ installmentAmount: 9000000, installmentOverrides: { 3: 9500000 } });
    expect(installmentAmountFor(ob, 3)).toBe(9500000);
    expect(installmentAmountFor(ob, 4)).toBe(9000000);
    d.expenses = [
      debtPaymentExpense('Cuota 3 de Préstamo', 9500000, '2026-11-06', '2026-11-06T12:00:00.000Z'),
      debtPaymentExpense('Pago a ARCA (monotributo)', 10000000, '2026-11-06', '2026-11-06T12:01:00.000Z'),
    ];
    const conAhorro = { ...d, goal: { contributions: [{ id: 'a', at: '2026-11-06T13:00:00.000Z', date: '2026-11-06', month: '2026-11', amount: 30000000 }] } };
    const c = cashStatus(conAhorro, '2026-11-07')!;
    expect(c.spent).toBe(9500000 + 10000000 + 30000000);
    expect(c.left).toBe(5000000 + 200000000 - 49500000);
    expect(c.items.map((i) => i.concept)).toContain('Ahorro para el viaje');
    // No son gastos del mes (las cuotas ya están en "Cuotas y obligaciones").
    expect(occurrencesForMonth(d.expenses, '2026-11')).toEqual([]);
    expect(computeMonth(d, '2026-11', '2026-11').sections.find((s) => s.key === 'personales')!.total).toBe(0);
  });

  it('una factura sin pagar no baja tu plata; al marcarla pagada, sí (aunque venza otro día)', () => {
    const d = base();
    const factura = { ...expense({ kind: 'personal', month: '2026-11', date: '2026-10-28', totalAmount: 2311999, paymentMethod: 'otro', concept: 'Claro' }), source: 'importado' as const, paid: false, notes: 'Factura Claro', createdAt: '2026-11-02T10:00:00.000Z' };
    d.expenses = [factura];
    expect(cashStatus(d, '2026-11-05')!.left).toBe(5000000);
    d.expenses = [{ ...factura, paid: true, paidAt: '2026-11-06T10:00:00.000Z' }];
    expect(cashStatus(d, '2026-11-07')!.left).toBe(5000000 - 2311999);
  });
});
