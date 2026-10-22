import { monthOf } from '../domain/dates';
import type { Cents } from '../domain/money';
import { uid } from '../domain/text';
import type { Expense } from '../domain/types';
import { suggestCategory } from '../importers/classify';
import { analizar, CUENTAS, type Detectado } from './analyzer';

/** Notificación tal como la guarda el lector del teléfono. */
export interface RawNotification {
  paquete: string;
  titulo: string;
  texto: string;
  fecha: number;
  clave: string;
}

/** Movimiento detectado que necesita una decisión (p. ej. una transferencia enviada). */
export interface ReviewNotif {
  id: string;
  fecha: number;
  monto: Cents;
  descripcion: string;
  cuenta: string;
  texto: string;
  motivo: string;
  /** Notificación de origen (para resolverla desde el aviso de Brote o la anotación rápida). */
  clave?: string;
}

export interface LogNotif {
  fecha: number;
  cuenta: string;
  texto: string;
  resultado: string;
}

export interface IngestResult {
  expenses: Expense[];
  review: ReviewNotif[];
  log: LogNotif[];
  keys: string[];
}

const DUP_MS = 10 * 60 * 1000;

const isoLocal = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export function expenseFromDetected(d: Detectado, nowIso: string, deviceId?: string, clave?: string): Expense {
  const date = isoLocal(d.fecha);
  const sug = suggestCategory(d.descripcion);
  return {
    id: uid(),
    createdAt: nowIso,
    updatedAt: nowIso,
    deviceId,
    // Las transferencias a otras personas no son del día a día (comida, transporte…): van como gasto personal.
    kind: d.transferencia === 'ENVIADA' ? 'personal' : 'cotidiano',
    category: d.transferencia === 'ENVIADA' ? 'Transferencias' : sug.category,
    concept: d.descripcion,
    date,
    month: monthOf(date),
    totalAmount: d.monto,
    userPct: 100,
    paid: true,
    frequency: 'unica',
    // No se sabe si fue débito o crédito: "otro" deja que el resumen de la tarjeta lo reconozca después.
    paymentMethod: d.transferencia === 'ENVIADA' ? 'transferencia' : 'otro',
    source: 'importado',
    importedFrom: 'notificacion',
    notes: `Notificación de ${d.cuenta} · ${new Date(d.fecha).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}`,
    linkedLineFingerprints: [`notif|${d.cuenta}|${d.fecha}|${d.monto}`, ...(clave ? [`notifkey|${clave}`] : [])],
  };
}

/**
 * Decide qué hacer con cada notificación (función pura, para poder probarla):
 * - compras y pagos → gasto del día a día (una sola vez aunque avisen dos apps, p. ej. Google Pay y el banco);
 * - transferencias enviadas → para revisar (pueden ser a tu pareja por el alquiler, ya cargado);
 * - compras en cuotas → no se cargan (llegan con el resumen de la tarjeta);
 * - ingresos, movimientos entre tus cuentas, promociones y avisos sin monto → solo quedan en el registro.
 */
export function decide(raws: RawNotification[], ctx: { expenses: Expense[]; processed: Set<string>; nowIso: string; deviceId?: string; cotizacionDolar?: number; partnerName?: string }): IngestResult {
  const partner = (ctx.partnerName ?? '').trim().split(/\s+/)[0]?.toLowerCase().normalize('NFD').replace(/\p{Mn}+/gu, '');
  const isPartner = (who?: string) => !!who && !!partner && partner !== 'pareja' && who.toLowerCase().normalize('NFD').replace(/\p{Mn}+/gu, '').split(/\s+/).some((w) => w.length >= 3 && (w.startsWith(partner) || partner.startsWith(w)));
  const out: IngestResult = { expenses: [], review: [], log: [], keys: [] };
  const recent = ctx.expenses.filter((e) => !e.deleted && e.importedFrom === 'notificacion');
  const pending: Array<{ d: Detectado }> = [];
  for (const r of raws) {
    out.keys.push(r.clave);
    if (ctx.processed.has(r.clave)) continue;
    ctx.processed.add(r.clave);
    const res = analizar(r.paquete, r.titulo, r.texto, r.fecha, ctx.cotizacionDolar ?? 0);
    const texto = [r.titulo, r.texto].filter(Boolean).join(' · ').slice(0, 200);
    const log = (cuenta: string, resultado: string) => out.log.push({ fecha: r.fecha, cuenta, texto, resultado });
    if ('ignorada' in res) {
      log(r.paquete, { SIN_MONTO: 'Sin importe', MONEDA_EXTRANJERA: 'En dólares (no se carga)', PROMOCION: 'Promoción', OPERACION_FALLIDA: 'Operación rechazada o aviso', NO_RECONOCIDA: 'No reconocida' }[res.ignorada]);
      continue;
    }
    const d = res.movimiento;
    if (d.tipo === 'TRANSFERENCIA_PROPIA') {
      log(d.cuenta, 'Entre tus cuentas o pago de tarjeta (no es gasto)');
      continue;
    }
    if (d.tipo === 'INGRESO') {
      log(d.cuenta, 'Ingreso (el sueldo se carga con los movimientos del banco)');
      continue;
    }
    if (d.cuotas) {
      log(d.cuenta, 'Compra en cuotas: llega con el resumen de la tarjeta');
      continue;
    }
    // La misma operación avisada dos veces (misma notificación otra vez, o Google Pay y el banco).
    const all = [...recent, ...out.expenses];
    const sameText = pending.find((p) => p.d.textoOriginal === d.textoOriginal && Math.abs(p.d.fecha - d.fecha) <= DUP_MS);
    const dup =
      sameText ||
      all.find((e) => e.totalAmount === d.monto && Math.abs(new Date(`${e.date}T12:00:00`).getTime() - d.fecha) <= 36 * 3600 * 1000 && (e.linkedLineFingerprints ?? []).filter((f) => f.startsWith('notif|')).some((f) => {
        const [, cuenta, t] = f.split('|');
        return Math.abs(Number(t) - d.fecha) <= DUP_MS && (cuenta !== d.cuenta ? cuenta === CUENTAS.GOOGLE_PAY || d.cuenta === CUENTAS.GOOGLE_PAY : true);
      }));
    if (dup) {
      log(d.cuenta, 'Repetida (ya registrada)');
      continue;
    }
    if (d.monto === 0 || (d.transferencia === 'ENVIADA' && isPartner(d.contraparte))) {
      // Sin importe en el aviso, o a tu pareja (puede ser el alquiler, que ya está en los compartidos): decide el usuario.
      const motivo = d.monto === 0 ? 'El aviso no dice el importe: poné cuánto fue' : 'Transferencia a tu pareja: ¿es un gasto nuevo o ya está en los compartidos?';
      out.review.push({ id: uid(), fecha: d.fecha, monto: d.monto, descripcion: d.descripcion, cuenta: d.cuenta, texto: d.textoOriginal.slice(0, 200), motivo, clave: r.clave });
      pending.push({ d });
      log(d.cuenta, d.monto === 0 ? (d.transferencia ? 'Para revisar (transferencia sin importe)' : 'Para revisar (pago sin importe)') : 'Para revisar (transferencia a tu pareja)');
      continue;
    }
    out.expenses.push(expenseFromDetected(d, ctx.nowIso, ctx.deviceId, r.clave));
    pending.push({ d });
    log(d.cuenta, `Gasto registrado: ${d.descripcion}`);
  }
  return out;
}
