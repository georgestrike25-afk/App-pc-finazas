import { describe, expect, it } from 'vitest';
import { parseBankExtract } from '../../src/importers/bankExtract';
import { parseStatementText, reconcile } from '../../src/importers/statementParser';
import { buildReview, commitReview, validateReview } from '../../src/importers/review';
import { monthChecklist } from '../../src/domain/checklist';
import { loadDataSet } from '../../src/db/repo';
import { freshDb } from './helpers';
import type { SourceLine } from '../../src/importers/statementParser';

/** Arma un renglón con celdas (texto + posición), como lo devuelve el lector de PDF. */
const row = (...cells: Array<[number, string]>): SourceLine => ({ text: cells.map((c) => c[1]).join(' '), cells: cells.map(([x, s]) => ({ x, s })) });

// Extracto FICTICIO con el diseño de la caja de ahorro de Ualá.
const EXTRACTO: SourceLine[] = [
  row([38, '¡Hola,']),
  row([38, 'Titular De Prueba!']),
  row([39, 'Saldo final'], [193, 'Período'], [425, 'CUIT']),
  row([39, '$ 1.000,00'], [193, '2026-09-01 - 2026-09-30'], [425, '20-11111111-1']),
  row([43, 'Saldo Inicial'], [498, '$ 500,00']),
  row([43, 'Ingreso de dinero'], [489, '$ 10.510,00']),
  row([43, 'Egreso de dinero'], [492, '$ 10.010,00']),
  row([43, 'Saldo final'], [497, '$ 1.000,00']),
  row([42, 'Fecha'], [110, 'Descripción'], [374, 'Débitos'], [443, 'Créditos'], [529, 'Saldo']),
  row([42, '01 sep 2026'], [110, 'Intereses diarios'], [447, '$ 10,00'], [498, '$ 510,00']),
  row([110, 'Ingreso de dinero a tu CBU']),
  row([42, '01 sep 2026'], [110, 'TITULAR DE PRUEBA'], [428, '$ 10.000,00'], [498, '$ 10.510,00']),
  row([110, 'Ingreso de dinero a tu CBU']),
  row([42, '02 sep 2026'], [110, 'DLO*UBER RIDES'], [353, '-$ 1.500,00'], [498, '$ 9.010,00']),
  row([110, 'Consumo con tarjeta']),
  row([42, '02 sep 2026'], [110, 'Devolución de compra'], [433, '$ 500,00'], [498, '$ 9.510,00']),
  row([110, 'Ingreso de dinero a tu CBU']),
  row([42, '02 sep 2026'], [110, 'DLO*UBER RIDES'], [353, '-$ 500,00'], [498, '$ 9.010,00']),
  row([110, 'Consumo con tarjeta']),
  row([42, '03 sep 2026'], [110, 'Transferencia enviada'], [351, '-$ 3.000,00'], [498, '$ 6.010,00']),
  row([110, 'Persona Ficticia']),
  row([110, '27000000001']),
  row([110, 'Referencia:']),
  row([110, '701a76ab-8d06-4e62-a2ac-257f888ea096']),
  row([42, '03 sep 2026'], [110, 'Transferencia enviada'], [351, '-$ 4.000,00'], [498, '$ 2.010,00']),
  row([110, 'Titular De Prueba']),
  row([110, '20111111111']),
  row([42, '04 sep 2026'], [110, 'Spotify'], [356, '-$ 1.000,00'], [498, '$ 1.010,00']),
  row([110, 'Consumo con tarjeta']),
  row([39, 'Movimientos de referencia']),
  row([42, 'Fecha'], [120, 'Descripción'], [444, 'Débitos'], [529, 'Saldo']),
  row([42, '04 sep 2026'], [120, 'Percepción de Ganancias del 30%'], [429, '-$ 10,00'], [499, '$ 1.000,00']),
  row([38, 'Ualá Bank S.A.U.']),
];

describe('extracto de cuenta Ualá (datos ficticios)', () => {
  it('lee débitos y créditos por columna, y coincide con los totales', () => {
    const d = parseBankExtract(EXTRACTO)!;
    expect(d.entity.value).toBe('Ualá');
    expect(d.accountCheck).toMatchObject({ credits: 1051000, debits: 1001000, parsedCredits: 1051000, parsedDebits: 1001000 });
    expect(d.items.map((i) => [i.kind, i.amount, !!i.cancelsOut])).toEqual([
      ['credito', 1000, false],
      ['transferencia', 1000000, false],
      ['consumo', 150000, false],
      ['bonificacion', 50000, false],
      ['consumo', 50000, false],
      ['consumo', 300000, false],
      ['transferencia', 400000, false],
      ['consumo', 100000, false],
      ['cargo', 1000, false],
    ]);
    expect(d.items[5].concept).toBe('Transferencia a Persona Ficticia');
    expect(d.items[2].suggestedCategory).toBe('Transporte');
  });

  it('anula un débito con la devolución del mismo importe e importa como débito pagado', async () => {
    const lines = [...EXTRACTO];
    // devolución exacta del segundo Uber
    lines.splice(19, 0, row([42, '02 sep 2026'], [110, 'Devolución de compra'], [433, '$ 500,00'], [498, '$ 9.510,00']));
    const d = parseBankExtract(lines)!;
    expect(d.items.filter((i) => i.cancelsOut)).toHaveLength(2);
    const db = await freshDb();
    const r = await buildReview(d, { name: 'u.pdf', size: 1, mime: 'application/pdf', kind: 'pdf', hash: 'u' }, false, db, '2026-10');
    expect(validateReview(r)).toEqual([]);
    await commitReview(r, null, db);
    const exps = (await loadDataSet(db)).expenses;
    expect(exps.every((e) => e.paymentMethod === 'debito' && e.paid)).toBe(true);
    expect(exps.map((e) => e.totalAmount).sort((a, b) => a - b)).toEqual([-50000, 1000, 100000, 150000, 300000]);
  });
});

describe('resumen de tarjeta Ualá (datos ficticios)', () => {
  const LINES: SourceLine[] = [
    row([70, '¡Hola,'], [426, 'Ualá Bank S.A.U.']),
    row([91, 'Tu deuda en pesos:'], [245, 'Tu deuda en dólares:']),
    row([91, '-$ 1.000,00'], [245, 'USD 0,00']),
    row([91, 'Pago mínimo'], [245, 'Pago mínimo'], [383, 'Fecha de cierre']),
    row([91, '$ 0,00'], [245, 'USD 0,00'], [383, '30 Sep 2026']),
    row([91, 'Resumen anterior'], [245, 'Resumen anterior'], [383, 'Fecha de vencimiento']),
    row([91, '$ 2.000,00'], [245, 'USD 0,00'], [383, '08 Oct 2026']),
    row([67, 'Fecha'], [147, 'Descripción'], [367, 'Pago en pesos'], [454, 'Pago en dólares']),
    row([67, '10 SEP 26'], [147, 'PAGO CON SALDO EN CUENTA'], [367, '-2.000,00']),
    row([67, 'Total'], [367, '-$ 2.000,00'], [454, 'USD 0,00']),
    row([67, 'Fecha'], [151, 'Descripción'], [274, 'N° Cupón'], [360, 'Pesos'], [451, 'Dólares']),
    row([151, 'MERPAGO*TIENDA']),
    row([67, '23 JUN 26'], [274, 'T11111'], [360, '1.000,00']),
    row([151, 'CABA'], [176, 'ARG(04/06)']),
    row([151, 'MERPAGO*OTRA']),
    row([67, '23 SEP 26'], [274, 'R22222'], [360, '500,00']),
    row([151, 'Capital'], [201, 'ARG(01/06)']),
    row([151, 'MERPAGO*OTRA']),
    row([67, '25 SEP 26'], [274, 'R33333'], [360, '-3.000,00']),
    row([151, 'Capital'], [201, 'ARG(01/06)']),
    row([67, 'Total'], [360, '-$ 1.500,00'], [451, 'USD 0,00']),
    row([67, 'Fecha'], [162, 'Descripción'], [438, 'Pago en pesos']),
    row([67, '30 SEP 26'], [162, 'IMPUESTO DE SELLOS'], [438, '500,00']),
  ];
  it('lee el diseño en tres renglones, el saldo a favor y la compra anulada', () => {
    const d = parseStatementText(LINES);
    expect(d.entity.value).toBe('Ualá');
    expect(d).toMatchObject({ month: '2026-10' });
    expect(d.total.value).toBe(-100000);
    expect(d.previousBalance.value).toBe(200000);
    expect(d.closingDate.value).toBe('2026-09-30');
    expect(d.items.map((i) => [i.kind, i.concept, i.amount, i.installment ? `${i.installment.n}/${i.installment.total}` : '', !!i.cancelsOut])).toEqual([
      ['pago', 'PAGO CON SALDO EN CUENTA', 200000, '', false],
      ['cuota', 'MERPAGO*TIENDA', 100000, '4/6', false],
      ['cuota', 'MERPAGO*OTRA', 50000, '1/6', true],
      ['credito', 'MERPAGO*OTRA', 300000, '1/6', true],
      ['cargo', 'IMPUESTO DE SELLOS', 50000, '', false],
    ]);
    expect(reconcile(d.previousBalance.value, d.total.value, d.items)).toMatchObject({ ok: true });
  });
});

describe('pendientes del mes', () => {
  it('pide el sueldo, el pago de cada tarjeta y la copia; se tildan solos', async () => {
    const db = await freshDb();
    const d = parseStatementText([
      { text: 'NARANJA X' },
      { text: 'Tu total a pagar es $5.000,00' },
      { text: 'y vence el 10/10/26.' },
      { text: '05/09/26 COMERCIO PRUEBA 5.000,00' },
    ]);
    await commitReview(await buildReview(d, { name: 'n.pdf', size: 1, mime: 'application/pdf', kind: 'pdf', hash: 'n' }, false, db, '2026-10'), null, db);
    let c = monthChecklist(await loadDataSet(db), '2026-10', '2026-10-20');
    expect(c.find((i) => i.key === 'sueldo')?.done).toBe(false);
    const pay = c.find((i) => i.key === 'pago-Naranja X')!;
    expect(pay).toMatchObject({ done: false });
    expect(pay.payStatementId).toBeDefined();
    expect(c.find((i) => i.key === 'copia')?.done).toBe(false);
    const { markStatementPaid } = await import('../../src/db/cardPayments');
    const st = (await loadDataSet(db)).statements[0];
    await markStatementPaid(db, st, '2026-10-20', '2026-10-20T12:00:00Z');
    c = monthChecklist(await loadDataSet(db), '2026-10', '2026-10-20', '2026-10-20T10:00:00Z');
    expect(c.find((i) => i.key === 'pago-Naranja X')?.done).toBe(true);
    expect(c.find((i) => i.key === 'copia')?.done).toBe(true);
    // Un resumen de hace un mes no se pide de nuevo (llegan con atraso)
    expect(c.find((i) => i.key === 'resumen-Naranja X')).toBeUndefined();
    expect(monthChecklist(await loadDataSet(db), '2026-12', '2026-12-05').find((i) => i.key === 'resumen-Naranja X')).toBeDefined();
  });
});
