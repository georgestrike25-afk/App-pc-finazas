import { describe, expect, it } from 'vitest';
import { GUIDE, liveAnswers, searchAnswers } from '../../src/domain/asistente';
import { defaultGoal } from '../../src/db/defaults';
import { emptyData, obligation } from './helpers';

const T = '2026-10-01T00:00:00.000Z';
const data = () => {
  const d = { ...emptyData(), goal: { ...defaultGoal(T), estimatedCost: 250000000, targetMonth: '2027-04' } };
  d.settings = { ...d.settings, projectedMonthlyIncome: 200000000, dailyBudgetRange: { min: 50000000, max: 60000000 }, cash: { amount: 100000000, setAt: '2026-11-01T10:00:00.000Z' } };
  d.obligations = [obligation({ id: 'p', entity: 'Banco Patagonia', type: 'prestamo', concept: 'Préstamo', loanNumber: '1', paidInstallments: 2, totalInstallments: 4, installmentAmount: 10000000, nextDueMonth: '2026-11' })];
  return d;
};

describe('Preguntale a Brote', () => {
  const live = liveAnswers(data(), '2026-11', '2026-11-03');
  const get = (id: string) => live.find((a) => a.id === id)!;

  it('cuánto puedo juntar: plata − lo que falta pagar − lo que falta del día a día', () => {
    // 1.000.000 − 100.000 (cuota) − 600.000 o 500.000 (día a día) = 300.000 a 400.000
    expect(get('juntar').short).toMatch(/entre \$\s300\.000,00 y \$\s400\.000,00/);
    expect(get('juntar').lines!.filter((l) => l.strong).map((l) => l.amount)).toEqual([30000000, 40000000]);
  });

  it('qué pago este mes y cuánto debo', () => {
    expect(get('pagar').lines!.at(-1)).toMatchObject({ label: 'Total sin ARCA', amount: 10000000 });
    expect(get('deuda').short).toMatch(/200\.000,00.*diciembre de 2026/);
  });

  it('el buscador encuentra la pregunta aunque se escriba distinto', () => {
    const all = [...live, ...GUIDE];
    expect(searchAnswers(all, 'cuanto puedo juntar')[0].id).toBe('juntar');
    expect(searchAnswers(all, 'qué significa se liberan')[0].id).toBe('g-liberan');
    expect(searchAnswers(all, 'me olvidé la frase')[0].id).toBe('g-frase');
    expect(searchAnswers(all, 'subí dos veces el mismo resumen')[0].id).toBe('g-duplicado');
    expect(searchAnswers(all, 'zzz')).toEqual([]);
  });
});
