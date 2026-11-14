import { describe, expect, it } from 'vitest';
import { expense } from './helpers';
import { happenedAt, noticeClock, notifMs } from '../../src/domain/expenses';
import { decide } from '../../src/notifications/ingest';

// Gastos detectados por avisos (FICTICIOS): la hora que cuenta es la del aviso, no la de cuando se abrió la app.
// Hora LOCAL del equipo (así la prueba vale en cualquier zona horaria): ms('14:03') = 14:03 del 14/11/2026.
const ms = (hhmm: string) => new Date(2026, 10, 14, Number(hhmm.slice(0, 2)), Number(hhmm.slice(3, 5))).getTime();
const deAviso = (id: string, aviso: string, anotado: string) =>
  expense({ id, kind: 'cotidiano', month: '2026-11', date: '2026-11-14', totalAmount: 10_000_00, importedFrom: 'notificacion', createdAt: anotado, linkedLineFingerprints: [`notif|Mercado Pago|${ms(aviso)}|1000000`, 'notifkey|k1'] });

describe('gastos de avisos: hora real y orden', () => {
  it('lee el momento del aviso de la huella y lo muestra en 24 horas', () => {
    const tarde = deAviso('t', '14:03', new Date(2026, 10, 14, 14, 10).toISOString());
    expect(notifMs(tarde)).toBe(ms('14:03'));
    expect(noticeClock(tarde)).toBe('14:03');
    expect(noticeClock(deAviso('x', '23:59', '2026-11-15T03:00:00.000Z'))).toBe('23:59');
    expect(noticeClock(expense({ kind: 'personal', month: '2026-11', totalAmount: 1 }))).toBeUndefined();
  });
  it('el de la tarde queda por encima del de la mañana aunque se hayan anotado juntos al abrir la app', () => {
    const anotado = new Date(2026, 10, 14, 14, 10).toISOString(); // los dos se anotaron a la vez, al abrir la app
    const manana = deAviso('m', '06:28', anotado);
    const tarde = deAviso('t', '14:03', anotado);
    expect([manana, tarde].sort((a, b) => happenedAt(b) - happenedAt(a)).map((e) => e.id)).toEqual(['t', 'm']);
  });
  it('un gasto anotado a mano se ordena por cuándo se anotó, junto a los de avisos', () => {
    const aMano = expense({ id: 'a', kind: 'cotidiano', month: '2026-11', date: '2026-11-14', totalAmount: 1, createdAt: new Date(2026, 10, 14, 13, 0).toISOString() }); // anotado a las 13:00
    const aviso = deAviso('v', '14:03', '2026-11-14T17:10:00.000Z');
    expect([aMano, aviso].sort((a, b) => happenedAt(b) - happenedAt(a)).map((e) => e.id)).toEqual(['v', 'a']);
  });
  it('las notas nuevas guardan la hora en 24 horas', () => {
    const r = decide([{ paquete: 'com.mercadopago.wallet', titulo: 'Pagaste con tu QR', texto: 'Pagaste $ 1.500,00 en Kiosco Prueba', fecha: ms('14:03'), clave: 'k' }], { expenses: [], processed: new Set(), nowIso: new Date(2026, 10, 14, 14, 10).toISOString() });
    expect(r.expenses[0].notes).not.toMatch(/[ap]\. ?m\./i);
    expect(r.expenses[0].notes).toMatch(/· 14:03$/);
  });
});
