import { describe, expect, it } from 'vitest';
import { cycleMonthOf, cycleRange, isBusinessDay, nthBusinessDay, paydayOf } from '../../src/domain/payday';
import { dailyOccurrencesForMonth } from '../../src/domain/expenses';
import { computeMonth } from '../../src/domain/monthly';
import { emptyData, expense } from './helpers';

describe('día de cobro: cuarto día hábil', () => {
  it('cuenta fines de semana y feriados', () => {
    expect(nthBusinessDay('2026-11', 4)).toBe('2026-11-05'); // lunes 2, mar 3, mié 4, jue 5
    expect(nthBusinessDay('2026-12', 4)).toBe('2026-12-04');
    expect(nthBusinessDay('2027-01', 4)).toBe('2027-01-07'); // el viernes 1 es feriado
    expect(nthBusinessDay('2026-04', 4)).toBe('2026-04-08'); // jueves 2 (Malvinas/Jueves Santo) y viernes 3 (Viernes Santo)
    expect(nthBusinessDay('2026-05', 4)).toBe('2026-05-07'); // el viernes 1 es feriado: lun 4, mar 5, mié 6, jue 7
    expect(isBusinessDay('2026-02-16')).toBe(false); // Carnaval
    expect(isBusinessDay('2027-02-09')).toBe(false);
    expect(nthBusinessDay('2026-11', 1)).toBe('2026-11-02');
  });

  it('se puede cambiar el día hábil o la fecha de un mes puntual', () => {
    expect(paydayOf('2026-11', { paydayNth: 1 })).toBe('2026-11-02');
    expect(paydayOf('2026-11', { paydays: { '2026-11': '2026-11-04' } })).toBe('2026-11-04');
    expect(paydayOf('2026-12', { paydays: { '2026-11': '2026-11-04' } })).toBe('2026-12-04');
  });
});

describe('ciclo del día a día', () => {
  const s = {};
  it('antes de cobrar cuenta en el ciclo anterior', () => {
    expect(cycleMonthOf('2026-11-02', s)).toBe('2026-10');
    expect(cycleMonthOf('2026-11-04', s)).toBe('2026-10');
    expect(cycleMonthOf('2026-11-05', s)).toBe('2026-11');
    expect(cycleMonthOf('2026-12-03', s)).toBe('2026-11');
    expect(cycleMonthOf('2026-12-04', s)).toBe('2026-12');
    expect(cycleMonthOf('2027-01-05', s)).toBe('2026-12');
  });
  it('rango del ciclo', () => {
    expect(cycleRange('2026-11', s)).toEqual({ from: '2026-11-05', to: '2026-12-03' });
  });

  it('el efectivo cuenta por fecha, la tarjeta por el mes del resumen y lo demás no cambia', () => {
    const d = emptyData();
    d.expenses = [
      expense({ id: 'a', kind: 'cotidiano', month: '2026-11', date: '2026-11-02', totalAmount: 100000, paymentMethod: 'efectivo' }), // ciclo de octubre
      expense({ id: 'b', kind: 'cotidiano', month: '2026-11', date: '2026-11-06', totalAmount: 200000, paymentMethod: 'debito' }), // noviembre
      expense({ id: 'c', kind: 'cotidiano', month: '2026-12', date: '2026-12-02', totalAmount: 300000, paymentMethod: 'transferencia' }), // noviembre
      expense({ id: 'd', kind: 'cotidiano', month: '2026-11', date: '2026-10-20', totalAmount: 400000, paymentMethod: 'tarjeta' }), // resumen de noviembre
      expense({ id: 'f', kind: 'hogar', month: '2026-11', date: '2026-11-02', totalAmount: 500000, userPct: 100, paymentMethod: 'transferencia' }), // fijo: mes calendario
    ];
    const ids = (m: string) => dailyOccurrencesForMonth(d.expenses, m, d.settings).map((o) => o.expenseId).sort();
    expect(ids('2026-10')).toEqual(['a']);
    expect(ids('2026-11')).toEqual(['b', 'c', 'd']);
    expect(ids('2026-12')).toEqual([]);
    const nov = computeMonth(d, '2026-11', '2026-11');
    expect(nov.info.dailyRegistered).toBe(900000);
    expect(nov.sections.find((x) => x.key === 'fijos')!.total).toBe(500000);
    expect(computeMonth(d, '2026-10', '2026-11').info.dailyRegistered).toBe(100000);
  });
});
