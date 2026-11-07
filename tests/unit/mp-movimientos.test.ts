import { describe, expect, it } from 'vitest';
import { parseWalletMovements } from '../../src/importers/walletMovements';
import { buildReview } from '../../src/importers/review';
import { freshDb, expense } from './helpers';
import { saveRecord } from '../../src/db/repo';

// Cuadros FICTICIOS de "Movimientos de tu dinero" de Mercado Pago, como los lee el OCR de un video.
const FRAMES = [
  ['11:15', 'Movimientos de tu dinero', '6 de noviembre         Disponible $100.000,00', 'KIOSCO SOL            - $2.000', 'Es   Pago con QR                      21:50',
    'EBANX S.A.                    -$      9', 'Pago', 'Persona Uno           -$3.800', 'e!   Transferencia enviada              11:51',
    'EBANX S.A.                    +$4.800', 'O    Devolución de pago               11:47', 'EBANX S.A.                    -$4.800', 'Pago                                 11:47'],
  ['11:15', 'Movimientos de tu dinero', 'EBANX S.A.                    -$5.439', 'Pago                                 19:13', 'Persona Uno           -$3.800', 'tes   Transferencia enviada              11:51',
    'EBANX S.A.                    -$4.800', 'Pago                                 11:47', 'x     JUAN PRUEBA...     +$50.000,50', 'Lo   Transferencia recibida              10:17',
    'Tarjeta de crédito        -$90.000,25', 'Pago de resumen                  10:08'],
  // Al desplazar, lo de arriba es todavía del 6; después empieza el 5.
  ['Movimientos de tu dinero', 'Tarjeta de crédito        -$90.000,25', 'Pago de resumen                  10:08', '5 de noviembre      Saldo del día $10.000,00',
    'Créditos de Mercado... -$40.000,00', '5   Pago de cuota                      07:59', 'Rendimientos                       +$7,08', '00:36'],
];
const lines = FRAMES.flatMap((f, i) => f.map((text) => ({ text, page: i + 1 })));

describe('Mercado Pago: Movimientos de tu dinero (video, datos ficticios)', () => {
  it('lee cada movimiento con su día y une los cuadros sin repetir', () => {
    const p = parseWalletMovements(lines, { ownNames: ['Juan Prueba Gomez'], today: '2026-11-07' })!;
    expect(p.entity.value).toBe('Mercado Pago');
    expect(p.items.map((i) => [i.kind, i.date, i.concept, i.amount, !!i.cancelsOut])).toEqual([
      ['consumo', '2026-11-06', 'KIOSCO SOL', 2_000_00, false],
      ['consumo', '2026-11-06', 'EBANX S.A.', 5_439_00, false],
      ['consumo', '2026-11-06', 'Transferencia a Persona Uno', 3_800_00, false],
      ['bonificacion', '2026-11-06', 'EBANX S.A.', 4_800_00, true],
      ['consumo', '2026-11-06', 'EBANX S.A.', 4_800_00, true],
      ['transferencia', '2026-11-06', 'Transferencia desde cuenta propia', 50_000_50, false],
      ['pago', '2026-11-06', 'Tarjeta de crédito', 90_000_25, false],
      ['transferencia', '2026-11-05', 'Pago de cuota: Créditos de Mercado', 40_000_00, false],
    ]);
    expect(p.items[1].suggestedCategory).toBe('Transporte');
  });

  it('lo que ya entró por un aviso no se carga de nuevo (queda vinculado)', async () => {
    const db = await freshDb();
    await saveRecord('expenses', expense({ kind: 'cotidiano', concept: 'Uber', month: '2026-11', date: '2026-11-06', totalAmount: 5_439_00, importedFrom: 'notificacion' }), 'aviso', db);
    const p = parseWalletMovements(lines, { ownNames: ['Juan Prueba Gomez'], today: '2026-11-07' })!;
    const r = await buildReview(p, { name: 'mp.mp4', size: 1, mime: 'video/mp4', kind: 'video', hash: 'v' }, true, db, '2026-11');
    const uber = r.items.find((i) => i.amount === 5_439_00)!;
    expect([uber.action, uber.duplicate?.type]).toEqual(['vincular', 'gasto_manual']);
    expect(r.items.filter((i) => i.include && i.action !== 'vincular').map((i) => i.concept)).toEqual(['KIOSCO SOL', 'Transferencia a Persona Uno', 'Tarjeta de crédito']);
  });
});
