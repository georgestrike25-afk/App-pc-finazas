import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import { getDb } from '../db/db';
import { addAudit, getDeviceId, getSettings, loadDataSet, notify, nowIso } from '../db/repo';
import { cashStatus } from '../domain/cash';
import { formatARS } from '../domain/money';
import { planQuick, type QuickEntry } from './quick';
import { isNative } from '../platform';
import { decide, type LogNotif, type RawNotification, type ReviewNotif } from './ingest';

interface NotificacionesPlugin {
  estado(): Promise<{ permitido: boolean }>;
  abrirAjustes(): Promise<void>;
  pendientes(): Promise<{ items: RawNotification[] }>;
  borrar(o: { cantidad: number }): Promise<void>;
  addListener(ev: 'nuevas' | 'rapidas' | 'compartido', cb: () => void): Promise<PluginListenerHandle>;
  configurar(o: { activo: boolean; pareja: string }): Promise<void>;
  rapidas(): Promise<{ items: QuickEntry[] }>;
  borrarRapidas(o: { cantidad: number }): Promise<void>;
  widget(o: { pendientes: number; ultimoT?: string; ultimoS?: string; ultimoM?: string; plata?: string }): Promise<void>;
  permisoAvisos(): Promise<{ permitido: boolean }>;
  pedirPermisoAvisos(): Promise<void>;
  compartidos(): Promise<{ items: Array<{ ruta: string; nombre: string; tipo: string }> }>;
  quitarAviso(o: { clave: string }): Promise<void>;
}

export const Notificaciones = registerPlugin<NotificacionesPlugin>('Notificaciones');

/** Configuración local de este teléfono (no se sincroniza). */
export interface NotifConfig {
  activo: boolean;
}

const meta = <T>(key: string, def: T) => getDb().meta.get(key).then((r) => (r?.value as T) ?? def);
const setMeta = (key: string, value: unknown) => getDb().meta.put({ key, value });

export const getNotifConfig = () => meta<NotifConfig>('notifConfig', { activo: false });
export const setNotifConfig = (c: NotifConfig) => setMeta('notifConfig', c);
export const getNotifLog = () => meta<LogNotif[]>('notifLog', []);
export const getNotifReview = () => meta<ReviewNotif[]>('notifReview', []);
export const setNotifReview = (r: ReviewNotif[]) => setMeta('notifReview', r);

let running = false;
let quickRunning = false;

/** Registra lo anotado desde el widget o los avisos de Brote (gastos, ingresos, compartidos, "No registrar" y "Deshacer"). */
export async function ingestQuick(): Promise<number> {
  if (!isNative() || quickRunning) return 0;
  quickRunning = true;
  try {
    const { items } = await Notificaciones.rapidas();
    if (!items.length) return 0;
    const db = getDb();
    const settings = await getSettings(db);
    const deviceId = await getDeviceId(db);
    const now = nowIso();
    const plan = planQuick(items, { expenses: await db.expenses.toArray(), incomes: await db.incomes.toArray(), nowIso: now, deviceId, defaultUserPct: settings.defaultUserPct, categories: settings.categories });
    await db.transaction('rw', [db.expenses, db.incomes, db.settings, db.meta, db.audit], async () => {
      for (const e of plan.put) await db.expenses.put(e);
      for (const e of plan.remove) await db.expenses.put({ ...e, deleted: true, updatedAt: now, deviceId });
      for (const i of plan.incomes) await db.incomes.put(i);
      if (plan.categories.length) await db.settings.put({ ...settings, categories: [...settings.categories, ...plan.categories], updatedAt: now });
      if (plan.resolved.length) {
        await setNotifReview((await getNotifReview()).filter((r) => !r.clave || !plan.resolved.includes(r.clave)));
        const keys = new Set(await meta<string[]>('notifKeys', []));
        plan.resolved.forEach((k) => keys.add(k));
        await setMeta('notifKeys', [...keys].slice(-1000));
      }
      const n = plan.put.length + plan.incomes.length;
      if (n || plan.remove.length) await addAudit(db, 'crear', 'gastos', undefined, `Anotación rápida: ${n} registro(s)${plan.remove.length ? `, ${plan.remove.length} deshecho(s)` : ''}`, deviceId);
    });
    await Notificaciones.borrarRapidas({ cantidad: items.length });
    notify();
    return plan.put.length + plan.incomes.length;
  } finally {
    quickRunning = false;
  }
}

/** Le pasa al widget el estado real: lo que falta registrar, lo último anotado y la plata hasta cobrar. */
export async function syncWidget(): Promise<void> {
  if (!isNative()) return;
  try {
    const data = await loadDataSet();
    const cfg = await getNotifConfig();
    await Notificaciones.configurar({ activo: cfg.activo, pareja: data.settings.partnerName ?? '' });
    const review = await getNotifReview();
    const last = data.expenses.filter((e) => !e.deleted).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    const today = new Date();
    const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const cash = cashStatus(data, iso);
    const mins = last ? Math.round((Date.now() - Date.parse(last.createdAt)) / 60000) : 0;
    const hace = mins < 2 ? 'recién' : mins < 60 ? `hace ${mins} min` : mins < 1440 ? `hace ${Math.round(mins / 60)} h` : `el ${last!.date.slice(8, 10)}/${last!.date.slice(5, 7)}`;
    await Notificaciones.widget({
      pendientes: review.length,
      ...(last ? { ultimoT: `Se sumó: ${last.concept}`, ultimoS: `${hace} · ${last.category}`, ultimoM: formatARS(last.kind === 'hogar' ? Math.round((last.totalAmount * last.userPct) / 100) : last.totalAmount).replace(/,00$/, '') } : {}),
      plata: cash ? formatARS(cash.left).replace(/,\d\d$/, '') : '—',
    });
  } catch {
    // sin widget: no pasa nada
  }
}

/** Archivos que llegan con "Compartir → Importar en Brote": se abren en "Subir documento". */
const sharedQueue: File[] = [];
const sharedListeners = new Set<() => void>();
export function takeSharedFile(): File | undefined {
  return sharedQueue.shift();
}
export function onSharedFile(cb: () => void): () => void {
  sharedListeners.add(cb);
  return () => sharedListeners.delete(cb);
}
async function receiveShared() {
  const { items } = await Notificaciones.compartidos();
  for (const it of items) {
    try {
      const blob = await (await fetch(Capacitor.convertFileSrc(`file://${it.ruta}`))).blob();
      sharedQueue.push(new File([blob], it.nombre, { type: it.tipo || blob.type }));
    } catch {
      // archivo que no se pudo leer
    }
  }
  if (!items.length) return;
  if (!location.hash.startsWith('#/importar')) location.hash = '#/importar';
  sharedListeners.forEach((l) => l());
}

/** Toma las notificaciones guardadas por el lector y registra los gastos. Devuelve cuántos se registraron. */
export async function ingestNotifications(): Promise<number> {
  if (!isNative() || running) return 0;
  const cfg = await getNotifConfig();
  if (!cfg.activo) return 0;
  running = true;
  try {
    const { items } = await Notificaciones.pendientes();
    if (!items.length) return 0;
    const db = getDb();
    const processed = new Set(await meta<string[]>('notifKeys', []));
    const settings = await getSettings(db);
    const r = decide(items, { expenses: await db.expenses.toArray(), processed, nowIso: nowIso(), deviceId: await getDeviceId(db), partnerName: settings.partnerName });
    await db.transaction('rw', [db.expenses, db.meta, db.audit], async () => {
      for (const e of r.expenses) await db.expenses.put(e);
      if (r.review.length) await setNotifReview([...(await getNotifReview()), ...r.review].slice(-100));
      await setMeta('notifLog', [...r.log.reverse(), ...(await getNotifLog())].slice(0, 100));
      await setMeta('notifKeys', [...processed].slice(-1000));
      if (r.expenses.length) await addAudit(db, 'crear', 'gastos', undefined, `${r.expenses.length} gasto(s) registrados desde notificaciones`, await getDeviceId(db));
    });
    await Notificaciones.borrar({ cantidad: items.length });
    if (r.expenses.length || r.review.length) notify();
    return r.expenses.length;
  } finally {
    running = false;
  }
}

/** Revisa las notificaciones al abrir la app, al volver a ella y cuando llega una nueva. */
export function startNotificationIngest(onNew?: (n: number) => void) {
  if (!isNative()) return;
  // Primero lo anotado a mano en el widget o los avisos (que puede resolver o deshacer un aviso), después las notificaciones.
  const run = () =>
    ingestQuick()
      .catch(() => 0)
      .then(() => ingestNotifications())
      .then((n) => n && onNew?.(n))
      .catch(() => {})
      .finally(() => syncWidget());
  run();
  Notificaciones.addListener('nuevas', run).catch(() => {});
  Notificaciones.addListener('rapidas', run).catch(() => {});
  Notificaciones.addListener('compartido', () => receiveShared().catch(() => {})).catch(() => {});
  receiveShared().catch(() => {});
  document.addEventListener('visibilitychange', () => !document.hidden && run());
}
