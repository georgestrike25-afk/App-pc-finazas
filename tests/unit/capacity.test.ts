import { describe, expect, it } from 'vitest';
import { savingsCapacity } from '../../src/domain/capacity';
import { emptyData, expense, income } from './helpers';
import type { Obligation } from '../../src/domain/types';

describe('cuánto podés ahorrar cada mes', () => {
  it('ingreso − fijos − cuotas − presupuesto, y sube cuando termina una deuda', () => {
    const d = emptyData();
    d.settings.dailyBudgetRange = { min: 60000000, max: 70000000 };
    d.incomes.push(income({ month: '2026-10', amountReceived: 200000000 }));
    // Gasto fijo de la planilla en octubre (en los meses siguientes se estima con el promedio)
    d.expenses.push({ ...expense({ kind: 'hogar', month: '2026-10', date: '2026-10-01', totalAmount: 50000000, userPct: 50, concept: 'Alquiler' }), linkedLineFingerprints: ['planilla|alquiler|2026-10'] });
    const T = '2026-10-01T00:00:00.000Z';
    const ob: Obligation = { id: 'o', createdAt: T, updatedAt: T, entity: 'Banco Patagonia', type: 'prestamo', concept: 'Préstamo A', paidInstallments: 10, totalInstallments: 12, installmentAmount: 10000000, nextDueMonth: '2026-11', frequency: 'mensual', status: 'pendiente', variableAmount: false, revisions: [] };
    d.obligations.push(ob);
    const c = savingsCapacity(d, '2026-10', 4);
    expect(c.income).toBe(200000000);
    expect(c.incomeSource).toBe('ultimo_cobro');
    expect(c.months.map((m) => [m.month, m.fixed, m.fixedEstimated, m.debts, m.saveLow, m.saveHigh, m.freed])).toEqual([
      ['2026-11', 25000000, true, 10000000, 200000000 - 25000000 - 10000000 - 70000000, 200000000 - 25000000 - 10000000 - 60000000, 0],
      ['2026-12', 25000000, true, 10000000, 95000000, 105000000, 0],
      ['2027-01', 25000000, true, 0, 105000000, 115000000, 10000000],
      ['2027-02', 25000000, true, 0, 105000000, 115000000, 10000000],
    ]);
    expect(c.months[2].ended).toEqual(['Préstamo A (Banco Patagonia)']);
  });
});
