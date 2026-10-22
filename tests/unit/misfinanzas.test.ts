import { describe, expect, it } from 'vitest';
import { misFinanzasToParsed, readMisFinanzasJson, readMisFinanzasRows } from '../../src/importers/misFinanzas';
import { parseStatementText } from '../../src/importers/statementParser';
import { buildReview, commitReview } from '../../src/importers/review';
import { parseCsv } from '../../src/importers/tabular';
import { freshDb } from './helpers';

const ms = (d: string) => new Date(`${d}T12:00:00`).getTime();
// Copia FICTICIA de Mis Finanzas
const COPIA = JSON.stringify({
  version: 1,
  creado: ms('2026-10-20'),
  movimientos: [
    { fecha: ms('2026-10-02'), montoCentavos: 350000, tipo: 'GASTO', categoria: 'Café', descripcion: 'Café del centro', cuenta: 'Mercado Pago', origen: 'NOTIFICACION' },
    { fecha: ms('2026-10-03'), montoCentavos: 1200000, tipo: 'GASTO', categoria: 'Comida', descripcion: 'Verdulería', cuenta: 'Efectivo', origen: 'MANUAL' },
    { fecha: ms('2026-10-05'), montoCentavos: 2287550, tipo: 'GASTO', categoria: 'Salud', descripcion: 'Farmacia prueba', cuenta: 'Naranja X', origen: 'NOTIFICACION' },
    { fecha: ms('2026-10-06'), montoCentavos: 5000000, tipo: 'TRANSFERENCIA_PROPIA', categoria: '', descripcion: 'Entre mis cuentas', cuenta: 'Ualá', origen: 'NOTIFICACION' },
    { fecha: ms('2026-10-10'), montoCentavos: 90000000, tipo: 'INGRESO', categoria: 'Sueldo', descripcion: 'Haberes', cuenta: 'Banco Patagonia', origen: 'NOTIFICACION' },
    { fecha: ms('2026-10-12'), montoCentavos: 1000000, tipo: 'GASTO', categoria: 'Compras', descripcion: 'Frávega', cuenta: 'Naranja X', origen: 'NOTIFICACION', cuotaNumero: 1, cuotaTotal: 6 },
  ],
});

describe('historial de Mis Finanzas', () => {
  it('lee la copia JSON y la exportación CSV', () => {
    const a = readMisFinanzasJson(COPIA)!;
    expect(a).toHaveLength(6);
    expect(a[0]).toMatchObject({ date: '2026-10-02', tipo: 'GASTO', amount: 350000, account: 'Mercado Pago' });
    const csv = '﻿Fecha;Tipo;Categoría;Descripción;Cuenta;Monto\r\n02/10/2026 09:30;Gasto;Café;Café del centro;Mercado Pago;-3500,00\r\n10/10/2026 08:00;Ingreso;Sueldo;Haberes;Banco Patagonia;900000,00\r\n12/10/2026 10:00;Gasto;Compras;Frávega (cuota 1/6);Naranja X;-10000,00\r\n';
    const b = readMisFinanzasRows(parseCsv(csv))!;
    expect(b.map((m) => [m.date, m.tipo, m.description, m.amount, m.installment?.total])).toEqual([
      ['2026-10-02', 'GASTO', 'Café del centro', 350000, undefined],
      ['2026-10-10', 'INGRESO', 'Haberes', 90000000, undefined],
      ['2026-10-12', 'GASTO', 'Frávega', 1000000, 6],
    ]);
    expect(readMisFinanzasJson('{"version":1}')).toBeNull();
    expect(readMisFinanzasRows([['fecha', 'concepto', 'importe']])).toBeNull();
  });

  it('carga solo los gastos que faltan y un resumen posterior los reconoce', async () => {
    const db = await freshDb();
    // Ya cargado por otra vía: la farmacia (vino en un extracto)
    const now = new Date().toISOString();
    await db.expenses.put({ id: 'ya', createdAt: now, updatedAt: now, kind: 'cotidiano', category: 'Farmacia', concept: 'FARMACIA PRUEBA', date: '2026-10-05', month: '2026-10', totalAmount: 2287550, userPct: 100, paid: true, frequency: 'unica', paymentMethod: 'debito', source: 'importado' });
    const rv = await buildReview(misFinanzasToParsed(readMisFinanzasJson(COPIA)!), { name: 'mis_finanzas_2026-10-20.json', size: 1, mime: 'text/csv', kind: 'csv', hash: 'mf1' }, false, db, '2026-10');
    expect(rv.summary.registerStatement).toBe(false);
    const inc = rv.items.filter((i) => i.include).map((i) => i.concept);
    expect(inc).toEqual(['Café del centro', 'Verdulería']);
    expect(rv.items.find((i) => i.concept === 'Farmacia prueba')?.duplicate?.label).toMatch(/Ya está cargado/);
    await commitReview(rv, null, db);
    const mf = (await db.expenses.toArray()).filter((e) => e.importedFrom === 'mis-finanzas');
    expect(mf.map((e) => [e.concept, e.paymentMethod, e.paid, e.kind])).toEqual([
      ['Café del centro', 'otro', true, 'cotidiano'],
      ['Verdulería', 'efectivo', true, 'cotidiano'],
    ]);
    // Volver a subir la copia no duplica
    const again = await buildReview(misFinanzasToParsed(readMisFinanzasJson(COPIA)!), { name: 'mf.json', size: 1, mime: 'text/csv', kind: 'csv', hash: 'mf2' }, false, db, '2026-10');
    expect(again.items.filter((i) => i.include)).toHaveLength(0);
    // Si el café se pagó con tarjeta, el resumen lo reconoce en vez de duplicarlo
    const st = await buildReview(parseStatementText(['VISA', 'Vencimiento actual: 10/11/2026', '02/10/26 CAFE DEL CENTRO 3.500,00', 'Total a pagar 3.500,00'].map((text) => ({ text }))), { name: 'r.pdf', size: 1, mime: 'application/pdf', kind: 'pdf', hash: 'r' }, false, db, '2026-11');
    expect(st.items[0]).toMatchObject({ action: 'vincular', duplicate: { type: 'gasto_manual' } });
    await commitReview(st, null, db);
    const cafe = (await db.expenses.toArray()).filter((e) => e.concept === 'Café del centro');
    expect(cafe).toHaveLength(1);
    expect(cafe[0].month).toBe('2026-11');
  });
});
