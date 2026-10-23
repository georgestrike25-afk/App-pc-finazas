import { monthOf } from '../domain/dates';
import type { Cents } from '../domain/money';
import { uid } from '../domain/text';
import type { Expense, ExpenseKind, Income } from '../domain/types';

/**
 * Anotación rápida hecha en el celular (widget o aviso de Brote), tal como la guarda Android.
 * - guardar: un gasto, ingreso o gasto compartido (si viene de un aviso, trae su clave);
 * - descartar: "No registrar" un aviso sin monto;
 * - deshacer: el gasto que se anotó solo no se registra (o se borra si ya estaba).
 */
export interface QuickEntry {
  id?: string;
  accion: 'guardar' | 'descartar' | 'deshacer';
  tipo?: 'gasto' | 'ingreso' | 'compartido';
  categoria?: 'dia' | 'transporte' | 'servicios' | 'otros';
  monto?: Cents;
  descripcion?: string;
  cuenta?: string;
  fecha?: number;
  transferencia?: boolean;
  clave?: string;
  reemplaza?: boolean;
  /** Compartido (modo pareja): lo pagó tu pareja. */
  pagoPareja?: boolean;
}

/** Categorías generales de la anotación rápida → tipo y categoría de la app. */
export const QUICK_CATEGORIES: Record<NonNullable<QuickEntry['categoria']>, { kind: ExpenseKind; category: string }> = {
  dia: { kind: 'cotidiano', category: 'Gasto diario' },
  transporte: { kind: 'cotidiano', category: 'Transporte' },
  servicios: { kind: 'personal', category: 'Servicios del hogar' },
  otros: { kind: 'personal', category: 'Otros' },
};

export interface QuickPlan {
  /** Gastos nuevos o modificados. */
  put: Expense[];
  /** Gastos a eliminar (los que se deshicieron). */
  remove: Expense[];
  incomes: Income[];
  /** Avisos resueltos: se sacan de "para revisar" y no se vuelven a procesar. */
  resolved: string[];
  /** Categorías nuevas que hay que agregar a la lista. */
  categories: string[];
}

const isoLocal = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const CUENTA_NOTIF: Record<string, string> = { 'Pago sin contacto': 'Google Pay' };

/** Decide qué cambios hacer con las anotaciones rápidas (función pura, para poder probarla). */
export function planQuick(entries: QuickEntry[], ctx: { expenses: Expense[]; incomes: Income[]; nowIso: string; deviceId?: string; defaultUserPct: number; categories: string[] }): QuickPlan {
  const plan: QuickPlan = { put: [], remove: [], incomes: [], resolved: [], categories: [] };
  const live = () => [...ctx.expenses.filter((e) => !e.deleted && !plan.remove.some((r) => r.id === e.id)), ...plan.put].filter((e, i, a) => a.findIndex((x) => x.id === e.id) === i);
  const byKey = (clave?: string) => (clave ? live().find((e) => (e.linkedLineFingerprints ?? []).includes(`notifkey|${clave}`)) : undefined);
  const upsert = (e: Expense) => {
    plan.put = [...plan.put.filter((x) => x.id !== e.id), e];
  };

  for (const q of entries) {
    if (q.clave && !plan.resolved.includes(q.clave)) plan.resolved.push(q.clave);
    if (q.accion !== 'guardar') {
      // "Deshacer": el gasto que se anotó solo no va. "No registrar": no había gasto, solo se resuelve el aviso.
      const e = byKey(q.clave);
      if (e && q.accion === 'deshacer') {
        plan.put = plan.put.filter((x) => x.id !== e.id);
        if (ctx.expenses.some((x) => x.id === e.id)) plan.remove.push(e);
      }
      continue;
    }
    const monto = Math.abs(Math.round(q.monto ?? 0));
    if (!monto) continue;
    const fecha = q.fecha ?? Date.parse(ctx.nowIso);
    const date = isoLocal(fecha);
    const concept = (q.descripcion ?? '').trim() || (q.tipo === 'ingreso' ? 'Ingreso' : 'Gasto');
    const existing = byKey(q.clave);

    if (q.tipo === 'ingreso') {
      // Si el aviso se había anotado como gasto y en realidad era un ingreso, ese gasto se quita.
      if (existing) {
        plan.put = plan.put.filter((x) => x.id !== existing.id);
        if (ctx.expenses.some((x) => x.id === existing.id)) plan.remove.push(existing);
      }
      const month = monthOf(date);
      const prev = plan.incomes.find((i) => i.month === month) ?? ctx.incomes.find((i) => !i.deleted && i.month === month);
      const line = { concept: `${concept}${q.cuenta ? ` (${q.cuenta})` : ''}`, amount: monto };
      const inc: Income = prev
        ? { ...prev, updatedAt: ctx.nowIso, deviceId: ctx.deviceId, extras: [...prev.extras, line] }
        : { id: uid(), createdAt: ctx.nowIso, updatedAt: ctx.nowIso, deviceId: ctx.deviceId, month, status: 'confirmado', amountReceived: 0, receivedDate: date, extras: [line], deductions: [], notes: 'Ingresos anotados con la anotación rápida.', revisions: [] };
      plan.incomes = [...plan.incomes.filter((i) => i.id !== inc.id), inc];
      continue;
    }

    const cat = QUICK_CATEGORIES[q.categoria ?? 'dia'] ?? QUICK_CATEGORIES.dia;
    if (!ctx.categories.includes(cat.category) && !plan.categories.includes(cat.category)) plan.categories.push(cat.category);
    const shared = q.tipo === 'compartido';
    const fields = {
      kind: shared ? ('hogar' as const) : cat.kind,
      category: cat.category,
      totalAmount: monto,
      userPct: shared ? ctx.defaultUserPct : 100,
      paidBy: shared ? ('usuario' as const) : undefined,
      updatedAt: ctx.nowIso,
      deviceId: ctx.deviceId,
    };
    if (existing) {
      // "Cambiar categoría" de un gasto que ya se anotó solo: se corrige ese mismo gasto.
      upsert({ ...existing, ...fields });
      continue;
    }
    const cuenta = q.cuenta ? CUENTA_NOTIF[q.cuenta] ?? q.cuenta : undefined;
    upsert({
      id: uid(),
      createdAt: ctx.nowIso,
      ...fields,
      concept,
      date,
      month: monthOf(date),
      paid: true,
      frequency: 'unica',
      paymentMethod: q.transferencia ? 'transferencia' : 'otro',
      source: 'manual',
      importedFrom: q.clave ? 'notificacion' : undefined,
      notes: `Anotación rápida${q.cuenta ? ` · ${q.cuenta}` : ''}`,
      linkedLineFingerprints: q.clave ? [`notifkey|${q.clave}`, ...(cuenta && q.fecha ? [`notif|${cuenta}|${q.fecha}|${monto}`] : [])] : [],
    });
  }
  return plan;
}
