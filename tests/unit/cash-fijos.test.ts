import { describe, expect, it } from 'vitest';
import { expense } from './helpers';
import { cashStatus } from '../../src/domain/cash';
import { payHousehold } from '../../src/domain/payments';
import type { Settings } from '../../src/domain/types';

const settings = { cash: { amount: 1_000_000_00, setAt: '2026-11-05T10:00:00.000Z' } } as unknown as Settings;
const left = (expenses: ReturnType<typeof expense>[], today: string) => cashStatus({ expenses, cardPayments: [], settings }, today)!.left;
const fijo = (p: Record<string, unknown> = {}) => expense({ kind: 'personal', concept: 'Suscripción', month: '2026-10', date: '2026-10-08', totalAmount: 10_000_00, frequency: 'mensual', createdAt: '2026-10-08T10:00:00.000Z', ...p });

describe('plata hasta cobrar: gastos fijos mensuales (ficticio)', () => {
  it('se descuenta cuando llega su día, una vez por mes', () => {
    const e = fijo();
    expect(left([e], '2026-11-07')).toBe(1_000_000_00); // todavía no llegó el 8
    expect(left([e], '2026-11-08')).toBe(990_000_00);
    expect(left([e], '2026-11-20')).toBe(990_000_00); // no se repite dentro del mes
    expect(left([e], '2026-12-09')).toBe(980_000_00); // y vuelve el mes siguiente
  });
  it('no cuenta lo de tarjeta, lo que paga la otra persona, lo ya pagado ni el mes salteado', () => {
    expect(left([fijo({ paymentMethod: 'tarjeta' })], '2026-11-20')).toBe(1_000_000_00);
    expect(left([fijo({ paidBy: 'pareja' })], '2026-11-20')).toBe(1_000_000_00);
    expect(left([fijo({ overrides: { '2026-11': { skip: true } } })], '2026-11-20')).toBe(1_000_000_00);
    const hogar = fijo({ kind: 'hogar', userPct: 50, concept: 'Gas', totalAmount: 8_000_00 });
    expect(left([hogar], '2026-11-20')).toBe(996_000_00); // tu mitad
    const { payment } = payHousehold(hogar, '2026-11', 4_000_00, false, 'Ana', '2026-11-08', '2026-11-08T10:00:00.000Z');
    expect(left([hogar, payment], '2026-11-20')).toBe(996_000_00); // "Pagado" no descuenta dos veces
  });
});
