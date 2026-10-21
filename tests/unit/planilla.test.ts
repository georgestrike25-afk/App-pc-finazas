import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { detectSharedSheet, parseSheetAmount, sheetRows, buildSharedReview, commitSharedReview, setSharedMe, gridToLines } from '../../src/importers/sharedSheet';
import { parseStatementText, type SourceLine } from '../../src/importers/statementParser';
import { detectPaymentPlan } from '../../src/importers/paymentPlan';
import { detectLoanSchedule } from '../../src/importers/loanSchedule';
import { rowsToLines } from '../../src/importers/tabular';
import { getSettings, loadDataSet } from '../../src/db/repo';
import { computeMonth } from '../../src/domain/monthly';
import { occurrencesForMonth } from '../../src/domain/expenses';
import { freshDb } from './helpers';

const CH = 4; // ancho aproximado de cada carácter
/** Celda centrada (encabezados) o alineada a la derecha (importes), con su ancho, como la entrega el lector de PDF. */
const centered = (cx: number, s: string) => ({ x: cx - (s.length * CH) / 2, w: s.length * CH, s });
const right = (r: number, s: string) => ({ x: r - s.length * CH, w: s.length * CH, s });
const line = (...cells: Array<{ x: number; w: number; s: string }>): SourceLine => ({ text: cells.map((c) => c.s).join(' '), cells });

// Columnas (borde derecho): Alquiler Caro/Leo, Luz Caro/Leo, Cochera Leo, Prepaga Caro/Leo, Total
const R = [140, 200, 260, 320, 400, 470, 530, 580];
const L = (i: number) => R[i] - 25; // centro de la etiqueta de persona
// Planilla FICTICIA con el diseño de una exportación de Google Sheets.
const PLANILLA: SourceLine[] = [
  line(centered(60, 'Mes'), centered(170, 'Alquiler'), centered(290, 'Luz'), centered(375, 'Cochera'), centered(500, 'Prepaga'), centered(565, 'Total Mes')),
  line(centered(L(0), 'Caro'), centered(L(1), 'Leo'), centered(L(2), 'Caro'), centered(L(3), 'Leo'), centered(L(4), 'Leo'), centered(L(5), 'Caro'), centered(L(6), 'Leo')),
  line({ x: 40, w: 24, s: 'Agosto' }, right(R[0], '$300,000.00'), right(R[1], '$150,000.00'), right(R[2], '$20.000,5'), right(R[3], '10000,25'), right(R[4], '$15,000'), right(R[5], '$0'), right(R[6], '$0'), right(R[7], '$0')),
  // Dos importes pegados en un mismo fragmento (pasa en las exportaciones de Sheets)
  line({ x: 40, w: 32, s: 'Septiembre' }, right(R[0], '$300,000.00'), right(R[1], '150.000'), { x: R[2] - 11 * CH, w: (11 + 1 + 9) * CH, s: '$30,000.00 $15000,5' }, right(R[4], '$15,000'), right(R[5], '$80,000'), right(R[6], '$120,000'), right(R[7], '$0')),
  line({ x: 40, w: 28, s: 'Octubre' }, right(R[0], '$310,000.00'), right(R[1], '$155,000.00'), right(R[2], '$25,000.00'), right(R[3], '$12,500.00'), right(R[4], '$15,000.00'), right(R[5], '$80,000.00'), right(R[6], '$120,000.00'), right(R[7], '$0.00')),
  line({ x: 40, w: 36, s: 'Noviembre' }, right(R[0], '$0.00'), right(R[1], '$0.00'), right(R[2], '$0.00'), right(R[3], '$0.00'), right(R[4], '$0.00'), right(R[5], '$0.00'), right(R[6], '$120,000.00'), right(R[7], '$0.00')),
];

describe('planilla de gastos compartidos', () => {
  it('lee importes escritos con formatos mezclados', () => {
    expect(parseSheetAmount('$449,758.00')).toBe(44975800);
    expect(parseSheetAmount('$408.149,53')).toBe(40814953);
    expect(parseSheetAmount('$7981,9')).toBe(798190);
    expect(parseSheetAmount('4.085,2')).toBe(408520);
    expect(parseSheetAmount('$7,916')).toBe(791600);
    expect(parseSheetAmount('36157,85')).toBe(3615785);
    expect(parseSheetAmount('$0')).toBe(0);
    expect(parseSheetAmount('Anto')).toBeNull();
  });

  it('reconoce gastos, personas y meses (también un fragmento con dos importes)', () => {
    const sh = detectSharedSheet(PLANILLA, { fileName: 'Gastos compartidos 2026.pdf', fallbackYear: 2000 })!;
    expect(sh.year).toBe(2026);
    expect(sh.people).toEqual(['Caro', 'Leo']);
    expect(sh.groups.map((g) => `${g.name}:${g.people.join('+')}`)).toEqual(['Alquiler:Caro+Leo', 'Luz:Caro+Leo', 'Cochera:Leo', 'Prepaga:Caro+Leo']);
    const v = (m: string, g: string, p: string) => sh.values.find((x) => x.month === m && x.group === g && x.person === p)?.amount;
    expect(v('2026-08', 'Luz', 'Leo')).toBe(1000025);
    expect(v('2026-09', 'Luz', 'Caro')).toBe(3000000);
    expect(v('2026-09', 'Luz', 'Leo')).toBe(1500050);
    expect(v('2026-09', 'Alquiler', 'Leo')).toBe(15000000);
    expect(v('2026-11', 'Prepaga', 'Leo')).toBe(12000000);
    expect(v('2026-11', 'Alquiler', 'Caro')).toBeUndefined();
    expect(sh.warnings).toEqual([]);
    // No se confunde con otros documentos
    expect(detectPaymentPlan(PLANILLA)).toBeNull();
    expect(detectLoanSchedule(PLANILLA)).toBeNull();
    expect(detectSharedSheet(parseStatementText([{ text: 'Resumen de tarjeta' }], { fallbackYear: 2026 }).items.map(() => ({ text: '' })), { fallbackYear: 2026 })).toBeNull();
  });

  it('arma tu parte de cada gasto según quién sos', () => {
    const sh = detectSharedSheet(PLANILLA, { fileName: 'x 2026.pdf', fallbackYear: 2026 })!;
    const { rows, skipped } = sheetRows(sh, 'Leo', [], '2026-10');
    const r = (m: string, c: string) => rows.find((x) => x.month === m && x.concept === c)!;
    expect(r('2026-10', 'Alquiler')).toMatchObject({ kind: 'hogar', total: 31000000, user: 15500000, userPct: 50, include: true });
    expect(r('2026-10', 'Cochera')).toMatchObject({ kind: 'personal', total: 1500000, userPct: 100 });
    // Obra social / prepaga: la columna de la pareja es lo que devuelve (no se carga); la tuya es tuya.
    expect(r('2026-10', 'Prepaga')).toMatchObject({ kind: 'personal', total: 12000000 });
    expect(skipped.join(' ')).toMatch(/Prepaga de Caro/);
    // Meses que todavía no llegaron: desmarcados
    expect(r('2026-11', 'Prepaga').include).toBe(false);
    // Del otro lado: Caro no tiene cochera
    const caro = sheetRows(sh, 'Caro', [], '2026-10');
    expect(caro.rows.find((x) => x.concept === 'Cochera')).toBeUndefined();
  });

  it('lee la misma planilla exportada como Excel o CSV', () => {
    const grid = [
      ['Mes', 'Alquiler', '', 'Luz', '', 'Cochera', 'Total Mes'],
      ['', 'Caro', 'Leo', 'Caro', 'Leo', 'Leo', ''],
      ['Agosto', 300000, 150000, 20000.5, 10000.25, 15000, 0],
      ['Septiembre', 300000, 150000, 30000, 15000, 15000, 0],
    ];
    const { lines } = rowsToLines(grid);
    const sh = detectSharedSheet(lines, { fileName: 'Gastos_2026.xlsx', fallbackYear: 2026 })!;
    expect(sh.groups.map((g) => g.name)).toEqual(['Alquiler', 'Luz', 'Cochera']);
    expect(sh.values.find((x) => x.month === '2026-08' && x.group === 'Luz' && x.person === 'Leo')?.amount).toBe(1000025);
    expect(detectSharedSheet(gridToLines(grid.map((r) => r.map(String))), { fallbackYear: 2026 })?.values.length).toBe(sh.values.length);
  });

  describe('incorporación', () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-10-21T12:00:00'));
    });
    afterEach(() => vi.useRealTimers());

    it('carga tu parte en cada mes, nombra a la pareja y al volver a subirla no duplica', async () => {
      const db = await freshDb();
      const sh = detectSharedSheet(PLANILLA, { fileName: 'x 2026.pdf', fallbackYear: 2026 })!;
      const file = { name: 'planilla.pdf', size: 1, mime: 'application/pdf', kind: 'pdf' as const, hash: 'h1' };
      let rv = await buildSharedReview(sh, file, db, '2026-10');
      expect(rv.me).toBeNull(); // la pareja todavía no tiene nombre: hay que elegir
      rv = await setSharedMe(rv, 'Leo', db, '2026-10');
      const res = await commitSharedReview(rv, null, db);
      expect(res.created).toBe(rv.rows.filter((r) => r.include).length);
      expect((await getSettings(db)).partnerName).toBe('Caro');

      const data = await loadDataSet(db);
      const oct = occurrencesForMonth(data.expenses, '2026-10');
      expect(oct.find((o) => o.concept === 'Alquiler')).toMatchObject({ total: 31000000, userShare: 15500000, paid: true });
      const m = computeMonth(data, '2026-10', '2026-10');
      expect(m.sections.find((s) => s.key === 'fijos')!.total).toBe(15500000 + 1250000);
      expect(m.sections.find((s) => s.key === 'personales')!.total).toBe(1500000 + 12000000);
      // Ya pagado: no queda deuda con la pareja
      expect(oct.filter((o) => o.kind === 'hogar').every((o) => o.paidBy === 'cada_uno')).toBe(true);

      // Segunda vez: ahora reconoce a Leo y deja todo desmarcado
      const again = await buildSharedReview(sh, { ...file, hash: 'h2' }, db, '2026-10');
      expect(again.me).toBe('Leo');
      expect(again.rows.filter((r) => r.include)).toHaveLength(0);

      // Planilla corregida: cambia la luz de octubre → se actualiza el mismo gasto
      const fixed = { ...sh, values: sh.values.map((v) => (v.month === '2026-10' && v.group === 'Luz' ? { ...v, amount: v.person === 'Leo' ? 1300000 : 2600000 } : v)) };
      const upd = await buildSharedReview(fixed, { ...file, hash: 'h3' }, db, '2026-10');
      expect(upd.rows.filter((r) => r.include).map((r) => r.key)).toEqual(['Luz|2026-10']);
      expect(await commitSharedReview(upd, null, db)).toEqual({ created: 0, updated: 1 });
      const luz = occurrencesForMonth((await loadDataSet(db)).expenses, '2026-10').filter((o) => o.concept === 'Luz');
      expect(luz).toHaveLength(1);
      expect(luz[0].userShare).toBe(1300000);
    });

    it('no duplica un gasto que ya anotaste a mano en ese mes', async () => {
      const db = await freshDb();
      const now = new Date().toISOString();
      await db.expenses.put({ id: 'm1', createdAt: now, updatedAt: now, kind: 'hogar', category: 'Alquiler', concept: 'Alquiler depto', date: '2026-10-05', month: '2026-10', totalAmount: 31000000, userPct: 50, paid: true, frequency: 'unica', paymentMethod: 'transferencia', source: 'manual' });
      const sh = detectSharedSheet(PLANILLA, { fileName: 'x 2026.pdf', fallbackYear: 2026 })!;
      const rv = await setSharedMe(await buildSharedReview(sh, { name: 'p.pdf', size: 1, mime: 'application/pdf', kind: 'pdf', hash: 'z' }, db, '2026-10'), 'Leo', db, '2026-10');
      const alq = rv.rows.find((r) => r.key === 'Alquiler|2026-10')!;
      expect(alq.include).toBe(false);
      expect(alq.note).toMatch(/Ya anotaste «Alquiler depto»/);
    });
  });
});
