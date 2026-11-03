import { describe, expect, it } from 'vitest';
import { parseCardBalance } from '../../src/importers/cardBalance';
import { buildReview, commitReview, validateReview } from '../../src/importers/review';
import { loadDataSet } from '../../src/db/repo';
import { debtByEntity, monthToPay } from '../../src/domain/obligations';
import { freshDb } from './helpers';

// OCR FICTICIO de la pantalla "Tarjeta de crédito → Saldo a pagar" (con el ruido típico de la barra de estado).
const OCR = ['14:14 5 *7 all €', '< Tarjeta de crédito ..”', '€ Mastercard', 'Terminada en 1234', 'Saldo a pagar', 'Total en pesos $ 12.345,67', 'Total en dólares USD 0,00', 'Cierre 30/10', 'Vencimiento 11/11', 'Pagar tarjeta', 'Ver últimos movimientos'].map((text) => ({ text, ocrConfidence: 90 }));

describe('captura del saldo a pagar de la tarjeta', () => {
  it('lee el total, el cierre y el vencimiento', () => {
    const d = parseCardBalance(OCR, { fileName: 'Screenshot_Uala.jpg', today: '2026-11-03' })!;
    expect(d).toMatchObject({ docType: 'resumen', month: '2026-11', items: [] });
    expect(d.entity.value).toBe('Ualá');
    expect(d.total.value).toBe(1234567);
    expect(d.closingDate.value).toBe('2026-10-30');
    expect(d.dueDate.value).toBe('2026-11-11');
    // Vencimiento de enero visto en diciembre: es del año que viene.
    expect(parseCardBalance(OCR.map((l) => ({ ...l, text: l.text.replace('11/11', '10/01').replace('30/10', '28/12') })), { today: '2026-12-20' })!.dueDate.value).toBe('2027-01-10');
    expect(parseCardBalance([{ text: 'Saldo a pagar' }])).toBeNull();
  });

  it('se carga como resumen y aparece en Deudas y en "Este mes pagás"', async () => {
    const db = await freshDb();
    const r = await buildReview(parseCardBalance(OCR, { today: '2026-11-03' })!, { name: 'c.jpg', size: 1, mime: 'image/jpeg', kind: 'imagen', hash: 'c' }, true, db, '2026-11');
    expect(validateReview(r)).toEqual([]);
    await commitReview(r, null, db);
    const data = await loadDataSet(db);
    expect(data.statements).toHaveLength(1);
    const debts = debtByEntity(data.obligations, '2026-11', data);
    expect(debts.find((d) => d.group === 'Ualá')!.remaining).toBe(1234567);
    expect(monthToPay(debts, '2026-11', data.statements)[0].lines[0]).toMatchObject({ label: 'Resumen de la tarjeta', due: '2026-11-11', amount: 1234567 });
  });
});
