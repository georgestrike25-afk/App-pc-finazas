#!/usr/bin/env node
/**
 * Servidor de sincronización autohospedado, gratuito y sin dependencias.
 *
 * - Guarda, por "espacio", un único bloque CIFRADO por la aplicación (AES-GCM).
 *   El servidor no puede leer los datos financieros.
 * - Control de concurrencia optimista con versión (If-Match) para no perder cambios.
 * - Autenticación por token (variable SYNC_TOKEN).
 * - Opcional: sirve la aplicación compilada (carpeta dist) con SERVE_APP=1.
 * - Opcional: HTTPS con TLS_CERT y TLS_KEY (rutas a archivos PEM).
 *
 * Uso:  SYNC_TOKEN=un-token-largo node sync-server/server.mjs
 */
import http from 'node:http';
import https from 'node:https';
import { promises as fs, readFileSync, existsSync } from 'node:fs';
import { join, dirname, extname, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { timingSafeEqual, createHash } from 'node:crypto';

const here = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 8787);
const HOST = process.env.HOST ?? '0.0.0.0';
const TOKEN = process.env.SYNC_TOKEN ?? '';
const DATA_DIR = resolve(process.env.DATA_DIR ?? join(here, 'data'));
const ALLOWED = (process.env.ALLOWED_ORIGINS ?? '*').split(',').map((s) => s.trim()).filter(Boolean);
const SERVE_APP = process.env.SERVE_APP === '1';
const APP_DIR = resolve(process.env.APP_DIR ?? join(here, '..', 'dist'));
const MAX_BODY = 30 * 1024 * 1024;

if (TOKEN.length < 16) {
  console.error('Defina SYNC_TOKEN con al menos 16 caracteres. Ejemplo: SYNC_TOKEN=$(node -e "console.log(crypto.randomUUID())")');
  process.exit(1);
}

const tokenHash = createHash('sha256').update(TOKEN).digest();
function authorized(req) {
  const h = req.headers.authorization ?? '';
  const m = h.match(/^Bearer (.+)$/);
  if (!m) return false;
  const got = createHash('sha256').update(m[1]).digest();
  return timingSafeEqual(got, tokenHash);
}

function cors(req, res) {
  const origin = req.headers.origin;
  if (origin && (ALLOWED.includes('*') || ALLOWED.includes(origin))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, If-Match');
    res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
    res.setHeader('Access-Control-Max-Age', '600');
  }
}

function send(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(body);
}

function readBody(req) {
  return new Promise((ok, fail) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        fail(Object.assign(new Error('too large'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => ok(Buffer.concat(chunks).toString('utf8')));
    req.on('error', fail);
  });
}

const locks = new Map();
async function withLock(key, fn) {
  const prev = locks.get(key) ?? Promise.resolve();
  let release;
  const next = new Promise((r) => (release = r));
  locks.set(key, prev.then(() => next));
  await prev;
  try {
    return await fn();
  } finally {
    release();
    if (locks.get(key) === next) locks.delete(key);
  }
}

async function readSpace(space) {
  try {
    return JSON.parse(await fs.readFile(join(DATA_DIR, `${space}.json`), 'utf8'));
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    throw e;
  }
}

async function writeSpace(space, obj) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const file = join(DATA_DIR, `${space}.json`);
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(obj), { mode: 0o600 });
  await fs.rename(tmp, file);
}

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.wasm': 'application/wasm', '.gz': 'application/gzip', '.txt': 'text/plain' };

async function serveStatic(req, res) {
  const url = new URL(req.url, 'http://x');
  let p = decodeURIComponent(url.pathname);
  if (p.endsWith('/')) p += 'index.html';
  const full = normalize(join(APP_DIR, p));
  if (!full.startsWith(APP_DIR)) return send(res, 403, { error: 'forbidden' });
  try {
    const data = await fs.readFile(full);
    res.writeHead(200, { 'Content-Type': MIME[extname(full)] ?? 'application/octet-stream', 'X-Content-Type-Options': 'nosniff' });
    res.end(data);
  } catch {
    try {
      const data = await fs.readFile(join(APP_DIR, 'index.html'));
      res.writeHead(200, { 'Content-Type': MIME['.html'] });
      res.end(data);
    } catch {
      send(res, 404, { error: 'not found' });
    }
  }
}

async function handler(req, res) {
  cors(req, res);
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }
  const url = new URL(req.url, 'http://x');
  if (!url.pathname.startsWith('/api/')) {
    if (SERVE_APP && req.method === 'GET') return serveStatic(req, res);
    return send(res, 404, { error: 'not found' });
  }
  if (!authorized(req)) return send(res, 401, { error: 'unauthorized' });
  if (url.pathname === '/api/health') return send(res, 200, { ok: true });
  const m = url.pathname.match(/^\/api\/spaces\/([A-Za-z0-9_-]{3,64})$/);
  if (!m) return send(res, 404, { error: 'not found' });
  const space = m[1];
  if (req.method === 'GET') {
    const s = await readSpace(space);
    if (!s) return send(res, 404, { error: 'empty' });
    // El cliente indica la última versión que conoce: si no cambió, no se reenvían los datos.
    if (url.searchParams.get('known') === String(s.version)) {
      res.writeHead(204, { 'Cache-Control': 'no-store' });
      return res.end();
    }
    return send(res, 200, { version: s.version, blob: s.blob, updatedAt: s.updatedAt });
  }
  if (req.method === 'PUT') {
    let body;
    try {
      body = JSON.parse(await readBody(req));
    } catch (e) {
      return send(res, e.status ?? 400, { error: 'invalid body' });
    }
    if (typeof body?.blob !== 'string') return send(res, 400, { error: 'blob required' });
    // Solo se aceptan bloques cifrados: protege contra subir datos legibles por error.
    try {
      const env = JSON.parse(body.blob);
      if (env.encrypted !== true || typeof env.payload !== 'string') return send(res, 400, { error: 'blob must be encrypted' });
    } catch {
      return send(res, 400, { error: 'blob must be encrypted' });
    }
    const ifMatch = Number(req.headers['if-match'] ?? '-1');
    return withLock(space, async () => {
      const cur = await readSpace(space);
      const curVersion = cur?.version ?? 0;
      if (ifMatch !== curVersion) return send(res, 409, { error: 'conflict', version: curVersion });
      const next = { version: curVersion + 1, blob: body.blob, updatedAt: new Date().toISOString() };
      await writeSpace(space, next);
      return send(res, 200, { version: next.version });
    });
  }
  return send(res, 405, { error: 'method not allowed' });
}

const safe = (req, res) => handler(req, res).catch((e) => {
  console.error('[sync] error interno:', e?.code ?? e?.message ?? 'desconocido');
  if (!res.headersSent) send(res, 500, { error: 'internal' });
});

const tls = process.env.TLS_CERT && process.env.TLS_KEY && existsSync(process.env.TLS_CERT)
  ? { cert: readFileSync(process.env.TLS_CERT), key: readFileSync(process.env.TLS_KEY) }
  : null;
const server = tls ? https.createServer(tls, safe) : http.createServer(safe);
server.listen(PORT, HOST, () => {
  console.log(`[sync] Servidor de sincronización en ${tls ? 'https' : 'http'}://${HOST}:${PORT}  (datos: ${DATA_DIR})`);
  if (SERVE_APP) console.log(`[sync] Sirviendo la aplicación desde ${APP_DIR}`);
});
export default server;
