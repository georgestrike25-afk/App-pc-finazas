import { describe, expect, it, beforeEach } from 'vitest';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createRequire } from 'node:module';
import { freshDb, expense, obligation } from './helpers';
import { extractPdfText, type PdfLib } from '../../src/importers/pdf';
import { parseStatementText } from '../../src/importers/statementParser';
import { buildReview, commitReview, validateReview } from '../../src/importers/review';
import { validateFile, ImportError } from '../../src/importers/fileValidation';
import { parseCsv, rowsToLines, parseSpreadsheet } from '../../src/importers/tabular';
import { sha256Hex } from '../../src/domain/text';
import { buildSchedule } from '../../src/domain/obligations';
import { computeMonth } from '../../src/domain/monthly';
import { loadDataSet, repararDuplicados } from '../../src/db/repo';
import { buildBackup, restoreBackup } from '../../src/backup/backup';
import { makeStatementPdf, NEXT_STATEMENT_LINES } from '../fixtures/makeFixtures';
import type { FinanzasDB } from '../../src/db/db';

const require = createRequire(import.meta.url);
(pdfjs as unknown as { GlobalWorkerOptions: { workerSrc: string } }).GlobalWorkerOptions.workerSrc = require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs');

async function reviewFromPdf(db: FinanzasDB, bytes: Uint8Array, name = 'resumen.pdf') {
  const v = validateFile(name, bytes);
  const { result, doc } = await extractPdfText(pdfjs as unknown as PdfLib, bytes.slice());
  await doc.destroy();
  const parsed = parseStatementText(result.lines);
  const hash = await sha256Hex(bytes);
  return buildReview(parsed, { name, size: bytes.length, mime: v.mime, kind: v.kind, hash }, false, db, '2026-10');
}

describe('importación de documentos', () => {
  let db: FinanzasDB;
  beforeEach(async () => {
    db = await freshDb();
  });

  it('valida archivos por contenido y rechaza malformados', () => {
    expect(() => validateFile('a.pdf', new Uint8Array([1, 2, 3]))).toThrow(ImportError);
    expect(() => validateFile('a.exe', new Uint8Array([0x4d, 0x5a]))).toThrow(/no admitido/);
    expect(() => validateFile('a.png', new TextEncoder().encode('%PDF-1.4'))).toThrow();
    expect(() => validateFile('a.csv', new TextEncoder().encode('<html><script>alert(1)</script>'))).toThrow(/código activo/);
    expect(() => validateFile('a.pdf', new Uint8Array())).toThrow(/vacío/);
    expect(validateFile('a.csv', new TextEncoder().encode('fecha;concepto;importe')).kind).toBe('csv');
  });

  it('rechaza un PDF dañado sin romper la aplicación', async () => {
    const bad = new TextEncoder().encode('%PDF-1.7\n garbage garbage');
    await expect(extractPdfText(pdfjs as unknown as PdfLib, bad)).rejects.toThrow(/No se pudo leer el PDF/);
  });

  it('importa un PDF con texto, permite corregir un importe y evita duplicados', async () => {
    const pdf = await makeStatementPdf();
    const review = await reviewFromPdf(db, pdf);
    expect(review.summary.entity).toBe('Visa Banco Patagonia');
    expect(review.summary.total).toBe(14170050);
    expect(review.summary.month).toBe('2026-10');
    expect(review.items.map((i) => i.action)).toEqual(['pago', 'gasto', 'cuota', 'sancor', 'gasto']);

    // Corrección de un importe extraído incorrectamente
    const coto = review.items[1];
    coto.amount = 3245000;
    coto.reviewed = true;
    expect(validateReview(review)).toEqual([]);
    const res = await commitReview(review, new Blob([pdf as BlobPart]), db);
    expect(res.created).toMatchObject({ gastos: 2, cuotas: 1, pagos: 1, sancor: 1, resumen: 1 });

    const exps = await db.expenses.toArray();
    expect(exps.find((e) => e.concept.includes('COTO'))!.totalAmount).toBe(3245000);
    // El total del resumen NO se convierte en deuda: solo 1 obligación (la compra en cuotas)
    const obs = await db.obligations.toArray();
    expect(obs).toHaveLength(1);
    expect(obs[0]).toMatchObject({ paidInstallments: 3, totalInstallments: 10, installmentAmount: 1200000, nextDueMonth: '2026-10' });
    expect(buildSchedule(obs[0], '2026-10').filter((i) => i.status === 'pendiente')).toHaveLength(7);
    const st = await db.statements.toArray();
    expect(st[0].total).toBe(14170050);
    expect((await db.blobs.count())).toBe(1);

    // El pago del resumen no se resta como gasto
    const data = await loadDataSet(db);
    const r = computeMonth(data, '2026-10', '2026-10');
    // El pago del 05/09 se imputa a septiembre como información, nunca como gasto
    const sep = computeMonth(data, '2026-09', '2026-10');
    expect(sep.info.cardPaymentsTotal).toBe(15000000);
    expect(sep.sections.every((s) => s.lines.every((l) => !l.label.includes('PAGO')))).toBe(true);
    expect(r.sections.find((s) => s.key === 'fijos')!.lines.some((l) => l.label.includes('Sancor'))).toBe(true);

    // Importación repetida: advierte y no duplica automáticamente
    const again = await reviewFromPdf(db, pdf);
    expect(again.documentDuplicateOf).toBeDefined();
    expect(again.warnings[0]).toMatch(/ya fue importado/);
    expect(again.items.every((i) => !i.include && i.duplicate?.type === 'linea')).toBe(true);
    const res2 = await commitReview(again, null, db);
    expect(res2.created).toMatchObject({ gastos: 0, cuotas: 0, pagos: 0, sancor: 0 });
    expect(await db.expenses.count()).toBe(2);
    expect(await db.obligations.count()).toBe(1);
  });

  it('un resumen posterior no duplica cuotas futuras', async () => {
    const first = await reviewFromPdf(db, await makeStatementPdf());
    await commitReview(first, null, db);
    const next = await reviewFromPdf(db, await makeStatementPdf(NEXT_STATEMENT_LINES), 'resumen-nov.pdf');
    const cuota = next.items.find((i) => i.installmentN === 5)!;
    expect(cuota.action).toBe('vincular');
    expect(cuota.duplicate?.type).toBe('obligacion');
    await commitReview(next, null, db, { markPreviousPaid: true });
    const obs = await db.obligations.toArray();
    expect(obs).toHaveLength(1);
    expect(obs[0].paidInstallments).toBe(4);
    expect(buildSchedule(obs[0], '2026-11').filter((i) => i.status === 'pendiente')).toHaveLength(6);
    expect(await db.sancor.count()).toBe(2);
  });

  it('vincula una línea importada con un gasto manual (sin doble cómputo)', async () => {
    await db.expenses.put(expense({ kind: 'cotidiano', month: '2026-09', date: '2026-09-08', totalAmount: 3245050, paymentMethod: 'tarjeta', concept: 'Súper Coto' }));
    const review = await reviewFromPdf(db, await makeStatementPdf());
    const coto = review.items[1];
    expect(coto.action).toBe('vincular');
    expect(coto.duplicate?.type).toBe('gasto_manual');
    await commitReview(review, null, db);
    const exps = await db.expenses.toArray();
    expect(exps.filter((e) => e.totalAmount === 3245050)).toHaveLength(1);
    expect(exps.find((e) => e.concept === 'Súper Coto')!.linkedLineFingerprints).toHaveLength(1);
  });

  it('bloquea datos dudosos hasta que se revisen', async () => {
    const parsed = parseStatementText([{ text: '03/09/26 FARMACIA 1.234,00', ocrConfidence: 40 }]);
    const r = await buildReview(parsed, { name: 'x.png', size: 1, mime: 'image/png', kind: 'imagen', hash: 'h' }, true, db, '2026-10');
    expect(validateReview(r)[0].message).toMatch(/lectura dudosa/);
    r.items[0].reviewed = true;
    expect(validateReview(r)).toEqual([]);
  });

  it('lee CSV con columnas (incluido formato de extracto de cuenta)', () => {
    const csv = 'Fecha;Descripción;Importe\n01/10/2026;Pago Edenor;-25.000,00\n02/10/2026;Transferencia recibida;100.000,00\n03/10/2026;Carrefour;-12.500,50';
    const { lines, mapped } = rowsToLines(parseCsv(csv));
    expect(mapped).toBe(true);
    const doc = parseStatementText(lines);
    expect(doc.items.map((i) => [i.kind, i.amount])).toEqual([
      ['consumo', 2500000],
      ['credito', 10000000],
      ['consumo', 1250050],
    ]);
    expect(doc.items[0].suggestedKind).toBe('hogar');
  });

  it('lee XLSX con fechas y números nativos', async () => {
    const XLSX = await import('@e965/xlsx');
    const ws = XLSX.utils.aoa_to_sheet([
      ['Fecha', 'Concepto', 'Cuota', 'Importe'],
      [new Date(2026, 9, 5), 'NARANJA X ZAPATILLAS', '2/6', 15000.5],
      [new Date(2026, 9, 7), 'YPF', '', 30000],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Movimientos');
    const bytes = new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }));
    expect(validateFile('m.xlsx', bytes).kind).toBe('excel');
    const { lines } = rowsToLines(await parseSpreadsheet(bytes));
    const doc = parseStatementText(lines);
    expect(doc.items[0]).toMatchObject({ kind: 'cuota', amount: 1500050, date: '2026-10-05', installment: { n: 2, total: 6 } });
    expect(doc.items[1]).toMatchObject({ kind: 'consumo', amount: 3000000, suggestedCategory: 'Combustible' });
  });

  it('lee XLS (formato binario antiguo)', async () => {
    const XLSX = await import('@e965/xlsx');
    const ws = XLSX.utils.aoa_to_sheet([['Fecha', 'Detalle', 'Monto'], ['05/10/2026', 'FARMACITY', '4.500,00']]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Hoja1');
    const bytes = new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'biff8' }));
    expect(validateFile('m.xls', bytes).kind).toBe('excel');
    const doc = parseStatementText(rowsToLines(await parseSpreadsheet(bytes)).lines);
    expect(doc.items[0]).toMatchObject({ amount: 450000, suggestedCategory: 'Farmacia' });
  });
});

describe('el mismo documento subido en dos dispositivos', () => {
  const importar = async (d: FinanzasDB, pdf: Uint8Array) => {
    const review = await reviewFromPdf(d, pdf);
    await commitReview(review, null, d);
  };
  const vivos = async (d: FinanzasDB) => ({
    exp: (await d.expenses.toArray()).filter((x) => !x.deleted).length,
    obl: (await d.obligations.toArray()).filter((x) => !x.deleted).length,
    st: (await d.statements.toArray()).filter((x) => !x.deleted).length,
    pagos: (await d.cardPayments.toArray()).filter((x) => !x.deleted).length,
    sancor: (await d.sancor.toArray()).filter((x) => !x.deleted).length,
  });

  it('al juntarlos quedaba todo duplicado; se deja una sola copia y la marca de borrado viaja al otro dispositivo', async () => {
    const pdf = await makeStatementPdf();
    const a = await freshDb();
    await importar(a, pdf);
    const unico = await vivos(a);
    const b = await freshDb();
    await importar(b, pdf);
    // Al sincronizar se juntan las dos copias y se limpian en el mismo paso.
    await restoreBackup(await buildBackup({}, b), 'fusionar', a, 'sincronizar');
    expect(await vivos(a)).toEqual(unico);
    // El otro dispositivo recibe los borrados y no vuelve a duplicar.
    await restoreBackup(await buildBackup({}, a), 'fusionar', b, 'sincronizar');
    await repararDuplicados(b);
    expect(await vivos(b)).toEqual(unico);
    expect(await repararDuplicados(a)).toBe(0);
  });

  it('un gasto manual y lo que se editó en una copia no se pierden', async () => {
    const pdf = await makeStatementPdf();
    const a = await freshDb();
    await importar(a, pdf);
    const b = await freshDb();
    await importar(b, pdf);
    // En el dispositivo B se marcó una cuota como pagada (la copia más trabajada).
    const ob = (await b.obligations.toArray()).find((o) => !o.deleted)!;
    await b.obligations.put({ ...ob, paidInstallments: ob.paidInstallments + 1, updatedAt: new Date(Date.now() + 60_000).toISOString() });
    await b.expenses.put({ ...expense({ kind: 'cotidiano', month: '2026-10', totalAmount: 1000, concept: 'Manual mío' }), documentId: (await b.documents.toArray())[0].id });
    await restoreBackup(await buildBackup({}, b), 'fusionar', a, 'sincronizar');
    await repararDuplicados(a);
    const obs = (await a.obligations.toArray()).filter((o) => !o.deleted);
    expect(obs).toHaveLength(1);
    expect(obs[0].paidInstallments).toBe(ob.paidInstallments + 1);
    expect((await a.expenses.toArray()).some((e) => !e.deleted && e.concept === 'Manual mío')).toBe(true);
  });

  it('dos préstamos distintos con la misma cuota no se confunden', async () => {
    const d = await freshDb();
    await importar(d, await makeStatementPdf());
    const antes = await vivos(d);
    expect(await repararDuplicados(d)).toBe(0);
    expect(await vivos(d)).toEqual(antes);
  });
});

describe('cuotas del mes pasado y de este mes', () => {
  const deudas = async (d: FinanzasDB) => (await d.obligations.toArray()).filter((o) => !o.deleted);

  it('subir dos veces el mismo resumen no duplica nada', async () => {
    const d = await freshDb();
    const pdf = await makeStatementPdf();
    await commitReview(await reviewFromPdf(d, pdf), null, d);
    const antes = { obl: (await deudas(d)).length, exp: (await d.expenses.toArray()).filter((e) => !e.deleted).length };
    await commitReview(await reviewFromPdf(d, pdf), null, d);
    expect((await deudas(d)).length).toBe(antes.obl);
    expect((await d.expenses.toArray()).filter((e) => !e.deleted).length).toBe(antes.exp);
  });

  it('si ya quedó duplicada (cuota 9 de 10 y cuota 10 de 10), se queda con la más nueva', async () => {
    const d = await freshDb();
    const base = obligation({ entity: 'Tarjeta Naranja', concept: 'Heladera 10 cuotas', totalInstallments: 10, installmentAmount: 50000, frequency: 'mensual' });
    // Del resumen de octubre: va por la 9 (8 pagadas). Del de noviembre: va por la 10 (9 pagadas).
    await d.obligations.bulkPut([
      { ...base, id: 'vieja', documentId: 'doc-oct', paidInstallments: 8, nextDueMonth: '2026-10' },
      { ...base, id: 'nueva', entity: 'Naranja X', documentId: 'doc-nov', paidInstallments: 9, nextDueMonth: '2026-11' },
      // Otra compra distinta en la misma tarjeta: no se toca.
      { ...base, id: 'otra', concept: 'Zapatillas', totalInstallments: 3, installmentAmount: 20000, documentId: 'doc-oct', paidInstallments: 1, nextDueMonth: '2026-10' },
    ]);
    await d.fingerprints.put({ id: 'f1', createdAt: base.createdAt, updatedAt: base.createdAt, fingerprint: 'x', documentId: 'doc-oct', targetType: 'cuota', targetId: 'vieja' } as never);
    expect(await repararDuplicados(d)).toBe(1);
    expect((await deudas(d)).map((o) => o.id).sort()).toEqual(['nueva', 'otra']);
    expect((await d.fingerprints.get('f1'))!.targetId).toBe('nueva');
    expect(await repararDuplicados(d)).toBe(0);
  });

  it('dos compras iguales del mismo resumen no se juntan', async () => {
    const d = await freshDb();
    const base = obligation({ entity: 'Naranja X', concept: 'Pasaje', totalInstallments: 6, installmentAmount: 30000, frequency: 'mensual', paidInstallments: 0, nextDueMonth: '2026-10' });
    await d.obligations.bulkPut([
      { ...base, id: 'p1', documentId: 'doc' },
      { ...base, id: 'p2', documentId: 'doc' },
    ]);
    expect(await repararDuplicados(d)).toBe(0);
  });
});
