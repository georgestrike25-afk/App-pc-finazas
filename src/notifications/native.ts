import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import { getDb } from '../db/db';
import { addAudit, getDeviceId, getSettings, notify, nowIso } from '../db/repo';
import { isNative } from '../platform';
import { decide, type LogNotif, type RawNotification, type ReviewNotif } from './ingest';

interface NotificacionesPlugin {
  estado(): Promise<{ permitido: boolean }>;
  abrirAjustes(): Promise<void>;
  pendientes(): Promise<{ items: RawNotification[] }>;
  borrar(o: { cantidad: number }): Promise<void>;
  addListener(ev: 'nuevas', cb: () => void): Promise<PluginListenerHandle>;
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
  const run = () => ingestNotifications().then((n) => n && onNew?.(n)).catch(() => {});
  run();
  Notificaciones.addListener('nuevas', run).catch(() => {});
  document.addEventListener('visibilitychange', () => !document.hidden && run());
}
