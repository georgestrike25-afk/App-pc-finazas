import { describe, expect, it } from 'vitest';
import { decide } from '../../src/notifications/ingest';

// Avisos FICTICIOS de Mercado Pago.
const min = 60 * 1000;
const T0 = Date.parse('2026-11-06T11:40:00-03:00');
const aviso = (n: number, minutos: number, texto = 'Pagaste $ 4.800,00 en Tienda Prueba') => ({ paquete: 'com.mercadopago.wallet', titulo: 'Pagaste con tu QR', texto, fecha: T0 + minutos * min, clave: `k${n}` });
const correr = (raws: ReturnType<typeof aviso>[]) => decide(raws, { expenses: [], processed: new Set(), nowIso: '2026-11-06T15:00:00.000Z' });

describe('avisos repetidos: se descarta lo idéntico, lo dudoso lo decidís vos', () => {
  it('el mismo aviso publicado de nuevo a los pocos segundos se descarta', () => {
    const r = correr([aviso(1, 0), aviso(2, 0.5)]);
    expect(r.expenses).toHaveLength(1);
    expect(r.review).toHaveLength(0);
  });
  it('dos pagos iguales con 7 minutos de diferencia no se pierden: el segundo va a revisar', () => {
    const r = correr([aviso(1, 0), aviso(2, 7)]);
    expect(r.expenses).toHaveLength(1);
    expect(r.review).toHaveLength(1);
    expect(r.review[0]).toMatchObject({ monto: 4_800_00 });
    expect(r.review[0].motivo).toMatch(/otro gasto o el mismo/);
  });
  it('con más de 10 minutos de diferencia son dos gastos', () => {
    const r = correr([aviso(1, 0), aviso(2, 15)]);
    expect(r.expenses).toHaveLength(2);
    expect(r.review).toHaveLength(0);
  });
  it('dos transferencias recibidas iguales a 5 minutos: la segunda va a revisar, no se pierde', () => {
    const t = (n: number, m: number) => ({ paquete: 'com.mercadopago.wallet', titulo: 'Recibiste dinero', texto: 'Persona Prueba te transfirió $ 10.000', fecha: T0 + m * min, clave: `i${n}` });
    const r = correr([t(1, 0), t(2, 5)]);
    expect(r.incomes).toHaveLength(1);
    expect(r.review).toHaveLength(1);
    expect(r.review[0].tipo).toBe('ingreso');
  });
});
