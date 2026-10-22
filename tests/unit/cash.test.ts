import { describe, expect, it } from 'vitest';
import { cashStatus } from '../../src/domain/cash';
import { emptyData, expense } from './helpers';

describe('plata hasta cobrar', () => {
  it('descuenta lo que gastás desde que anotaste el monto (no las compras con tarjeta)', () => {
    const d = emptyData();
    d.settings.cash = { amount: 10000000, setAt: '2026-10-22T10:00:00.000Z', until: '2026-11-01' };
    const at = (iso: string) => ({ createdAt: iso, updatedAt: iso });
    d.expenses.push(
      { ...expense({ kind: 'cotidiano', month: '2026-10', date: '2026-10-22', totalAmount: 1500000, paymentMethod: 'efectivo', concept: 'Súper' }), ...at('2026-10-22T12:00:00.000Z') },
      { ...expense({ kind: 'cotidiano', month: '2026-10', date: '2026-10-22', totalAmount: 900000, paymentMethod: 'tarjeta', concept: 'Con tarjeta' }), ...at('2026-10-22T12:00:00.000Z') },
      { ...expense({ kind: 'hogar', month: '2026-10', date: '2026-10-23', totalAmount: 2000000, userPct: 50, paymentMethod: 'transferencia', concept: 'Luz' }), ...at('2026-10-23T12:00:00.000Z') },
      // Anotado antes de poner el monto: no cuenta
      { ...expense({ kind: 'cotidiano', month: '2026-10', date: '2026-10-21', totalAmount: 500000, paymentMethod: 'efectivo', concept: 'Ayer' }), ...at('2026-10-21T12:00:00.000Z') },
    );
    d.cardPayments.push({ id: 'p', createdAt: '2026-10-24T10:00:00.000Z', updatedAt: '2026-10-24T10:00:00.000Z', entity: 'Naranja X', date: '2026-10-24', month: '2026-10', amount: 3000000, source: 'manual' });
    const s = cashStatus(d, '2026-10-24')!;
    expect(s.spent).toBe(1500000 + 1000000 + 3000000);
    expect(s.left).toBe(10000000 - 5500000);
    expect(s.days).toBe(9);
    expect(s.perDay).toBe(Math.floor(4500000 / 9));
    expect(s.items.map((i) => i.concept)).toEqual(['Pago del resumen de Naranja X', 'Luz', 'Súper']);
    expect(cashStatus({ ...d, settings: { ...d.settings, cash: undefined } }, '2026-10-24')).toBeNull();
  });
});

describe('ajuste de gastos sin detalle', () => {
  it('no se descuenta de la plata que tenés', () => {
    const d = emptyData();
    d.settings.cash = { amount: 10000000, setAt: '2026-10-22T10:00:00.000Z' };
    d.expenses.push({ ...expense({ kind: 'personal', month: '2026-10', date: '2026-10-22', totalAmount: 4627186, paymentMethod: 'efectivo', concept: 'Gastos sin detalle (ajuste)' }), createdAt: '2026-10-22T11:00:00.000Z', updatedAt: '2026-10-22T11:00:00.000Z', cashAdjust: true });
    expect(cashStatus(d, '2026-10-22')!.left).toBe(10000000);
  });
});
