import { describe, expect, it } from 'vitest';
import { planQuick, type QuickEntry } from '../../src/notifications/quick';
import { decide } from '../../src/notifications/ingest';
import type { Expense } from '../../src/domain/types';

const ctx = (expenses: Expense[] = []) => ({ expenses, incomes: [], nowIso: '2026-10-22T15:00:00.000Z', defaultUserPct: 50, categories: ['Transporte', 'Otros'] });
const fecha = Date.parse('2026-10-22T14:31:00-03:00');

describe('anotación rápida (widget y avisos)', () => {
  it('gasto del día a día, transporte y compartido a medias', () => {
    const q: QuickEntry[] = [
      { accion: 'guardar', tipo: 'gasto', categoria: 'dia', monto: 640000, descripcion: 'Kiosco', fecha },
      { accion: 'guardar', tipo: 'gasto', categoria: 'transporte', monto: 350000, descripcion: 'Transporte', fecha },
      { accion: 'guardar', tipo: 'compartido', categoria: 'dia', monto: 1000000, descripcion: 'Verdulería', fecha },
    ];
    const p = planQuick(q, ctx());
    expect(p.put).toHaveLength(3);
    expect(p.put[0]).toMatchObject({ kind: 'cotidiano', category: 'Gasto diario', totalAmount: 640000, date: '2026-10-22', paid: true });
    expect(p.put[1]).toMatchObject({ kind: 'cotidiano', category: 'Transporte' });
    expect(p.put[2]).toMatchObject({ kind: 'hogar', userPct: 50, paidBy: 'usuario' });
    expect(p.categories).toEqual(['Gasto diario']);
  });

  it('ingreso: se suma como línea extra del mes', () => {
    const p = planQuick([{ accion: 'guardar', tipo: 'ingreso', monto: 15000000, descripcion: 'Venta del aire', fecha }], ctx());
    expect(p.incomes[0]).toMatchObject({ month: '2026-10', amountReceived: 0, extras: [{ concept: 'Venta del aire', amount: 15000000 }] });
  });

  it('"¿Cuánto fue?": el monto que se pone resuelve el aviso y la app no lo vuelve a procesar', () => {
    const raw = { paquete: 'com.uala.app', titulo: 'Realizaste una transferencia', texto: 'Kiosco San Martín recibió el dinero', fecha, clave: 'k1' };
    const r = decide([raw], { expenses: [], processed: new Set(), nowIso: '2026-10-22T15:00:00Z' });
    expect(r.review[0]).toMatchObject({ clave: 'k1', monto: 0 });
    const p = planQuick([{ accion: 'guardar', tipo: 'gasto', categoria: 'otros', monto: 640000, descripcion: 'Transferencia', cuenta: 'Ualá', fecha, clave: 'k1', transferencia: true }], ctx());
    expect(p.resolved).toEqual(['k1']);
    expect(p.put[0]).toMatchObject({ paymentMethod: 'transferencia', importedFrom: 'notificacion' });
    // Si la notificación todavía estaba en la cola, ya no se registra de nuevo
    expect(decide([raw], { expenses: p.put, processed: new Set(p.resolved), nowIso: '2026-10-22T15:00:00Z' }).review).toHaveLength(0);
  });

  it('pago sin monto ("Se debitó tu pago en …") también queda para completar', () => {
    const r = decide([{ paquete: 'com.mercadopago.wallet', titulo: 'Se debitó tu pago', texto: 'en Kiosco San Martín', fecha, clave: 'k2' }], { expenses: [], processed: new Set(), nowIso: '2026-10-22T15:00:00Z' });
    expect(r.review[0]).toMatchObject({ clave: 'k2', descripcion: 'Pago en Kiosco San Martín' });
  });

  it('"Deshacer" y "Cambiar categoría" sobre el gasto que se anotó solo', () => {
    const raw = { paquete: 'com.uala.app', titulo: 'Pagaste $ 4.500', texto: 'en Supermercado Día con tu tarjeta', fecha, clave: 'k3' };
    const auto = decide([raw], { expenses: [], processed: new Set(), nowIso: '2026-10-22T15:00:00Z' }).expenses;
    expect(auto[0].linkedLineFingerprints).toContain('notifkey|k3');
    const cambio = planQuick([{ accion: 'guardar', tipo: 'gasto', categoria: 'transporte', monto: 450000, clave: 'k3', reemplaza: true, fecha }], ctx(auto));
    expect(cambio.put).toHaveLength(1);
    expect(cambio.put[0]).toMatchObject({ id: auto[0].id, category: 'Transporte' });
    const borrar = planQuick([{ accion: 'deshacer', clave: 'k3' }], ctx(auto));
    expect(borrar.remove.map((e) => e.id)).toEqual([auto[0].id]);
    // Deshacer antes de que la app lo registrara: solo se marca como resuelto
    const antes = planQuick([{ accion: 'deshacer', clave: 'k3' }], ctx());
    expect(antes.remove).toHaveLength(0);
    expect(antes.resolved).toEqual(['k3']);
  });
});
