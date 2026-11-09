import { describe, expect, it } from 'vitest';
import { freshDb, obligation } from './helpers';
import { loadDataSet, repararDuplicados, saveRecord } from '../../src/db/repo';
import type { Obligation } from '../../src/domain/types';

// FICTICIO: dos compras distintas en el mismo comercio (mismas 2 cuotas, importes parecidos), vistas en el resumen de un mes y en el del siguiente.
describe('limpieza de duplicados: no funde compras distintas del mismo comercio', () => {
  const mk = (db: Awaited<ReturnType<typeof freshDb>>, id: string, doc: string, amount: number, paid: number, next: string) =>
    saveRecord<Obligation>('obligations', obligation({ id, entity: 'Mercado Pago', concept: 'MERPAGO*TIENDA', type: 'compra_cuotas', documentId: doc, totalInstallments: 2, installmentAmount: amount, paidInstallments: paid, nextDueMonth: next, frequency: 'mensual' }), 'alta', db);

  it('dos compras parecidas en dos resúmenes: quedan las dos, la más avanzada de cada una', async () => {
    const db = await freshDb();
    await mk(db, 'A-oct', 'docOct', 40_000_00, 1, '2026-10');
    await mk(db, 'B-oct', 'docOct', 42_800_00, 1, '2026-10');
    await mk(db, 'A-nov', 'docNov', 40_000_00, 2, '2026-11');
    await mk(db, 'B-nov', 'docNov', 42_800_00, 2, '2026-11');
    expect(await repararDuplicados(db)).toBe(2);
    const vivas = (await loadDataSet(db)).obligations.filter((o) => !o.deleted).map((o) => [o.id, o.installmentAmount]);
    expect(vivas.sort()).toEqual([['A-nov', 40_000_00], ['B-nov', 42_800_00]]);
  });

  it('la misma compra en dos resúmenes sigue juntándose en una', async () => {
    const db = await freshDb();
    await mk(db, 'A-oct', 'docOct', 40_000_00, 1, '2026-10');
    await mk(db, 'A-nov', 'docNov', 40_000_00, 2, '2026-11');
    expect(await repararDuplicados(db)).toBe(1);
    expect((await loadDataSet(db)).obligations.filter((o) => !o.deleted).map((o) => o.id)).toEqual(['A-nov']);
  });
});
