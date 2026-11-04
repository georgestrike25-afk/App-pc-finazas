import { describe, expect, it } from 'vitest';
import { netOfRefund, markRefund, receiveRefunds, refundSummary, reopenRefund, undoRefund } from '../../src/domain/refunds';
import { computeMonth } from '../../src/domain/monthly';
import { cashStatus } from '../../src/domain/cash';
import { emptyData, expense } from './helpers';

const uber = (id: string, amount: number, date = '2026-11-10') => expense({ id, kind: 'cotidiano', category: 'Transporte', month: '2026-11', date, totalAmount: amount, paymentMethod: 'debito', concept: 'Uber' });

describe('gastos que te devuelve el hospital', () => {
  it('mientras están pendientes no son un gasto tuyo, pero la plata sí salió de tu bolsillo', () => {
    const d = emptyData();
    d.settings = { ...d.settings, cash: { amount: 100000000, setAt: '2026-11-01T10:00:00.000Z' } };
    d.expenses = [
      { ...uber('a', 1000000), createdAt: '2026-11-10T10:00:00.000Z' }, // $ 10.000 propio
      { ...markRefund({ ...uber('b', 2000000), createdAt: '2026-11-10T11:00:00.000Z' }, 'Hospital'), }, // $ 20.000 que devuelve el hospital
    ];
    const m = computeMonth(d, '2026-11', '2026-11');
    expect(m.info.dailyRegistered).toBe(1000000); // solo el propio
    // Tu plata baja por los dos: lo que se fue de tu bolsillo.
    expect(cashStatus(d, '2026-11-12')!.left).toBe(100000000 - 3000000);
  });

  it('cuando te devuelven, la plata vuelve y el gasto nunca fue tuyo', () => {
    const d = emptyData();
    d.settings = { ...d.settings, cash: { amount: 100000000, setAt: '2026-11-01T10:00:00.000Z' } };
    const items = [markRefund({ ...uber('a', 1000000), createdAt: '2026-11-10T10:00:00.000Z' }, 'Hospital'), markRefund({ ...uber('b', 2000000), createdAt: '2026-11-10T11:00:00.000Z' }, 'Hospital')];
    d.expenses = receiveRefunds(items, 3000000, '2026-11-20', '2026-11-20T09:00:00.000Z');
    expect(d.expenses.map((e) => [e.refund!.status, e.refund!.receivedAmount])).toEqual([['devuelto', 1000000], ['devuelto', 2000000]]);
    expect(computeMonth(d, '2026-11', '2026-11').info.dailyRegistered).toBe(0);
    const c = cashStatus(d, '2026-11-21')!;
    expect(c.returned).toBe(3000000);
    expect(c.left).toBe(100000000); // salió y volvió
  });

  it('si el hospital paga distinto, se reparte en proporción y lo que no devolvió sí es tuyo', () => {
    const items = [markRefund(uber('a', 1000000), 'Hospital'), markRefund(uber('b', 3000000), 'Hospital')];
    const r = receiveRefunds(items, 3200000, '2026-11-20', '2026-11-20T09:00:00.000Z'); // pagó $ 32.000 de $ 40.000
    expect(r.map((e) => e.refund!.receivedAmount)).toEqual([800000, 2400000]);
    const d = emptyData();
    d.expenses = r;
    expect(computeMonth(d, '2026-11', '2026-11').info.dailyRegistered).toBe(800000); // los $ 8.000 que no devolvió
  });

  it('un monto parcial: el resto sí es gasto tuyo; deshacer y reabrir lo dejan como estaba', () => {
    const e = markRefund(uber('a', 1000000), 'Hospital', 600000);
    const d = emptyData();
    d.expenses = [e];
    expect(computeMonth(d, '2026-11', '2026-11').info.dailyRegistered).toBe(400000);
    expect(undoRefund(e).refund).toBeUndefined();
    const hecho = receiveRefunds([e], 600000, '2026-11-20', '2026-11-20T09:00:00.000Z')[0];
    const reabierto = reopenRefund(hecho);
    expect(reabierto.refund).toEqual({ from: 'Hospital', amount: 600000, status: 'pendiente' });
  });

  it('el resumen agrupa lo pendiente por quién devuelve', () => {
    const items = [markRefund(uber('a', 1000000, '2026-11-02'), 'Hospital'), markRefund(uber('b', 2000000, '2026-11-09'), 'Hospital'), markRefund(uber('c', 500000), 'Amigo'), uber('d', 999)];
    const s = refundSummary(items);
    expect(s.pendingTotal).toBe(3500000);
    expect(s.byFrom.map((g) => [g.from, g.total])).toEqual([['Hospital', 3000000], ['Amigo', 500000]]);
    expect(s.pending[0].id).toBe('c'); // lo más nuevo primero (10/11)
  });

  it('un gasto sin devolución no se toca (ni los importes negativos, como una bonificación)', () => {
    expect(netOfRefund(-100000, {})).toBe(-100000);
    expect(netOfRefund(1500, {})).toBe(1500);
  });
});

describe('gasto repetido por el mismo aviso', () => {
  it('la limpieza deja uno solo si salió del mismo aviso; dos viajes iguales a distinta hora quedan', async () => {
    const { freshDb } = await import('./helpers');
    const { repararDuplicados } = await import('../../src/db/repo');
    const { expenseFromDetected } = await import('../../src/notifications/ingest');
    const db = await freshDb();
    const t = Date.parse('2026-11-03T14:30:00');
    const aviso = { fecha: t, monto: 2414000, tipo: 'GASTO' as const, descripcion: 'Dlo*uber Rides', cuenta: 'Ualá', textoOriginal: 'x' };
    const a = expenseFromDetected(aviso, '2026-11-03T14:30:05.000Z', 'cel', 'k1');
    const b = expenseFromDetected(aviso, '2026-11-03T14:31:00.000Z', 'cel', 'k2'); // el mismo aviso otra vez
    const c = expenseFromDetected({ ...aviso, fecha: t + 3 * 3600 * 1000 }, '2026-11-03T17:30:05.000Z', 'cel', 'k3'); // otro viaje, mismo precio
    await db.expenses.bulkPut([a, b, c]);
    expect(await repararDuplicados(db)).toBe(1);
    const vivos = (await db.expenses.toArray()).filter((e) => !e.deleted).map((e) => e.id).sort();
    expect(vivos).toEqual([a.id, c.id].sort());
  });
});
