import { describe, expect, it } from 'vitest';
import { expense } from './helpers';
import { cashStatus } from '../../src/domain/cash';
import { debtPaymentExpense } from '../../src/domain/payments';
import type { Settings } from '../../src/domain/types';

const settings = { cash: { amount: 1_000_000_00, setAt: '2026-11-05T10:00:00.000Z' } } as unknown as Settings;
const status = (expenses: ReturnType<typeof expense>[]) => cashStatus({ expenses, cardPayments: [], settings }, '2026-11-08')!;

describe('plata hasta cobrar: los pagos ocultos se ven y se pueden quitar', () => {
  it('un pago de cuota (no es gasto) trae su id para quitarlo; un gasto común no', () => {
    const pago = debtPaymentExpense('Cuota 2 de Préstamo', 50_000_00, '2026-11-06', '2026-11-06T10:00:00.000Z');
    const gasto = expense({ kind: 'cotidiano', month: '2026-11', date: '2026-11-06', totalAmount: 10_000_00, createdAt: '2026-11-06T11:00:00.000Z' });
    const s = status([pago, gasto]);
    expect(s.left).toBe(940_000_00);
    expect(s.items.map((i) => [i.concept, !!i.removableId])).toEqual(expect.arrayContaining([['Cuota 2 de Préstamo', true], ['Gasto de prueba', false]]));
    // Quitar = marcar eliminado: la plata vuelve.
    expect(status([{ ...pago, deleted: true }, gasto]).left).toBe(990_000_00);
  });
});
