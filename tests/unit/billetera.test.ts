import { describe, expect, it } from 'vitest';
import { parseWalletMovements } from '../../src/importers/walletMovements';
import { parseAccountMovements } from '../../src/importers/accountMovements';
import type { SourceLine } from '../../src/importers/statementParser';
import { buildReview, commitReview } from '../../src/importers/review';
import type { FinanzasDB } from '../../src/db/db';
import { expense, freshDb } from './helpers';

// OCR FICTICIO de tres cuadros de "Mis movimientos" (se superponen al desplazar).
const f = (page: number, rows: string[]): SourceLine[] => rows.map((text) => ({ text, ocrConfidence: 92, page }));
const LINES: SourceLine[] = [
  ...f(1, ['14:06', '< Mis movimientos =', 'Dlo*uber Rides   $4.000,00', 'Compra   22/10', 'Persona Uno Pru... $6.000,00', 'Transferencia enviada  22/10', '(e) Dlo*uber Rides  $3.000,00', 'Compra  22/10', 'Rendimientos  +$200,00', 'Operación exitosa  22/10']),
  ...f(2, ['< Mis movimientos', '(e) Dlo*uber Rides  $3.000,00', 'Compra  22/10', 'Rendimientos  +$200,00', 'Operación exitosa  22/10', 'Carolina Prueba Vass... +$100.000,00', 'Transferencia recibida  21/10', 'Dlo*uber Rides  $3.000,00', 'Compra  21/10', 'Dlo*uber Rides  $3.000,00', 'Compra  21/10']),
  ...f(3, ['Dlo*uber Rides  $3.000,00', 'Compra  21/10', 'Titular Prueba Ape... $10.000,00', 'Transferencia enviada  18/10', 'Titular Prueba Ap... +$10.000,00', 'Transferencia recibida  18/10', 'Carolina Prueba Vassor  $50.000,00', 'Transferencia enviada  10/10', 'Compra Dólar Oficial  $15.000,00', 'Operación exitosa  10/10', '| E Devolución de com... +$5.000,00', 'Devolución en cuenta  08/10', 'Dlo*uber Rides  $5.000,00', 'Compra  08/10', '(a) Barrica  $7.400,00', 'Compra  08/10', 'Hola, Titular']),
  // Al final del video se vuelve al inicio de la cuenta: muestra otra vez los últimos movimientos.
  ...f(4, ['Detalle de cuenta', 'Movimientos   Ver todos', 'Dlo*uber Rides   $4.000,00', 'Compra   22/10', 'A Persona Uno Pru... $6.000,00', 'Transferencia enviada  22/10']),
];

describe('movimientos de billetera (video o capturas de "Mis movimientos")', () => {
  const d = parseWalletMovements(LINES, { partnerName: 'Carolina', today: '2026-10-22', fileName: 'Screen_Recording_Ual.mp4' })!;
  it('une los cuadros sin repetir filas y conserva dos compras iguales del mismo día', () => {
    expect(d.docType).toBe('cuenta');
    expect(d.entity.value).toBe('Ualá');
    expect(d.items.filter((i) => i.date === '2026-10-21' && i.concept === 'Dlo*uber Rides')).toHaveLength(2);
    expect(d.items.filter((i) => i.date === '2026-10-22' && i.concept === 'Dlo*uber Rides')).toHaveLength(2);
    expect(d.items).toHaveLength(14);
    expect(d.items.filter((i) => i.amount === 600000)).toHaveLength(1);
  });
  it('clasifica cada movimiento', () => {
    const k = (c: string) => d.items.find((i) => i.concept.startsWith(c))!;
    expect(k('Transferencia a Persona Uno')).toMatchObject({ kind: 'consumo', suggestedCategory: 'Transferencias', amount: 600000 });
    expect(k('Rendimientos').kind).toBe('credito');
    expect(k('Transferencia de Carolina').kind).toBe('ingreso');
    expect(k('Transferencia a Carolina').kind).toBe('transferencia'); // a tu pareja: compartidos
    expect(d.items.filter((i) => /cuenta propia/.test(i.concept)).map((i) => i.amount)).toEqual([1000000, 1000000]);
    expect(k('Compra Dólar').kind).toBe('transferencia');
    expect(k('Barrica')).toMatchObject({ kind: 'consumo', date: '2026-10-08', amount: 740000 });
    const dev = d.items.find((i) => i.kind === 'bonificacion')!;
    expect(dev.concept).toBe('Devolución de com...');
    expect(dev.cancelsOut).toBe(true);
    expect(d.items.find((i) => i.kind === 'consumo' && i.amount === 500000)!.cancelsOut).toBe(true);
  });
  it('no se confunde con la captura del banco ni al revés', () => {
    const pata: SourceLine[] = ['Otorgamiento adelanto  + $ 644.979,46', '13/10/2026', 'Pago visa electronico  - $ 799.252,39', '13/10/2026', 'Compra en comercio  - $ 1.000,00', '12/10/2026'].map((text) => ({ text, ocrConfidence: 90 }));
    expect(parseWalletMovements(pata, {})).toBeNull();
    expect(parseAccountMovements(pata)).not.toBeNull();
  });
});

describe('capturas de Ualá que repiten lo que ya está cargado', () => {
  const cap = (rows: string[]): SourceLine[] => rows.map((text) => ({ text, ocrConfidence: 92, page: 1 }));
  const meta = (hash: string) => ({ name: `${hash}.jpg`, size: 1, mime: 'image/jpeg', kind: 'imagen' as const, hash });
  const vivos = async (db: FinanzasDB) => (await db.expenses.toArray()).filter((e) => !e.deleted);

  it('la segunda captura (que se superpone y el OCR leyó distinto) solo agrega lo nuevo', async () => {
    const db = await freshDb();
    const uno = parseWalletMovements(cap(['< Mis movimientos', 'Dlo*uber Rides  $4.000,00', 'Compra  22/10', 'Barrica  $7.400,00', 'Compra  21/10', 'Sube Viajes  $2.150,00', 'Compra  21/10']), { today: '2026-10-22', fileName: 'Screenshot_Ual.jpg' })!;
    await commitReview(await buildReview(uno, meta('a'), true, db, '2026-10'), null, db);
    expect(await vivos(db)).toHaveLength(3);
    // Otra captura: la de Barrica se leyó "Barrlca" y hay una compra nueva.
    const dos = parseWalletMovements(cap(['< Mis movimientos', 'Barrlca  $7.400,00', 'Compra  21/10', 'Sube Viajes  $2.150,00', 'Compra  21/10', 'Hp Farma  $1.600,00', 'Compra  20/10']), { today: '2026-10-22', fileName: 'Screenshot_Ual.jpg' })!;
    const r = await buildReview(dos, meta('b'), true, db, '2026-10');
    expect(r.items.find((i) => i.amount === 740000)!).toMatchObject({ include: false, action: 'ignorar' });
    await commitReview(r, null, db);
    expect((await vivos(db)).map((e) => e.totalAmount).sort()).toEqual([160000, 215000, 400000, 740000]);
  });

  it('un gasto anotado a mano que ya quedó vinculado a otra captura no se repite', async () => {
    const db = await freshDb();
    await db.expenses.put(expense({ kind: 'cotidiano', month: '2026-10', date: '2026-10-22', totalAmount: 400000, concept: 'Uber', paymentMethod: 'debito', linkedLineFingerprints: ['otra'] }));
    const d = parseWalletMovements(cap(['< Mis movimientos', 'Dlo*uber Rides  $4.000,00', 'Compra  22/10', 'Barrica  $7.400,00', 'Compra  21/10', 'Sube Viajes  $2.150,00', 'Compra  21/10']), { today: '2026-10-22', fileName: 'Screenshot_Ual.jpg' })!;
    await commitReview(await buildReview(d, meta('c'), true, db, '2026-10'), null, db);
    expect((await vivos(db)).filter((e) => e.totalAmount === 400000)).toHaveLength(1);
    expect(await vivos(db)).toHaveLength(3);
  });

  it('las transferencias recibidas se anotan como ingreso una sola vez, de todos los meses del video', async () => {
    const db = await freshDb();
    const ingresos = async () => (await db.incomes.toArray()).filter((i) => !i.deleted).flatMap((i) => i.extras.map((x) => `${i.month} ${x.amount}`)).sort();
    // Ya estaba anotada (por el aviso) la de octubre por $ 1.500.
    const { saveRecord } = await import('../../src/db/repo');
    await saveRecord('incomes', { month: '2026-10', status: 'confirmado', amountReceived: 0, extras: [{ concept: 'Te entraron', amount: 150000, at: '2026-10-14T10:00:00.000Z' }], deductions: [], revisions: [] } as never, 't', db);
    const d = parseWalletMovements(cap(['< Mis movimientos', 'Persona Prueba  +$1.500,00', 'Transferencia recibida  14/10', 'Persona Prueba  +$2.000,00', 'Transferencia recibida  20/10', 'Otra Persona  +$900,00', 'Transferencia recibida  28/09', 'Rendimientos  +$50,00', 'Operación exitosa  20/10']), { today: '2026-10-22', fileName: 'Screen_Recording_Ual.mp4' })!;
    const r = await buildReview(d, meta('v'), true, db, '2026-10');
    expect(r.items.filter((i) => i.include).map((i) => i.amount).sort()).toEqual([200000, 90000].sort());
    await commitReview(r, null, db);
    expect(await ingresos()).toEqual(['2026-09 90000', '2026-10 150000', '2026-10 200000']);
    // Subir el mismo video otra vez no suma nada.
    await commitReview(await buildReview(d, meta('v2'), true, db, '2026-10'), null, db);
    expect(await ingresos()).toEqual(['2026-09 90000', '2026-10 150000', '2026-10 200000']);
    expect((await db.incomes.toArray()).every((i) => i.amountReceived === 0)).toBe(true);
  });
});
