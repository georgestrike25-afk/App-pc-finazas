/**
 * App de escritorio para Windows (Electron).
 *
 * - Abre la misma aplicación que el celular, servida desde esta PC.
 * - Trae adentro el servidor de sincronización: el celular se conecta a esta PC
 *   por el Wi-Fi de la casa con el código de emparejamiento (FP1-…).
 * - Los datos quedan en esta PC (carpeta de datos del usuario). Nada sale a internet.
 */
import { app, BrowserWindow, ipcMain, Menu, shell, clipboard, dialog } from 'electron';
import { randomBytes } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startSyncServer } from './server.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const SMOKE = process.argv.includes('--smoke-test');
// En Windows la app no tiene consola: el resultado de la prueba se escribe en un archivo.
const SMOKE_OUT = process.argv.find((a) => a.startsWith('--smoke-out='))?.slice('--smoke-out='.length);
const PORTS = [8787, 8788, 8789, 8790, 8791];

// La app se llamaba "Finanzas Personales": se sigue usando esa carpeta de datos para no perder
// lo guardado (base local, emparejamiento y sincronización) al pasar a llamarse "Brote".
app.setPath('userData', join(app.getPath('appData'), 'Finanzas Personales'));

if (!SMOKE && !app.requestSingleInstanceLock()) app.quit();

let win = null;
let pairing = null;

/** Configuración propia de esta PC: token y espacio (se crean la primera vez). */
async function loadConfig() {
  const file = join(app.getPath('userData'), 'escritorio.json');
  try {
    const c = JSON.parse(await fs.readFile(file, 'utf8'));
    if (typeof c.token === 'string' && c.token.length >= 32 && typeof c.space === 'string') return { file, ...c };
  } catch {
    /* primera vez */
  }
  const c = { token: randomBytes(24).toString('base64url'), space: 'hogar', port: null };
  await fs.mkdir(dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(c, null, 2), { mode: 0o600 });
  return { file, ...c };
}

/** Direcciones de esta PC en la red de la casa (192.168…, 10…, 172.16-31…). */
function lanAddresses() {
  const out = [];
  for (const [name, list] of Object.entries(networkInterfaces())) {
    for (const a of list ?? []) {
      if (a.family !== 'IPv4' || a.internal) continue;
      if (/^169\.254\./.test(a.address)) continue;
      const priv = /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(a.address);
      // Se evitan adaptadores virtuales (VirtualBox, VMware, WSL, Hyper-V) si hay otro.
      const virtual = /virtual|vmware|vbox|wsl|hyper-v|vethernet|docker|loopback/i.test(name);
      out.push({ address: a.address, score: (priv ? 2 : 0) + (virtual ? 0 : 1) + (/^192\.168\./.test(a.address) ? 1 : 0) });
    }
  }
  return out.sort((a, b) => b.score - a.score).map((a) => a.address);
}

function pairingCode(serverUrl, space, token) {
  return `FP1-${Buffer.from(JSON.stringify({ u: serverUrl, s: space, t: token })).toString('base64url')}`;
}

async function startServer(cfg) {
  const appDir = join(here, 'dist');
  const dataDir = join(app.getPath('userData'), 'sincronizacion');
  // Siempre el mismo puerto: la app guarda sus datos según la dirección desde la que se abre.
  const order = cfg.port ? [cfg.port] : PORTS;
  let lastErr;
  for (const port of order) {
    try {
      const r = await startSyncServer({ token: cfg.token, port, host: '0.0.0.0', dataDir, appDir, serveApp: true });
      if (cfg.port !== r.port) await fs.writeFile(cfg.file, JSON.stringify({ token: cfg.token, space: cfg.space, port: r.port }, null, 2), { mode: 0o600 });
      return r.port;
    } catch (e) {
      lastErr = e;
      if (e?.code !== 'EADDRINUSE') break;
    }
  }
  throw lastErr;
}

function buildPairing(cfg, port) {
  const ips = lanAddresses();
  const lanUrl = ips[0] ? `http://${ips[0]}:${port}` : null;
  return {
    localUrl: `http://127.0.0.1:${port}`,
    lanUrl,
    otherUrls: ips.slice(1).map((ip) => `http://${ip}:${port}`),
    space: cfg.space,
    token: cfg.token,
    code: lanUrl ? pairingCode(lanUrl, cfg.space, cfg.token) : null,
    version: app.getVersion(),
  };
}

function createWindow(url) {
  win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 380,
    minHeight: 500,
    title: 'Brote',
    backgroundColor: '#0d1714',
    autoHideMenuBar: true,
    show: !SMOKE,
    webPreferences: { preload: join(here, 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false },
  });
  // Los enlaces externos se abren en el navegador; la app nunca navega fuera de sí misma.
  win.webContents.setWindowOpenHandler(({ url: u }) => {
    if (/^https?:\/\//.test(u)) shell.openExternal(u);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, u) => {
    if (!u.startsWith(url)) {
      e.preventDefault();
      if (/^https?:\/\//.test(u)) shell.openExternal(u);
    }
  });
  win.loadURL(`${url}/`);
  return win;
}

ipcMain.handle('finanzas:pairing', () => pairing);
ipcMain.handle('finanzas:copy', (_e, text) => {
  if (typeof text === 'string' && text.length < 2000) clipboard.writeText(text);
  return true;
});

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  try {
    const cfg = await loadConfig();
    const port = await startServer(cfg);
    pairing = buildPairing(cfg, port);
    const w = createWindow(pairing.localUrl);
    if (SMOKE) {
      // Prueba automática (CI): la app abre, muestra "Este mes" y el código de emparejamiento existe.
      const timer = setTimeout(() => {
        console.error('SMOKE: tiempo agotado');
        app.exit(2);
      }, 60_000);
      w.webContents.once('did-finish-load', async () => {
        try {
          let title = '';
          for (let i = 0; i < 60 && !title; i++) {
            await new Promise((r) => setTimeout(r, 500));
            title = await w.webContents.executeJavaScript(`(document.querySelector('.topbar h1')||{}).textContent||''`);
          }
          const desktop = await w.webContents.executeJavaScript(`typeof window.finanzasDesktop === 'object'`);
          const health = await fetch(`${pairing.localUrl}/api/health`, { headers: { Authorization: `Bearer ${cfg.token}` } }).then((r) => r.status);
          const line = `SMOKE: titulo="${title}" escritorio=${desktop} health=${health} codigo=${pairing.code ? 'si' : 'no'}`;
          console.log(line);
          if (SMOKE_OUT) await fs.writeFile(SMOKE_OUT, line + '\n');
          clearTimeout(timer);
          app.exit(title === 'Este mes' && desktop && health === 200 ? 0 : 1);
        } catch (e) {
          console.error('SMOKE: error', e);
          app.exit(1);
        }
      });
    }
  } catch (e) {
    console.error(e);
    if (!SMOKE) dialog.showErrorBox('Brote', `No se pudo iniciar la aplicación.\n\n${e?.code === 'EADDRINUSE' ? 'Los puertos 8787 a 8791 están ocupados por otro programa.' : e?.message ?? e}`);
    app.exit(1);
  }
});

app.on('second-instance', () => {
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

app.on('window-all-closed', () => app.quit());
