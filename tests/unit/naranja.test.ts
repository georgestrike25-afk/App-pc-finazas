import { describe, expect, it } from 'vitest';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createRequire } from 'node:module';
import { freshDb } from './helpers';
import { extractPdfText, type PdfLib } from '../../src/importers/pdf';
import { checkUpcoming, parseStatementText, reconcile } from '../../src/importers/statementParser';
import { buildReview, commitReview, validateReview, verifyReview } from '../../src/importers/review';
import { loadDataSet } from '../../src/db/repo';
import { debtByEntity } from '../../src/domain/obligations';
import { makeNaranjaPdf } from '../fixtures/naranjaFixture';

const require = createRequire(import.meta.url);
(pdfjs as unknown as { GlobalWorkerOptions: { workerSrc: string } }).GlobalWorkerOptions.workerSrc = require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs');

async function parse() {
  const { result, doc } = await extractPdfText(pdfjs as unknown as PdfLib, (await makeNaranjaPdf()).slice());
  await doc.destroy();
  return parseStatementText(result.lines);
}

describe('resumen con diseño Naranja X (datos ficticios)', () => {
  it('lee fechas escritas en texto ("vence el", "cerró el") y los totales', async () => {
    const d = await parse();
    expect(d.entity.value).toBe('Naranja X');
    expect(d.dueDate.value).toBe('2026-09-10');
    expect(d.closingDate.value).toBe('2026-08-27');
    expect(d.nextClosingDate.value).toBe('2026-09-27');
    expect(d.nextDueDate.value).toBe('2026-10-10');
    expect(d.month).toBe('2026-09');
    expect(d.total.value).toBe(550000);
    expect(d.minimumPayment.value).toBe(200000);
    expect(d.previousBalance.value).toBe(1000000);
  });

  it('lee consumos con columna de cuota, cargos sin fecha y el pago anterior', async () => {
    const d = await parse();
    expect(d.items.map((i) => [i.kind, i.amount, i.installment ? `${i.installment.n}/${i.installment.total}` : ''])).toEqual([
      ['cuota', 300000, '9/12'],
      ['cargo', 200000, ''],
      ['cargo', 42000, ''],
      ['cargo', 8000, ''],
      ['pago', 1000000, ''],
    ]);
    expect(d.items[0]).toMatchObject({ concept: 'TIENDA PRUEBA', installmentConfidence: 'alta', date: '2025-12-15' });
    expect(d.items[2].concept).toMatch(/^IVA/);
    expect(d.items[2].date).toBe('2026-08-27');
    expect(d.items[3].concept).toBe('Impuesto de Sellos');
  });

  it('se autoverifica (saldo y cuotas futuras) e importa sin errores', async () => {
    const d = await parse();
    expect(reconcile(d.previousBalance.value, d.total.value, d.items)).toMatchObject({ ok: true, difference: 0 });
    expect(d.upcoming.map((u) => u.amount)).toEqual([300000, 300000, 300000, 0]);
    expect(checkUpcoming(d.upcoming, d.items).every((u) => u.ok)).toBe(true);
    const db = await freshDb();
    const r = await buildReview(d, { name: 'nx.pdf', size: 1, mime: 'application/pdf', kind: 'pdf', hash: 'nx' }, false, db, '2026-09');
    expect(validateReview(r)).toEqual([]);
    expect(verifyReview(r).balance?.ok).toBe(true);
    await commitReview(r, null, db);
    const data = await loadDataSet(db);
    const debt = debtByEntity(data.obligations, '2026-09');
    expect(debt[0]).toMatchObject({ group: 'Naranja X', remaining: 1200000, lastMonth: '2026-12' });
  });
});
