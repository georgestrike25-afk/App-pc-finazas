import { describe, expect, it } from 'vitest';
import { projectGoal, DEFAULT_SCENARIOS } from '../../src/domain/savings';
import { defaultGoal } from '../../src/db/defaults';
import { emptyData, obligation } from './helpers';

const T = '2026-10-01T00:00:00.000Z';

describe('proyección del viaje de abril de 2027', () => {
  it('objetivo inicial vacío: $0 y fecha abril 2027', () => {
    const g = defaultGoal(T);
    expect(g.targetMonth).toBe('2027-04');
    expect(g.estimatedCost + g.initialSaving + g.reserved + g.plannedMonthlyContribution).toBe(0);
    const p = projectGoal(emptyData(), g, '2026-10', DEFAULT_SCENARIOS[1]);
    expect(p.months.map((m) => m.month)).toEqual(['2026-10', '2026-11', '2026-12', '2027-01', '2027-02', '2027-03']);
    expect(p.reachable).toBe(false);
    expect(p.warnings.join(' ')).toMatch(/costo estimado/);
  });

  it('proyecta aportes, cuotas finalizadas y reinversión configurable', () => {
    const d = emptyData();
    d.settings.projectedMonthlyIncome = 200000000; // $2.000.000 estimado
    d.settings.dailyBudgetDefault = 70000000;
    // Cuota de $100.000 que termina en diciembre 2026
    d.obligations.push(obligation({ totalInstallments: 3, paidInstallments: 0, installmentAmount: 10000000, nextDueMonth: '2026-10' }));
    const g = { ...defaultGoal(T), estimatedCost: 300000000, initialSaving: 20000000, plannedMonthlyContribution: 40000000, reinvestPct: 50 };
    const p = projectGoal(d, g, '2026-10', DEFAULT_SCENARIOS[1]);
    expect(p.monthsRemaining).toBe(6);
    // Oct-Dic: aporte 400.000; Ene-Mar: 400.000 + 50 % de 100.000 liberados
    expect(p.months.map((m) => m.contribution)).toEqual([40000000, 40000000, 40000000, 45000000, 45000000, 45000000]);
    expect(p.months[3].freed).toBe(10000000);
    expect(p.finalAccumulated).toBe(20000000 + 255000000);
    expect(p.reachable).toBe(false);
    expect(p.requiredMonthly).toBe(Math.ceil((300000000 - 20000000) / 6));
    // Sin reinversión, el dinero liberado no se ahorra automáticamente
    const p0 = projectGoal(d, { ...g, reinvestPct: 0 }, '2026-10', DEFAULT_SCENARIOS[1]);
    expect(p0.months[5].contribution).toBe(40000000);
  });

  it('el aporte no supera el saldo disponible proyectado (escenario conservador)', () => {
    const d = emptyData();
    d.settings.projectedMonthlyIncome = 80000000;
    const g = { ...defaultGoal(T), estimatedCost: 100000000, plannedMonthlyContribution: 50000000 };
    const p = projectGoal(d, g, '2026-10', DEFAULT_SCENARIOS[0]);
    expect(p.months[1].available).toBe(Math.round(80000000 * 0.9) - Math.round(70000000 * 1.1));
    expect(p.months[1].contribution).toBe(0);
    expect(p.months[1].capped).toBe(true);
  });

  it('usa aportes reales cuando existen', () => {
    const d = emptyData();
    const g = { ...defaultGoal(T), estimatedCost: 100, contributions: [{ id: 'c', date: '2026-10-05', month: '2026-10', amount: 12345 }] };
    const p = projectGoal(d, g, '2026-10', DEFAULT_SCENARIOS[1]);
    expect(p.months[0]).toMatchObject({ contribution: 12345, contributionKind: 'real' });
    expect(p.currentProgress).toBe(12345);
  });
});
