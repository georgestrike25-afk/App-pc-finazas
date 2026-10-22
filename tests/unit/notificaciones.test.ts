import { describe, expect, it } from 'vitest';
import { analizar, cuentaDePaquete, CUENTAS, textoACentavos, type Detectado, type MotivoIgnorada } from '../../src/notifications/analyzer';

// Mismos casos que las pruebas de la app Mis Finanzas.
const mov = (p: string, t: string, x: string): Detectado => {
  const r = analizar(p, t, x, 1000);
  if (!('movimiento' in r)) throw new Error(`Se esperaba un movimiento y fue ${JSON.stringify(r)}`);
  return r.movimiento;
};
const motivo = (p: string, t: string, x: string): MotivoIgnorada => {
  const r = analizar(p, t, x, 1000);
  if (!('ignorada' in r)) throw new Error(`Se esperaba ignorada y fue ${JSON.stringify(r)}`);
  return r.ignorada;
};

describe('lectura de notificaciones (de Mis Finanzas)', () => {
  it('reconoce las cuentas por paquete', () => {
    expect(cuentaDePaquete('ar.com.bancar.uala')).toBe(CUENTAS.UALA);
    expect(cuentaDePaquete('com.mercadopago.wallet')).toBe(CUENTAS.MERCADO_PAGO);
    expect(cuentaDePaquete('com.google.android.apps.walletnfcrel')).toBe(CUENTAS.GOOGLE_PAY);
    expect(cuentaDePaquete('ar.com.bna.bnamas')).toBe(CUENTAS.BNA);
    expect(cuentaDePaquete('com.whatsapp')).toBeNull();
  });
  it('compra con comercio', () => {
    const m = mov('com.mercadopago.wallet', 'Pagaste con tu QR', 'Pagaste $ 1.500,50 en Kiosco El Sol con tu dinero disponible.');
    expect(m).toMatchObject({ tipo: 'GASTO', monto: 150050, descripcion: 'Kiosco El Sol', cuenta: CUENTAS.MERCADO_PAGO });
  });
  it('Google Pay usa el título como comercio', () => {
    expect(mov('com.google.android.apps.walletnfcrel', 'COTO', '$ 5.432,10 con Visa ••1234')).toMatchObject({ tipo: 'GASTO', descripcion: 'COTO', cuenta: CUENTAS.GOOGLE_PAY });
  });
  it('transferencias enviadas y recibidas', () => {
    expect(mov('ar.com.bancar.uala', 'Transferencia enviada', 'Le transferiste $ 10.000 a Juan Pérez.')).toMatchObject({ tipo: 'GASTO', transferencia: 'ENVIADA', contraparte: 'Juan Pérez' });
    expect(mov('com.mercadopago.wallet', 'Recibiste dinero', 'Jorge Gómez te transfirió $ 10.000')).toMatchObject({ tipo: 'INGRESO', transferencia: 'RECIBIDA', contraparte: 'Jorge Gómez' });
    expect(mov('ar.com.bancar.uala', 'Ingreso de dinero', 'Recibiste $ 2.000 de María López.').contraparte).toBe('María López');
  });
  it('sueldo, carga de saldo y pago de tarjeta', () => {
    expect(mov('ar.com.bancopatagonia.patagoniamovil', 'Acreditación', 'Se acreditó tu sueldo por $ 850.000,00')).toMatchObject({ tipo: 'INGRESO', monto: 85000000 });
    expect(mov('com.mercadopago.wallet', 'Ingresaste dinero', 'Ingresaste $ 20.000 a tu cuenta desde Banco Patagonia').tipo).toBe('TRANSFERENCIA_PROPIA');
    expect(mov('ar.com.bna.bnamas', 'BNA+', 'Pago de tarjeta Visa por $ 150.000 realizado').tipo).toBe('TRANSFERENCIA_PROPIA');
  });
  it('ignora promociones, fallidas, sin monto y dólares sin cotización', () => {
    expect(motivo('com.tarjetanaranja.emisor', '¡Aprovechá!', 'Comprá con 20% de descuento, compra mínima $ 5.000')).toBe('PROMOCION');
    expect(motivo('ar.com.bancar.uala', 'Compra rechazada', 'Tu compra de $ 3.000 fue rechazada')).toBe('OPERACION_FALLIDA');
    expect(motivo('ar.com.bancar.uala', 'Hola', 'Tenés un mensaje nuevo')).toBe('SIN_MONTO');
    expect(motivo('ar.com.bancar.uala', 'Compra', 'Compraste US$ 10,00 en Steam')).toBe('MONEDA_EXTRANJERA');
  });
  it('compra con promoción igual se registra; cuotas; dólares con cotización', () => {
    expect(mov('com.tarjetanaranja.emisor', 'Compra aprobada', 'Compraste $ 8.000 en Farmacity con 15% de descuento')).toMatchObject({ tipo: 'GASTO', descripcion: 'Farmacity' });
    expect(mov('com.tarjetanaranja.emisor', 'Compra aprobada', 'Compraste $ 60.000 en 6 cuotas en Frávega')).toMatchObject({ cuotas: { total: 6 }, monto: 6000000 });
    expect(mov('ar.com.bancar.uala', 'Préstamo', 'Se debitó la cuota 3 de 12 de tu préstamo por $ 25.000').cuotas).toEqual({ total: 12, numero: 3 });
    const r = analizar('com.tarjetanaranja.emisor', 'Pago con tarjeta de débito', 'Pagaste USD 4,99 en Google *google One', 1000, 145000);
    expect(r).toMatchObject({ movimiento: { tipo: 'GASTO', monto: 723550, descripcion: 'Google *google One (USD 4,99)' } });
  });
  it('importes en texto', () => {
    expect(textoACentavos('1.234,56')).toBe(123456);
    expect(textoACentavos('$ 12.500')).toBe(1250000);
    expect(textoACentavos('1234.56')).toBe(123456);
    expect(textoACentavos('1,234.56')).toBe(123456);
    expect(textoACentavos('(500)')).toBe(-50000);
  });
});

import { decide, type RawNotification } from '../../src/notifications/ingest';

describe('gastos automáticos desde notificaciones', () => {
  const t0 = new Date('2026-10-22T13:00:00').getTime();
  const raw = (p: string, titulo: string, texto: string, min = 0, clave?: string): RawNotification => ({ paquete: p, titulo, texto, fecha: t0 + min * 60000, clave: clave ?? `${p}|${titulo}|${min}` });
  it('anota compras una sola vez y deja para revisar las transferencias', () => {
    const processed = new Set<string>();
    const r = decide(
      [
        raw('com.mercadopago.wallet', 'Pagaste con tu QR', 'Pagaste $ 1.500,50 en Kiosco El Sol con tu dinero disponible.'),
        // La misma notificación vuelve a aparecer (al reconectarse el lector)
        raw('com.mercadopago.wallet', 'Pagaste con tu QR', 'Pagaste $ 1.500,50 en Kiosco El Sol con tu dinero disponible.', 0),
        // Google Pay y el banco avisan la misma compra
        raw('com.google.android.apps.walletnfcrel', 'COTO', '$ 5.432,10 con Visa ••1234', 5),
        raw('ar.com.bancar.uala', 'Compra', 'Compraste $ 5.432,10 en COTO con tu tarjeta', 6),
        raw('ar.com.bancar.uala', 'Transferencia enviada', 'Le transferiste $ 224.879 a Antonella Prueba.', 10),
        raw('ar.com.bancopatagonia.patagoniamovil', 'Acreditación', 'Se acreditó tu sueldo por $ 850.000,00', 20),
        raw('com.tarjetanaranja.emisor', 'Compra aprobada', 'Compraste $ 60.000 en 6 cuotas en Frávega', 30),
        raw('com.mercadopago.wallet', 'Ingresaste dinero', 'Ingresaste $ 20.000 a tu cuenta desde Banco Patagonia', 40),
        raw('com.tarjetanaranja.emisor', '¡Aprovechá!', 'Comprá con 20% de descuento, compra mínima $ 5.000', 50),
      ],
      { expenses: [], processed, nowIso: '2026-10-22T16:00:00.000Z' },
    );
    expect(r.expenses.map((e) => [e.concept, e.totalAmount, e.kind, e.paymentMethod, e.month])).toEqual([
      ['Kiosco El Sol', 150050, 'cotidiano', 'otro', '2026-10'],
      ['COTO', 543210, 'cotidiano', 'otro', '2026-10'],
    ]);
    expect(r.review.map((x) => [x.descripcion, x.monto])).toEqual([['Transferencia a Antonella Prueba', 22487900]]);
    expect(r.log.map((l) => l.resultado)).toContain('Compra en cuotas: llega con el resumen de la tarjeta');
    expect(r.log.map((l) => l.resultado)).toContain('Promoción');
    // Volver a procesar las mismas no repite nada
    const again = decide([raw('com.mercadopago.wallet', 'Pagaste con tu QR', 'Pagaste $ 1.500,50 en Kiosco El Sol con tu dinero disponible.')], { expenses: r.expenses, processed, nowIso: '2026-10-22T16:00:00.000Z' });
    expect(again.expenses).toHaveLength(0);
    // Una segunda compra igual, horas después, sí se anota
    const later = decide([raw('com.mercadopago.wallet', 'Pagaste con tu QR', 'Pagaste $ 1.500,50 en Kiosco El Sol con tu dinero disponible.', 240)], { expenses: r.expenses, processed: new Set(), nowIso: '2026-10-22T20:00:00.000Z' });
    expect(later.expenses).toHaveLength(1);
  });
});
