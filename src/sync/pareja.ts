import { decryptString, encryptString, type EncryptedEnvelope } from '../backup/crypto';
import { getDb, type FinanzasDB } from '../db/db';
import { addAudit, getDeviceId, getSettings, notify, nowIso, subscribe } from '../db/repo';
import { currentMonth } from '../domain/dates';
import { formatARS } from '../domain/money';
import { codigoPareja, huellaDoc, nuevoDoc, otro, partes, planEspejo, unirDocs, type Miembro, type ParejaCfg, type ParejaDoc } from '../domain/pareja';
import { findServer, normalizeServerUrl } from './syncClient';
import { detenerHost, iniciarHost, type HostInfo } from './parejaHost';

/**
 * Modo pareja: el documento compartido viaja cifrado entre los dispositivos de los dos por el Wi-Fi.
 * Cada celular (y la PC, si está) guarda una copia y también la recibe de los demás: no depende de
 * que la PC esté prendida. Se puede anotar sin conexión y se sincroniza al volver a estar juntos.
 */
export interface ParejaEstado {
  cfg: ParejaCfg;
  /** Quién es este dispositivo (se elige al unirse). */
  yo?: Miembro;
  doc: ParejaDoc;
  /** Gastos y pagos del otro que ya se avisaron. */
  vistos: string[];
  /** Última versión conocida de cada dirección. */
  versiones?: Record<string, { v: number; h?: string }>;
  /** Última vez que se sincronizó con otro dispositivo (no con este mismo). */
  ultima?: string;
  error?: string;
}

/** La frase es aleatoria y larga: alcanza con menos iteraciones que una contraseña escrita a mano. */
const ITER = 150_000;
const KEY = 'pareja';

type FetchLike = typeof fetch;
const listeners = new Set<(s: ParejaEstado | null) => void>();
/** Copia en memoria por base (la misma referencia mientras no cambie: así se sabe si se tocó). */
const cache = new WeakMap<FinanzasDB, ParejaEstado | null>();

export async function loadPareja(db: FinanzasDB = getDb()): Promise<ParejaEstado | null> {
  if (cache.has(db)) return cache.get(db)!;
  const v = ((await db.meta.get(KEY))?.value as ParejaEstado | undefined) ?? null;
  cache.set(db, v);
  return v;
}

async function savePareja(st: ParejaEstado | null, db: FinanzasDB = getDb()) {
  if (st) await db.meta.put({ key: KEY, value: st });
  else await db.meta.delete(KEY);
  cache.set(db, st);
  if (db === getDb()) listeners.forEach((l) => l(st));
}

export function onPareja(l: (s: ParejaEstado | null) => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

function random(bytes: number): string {
  const b = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Crea el modo pareja en este dispositivo (quien lo crea es "a"). servidores: la PC, si ya está conectada. */
export async function crearPareja(p: { yo: string; otro: string; servidores?: string[] }, db: FinanzasDB = getDb()): Promise<ParejaEstado> {
  const st: ParejaEstado = {
    cfg: { servidores: (p.servidores ?? []).map(normalizeServerUrl), space: `pareja-${random(12).replace(/[^A-Za-z0-9]/g, '')}`, token: random(24), passphrase: random(18) },
    yo: 'a',
    doc: nuevoDoc({ a: p.yo.trim() || 'Yo', b: p.otro.trim() || 'Pareja' }, nowIso()),
    vistos: [],
  };
  await savePareja(st, db);
  await addAudit(db, 'crear', 'pareja', undefined, `Modo pareja con ${st.doc.nombres.b}`, await getDeviceId(db));
  return st;
}

/** Se une con el código que mandó el otro. Después elige quién es. */
export async function unirPareja(cfg: ParejaCfg, db: FinanzasDB = getDb()): Promise<ParejaEstado> {
  const st: ParejaEstado = { cfg: { ...cfg, servidores: cfg.servidores.map(normalizeServerUrl) }, doc: { ...nuevoDoc({ a: '', b: '' }, '1970-01-01T00:00:00.000Z'), items: [] }, vistos: [] };
  await savePareja(st, db);
  return st;
}

/** Código para pasarle al otro: con todas las direcciones conocidas. */
export function codigoDe(st: ParejaEstado, host: HostInfo = {}): string {
  const urls = [...new Set([host.publica, ...(st.doc.servidores ?? []).filter((x) => !x.deleted).map((x) => x.url), ...st.cfg.servidores].filter((u): u is string => !!u && u !== host.local))];
  return codigoPareja({ ...st.cfg, servidores: urls });
}

export async function elegirYo(yo: Miembro, db: FinanzasDB = getDb()) {
  const st = await loadPareja(db);
  if (!st) return;
  // Lo que ya estaba no se avisa como nuevo.
  const vistos = [...st.doc.gastos.map((g) => g.id), ...st.doc.pagos.map((p) => p.id)];
  await savePareja({ ...st, yo, vistos }, db);
  await aplicarEspejo(db);
  notify();
}

export async function salirPareja(db: FinanzasDB = getDb()) {
  await savePareja(null, db);
  await detenerHost();
  notify();
}

/** Cambia el documento compartido en este dispositivo y lo lleva a los gastos; se sube en la próxima sincronización. */
export async function cambiarPareja(fn: (doc: ParejaDoc, yo: Miembro) => ParejaDoc, db: FinanzasDB = getDb()) {
  const st = await loadPareja(db);
  if (!st?.yo) throw new Error('El modo pareja no está activado.');
  const doc = fn(structuredClone(st.doc), st.yo);
  const propios = [...doc.gastos.map((g) => g.id), ...doc.pagos.map((p) => p.id)].filter((id) => !st.vistos.includes(id));
  await savePareja({ ...st, doc, vistos: [...st.vistos, ...propios].slice(-3000) }, db);
  await aplicarEspejo(db);
  notify();
  scheduleSync(1500);
}

/** Lleva los gastos compartidos a la lista de gastos de este dispositivo (y trae lo editado o borrado desde Gastos). */
export async function aplicarEspejo(db: FinanzasDB = getDb()): Promise<boolean> {
  const st = await loadPareja(db);
  if (!st?.yo) return false;
  const settings = await getSettings(db);
  const deviceId = await getDeviceId(db);
  const now = nowIso();
  const plan = planEspejo(st.doc, st.yo, await db.expenses.toArray(), { nowIso: now, mes: currentMonth(), deviceId, categories: settings.categories });
  if (!plan.put.length && !plan.gastos.length && !plan.nuevos.length && !plan.categorias.length) return false;
  await db.transaction('rw', [db.expenses, db.settings, db.meta], async () => {
    for (const e of plan.put) await db.expenses.put(e);
    if (plan.categorias.length) await db.settings.put({ ...settings, categories: [...settings.categories, ...plan.categorias], updatedAt: now });
  });
  if (plan.gastos.length || plan.nuevos.length) {
    const cambios = new Map([...plan.nuevos, ...plan.gastos].map((g) => [g.id, g]));
    const doc = { ...st.doc, gastos: [...st.doc.gastos.filter((g) => !cambios.has(g.id)), ...cambios.values()] };
    await savePareja({ ...st, doc, vistos: [...st.vistos, ...plan.nuevos.map((g) => g.id)] }, db);
    scheduleSync(1500);
  }
  return true;
}

export interface Novedad {
  titulo: string;
  texto: string;
  id: string;
}

/** Gastos y pagos nuevos del otro (para avisar). */
export function novedades(st: ParejaEstado): Novedad[] {
  if (!st.yo) return [];
  const yo = st.yo;
  const el = st.doc.nombres[otro(yo)] || 'Tu pareja';
  const out: Novedad[] = [];
  for (const g of st.doc.gastos) {
    if (g.deleted || g.autor === yo || st.vistos.includes(g.id)) continue;
    const mia = partes(g)[yo];
    out.push({
      id: g.id,
      titulo: `${el} anotó ${g.concepto} ${formatARS(g.total).replace(/,00$/, '')}`,
      texto: g.paga === yo ? `Lo pagaste vos: ${el} te debe ${formatARS(g.total - mia).replace(/,00$/, '')}.` : `Compartido: tu parte es ${formatARS(mia).replace(/,00$/, '')}. Ya se sumó a tus gastos.`,
    });
  }
  for (const p of st.doc.pagos) {
    if (p.deleted || p.de === yo || st.vistos.includes(p.id)) continue;
    out.push({ id: p.id, titulo: `${el} marcó: te pasó ${formatARS(p.monto).replace(/,00$/, '')}`, texto: 'Se sumó a tu plata hasta cobrar y el saldo entre ustedes se actualizó.' });
  }
  return out;
}

async function decode(blob: string, pass: string): Promise<ParejaDoc> {
  const env = JSON.parse(blob) as EncryptedEnvelope & { format?: string };
  if (env.format !== 'brote-pareja') throw new Error('El espacio de pareja tiene datos de otro tipo.');
  const doc = JSON.parse(await decryptString(env, pass)) as ParejaDoc;
  if (doc?.v !== 1 || !Array.isArray(doc.gastos) || !Array.isArray(doc.items) || !Array.isArray(doc.pagos)) throw new Error('Datos de pareja dañados.');
  return doc;
}

async function encode(doc: ParejaDoc, pass: string): Promise<string> {
  return JSON.stringify({ format: 'brote-pareja', encrypted: true, ...(await encryptString(JSON.stringify(doc), pass, ITER)) });
}

function conTiempo(f: FetchLike, ms: number): FetchLike {
  return async (input, init) => {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), ms);
    try {
      return await f(input, { ...init, signal: ctl.signal });
    } catch (e) {
      throw e instanceof TypeError ? e : new TypeError('sin respuesta');
    } finally {
      clearTimeout(t);
    }
  };
}

/** Sincroniza con una dirección: baja, une y sube si hace falta. Devuelve el documento unido. */
async function syncCon(url: string, st: ParejaEstado, f: FetchLike): Promise<{ doc: ParejaDoc; ver: { v: number; h?: string } }> {
  const ep = `${normalizeServerUrl(url)}/api/spaces/${st.cfg.space}`;
  const headers = { Authorization: `Bearer ${st.cfg.token}`, 'Content-Type': 'application/json' };
  let known = st.versiones?.[url];
  let doc = st.doc;
  for (let intento = 0; intento < 4; intento++) {
    const get = await f(known ? `${ep}?known=${known.v}` : ep, { headers });
    let version = 0;
    let remota: string | undefined;
    if (get.status === 204 && known) {
      version = known.v;
      remota = known.h;
    } else if (get.status === 200) {
      const body = (await get.json()) as { version: number; blob: string };
      version = body.version;
      const r = await decode(body.blob, st.cfg.passphrase);
      remota = huellaDoc(r);
      doc = unirDocs(doc, r);
    } else if (get.status === 401 || get.status === 403) {
      throw new Error('Un dispositivo rechazó el código de pareja. Volvé a pegar el código que te mandaron.');
    } else if (get.status !== 404) {
      throw new Error(`Error al sincronizar (${get.status}).`);
    }
    const local = huellaDoc(doc);
    if (local === remota) return { doc, ver: { v: version, h: remota } };
    const put = await f(ep, { method: 'PUT', headers: { ...headers, 'If-Match': String(version) }, body: JSON.stringify({ blob: await encode(doc, st.cfg.passphrase) }) });
    if (put.status === 409) {
      known = undefined;
      continue;
    }
    if (!put.ok) throw new Error(`No se pudo sincronizar (${put.status}).`);
    return { doc, ver: { v: ((await put.json()) as { version: number }).version, h: local } };
  }
  throw new Error('Conflicto de sincronización. Probá de nuevo.');
}

export interface ResultadoSync {
  novedades: Novedad[];
  /** Direcciones de otros dispositivos con las que se pudo sincronizar. */
  conectados: string[];
  /** Direcciones que no respondieron (para buscarlas de nuevo en el Wi-Fi). */
  sinRespuesta: string[];
}

/**
 * Sincroniza con este mismo dispositivo (lo que le dejó el otro mientras la app estaba cerrada)
 * y con cada dispositivo conocido que responda en el Wi-Fi. Devuelve las novedades del otro.
 */
export async function syncPareja(f: FetchLike = fetch, db: FinanzasDB = getDb(), host: HostInfo = {}): Promise<ResultadoSync> {
  let st = await loadPareja(db);
  const res: ResultadoSync = { novedades: [], conectados: [], sinRespuesta: [] };
  if (!st) return res;
  const inicio = st.doc;
  const deviceId = await getDeviceId(db);
  // Este dispositivo publica dónde se lo encuentra.
  const mio = st.doc.servidores?.find((x) => x.id === deviceId);
  if (host.publica && (mio?.url !== host.publica || mio.deleted)) {
    st = { ...st, doc: { ...st.doc, servidores: [...(st.doc.servidores ?? []).filter((x) => x.id !== deviceId), { id: deviceId, url: host.publica, updatedAt: nowIso() }] } };
  }
  const versiones = { ...(st.versiones ?? {}) };
  let errMsg: string | undefined;
  const una = async (url: string, timeout: number) => {
    try {
      const r = await syncCon(url, st!, conTiempo(f, timeout));
      st = { ...st!, doc: r.doc };
      versiones[url] = r.ver;
      return true;
    } catch (e) {
      if (!(e instanceof TypeError)) errMsg = (e as Error).message;
      return false;
    }
  };
  if (host.local) await una(host.local, 8000);
  // Las direcciones de los otros se conocen recién después de leer lo que dejaron acá.
  const otros = [...st.cfg.servidores, ...(st.doc.servidores ?? []).filter((x) => !x.deleted && x.id !== deviceId).map((x) => x.url)].map(normalizeServerUrl);
  const remotos = [...new Set(otros)].filter((u) => u !== host.publica && u !== host.local);
  for (const url of remotos) {
    if (await una(url, 6000)) res.conectados.push(url);
    else res.sinRespuesta.push(url);
  }
  // Lo traído de los otros también queda en este dispositivo (para pasárselo al que venga después).
  if (host.local && res.conectados.length) await una(host.local, 8000);

  res.novedades = novedades(st);
  st = {
    ...st,
    versiones,
    vistos: [...st.vistos, ...res.novedades.map((n) => n.id)].slice(-3000),
    ...(res.conectados.length ? { ultima: nowIso() } : {}),
    error: errMsg,
  };
  // Si se anotó algo mientras se sincronizaba, se conserva (y se manda en la próxima).
  const actual = await loadPareja(db);
  if (!actual) return res;
  const cambio = actual.doc !== inicio;
  st = { ...st, yo: actual.yo, doc: cambio ? unirDocs(st.doc, actual.doc) : st.doc };
  await savePareja(st, db);
  if (cambio) scheduleSync(1500);
  await aplicarEspejo(db);
  notify();
  return res;
}

// ----- Sincronización automática -----

let running = false;
let started = false;
let timer: ReturnType<typeof setTimeout> | null = null;
let lastSearch = 0;
const novListeners = new Set<(n: Novedad[]) => void>();

/** Avisos cuando el otro anota un gasto compartido o marca un pago. */
export function onNovedades(l: (n: Novedad[]) => void): () => void {
  novListeners.add(l);
  return () => novListeners.delete(l);
}

export async function runParejaSync(): Promise<ResultadoSync | null> {
  if (running) return null;
  const st = await loadPareja();
  if (!st) return null;
  running = true;
  try {
    const host = await iniciarHost(st.cfg.token, st.cfg.space);
    const r = await syncPareja(fetch, getDb(), host);
    // Un celular o la PC cambió de dirección en el Wi-Fi: se busca de nuevo (cada tanto, porque tarda).
    if (!r.conectados.length && r.sinRespuesta.length && Date.now() - lastSearch > 5 * 60_000) {
      lastSearch = Date.now();
      for (const viejo of r.sinRespuesta) {
        const nuevo = await findServer({ serverUrl: viejo, token: st.cfg.token });
        if (!nuevo) continue;
        const cur = await loadPareja();
        if (cur) await savePareja({ ...cur, cfg: { ...cur.cfg, servidores: [...new Set([nuevo, ...cur.cfg.servidores.filter((u) => u !== viejo)])] } });
        const r2 = await syncPareja(fetch, getDb(), host);
        r.novedades.push(...r2.novedades);
        r.conectados.push(...r2.conectados);
        break;
      }
    }
    if (r.novedades.length) novListeners.forEach((l) => l(r.novedades));
    return r;
  } catch (e) {
    const cur = await loadPareja();
    if (cur) await savePareja({ ...cur, error: (e as Error).message });
    return null;
  } finally {
    running = false;
  }
}

function scheduleSync(ms: number) {
  if (!started) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    runParejaSync();
  }, ms);
}

/** Al abrir, al volver a la app, al recuperar conexión, cada 2 minutos y después de cada cambio. */
export function startParejaSync() {
  if (started) return;
  started = true;
  setTimeout(() => runParejaSync(), 1500);
  setInterval(() => runParejaSync(), 2 * 60_000);
  document.addEventListener('visibilitychange', () => !document.hidden && scheduleSync(500));
  window.addEventListener('online', () => scheduleSync(500));
  // Lo editado o borrado desde Gastos (o lo que llega de la sincronización con la PC) vuelve a la pareja.
  let espejo: ReturnType<typeof setTimeout> | null = null;
  subscribe(() => {
    if (espejo) clearTimeout(espejo);
    espejo = setTimeout(() => {
      aplicarEspejo().then((cambio) => cambio && notify()).catch(() => {});
    }, 1200);
  });
}

