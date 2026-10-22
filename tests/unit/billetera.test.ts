import { describe, expect, it } from 'vitest';
import { parseWalletMovements } from '../../src/importers/walletMovements';
import { parseAccountMovements } from '../../src/importers/accountMovements';
import type { SourceLine } from '../../src/importers/statementParser';

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
    expect(k('Transferencia de Carolina').kind).toBe('credito');
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
