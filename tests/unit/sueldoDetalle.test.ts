import { describe, expect, it } from 'vitest';
import { parseMovementDetail } from '../../src/importers/accountMovements';
import { buildReview, commitReview, validateReview } from '../../src/importers/review';
import { loadDataSet } from '../../src/db/repo';
import { monthChecklist } from '../../src/domain/checklist';
import { freshDb } from './helpers';

// OCR FICTICIO de la pantalla "Detalle de movimiento" del home banking (con el ruido de la barra de estado).
const OCR = (concepto: string, importe: string) =>
  ['06:55 we O 7 ill CE', '<— Detalle de movimiento e', 'Cuenta', 'CA$ 70-123456789-000', 'Fecha', '05/11/2026', 'Concepto', concepto, 'Importe', importe].map((text) => ({ text, ocrConfidence: 92 }));
const meta = { name: 'sueldo.jpg', size: 1, mime: 'image/jpeg', kind: 'imagen' as const, hash: 'sueldo' };

describe('captura de un solo movimiento: el sueldo', () => {
  it('lee concepto, fecha e importe y lo reconoce como sueldo', () => {
    const d = parseMovementDetail(OCR('ACREDIT. PLAN SUELDOS C 4193', '+ $ 1.234.567,89'))!;
    expect(d.docType).toBe('cuenta');
    expect(d.items).toHaveLength(1);
    expect(d.items[0]).toMatchObject({ kind: 'ingreso', date: '2026-11-05', amount: 123456789, concept: 'ACREDIT. PLAN SUELDOS C 4193' });
  });

  it('se carga como el sueldo del mes y tilda el pendiente', async () => {
    const db = await freshDb();
    const r = await buildReview(parseMovementDetail(OCR('ACREDIT. PLAN SUELDOS C 4193', '+ $ 1.234.567,89'))!, meta, true, db, '2026-11');
    expect(validateReview(r)).toEqual([]);
    expect(r.items[0]).toMatchObject({ action: 'ingreso', include: true, month: '2026-11' });
    await commitReview(r, null, db);
    const data = await loadDataSet(db);
    expect(data.incomes).toHaveLength(1);
    expect(data.incomes[0]).toMatchObject({ month: '2026-11', status: 'confirmado', amountReceived: 123456789, receivedDate: '2026-11-05' });
    expect(monthChecklist(data, '2026-11', '2026-11-05').find((i) => i.key === 'sueldo')?.done).toBe(true);
    // Subir la misma captura otra vez no suma otro sueldo.
    const otra = await buildReview(parseMovementDetail(OCR('ACREDIT. PLAN SUELDOS C 4193', '+ $ 1.234.567,89'))!, { ...meta, hash: 'sueldo2' }, true, db, '2026-11');
    expect(otra.items[0].include).toBe(false);
    await commitReview(otra, null, db);
    expect((await loadDataSet(db)).incomes[0].extras).toEqual([]);
  });

  it('un gasto de la misma pantalla se lee como gasto y lo que no es esa pantalla no se toca', () => {
    const g = parseMovementDetail(OCR('COMPRA EN COMERCIO', '- $ 1.000,00'))!;
    expect(g.items[0]).toMatchObject({ kind: 'consumo', amount: 100000 });
    expect(parseMovementDetail([{ text: 'Cuenta' }, { text: 'Importe + $ 5,00' }])).toBeNull();
    expect(parseMovementDetail(OCR('SUELDO', '$ 1.000,00'))).toBeNull(); // sin signo no se sabe si entra o sale
  });
});
