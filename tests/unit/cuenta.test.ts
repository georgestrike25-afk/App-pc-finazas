import { describe, expect, it, beforeEach } from 'vitest';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createRequire } from 'node:module';
import { freshDb } from './helpers';
import { extractPdfText, type PdfLib } from '../../src/importers/pdf';
import { parseAccountMovements } from '../../src/importers/accountMovements';
import { parseStatementText } from '../../src/importers/statementParser';
import { detectLoanSchedule } from '../../src/importers/loanSchedule';
import { buildLoanReview, commitLoanReview } from '../../src/importers/loanReview';
import { buildReview, commitReview, validateReview } from '../../src/importers/review';
import { loadDataSet, saveRecord } from '../../src/db/repo';
import { makeLoanPdf } from '../fixtures/loanFixture';
import type { FinanzasDB } from '../../src/db/db';
import type { Income, Statement } from '../../src/domain/types';

const require = createRequire(import.meta.url);
(pdfjs as unknown as { GlobalWorkerOptions: { workerSrc: string } }).GlobalWorkerOptions.workerSrc = require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs');

/** Texto de una captura FICTICIA de movimientos de cuenta (como la devuelve el OCR). */
export const ACCOUNT_LINES = [
  '19:36 Banco Pata... patagonia.com.ar',
  'Otorgamiento adelanto + $ 50.000,00', '13/09/2026',
  'Transferencia entre cuentas var 20000000001 titular de prueba - $ 10.000,00', '13/09/2026',
  'Pago visa electronico - $ 318.000,00', '13/09/2026',
  'Amort.s/prestamo otorg. - $23.500,00', '13/09/2026',
  'Cancelacion adelanto - $ 40.000,00', '13/09/2026',
  'Acredit. plan sueldos c 0001 + $1.000.000,00', '13/09/2026',
  'Acreditacion de intereses + $ 0,10', '31/08/2026',
  'Tarjetas de credito + $ 5.000,00', '11/08/2026',
  'Amort.s/prestamo otorg. - $ 24.000,00', '10/08/2026',
].map((text) => ({ text, ocrConfidence: 90 }));

async function setup(db: FinanzasDB) {
  const { result } = await extractPdfText(pdfjs as unknown as PdfLib, (await makeLoanPdf(3)).slice());
  await commitLoanReview(await buildLoanReview(detectLoanSchedule(result.lines)!, { name: 'c.pdf', size: 1, mime: 'application/pdf', kind: 'pdf', hash: 'loan' }, '', db), null, db);
  await saveRecord<Statement>('statements', { entity: 'Visa Banco Patagonia', month: '2026-09', total: 31800000, currency: 'ARS' } as Statement, 't', db);
}

describe('movimientos de cuenta (capturas de home banking, datos ficticios)', () => {
  let db: FinanzasDB;
  beforeEach(async () => {
    db = await freshDb();
    await setup(db);
  });

  it('reconoce el formato y clasifica cada movimiento', () => {
    const d = parseAccountMovements(ACCOUNT_LINES)!;
    expect(d.docType).toBe('cuenta');
    expect(d.entity.value).toBe('Banco Patagonia');
    expect(d.month).toBe('2026-09');
    expect(d.items.map((i) => [i.kind, i.amount, i.date])).toEqual([
      ['adelanto', 5000000, '2026-09-13'],
      ['transferencia', 1000000, '2026-09-13'],
      ['pago', 31800000, '2026-09-13'],
      ['pago_prestamo', 2350000, '2026-09-13'],
      ['adelanto', 4000000, '2026-09-13'],
      ['ingreso', 100000000, '2026-09-13'],
      ['credito', 10, '2026-08-31'],
      ['credito', 500000, '2026-08-11'],
      ['pago_prestamo', 2400000, '2026-08-10'],
    ]);
  });

  it('no confunde resúmenes ni cronogramas con movimientos de cuenta', async () => {
    expect(parseAccountMovements([{ text: '05/09/26 COTO 1.234,56' }, { text: '06/09/26 YPF 2.000,00' }, { text: '07/09/26 DIA 500,00' }])).toBeNull();
    const { result } = await extractPdfText(pdfjs as unknown as PdfLib, (await makeLoanPdf(3)).slice());
    expect(parseAccountMovements(result.lines)).toBeNull();
  });

  it('incorpora el sueldo, vincula el pago de la tarjeta y la cuota del préstamo; solo el mes más reciente', async () => {
    const r = await buildReview(parseAccountMovements(ACCOUNT_LINES)!, { name: 'captura.jpg', size: 1, mime: 'image/jpeg', kind: 'imagen', hash: 'cap' }, true, db, '2026-09');
    expect(validateReview(r)).toEqual([]);
    const incl = r.items.filter((i) => i.include).map((i) => [i.action, i.parsedKind]);
    expect(incl).toEqual([
      ['pago', 'pago'],
      ['vincular', 'pago_prestamo'],
      ['ingreso', 'ingreso'],
    ]);
    expect(r.items[2].duplicate?.type).toBe('resumen');
    expect(r.items[3].duplicate).toMatchObject({ type: 'prestamo', installmentN: 4 });
    // La cuota de agosto (3) ya figura pagada por el cronograma
    expect(r.items[8]).toMatchObject({ include: false, action: 'ignorar' });
    const res = await commitReview(r, null, db);
    expect(res.created).toMatchObject({ ingresos: 1, pagos: 1, vinculados: 1, gastos: 0 });
    const data = await loadDataSet(db);
    expect(data.incomes).toHaveLength(1);
    expect(data.incomes[0]).toMatchObject({ month: '2026-09', status: 'confirmado', amountReceived: 100000000, receivedDate: '2026-09-13' });
    expect(data.cardPayments[0]).toMatchObject({ amount: 31800000, entity: 'Visa Banco Patagonia' });
    expect(data.cardPayments[0].statementId).toBe(data.statements[0].id);
    expect(data.obligations[0].paidInstallments).toBe(4);
    // Adelantos y transferencias no son ingresos ni gastos
    expect(data.expenses).toHaveLength(0);
  });

  it('subir la misma captura otra vez no duplica nada', async () => {
    const d = parseAccountMovements(ACCOUNT_LINES)!;
    await commitReview(await buildReview(d, { name: 'a.jpg', size: 1, mime: 'image/jpeg', kind: 'imagen', hash: 'a' }, true, db, '2026-09'), null, db);
    const r2 = await buildReview(d, { name: 'b.jpg', size: 1, mime: 'image/jpeg', kind: 'imagen', hash: 'b' }, true, db, '2026-09');
    expect(r2.items.filter((i) => i.include)).toHaveLength(0);
    await commitReview(r2, null, db);
    const data = await loadDataSet(db);
    expect(data.incomes).toHaveLength(1);
    expect(data.cardPayments).toHaveLength(1);
    expect(data.obligations[0].paidInstallments).toBe(4);
  });

  it('si ya había un ingreso del mes, el sueldo nuevo se suma como adicional', async () => {
    const d = parseAccountMovements(ACCOUNT_LINES)!;
    const { saveRecord: save } = await import('../../src/db/repo');
    await save<Income>('incomes', { month: '2026-09', status: 'confirmado', amountReceived: 20000000, extras: [], deductions: [], revisions: [] }, 't', db);
    await commitReview(await buildReview(d, { name: 'a.jpg', size: 1, mime: 'image/jpeg', kind: 'imagen', hash: 'a' }, true, db, '2026-09'), null, db);
    const inc = (await loadDataSet(db)).incomes[0];
    expect(inc.amountReceived).toBe(20000000);
    expect(inc.extras).toEqual([{ concept: 'Acredit. plan sueldos c 0001', amount: 100000000 }]);
    expect(inc.revisions).toHaveLength(1);
    expect(parseStatementText(ACCOUNT_LINES).items.length).toBeGreaterThanOrEqual(0);
  });
});
