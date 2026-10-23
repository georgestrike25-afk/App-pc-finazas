import { addMonths, monthOf, type MonthKey } from './dates';
import { splitAmount, sum, type Cents } from './money';
import type { Expense } from './types';

/**
 * Modo pareja: los dos comparten una planilla de gastos fijos, los gastos compartidos y los pagos
 * entre ellos. Cada uno conserva sus datos privados; solo viaja este documento (cifrado).
 * "a" es quien creó el modo pareja y "b" quien se unió con el código.
 */
export type Miembro = 'a' | 'b';

export interface ParejaRegistro {
  id: string;
  updatedAt: string;
  deleted?: boolean;
}

/** Un renglón de la planilla de gastos fijos (se repite todos los meses). */
export interface ParejaItem extends ParejaRegistro {
  nombre: string;
  /** Ícono de la lista (nombre de lucide). */
  icono: string;
  categoria: string;
  /** Quién lo paga; "ambos" = lo puede cargar cualquiera (p. ej. fondo casa). */
  paga: Miembro | 'ambos';
  /** Parte de quien paga (50 = mitad y mitad; 100 = es solo de quien paga, no se comparte; 0 = es todo del otro, que se lo debe). */
  pctPaga: number;
  /** Monto fijo: se carga solo todos los meses. Sin monto = lo pone quien paga cada mes. */
  fijo?: Cents;
  /** Obra social: llega con el resumen de la tarjeta de quien la paga (no se duplica en su app). */
  sancor?: boolean;
  opcional?: boolean;
  orden: number;
}

/** Gasto compartido (del día a día o un gasto fijo del mes). */
export interface ParejaGasto extends ParejaRegistro {
  createdAt: string;
  autor: Miembro;
  paga: Miembro;
  /** Parte de quien pagó (50 = mitad y mitad). */
  pctPaga: number;
  concepto: string;
  total: Cents;
  fecha: string;
  mes: MonthKey;
  categoria: string;
  itemId?: string;
}

/** "Pagado": uno le pasó plata al otro para saldar. */
export interface ParejaPago extends ParejaRegistro {
  createdAt: string;
  de: Miembro;
  a: Miembro;
  monto: Cents;
  fecha: string;
  mes: MonthKey;
  medio: 'transferencia' | 'efectivo';
}

/** Dirección en la que un dispositivo (celular o PC) recibe la sincronización en el Wi-Fi. */
export interface ParejaServidor extends ParejaRegistro {
  /** id = identificador del dispositivo. */
  url: string;
}

export interface ParejaDoc {
  v: 1;
  nombres: { a: string; b: string; updatedAt: string };
  items: ParejaItem[];
  gastos: ParejaGasto[];
  pagos: ParejaPago[];
  servidores?: ParejaServidor[];
}

export const otro = (m: Miembro): Miembro => (m === 'a' ? 'b' : 'a');

/** Planilla inicial (sin montos, salvo el consultorio). "a" es Jorge, "b" Antonella; se puede editar. */
export function plantillaInicial(now: string): ParejaItem[] {
  const base: Array<Omit<ParejaItem, 'id' | 'updatedAt' | 'orden'>> = [
    { nombre: 'Alquiler', icono: 'House', categoria: 'Alquiler', paga: 'b', pctPaga: 50 },
    { nombre: 'Luz', icono: 'Zap', categoria: 'Servicios del hogar', paga: 'b', pctPaga: 50 },
    { nombre: 'Gas', icono: 'Flame', categoria: 'Servicios del hogar', paga: 'b', pctPaga: 50 },
    { nombre: 'Internet', icono: 'Wifi', categoria: 'Servicios del hogar', paga: 'b', pctPaga: 50 },
    { nombre: 'Fondo casa', icono: 'PiggyBank', categoria: 'Hogar', paga: 'ambos', pctPaga: 50, opcional: true },
    { nombre: 'Obra social (Sancor)', icono: 'HeartPulse', categoria: 'Salud', paga: 'a', pctPaga: 50, sancor: true },
    // Es todo de Jorge, pero se lo paga a Antonella: suma a lo que le tiene que pasar.
    { nombre: 'Alquiler de consultorio', icono: 'Stethoscope', categoria: 'Consultorio', paga: 'b', pctPaga: 0, fijo: 2_000_000 },
  ];
  return base.map((b, i) => ({ ...b, id: `fijo-${i + 1}`, updatedAt: now, orden: i + 1 }));
}

export function nuevoDoc(nombres: { a: string; b: string }, now: string): ParejaDoc {
  return { v: 1, nombres: { ...nombres, updatedAt: now }, items: plantillaInicial(now), gastos: [], pagos: [] };
}

function unir<T extends ParejaRegistro>(a: T[], b: T[]): T[] {
  const m = new Map<string, T>();
  for (const r of [...a, ...b]) {
    const prev = m.get(r.id);
    if (!prev || r.updatedAt > prev.updatedAt || (r.updatedAt === prev.updatedAt && r.deleted && !prev.deleted)) m.set(r.id, r);
  }
  return [...m.values()];
}

/** Une dos versiones del documento: gana la última modificación de cada renglón. */
export function unirDocs(a: ParejaDoc, b: ParejaDoc): ParejaDoc {
  return {
    v: 1,
    nombres: b.nombres.updatedAt > a.nombres.updatedAt ? b.nombres : a.nombres,
    items: unir(a.items, b.items).sort((x, y) => x.orden - y.orden),
    gastos: unir(a.gastos, b.gastos).sort((x, y) => x.fecha.localeCompare(y.fecha) || x.createdAt.localeCompare(y.createdAt)),
    pagos: unir(a.pagos, b.pagos).sort((x, y) => x.fecha.localeCompare(y.fecha) || x.createdAt.localeCompare(y.createdAt)),
    servidores: unir(a.servidores ?? [], b.servidores ?? []),
  };
}

/** Huella estable del contenido (para saber si hay algo nuevo que subir). */
export function huellaDoc(d: ParejaDoc): string {
  const ids = (rs: ParejaRegistro[]) => rs.map((r) => `${r.id}@${r.updatedAt}${r.deleted ? 'x' : ''}`).sort().join(',');
  return `${d.nombres.updatedAt}|${ids(d.items)}|${ids(d.gastos)}|${ids(d.pagos)}|${ids(d.servidores ?? [])}`;
}

/** Cuánto le toca a cada uno de un gasto compartido. */
export function partes(g: Pick<ParejaGasto, 'total' | 'pctPaga' | 'paga'>): Record<Miembro, Cents> {
  const [delQuePaga, delOtro] = splitAmount(g.total, g.pctPaga);
  return g.paga === 'a' ? { a: delQuePaga, b: delOtro } : { a: delOtro, b: delQuePaga };
}

export interface Saldo {
  /** Positivo: el otro te debe. Negativo: le debés al otro. */
  neto: Cents;
  pagasteVos: Cents;
  pagoElOtro: Cents;
  /** Tu parte de lo que pagó el otro. */
  tuParteDeLoSuyo: Cents;
  /** Su parte de lo que pagaste vos. */
  suParteDeLoTuyo: Cents;
}

/** Saldo de la pareja desde el punto de vista de "yo" (todos los meses, descontando los pagos). */
export function saldo(doc: ParejaDoc, yo: Miembro, mes?: MonthKey): Saldo {
  const vivos = doc.gastos.filter((g) => !g.deleted && (!mes || g.mes === mes));
  const mios = vivos.filter((g) => g.paga === yo);
  const suyos = vivos.filter((g) => g.paga !== yo);
  const suParteDeLoTuyo = sum(mios.map((g) => partes(g)[otro(yo)]));
  const tuParteDeLoSuyo = sum(suyos.map((g) => partes(g)[yo]));
  const pagos = doc.pagos.filter((p) => !p.deleted && (!mes || p.mes === mes));
  const pagaste = sum(pagos.filter((p) => p.de === yo).map((p) => p.monto));
  const recibiste = sum(pagos.filter((p) => p.a === yo).map((p) => p.monto));
  return {
    neto: suParteDeLoTuyo - tuParteDeLoSuyo + pagaste - recibiste,
    pagasteVos: sum(mios.map((g) => g.total)),
    pagoElOtro: sum(suyos.map((g) => g.total)),
    tuParteDeLoSuyo,
    suParteDeLoTuyo,
  };
}

export interface FilaFijo {
  item: ParejaItem;
  gasto?: ParejaGasto;
  /** Monto del mes anterior, como referencia ("Igual que el mes pasado"). */
  anterior?: Cents;
}

/** Planilla de gastos fijos del mes: lo cargado y lo pendiente (los que no se comparten solo los ve quien paga). */
export function fijosDelMes(doc: ParejaDoc, mes: MonthKey, yo: Miembro): FilaFijo[] {
  const prev = addMonths(mes, -1);
  return doc.items
    .filter((i) => !i.deleted && (i.pctPaga < 100 || i.paga === yo))
    .map((item) => {
      const delItem = doc.gastos.filter((g) => !g.deleted && g.itemId === item.id);
      return {
        item,
        gasto: delItem.find((g) => g.mes === mes),
        anterior: delItem.filter((g) => g.mes === prev).at(-1)?.total,
      };
    });
}

export const idEspejo = (gastoId: string) => `pareja-${gastoId}`;
export const idFijoSolo = (itemId: string, mes: MonthKey) => `pareja-fijo-${itemId}-${mes}`;
export const esDePareja = (e: Pick<Expense, 'id'>) => e.id.startsWith('pareja-');

export interface PlanEspejo {
  /** Gastos de la app de este dispositivo que hay que crear, corregir o borrar. */
  put: Expense[];
  /** Cambios hechos en la app (editar o borrar el gasto) que vuelven a la pareja. */
  gastos: ParejaGasto[];
  /** Gastos fijos que se cargan solos este mes. */
  nuevos: ParejaGasto[];
  categorias: string[];
}

/**
 * Lleva los gastos compartidos a la lista de gastos de este dispositivo (con la parte que le toca)
 * y trae de vuelta lo que se editó o borró desde Gastos. Función pura: no toca la base.
 * - El gasto de la app tiene id fijo (pareja-<id>): el celular y la PC de la misma persona generan el mismo.
 * - La obra social que paga uno con la tarjeta no se copia en su propia app: llega con el resumen.
 * - Los fijos con monto (consultorio) se cargan solos el mes actual (cualquiera de los dos dispositivos, con el mismo id);
 *   si no se comparten (100 % de quien paga), van solo a quien paga.
 */
export function planEspejo(doc: ParejaDoc, yo: Miembro, expenses: Expense[], ctx: { nowIso: string; mes: MonthKey; deviceId?: string; categories: string[] }): PlanEspejo {
  const plan: PlanEspejo = { put: [], gastos: [], nuevos: [], categorias: [] };
  const byId = new Map(expenses.map((e) => [e.id, e]));
  const cat = (c: string) => {
    if (c && !ctx.categories.includes(c) && !plan.categorias.includes(c)) plan.categorias.push(c);
  };

  // Fijos con monto que se cargan solos este mes.
  for (const item of doc.items) {
    if (item.deleted || !item.fijo) continue;
    if (item.pctPaga >= 100) {
      if (item.paga !== yo) continue;
      const id = idFijoSolo(item.id, ctx.mes);
      if (byId.has(id)) continue; // ya está (o se borró a propósito este mes)
      cat(item.categoria);
      plan.put.push({
        id,
        createdAt: ctx.nowIso,
        updatedAt: ctx.nowIso,
        deviceId: ctx.deviceId,
        kind: 'personal',
        category: item.categoria,
        concept: item.nombre,
        date: `${ctx.mes}-01`,
        month: ctx.mes,
        totalAmount: item.fijo,
        userPct: 100,
        paid: true,
        frequency: 'unica',
        paymentMethod: 'otro',
        source: 'manual',
        notes: 'Gasto fijo de la planilla (modo pareja): se carga solo todos los meses.',
      });
    } else if (!doc.gastos.some((g) => g.itemId === item.id && g.mes === ctx.mes)) {
      plan.nuevos.push({
        id: `${item.id}-${ctx.mes}`,
        createdAt: ctx.nowIso,
        updatedAt: ctx.nowIso,
        autor: yo,
        paga: item.paga === 'ambos' ? yo : item.paga,
        pctPaga: item.pctPaga,
        concepto: item.nombre,
        total: item.fijo,
        fecha: `${ctx.mes}-01`,
        mes: ctx.mes,
        categoria: item.categoria,
        itemId: item.id,
      });
    }
  }

  const items = new Map(doc.items.map((i) => [i.id, i]));
  for (const g of [...doc.gastos, ...plan.nuevos]) {
    if (g.paga === yo && g.itemId && items.get(g.itemId)?.sancor) continue;
    const id = idEspejo(g.id);
    const e = byId.get(id);
    const mia = partes(g)[yo];
    const want = {
      kind: 'hogar' as const,
      category: g.categoria,
      concept: g.concepto,
      date: g.fecha,
      month: g.mes,
      totalAmount: g.total,
      userPct: g.total ? Math.round((mia / g.total) * 10000) / 100 : g.paga === yo ? g.pctPaga : 100 - g.pctPaga,
      paidBy: g.paga === yo ? ('usuario' as const) : ('pareja' as const),
    };
    if (g.deleted) {
      if (e && !e.deleted) plan.put.push({ ...e, deleted: true, updatedAt: ctx.nowIso, deviceId: ctx.deviceId });
      continue;
    }
    if (!e) {
      cat(g.categoria);
      plan.put.push({
        id,
        createdAt: ctx.nowIso,
        updatedAt: ctx.nowIso,
        deviceId: ctx.deviceId,
        ...want,
        paid: true,
        frequency: 'unica',
        paymentMethod: 'otro',
        source: 'manual',
        notes: g.paga === yo ? 'Compartido (modo pareja): lo pagaste vos.' : 'Compartido (modo pareja): lo pagó tu pareja.',
      });
      continue;
    }
    const newerHere = e.updatedAt > g.updatedAt;
    if (e.deleted) {
      // Se borró desde Gastos después del último cambio de la pareja: no era compartido.
      if (newerHere) plan.gastos.push({ ...g, deleted: true, updatedAt: ctx.nowIso });
      else plan.put.push({ ...e, ...want, deleted: false, updatedAt: ctx.nowIso, deviceId: ctx.deviceId });
      continue;
    }
    const igual = e.totalAmount === g.total && e.concept === g.concepto && e.date === g.fecha && e.category === g.categoria;
    if (!igual && newerHere) {
      plan.gastos.push({ ...g, total: e.totalAmount, concepto: e.concept, fecha: e.date, mes: monthOf(e.date), categoria: e.category, updatedAt: ctx.nowIso });
    } else if (!igual || e.userPct !== want.userPct || e.paidBy !== want.paidBy || e.kind !== 'hogar' || e.month !== want.month) {
      plan.put.push({ ...e, ...want, updatedAt: ctx.nowIso, deviceId: ctx.deviceId });
    }
  }
  return plan;
}

/** Plata entre los dos para "Plata hasta cobrar": lo que pasaste (sale) y lo que te pasaron (entra). */
export interface ParejaCaja {
  yo: Miembro;
  nombreOtro: string;
  pagos: ParejaPago[];
}

/** Lo que sale de tu bolsillo por un gasto compartido del modo pareja: todo si lo pagaste vos, nada si lo pagó el otro. */
export function bolsilloPareja(e: Expense): Cents | null {
  if (!esDePareja(e) || e.kind !== 'hogar') return null;
  return e.paidBy === 'pareja' ? 0 : e.totalAmount;
}

export interface ParejaCfg {
  /** Direcciones conocidas (celulares y PC) donde se puede sincronizar. */
  servidores: string[];
  space: string;
  token: string;
  passphrase: string;
}

/** Código para unir el otro celular: direcciones, espacio, token y frase (se manda por WhatsApp entre ustedes). */
export function codigoPareja(p: ParejaCfg): string {
  const json = JSON.stringify({ u: p.servidores, s: p.space, t: p.token, k: p.passphrase });
  const b64 = btoa(unescape(encodeURIComponent(json)));
  return `BROTE2-${b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`;
}

export function leerCodigoPareja(code: string): ParejaCfg {
  const m = code.trim().replace(/\s+/g, '').match(/^BROTE2-([A-Za-z0-9_-]+)$/);
  if (!m) throw new Error('El código no es de modo pareja (empieza con BROTE2-).');
  try {
    const b64 = m[1].replace(/-/g, '+').replace(/_/g, '/');
    const o = JSON.parse(decodeURIComponent(escape(atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4)))));
    if (!Array.isArray(o.u) || o.u.some((x: unknown) => typeof x !== 'string') || typeof o.s !== 'string' || typeof o.t !== 'string' || typeof o.k !== 'string') throw new Error();
    if (!/^pareja-[A-Za-z0-9_-]{3,56}$/.test(o.s)) throw new Error();
    return { servidores: o.u, space: o.s, token: o.t, passphrase: o.k };
  } catch {
    throw new Error('El código está incompleto o dañado. Copialo de nuevo.');
  }
}
