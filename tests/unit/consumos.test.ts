import { describe, expect, it } from 'vitest';
import { parseCardActivity } from '../../src/importers/cardActivity';
import { parseStatementText, type SourceLine } from '../../src/importers/statementParser';
import { buildReview, commitReview } from '../../src/importers/review';
import { validateFile } from '../../src/importers/fileValidation';
import { freshDb } from './helpers';
import { loadDataSet } from '../../src/db/repo';
import { debtByEntity } from '../../src/domain/obligations';

// OCR FICTICIO de dos cuadros de una grabación de "Tus consumos" (con los errores típicos: "0CT", "PlanZ").
const frame = (page: number, rows: string[]): SourceLine[] => rows.map((text) => ({ text, ocrConfidence: 90, page }));
const VIDEO: SourceLine[] = [
  ...frame(1, [
    'OCT             NOV              DIC',
    'Octubre hasta ahora              Cierre: 27/OCT',
    's 150.300" O',
    'Consumos del 28/SEP al 27/OCT',
    '14/0CT/26',
    'Merpago* tiendaprueba           $ 20.000,00',
    'Naranja X de Persona Prueba            1 pago',
    '7/0CT/26',
    'Comercio prueba                 $ 40.000,00',
    'Naranja X de Persona Prueba            PlanZ',
    '5/0CT/26',
    'Uniformes prueba sa             $ 30.000,30',
  ]),
  // El siguiente cuadro (después de desplazar) repite consumos y muestra los que faltaban.
  ...frame(2, [
    'Octubre hasta ahora              Cierre: 27/OCT',
    'Consumos del 28/SEP al 27/OCT',
    '7/OCT/26',
    'Comercio prueba                 $ 40.000,00',
    'Naranja X de Persona Prueba            Plan Z',
    '5/OCT/26',
    'Uniformes prueba sa             $ 30.000,30',
    'Naranja X de Persona Prueba        Cuota 1/3',
    '5/OCT/26',
    'Farmacia prueba                 $ 60.300,00',
    'Naranja X de Persona Prueba            1 pago',
  ]),
  ...frame(3, ['Noviembre hasta ahora          Cierre: 27/NOV', 's 30.000% ()', 'Cuotas de consumos anteriores', '5/0CT/26', 'Uniformes prueba sa  $ 30.000,30', 'Naranja X de Persona Prueba   Cuota 2/3']),
];

describe('consumos del período abierto (video o capturas de la app de la tarjeta)', () => {
  it('lee los consumos sin repetirlos entre cuadros y verifica el total', () => {
    const d = parseCardActivity(VIDEO)!;
    expect(d.docType).toBe('consumos');
    expect(d.entity.value).toBe('Naranja X');
    expect(d.closingDate.value).toBe('2026-10-27');
    expect(d.month).toBe('2026-11');
    expect(d.items.map((i) => [i.concept, i.amount, i.kind, i.installment?.total])).toEqual([
      ['Merpago*tiendaprueba', 2000000, 'consumo', undefined],
      ['Comercio prueba', 4000000, 'consumo', undefined],
      ['Uniformes prueba sa', 3000030, 'cuota', 3],
      ['Farmacia prueba', 6030000, 'consumo', undefined],
    ]);
    expect(d.activityCheck).toEqual({ declaredWhole: 150300, parsed: 15030030, label: 'Octubre hasta ahora' });
    expect(parseCardActivity([{ text: 'Resumen de cuenta' }])).toBeNull();
  });

  it('se cargan como provisorios y el resumen después los confirma sin duplicar', async () => {
    const db = await freshDb();
    const file = { name: 'grabacion.mp4', size: 1, mime: 'video/mp4', kind: 'video' as const, hash: 'v1' };
    const rv = await buildReview(parseCardActivity(VIDEO)!, file, true, db, '2026-10');
    expect(rv.summary.registerStatement).toBe(false);
    const r = await commitReview(rv, null, db);
    expect(r.created).toMatchObject({ gastos: 3, cuotas: 1, resumen: 0 });
    const prov = (await db.expenses.toArray()).filter((e) => e.provisional);
    expect(prov).toHaveLength(3);
    expect(prov.every((e) => e.month === '2026-11' && e.paymentMethod === 'tarjeta')).toBe(true);
    // En "Deuda por entidad" aparece la tarjeta: consumos del próximo resumen + la compra en cuotas.
    const data = await loadDataSet(db);
    const nx = debtByEntity(data.obligations, '2026-10', data).find((d) => d.group === 'Naranja X')!;
    expect(nx.card.map((c) => [c.kind, c.amount, c.month])).toEqual([['consumos', 12030000, '2026-11']]);
    expect(nx.items).toHaveLength(1);
    expect(nx.remaining).toBe(12030000 + 3 * 3000030);

    // Llega el resumen: dos consumos coinciden, la cuota también; uno (Plan Z) no aparece.
    const resumen = `NARANJA X
Cierre actual: 27/10/2026
Vencimiento actual: 10/11/2026
Saldo anterior 0,00
14/10/26 MERPAGO*TIENDAPRUEBA 20.000,00
05/10/26 FARMACIA PRUEBA 60.300,00
05/10/26 UNIFORMES PRUEBA SA C.01/03 30.000,30
Total a pagar 110.300,30`;
    const st = await buildReview(parseStatementText(resumen.split('\n').map((text) => ({ text }))), { name: 'r.pdf', size: 1, mime: 'application/pdf', kind: 'pdf', hash: 'r1' }, false, db, '2026-11');
    const acts = st.items.map((i) => [i.concept, i.action, i.duplicate?.type]);
    expect(acts).toEqual([
      ['MERPAGO*TIENDAPRUEBA', 'vincular', 'gasto_manual'],
      ['FARMACIA PRUEBA', 'vincular', 'gasto_manual'],
      ['UNIFORMES PRUEBA SA', 'vincular', 'obligacion'],
    ]);
    expect(st.warnings.join(' ')).toMatch(/1 consumo\(s\) provisorio\(s\) de Naranja X no aparecen.*Comercio prueba/);
    await commitReview(st, null, db);
    const all = (await db.expenses.toArray()).filter((e) => !e.deleted);
    expect(all).toHaveLength(3);
    expect(all.filter((e) => e.provisional).map((e) => e.concept)).toEqual(['Comercio prueba']);
    expect(await db.obligations.count()).toBe(1);
  });

  it('acepta grabaciones de pantalla (MP4)', () => {
    const mp4 = new Uint8Array([0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]);
    expect(validateFile('Screen_Recording.mp4', mp4)).toMatchObject({ kind: 'video', mime: 'video/mp4' });
    expect(() => validateFile('falso.mp4', new TextEncoder().encode('hola'))).toThrow();
  });
});

describe('deuda por entidad con resúmenes sin pagar', () => {
  it('suma lo que falta pagar del resumen sin contar dos veces sus cuotas', async () => {
    const { debtByEntity } = await import('../../src/domain/obligations');
    const T = '2026-10-01T00:00:00.000Z';
    const ob = { id: 'o', createdAt: T, updatedAt: T, entity: 'Naranja X', type: 'compra_cuotas' as const, concept: 'Uniformes', paidInstallments: 1, totalInstallments: 5, installmentAmount: 3000000, nextDueMonth: '2026-11', frequency: 'mensual' as const, status: 'pendiente' as const, variableAmount: false, revisions: [] };
    const st = { id: 's', createdAt: T, updatedAt: T, entity: 'Naranja X', month: '2026-11', dueDate: '2026-11-10', total: 20000000, currency: 'ARS' as const };
    const pay = { id: 'p', createdAt: T, updatedAt: T, entity: 'Naranja X', statementId: 's', date: '2026-10-30', month: '2026-10', amount: 5000000, source: 'manual' as const };
    const [nx] = debtByEntity([ob], '2026-10', { statements: [st], cardPayments: [pay], expenses: [] });
    // Resumen: 200.000 − pagado 50.000 − cuota de noviembre 30.000 (ya en la deuda de cuotas) = 120.000
    expect(nx.card).toEqual([expect.objectContaining({ kind: 'resumen', amount: 12000000, month: '2026-11' })]);
    expect(nx.remaining).toBe(12000000 + 4 * 3000000);
  });

  it('al resumen de la tarjeta no se le restan los préstamos personales del mismo banco', async () => {
    const { debtByEntity } = await import('../../src/domain/obligations');
    const T = '2026-10-01T00:00:00.000Z';
    const base = { createdAt: T, updatedAt: T, entity: 'Banco Patagonia', frequency: 'mensual' as const, status: 'pendiente' as const, variableAmount: false, revisions: [] };
    // Del resumen de la Visa: una compra en cuotas. Del cronograma: un préstamo personal (se debita aparte).
    const cuota = { ...base, id: 'c', type: 'compra_cuotas' as const, concept: 'Compra', paidInstallments: 1, totalInstallments: 3, installmentAmount: 1000000, nextDueMonth: '2026-11', documentId: 'doc-visa' };
    const prestamo = { ...base, id: 'p', type: 'prestamo' as const, concept: 'Préstamo personal', loanNumber: '123', paidInstallments: 4, totalInstallments: 12, installmentAmount: 500000, nextDueMonth: '2026-11' };
    const st = { id: 's', createdAt: T, updatedAt: T, entity: 'Visa Banco Patagonia', month: '2026-11', dueDate: '2026-11-11', total: 6000000, currency: 'ARS' as const, documentId: 'doc-visa' };
    const [bp] = debtByEntity([cuota, prestamo], '2026-10', { statements: [st], cardPayments: [], expenses: [] });
    // Resumen 60.000 − cuota de la tarjeta 10.000 = 50.000 (el préstamo no se resta).
    expect(bp.card).toEqual([expect.objectContaining({ kind: 'resumen', amount: 5000000 })]);
    // Noviembre: todo el resumen (60.000) + la cuota del préstamo (5.000).
    expect(bp.byMonth['2026-11']).toBe(6000000 + 500000);
  });

  it('"Este mes pagás": el resumen por su total con sus cuotas adentro y los préstamos aparte', async () => {
    const { debtByEntity, monthToPay } = await import('../../src/domain/obligations');
    const T = '2026-10-01T00:00:00.000Z';
    const base = { createdAt: T, updatedAt: T, entity: 'Banco Patagonia', frequency: 'mensual' as const, status: 'pendiente' as const, variableAmount: false, revisions: [] };
    const cuota = { ...base, id: 'c', type: 'compra_cuotas' as const, concept: 'Compra', paidInstallments: 1, totalInstallments: 3, installmentAmount: 1000000, nextDueMonth: '2026-11', documentId: 'doc-visa' };
    const prestamo = { ...base, id: 'p', type: 'prestamo' as const, concept: 'Préstamo personal', loanNumber: '123', paidInstallments: 4, totalInstallments: 12, installmentAmount: 500000, nextDueMonth: '2026-11', dueDates: { 5: '2026-11-05' } };
    const st = { id: 's', createdAt: T, updatedAt: T, entity: 'Visa Banco Patagonia', month: '2026-11', dueDate: '2026-11-11', total: 6000000, currency: 'ARS' as const, documentId: 'doc-visa' };
    const cards = { statements: [st], cardPayments: [], expenses: [] };
    const [bp] = monthToPay(debtByEntity([cuota, prestamo], '2026-11', cards), '2026-11', [st]);
    expect(bp.total).toBe(6000000 + 500000);
    expect(bp.lines).toEqual([
      expect.objectContaining({ label: 'Préstamo personal', due: '2026-11-05', amount: 500000, detail: 'Cuota 5 de 12' }),
      expect.objectContaining({ label: 'Resumen de la tarjeta', due: '2026-11-11', amount: 6000000, detail: 'Incluye Compra 2/3' }),
    ]);
  });
});

describe('consumos de la app de la tarjeta subidos después del resumen', () => {
  const RESUMEN = `NARANJA X
Cierre actual: 27/10/2026
Vencimiento actual: 10/11/2026
Saldo anterior 0,00
14/10/26 MERPAGO*TIENDAPRUEB 20.000,00
06/10/26 FARMACIA PRUEBA SRL 60.300,00
05/10/26 UNIFORMES PRUEBA SA C.01/03 30.000,30
Total a pagar 110.300,30`;
  const vivos = async (db: Awaited<ReturnType<typeof freshDb>>) => (await db.expenses.toArray()).filter((e) => !e.deleted);

  // El resumen escribe distinto el comercio y la fecha que la app de la tarjeta.
  it('lo que ya vino en el resumen no se vuelve a sumar como "próximo resumen"', async () => {
    const db = await freshDb();
    await commitReview(await buildReview(parseStatementText(RESUMEN.split('\n').map((text) => ({ text }))), { name: 'r.pdf', size: 1, mime: 'application/pdf', kind: 'pdf', hash: 'r1' }, false, db, '2026-11'), null, db);
    expect(await vivos(db)).toHaveLength(2);
    const rv = await buildReview(parseCardActivity(VIDEO)!, { name: 'grabacion.mp4', size: 1, mime: 'video/mp4', kind: 'video', hash: 'v1' }, true, db, '2026-11');
    expect(rv.items.filter((i) => i.include).map((i) => i.concept)).toEqual(['Comercio prueba']);
    await commitReview(rv, null, db);
    expect((await vivos(db)).filter((e) => e.provisional).map((e) => e.concept)).toEqual(['Comercio prueba']);
    expect(await db.obligations.count()).toBe(1);
  });

  it('si ya quedaron repetidos, la limpieza quita los provisorios que vinieron en el resumen', async () => {
    const db = await freshDb();
    await commitReview(await buildReview(parseStatementText(RESUMEN.split('\n').map((text) => ({ text }))), { name: 'r.pdf', size: 1, mime: 'application/pdf', kind: 'pdf', hash: 'r1' }, false, db, '2026-11'), null, db);
    const T = '2026-10-20T00:00:00.000Z';
    const prov = (id: string, concept: string, date: string, amount: number) => ({ id, createdAt: T, updatedAt: T, date, month: '2026-11', concept, category: 'Otros', kind: 'personal' as const, totalAmount: amount, userPct: 100, frequency: 'unica' as const, paymentMethod: 'tarjeta' as const, source: 'importado' as const, paid: false, provisional: true, cardEntity: 'Naranja X' });
    await db.expenses.bulkPut([prov('p1', 'Merpago* tiendaprueba', '2026-10-14', 2000000), prov('p2', 'Farmacia prueba', '2026-10-05', 6030000), prov('p3', 'Comercio prueba', '2026-10-07', 4000000)]);
    const { repararDuplicados } = await import('../../src/db/repo');
    expect(await repararDuplicados(db)).toBe(2);
    expect((await vivos(db)).filter((e) => e.provisional).map((e) => e.id)).toEqual(['p3']);
  });
});
