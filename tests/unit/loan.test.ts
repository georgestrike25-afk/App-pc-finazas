import { describe, expect, it, beforeEach } from 'vitest';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createRequire } from 'node:module';
import { freshDb } from './helpers';
import { extractPdfText, type PdfLib } from '../../src/importers/pdf';
import { detectLoanSchedule, summarizeLoan } from '../../src/importers/loanSchedule';
import { buildLoanReview, commitLoanReview } from '../../src/importers/loanReview';
import { parseStatementText } from '../../src/importers/statementParser';
import { loadDataSet } from '../../src/db/repo';
import { buildSchedule, obligationProgress } from '../../src/domain/obligations';
import { computeMonth } from '../../src/domain/monthly';
import { makeLoanPdf } from '../fixtures/loanFixture';
import { makePatagoniaPdf } from '../fixtures/patagoniaFixture';
import type { FinanzasDB } from '../../src/db/db';

const require = createRequire(import.meta.url);
(pdfjs as unknown as { GlobalWorkerOptions: { workerSrc: string } }).GlobalWorkerOptions.workerSrc = require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs');

async function lines(bytes: Uint8Array) {
  const { result, doc } = await extractPdfText(pdfjs as unknown as PdfLib, bytes.slice());
  await doc.destroy();
  return result.lines;
}

async function importLoan(db: FinanzasDB, paidUpTo: number, hash: string) {
  const ls = await lines(await makeLoanPdf(paidUpTo));
  const r = await buildLoanReview(detectLoanSchedule(ls)!, { name: 'cronograma.pdf', size: 1, mime: 'application/pdf', kind: 'pdf', hash }, ls.map((l) => l.text).join('\n'), db);
  return { r, res: await commitLoanReview(r, null, db) };
}

describe('cronogramas de préstamos (datos ficticios)', () => {
  let db: FinanzasDB;
  beforeEach(async () => {
    db = await freshDb();
  });

  it('reconoce el cronograma: cuotas, capital, total y estado', async () => {
    const s = detectLoanSchedule(await lines(await makeLoanPdf()))!;
    expect(s).not.toBeNull();
    expect(s.loanType).toBe('personal');
    expect(s.loanNumber).toBe('99990001');
    expect(s.rows).toHaveLength(6);
    expect(s.rows[0]).toMatchObject({ n: 1, dueDate: '2026-06-05', capital: 1000000, total: 2500000, status: 'pagada' });
    expect(s.rows[3]).toMatchObject({ n: 4, status: 'pendiente' });
    expect(s.warnings).toEqual([]);
    const sm = summarizeLoan(s.rows, '2026-08-20');
    expect(sm).toMatchObject({ paidCount: 3, totalInstallments: 6, remainingTotal: 6900000, remainingCapital: 4200000, remainingInterestAndTaxes: 2700000, originalCapital: 7500000 });
    expect(sm.nextRow?.n).toBe(4);
    expect(sm.lastRow.dueDate).toBe('2026-11-05');
  });

  it('no confunde un cronograma con un resumen de tarjeta ni al revés', async () => {
    expect(parseStatementText(await lines(await makeLoanPdf())).items).toHaveLength(0);
    expect(detectLoanSchedule(await lines(await makePatagoniaPdf()))).toBeNull();
  });

  it('crea un préstamo con el importe exacto de cada cuota e informa el avance', async () => {
    await importLoan(db, 3, 'a');
    const [ob] = (await loadDataSet(db)).obligations;
    expect(ob).toMatchObject({ type: 'prestamo', entity: 'Banco Patagonia', paidInstallments: 3, totalInstallments: 6, nextDueMonth: '2026-09', loanNumber: '99990001' });
    const pr = obligationProgress(ob, '2026-08');
    expect(pr).toMatchObject({ currentN: 4, total: 6, paid: 3, remainingCount: 3, remainingTotal: 6900000, remainingCapital: 4200000, remainingInterest: 2700000, nextAmount: 2350000, nextDueDate: '2026-09-05', lastDueDate: '2026-11-05' });
    expect(pr.paidPct).toBe(44);
    expect(buildSchedule(ob, '2026-08').map((i) => i.amount)).toEqual([2500000, 2450000, 2400000, 2350000, 2300000, 2250000]);
    const data = await loadDataSet(db);
    expect(computeMonth(data, '2026-10', '2026-08').sections.find((s) => s.key === 'obligaciones')!.total).toBe(2300000);
    expect(computeMonth(data, '2026-12', '2026-08').sections.find((s) => s.key === 'obligaciones')!.total).toBe(0);
  });

  it('un cronograma más nuevo actualiza el mismo préstamo sin duplicarlo', async () => {
    await importLoan(db, 3, 'a');
    const { r, res } = await importLoan(db, 5, 'b');
    expect(r.existing).toBeDefined();
    expect(res.updated).toBe(true);
    const obs = (await loadDataSet(db)).obligations;
    expect(obs).toHaveLength(1);
    expect(obs[0].paidInstallments).toBe(5);
    expect(obs[0].revisions).toHaveLength(1);
    expect(obligationProgress(obs[0], '2026-10')).toMatchObject({ currentN: 6, remainingTotal: 2250000 });
  });
});
