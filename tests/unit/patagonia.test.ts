import { describe, expect, it, beforeEach } from 'vitest';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createRequire } from 'node:module';
import { freshDb } from './helpers';
import { extractPdfText, type PdfLib } from '../../src/importers/pdf';
import { parseStatementText, reconcile, checkUpcoming } from '../../src/importers/statementParser';
import { buildReview, commitReview, validateReview, verifyReview } from '../../src/importers/review';
import { loadDataSet } from '../../src/db/repo';
import { computeMonth } from '../../src/domain/monthly';
import { buildSchedule } from '../../src/domain/obligations';
import { makePatagoniaPdf } from '../fixtures/patagoniaFixture';
import type { FinanzasDB } from '../../src/db/db';

const require = createRequire(import.meta.url);
(pdfjs as unknown as { GlobalWorkerOptions: { workerSrc: string } }).GlobalWorkerOptions.workerSrc = require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs');

async function parsePdf(bytes: Uint8Array) {
  const { result, doc } = await extractPdfText(pdfjs as unknown as PdfLib, bytes.slice());
  await doc.destroy();
  return parseStatementText(result.lines);
}

async function review(db: FinanzasDB, next = false) {
  const bytes = await makePatagoniaPdf({ next });
  return buildReview(await parsePdf(bytes), { name: next ? 'nov.pdf' : 'oct.pdf', size: bytes.length, mime: 'application/pdf', kind: 'pdf', hash: next ? 'h2' : 'h1' }, false, db, '2026-10');
}

describe('resumen con diseño Visa Banco Patagonia (datos ficticios)', () => {
  let db: FinanzasDB;
  beforeEach(async () => {
    db = await freshDb();
  });

  it('lee los datos del resumen, incluso los que están en columnas', async () => {
    const d = await parsePdf(await makePatagoniaPdf());
    expect(d.entity.value).toBe('Visa Banco Patagonia');
    expect(d.closingDate.value).toBe('2026-10-01');
    expect(d.dueDate.value).toBe('2026-10-13');
    expect(d.month).toBe('2026-10');
    expect(d.total.value).toBe(31800000);
    expect(d.minimumPayment.value).toBe(6000000);
    expect(d.previousBalance.value).toBe(50000000);
    expect(d.nextClosingDate.value).toBe('2026-10-29');
    expect(d.nextDueDate.value).toBe('2026-11-11');
    expect(d.undetermined).toEqual([]);
  });

  it('clasifica pagos, refinanciación, bonificaciones, cuotas, Plan V, Sancor y cargos', async () => {
    const d = await parsePdf(await makePatagoniaPdf());
    const rows = d.items.map((i) => [i.kind, i.amount, i.installment ? `${i.installment.n}/${i.installment.total}` : '']);
    expect(rows).toEqual([
      ['pago', 10000000, ''],
      ['credito', 40000000, ''],
      ['bonificacion', 210000, ''],
      ['bonificacion', 1000000, ''],
      ['cuota', 5000000, '3/6'],
      ['cuota', 15000000, '1/3'],
      ['consumo', 2000000, ''],
      ['bonificacion', 500000, ''],
      ['sancor', 10000000, ''],
      ['cargo', 1000000, ''],
      ['cargo', 300000, ''],
      ['cargo', 210000, ''],
    ]);
    expect(d.items[1].refinancing).toBe(true);
    expect(d.items[4].concept).toBe('SHOP*PRUEBA');
    expect(d.items[5].concept).toContain('PLAN V');
    expect(d.items[11].concept).toBe('DB IVA $ 21%');
    expect(d.items.every((i) => i.currency === 'ARS' && i.confidence === 'alta')).toBe(true);
  });

  it('se autoverifica contra el saldo actual y el cuadro "Cuotas a vencer"', async () => {
    const d = await parsePdf(await makePatagoniaPdf());
    expect(reconcile(d.previousBalance.value, d.total.value, d.items)).toMatchObject({ ok: true, difference: 0 });
    expect(d.upcoming.map((u) => u.amount)).toEqual([20000000, 20000000, 5000000, 0]);
    expect(checkUpcoming(d.upcoming, d.items).every((u) => u.ok)).toBe(true);
    // Un importe mal leído rompe la verificación
    const broken = d.items.map((i, k) => (k === 6 ? { ...i, amount: 2100000 } : i));
    expect(reconcile(d.previousBalance.value, d.total.value, broken)).toMatchObject({ ok: false, difference: -100000 });
  });

  it('importa sin errores y el mes coincide con el total del resumen', async () => {
    const r = await review(db);
    expect(validateReview(r)).toEqual([]);
    expect(verifyReview(r).balance?.ok).toBe(true);
    expect(r.items[1]).toMatchObject({ action: 'ignorar', include: false });
    await commitReview(r, null, db);
    const data = await loadDataSet(db);
    data.settings.monthBudgets['2026-10'] = { amount: 0, mode: 'real' };
    const m = computeMonth(data, '2026-10', '2026-10');
    const outflows = m.sections.filter((s) => s.sign === -1).reduce((a, s) => a + s.total, 0);
    // Consumos, cuotas, cargos y Sancor menos bonificaciones = total del resumen (los pagos no son gasto)
    expect(outflows).toBe(31800000);
    expect(m.sections.find((s) => s.key === 'cotidiano')!.total).toBe(1500000);
    // Cargos 10.000 + 3.000 + 2.100 − bonificación de comisión 10.000 − crédito de IVA 2.100
    expect(m.sections.find((s) => s.key === 'personales')!.total).toBe(300000);
    expect(m.info.sancorExpected).toBe(5000000);
    expect(computeMonth(data, '2026-11', '2026-10').sections.find((s) => s.key === 'obligaciones')!.total).toBe(20000000);
    expect(computeMonth(data, '2027-01', '2026-10').sections.find((s) => s.key === 'obligaciones')!.total).toBe(5000000);
    expect(computeMonth(data, '2027-02', '2026-10').sections.find((s) => s.key === 'obligaciones')!.total).toBe(0);
  });

  it('el resumen siguiente no duplica cuotas', async () => {
    await commitReview(await review(db), null, db);
    const r2 = await review(db, true);
    expect(r2.summary.month).toBe('2026-11');
    expect(r2.items.filter((i) => i.action === 'vincular').map((i) => i.installmentN)).toEqual([4, 2]);
    await commitReview(r2, null, db, { markPreviousPaid: true });
    const obs = (await loadDataSet(db)).obligations;
    expect(obs).toHaveLength(2);
    const shop = obs.find((o) => o.concept === 'SHOP*PRUEBA')!;
    expect(shop.paidInstallments).toBe(3);
    expect(buildSchedule(shop, '2026-11').filter((i) => i.status === 'pendiente').map((i) => i.n)).toEqual([4, 5, 6]);
  });
});
