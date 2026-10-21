import { describe, expect, it } from 'vitest';
import { parseStatementText } from '../../src/importers/statementParser';
import { buildReview, commitReview } from '../../src/importers/review';
import { couponMerges, partnerCoupon, pctForCoupon, sancorSummary } from '../../src/domain/sancor';
import { ensureInitialized, loadDataSet, mergeSancorCoupons } from '../../src/db/repo';
import { monthChecklist } from '../../src/domain/checklist';
import type { SancorCharge } from '../../src/domain/types';
import { freshDb } from './helpers';

// Resumen FICTICIO con dos cupones de Sancor: el del titular y el de su pareja.
const RESUMEN = `BANCO PATAGONIA - VISA
Cierre actual: 25/09/2026
Vencimiento actual: 06/10/2026
Saldo anterior 0,00
08/09/26 COTO SUC 45 10.000,00
17/09/26 111111* ASOC MUTUAL SANC 000111C00000001 100.000,00
17/09/26 222222* ASOC MUTUAL SANC 000111C00000002 100.000,00
Total a pagar 210.000,00`;

const T = '2026-10-01T00:00:00.000Z';
const charge = (p: Partial<SancorCharge>): SancorCharge => ({ id: 'x', createdAt: T, updatedAt: T, month: '2026-10', chargeAmount: 10000000, partnerPct: 50, received: [], statementId: 'st1', ...p });

describe('Sancor: dos cupones en el mismo resumen', () => {
  it('al importar forman un solo cargo y la pareja devuelve un cupón entero', async () => {
    const db = await freshDb();
    const parsed = parseStatementText(RESUMEN.split('\n').map((text) => ({ text })));
    const rv = await buildReview(parsed, { name: 'r.pdf', size: 1, mime: 'application/pdf', kind: 'pdf', hash: 'h' }, false, db, '2026-10');
    expect(rv.items.filter((i) => i.action === 'sancor')).toHaveLength(2);
    const res = await commitReview(rv, null, db);
    expect(res.created.sancor).toBe(1);
    const [c] = (await db.sancor.toArray()).filter((x) => !x.deleted);
    expect(c.chargeAmount).toBe(20000000);
    expect(c.coupons?.map((k) => k.amount)).toEqual([10000000, 10000000]);
    const s = sancorSummary(c);
    expect(s.expected).toBe(10000000);
    expect(s.netEstimated).toBe(10000000);
    expect(partnerCoupon(c)?.amount).toBe(10000000);
    const data = await loadDataSet(db);
    expect(monthChecklist(data, '2026-10', '2026-10-21').find((i) => i.key === 'sancor')?.title).toContain('100.000,00');
  });

  it('une los cargos que ya estaban guardados por separado (y lo hace igual en cada dispositivo)', async () => {
    const db = await freshDb();
    await db.sancor.bulkPut([
      charge({ id: 'b', received: [{ date: '2026-10-05', amount: 2000000 }] }),
      charge({ id: 'a' }),
      charge({ id: 'otro-mes', month: '2026-09' }),
      charge({ id: 'manual', statementId: undefined }),
    ]);
    await db.fingerprints.put({ id: 'f1', createdAt: T, updatedAt: T, fingerprint: 'linea-b', targetType: 'sancor', targetId: 'b' });
    expect(couponMerges(await db.sancor.toArray()).map((m) => [m.keep.id, m.remove.map((r) => r.id)])).toEqual([['a', ['b']]]);
    await ensureInitialized(db); // se ejecuta al abrir la app
    const all = await db.sancor.toArray();
    const a = all.find((x) => x.id === 'a')!;
    expect(a.chargeAmount).toBe(20000000);
    expect(a.coupons).toHaveLength(2);
    expect(a.received).toEqual([{ date: '2026-10-05', amount: 2000000 }]);
    expect(sancorSummary(a)).toMatchObject({ expected: 10000000, received: 2000000, pending: 8000000 });
    expect(all.find((x) => x.id === 'b')!.deleted).toBe(true);
    expect(all.find((x) => x.id === 'manual')!.deleted).toBeFalsy();
    expect((await db.fingerprints.get('f1'))!.targetId).toBe('a');
    // Idempotente
    expect(await mergeSancorCoupons(db)).toBe(0);
  });

  it('si los cupones son distintos se puede elegir cuál es el de la pareja', () => {
    const c = charge({ chargeAmount: 25000000, coupons: [{ amount: 10000000 }, { amount: 15000000 }] });
    expect(partnerCoupon(c)).toBeUndefined();
    const pct = pctForCoupon(c, 15000000);
    expect(sancorSummary({ ...c, partnerPct: pct }).expected).toBe(15000000);
    expect(partnerCoupon({ ...c, partnerPct: pct })?.amount).toBe(15000000);
  });
});
