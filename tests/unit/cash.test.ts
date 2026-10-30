import { describe, expect, it } from 'vitest';
import { cashStatus } from '../../src/domain/cash';
import { emptyData, expense, income } from './helpers';

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

describe('reintegro de Sancor y tu plata', () => {
  it('lo que te devuelve tu pareja después de anotar tu plata se suma a lo que te queda', () => {
    const d = emptyData();
    d.settings.cash = { amount: 10000000, setAt: '2026-10-22T10:00:00.000Z' };
    d.sancor.push({ id: 's', createdAt: 'x', updatedAt: 'x', month: '2026-10', chargeAmount: 286456_00, partnerPct: 50, received: [
      { date: '2026-10-21', amount: 14322800 }, // antes: ya estaba incluido en lo que anotaste
      { date: '2026-11-05', amount: 15000000, at: '2026-11-05T12:00:00.000Z' },
    ] });
    const s = cashStatus(d, '2026-11-06')!;
    expect(s.returned).toBe(15000000);
    expect(s.left).toBe(25000000);
  });
});

describe('plata hasta cobrar: ingresos anotados después', () => {
  it('suma lo que entró después de anotar la plata (no lo de antes)', () => {
    const settings = { ...emptyData().settings, cash: { amount: 100_000_00, setAt: '2026-10-20T10:00:00.000Z' } };
    const inc = (createdAt: string, extras: Array<{ concept: string; amount: number; at?: string }>) => ({ ...income({ month: '2026-10', amountReceived: 0 }), createdAt, extras });
    const c = cashStatus(
      {
        ...emptyData(),
        settings,
        incomes: [
          inc('2026-10-01T10:00:00.000Z', [
            { concept: 'Viejo', amount: 5_000_00, at: '2026-10-05T10:00:00.000Z' },
            { concept: 'Transferencia', amount: 150_000_00, at: '2026-10-29T10:00:00.000Z' },
          ]),
          // Anotado con el widget antes de que existiera la fecha por renglón: el registro es de después.
          inc('2026-10-28T10:00:00.000Z', [{ concept: 'Ingreso', amount: 1_000_00 }]),
        ],
      },
      '2026-10-30',
    )!;
    expect(c.ingresos).toBe(151_000_00);
    expect(c.left).toBe(100_000_00 + 151_000_00);
  });
});
