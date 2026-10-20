import { useCallback, useEffect, useRef, useState } from 'react';
import { AppProvider, useAppMaybe } from './store';
import { ConfirmHost } from './components/ui';
import { getLock, verifyPin } from './lock';
import { ResumenPage } from './pages/Resumen';
import { IngresosPage } from './pages/Ingresos';
import { GastosPage } from './pages/Gastos';
import { CompartidosPage } from './pages/Compartidos';
import { DeudasPage } from './pages/Deudas';
import { CuotasPage } from './pages/Cuotas';
import { EntidadesPage } from './pages/Entidades';
import { PresupuestoPage } from './pages/Presupuesto';
import { ImportarPage } from './pages/Importar';
import { ViajePage } from './pages/Viaje';
import { HistorialPage } from './pages/Historial';
import { ConfiguracionPage } from './pages/Configuracion';
import { CopiasPage } from './pages/Copias';
import { usePwa } from './pwa';
import { getSyncStatus, onSyncStatus, type SyncStatus } from '../sync/autoSync';

function SyncBadge() {
  const [s, setS] = useState<SyncStatus>(getSyncStatus());
  useEffect(() => onSyncStatus(setS), []);
  if (s.state === 'inactivo') return null;
  const label = s.state === 'ok' ? `⟳ ${new Date(s.at!).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}` : s.state === 'error' ? '⟳ Sin sincronizar' : '⟳ …';
  return <a href="#/copias" className={`badge ${s.state === 'error' ? 'badge-warn' : 'badge-ok'}`} title={s.message}>{label}</a>;
}

export const ROUTES = [
  { path: 'resumen', label: 'Resumen', icon: '◎', el: ResumenPage, main: true },
  { path: 'ingresos', label: 'Ingresos', icon: '↓', el: IngresosPage, main: true },
  { path: 'gastos', label: 'Gastos', icon: '↑', el: GastosPage, main: true },
  { path: 'deudas', label: 'Tarjetas y deudas', icon: '▤', el: DeudasPage, main: true },
  { path: 'entidades', label: 'Deuda por entidad', icon: '◫', el: EntidadesPage },
  { path: 'importar', label: 'Importar documentos', icon: '⇪', el: ImportarPage },
  { path: 'cuotas', label: 'Cuotas futuras', icon: '⋯', el: CuotasPage },
  { path: 'compartidos', label: 'Gastos compartidos', icon: '⚭', el: CompartidosPage },
  { path: 'presupuesto', label: 'Presupuesto mensual', icon: '◔', el: PresupuestoPage },
  { path: 'viaje', label: 'Objetivo de viaje', icon: '✈', el: ViajePage, main: true },
  { path: 'historial', label: 'Historial', icon: '☰', el: HistorialPage },
  { path: 'configuracion', label: 'Configuración', icon: '⚙', el: ConfiguracionPage },
  { path: 'copias', label: 'Copias y sincronización', icon: '⟳', el: CopiasPage },
] as const;

function useHashRoute(): string {
  const get = () => (window.location.hash.replace(/^#\/?/, '').split('?')[0] || 'resumen');
  const [r, setR] = useState(get);
  useEffect(() => {
    const h = () => {
      setR(get());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', h);
    return () => window.removeEventListener('hashchange', h);
  }, []);
  return r;
}

function Toasts({ items }: { items: Array<{ id: number; msg: string; kind: string }> }) {
  return (
    <div className="toasts" role="status" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={`toast toast-${t.kind}`}>{t.msg}</div>
      ))}
    </div>
  );
}

function LockScreen({ onUnlock }: { onUnlock: () => void }) {
  const [pin, setPin] = useState('');
  const [err, setErr] = useState('');
  return (
    <div className="lock">
      <form
        className="card lock-card"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await verifyPin(pin)) onUnlock();
          else {
            setErr('PIN incorrecto');
            setPin('');
          }
        }}
      >
        <h1>Finanzas Personales</h1>
        <p className="muted">La aplicación está bloqueada.</p>
        <label htmlFor="pin">PIN</label>
        <input id="pin" type="password" inputMode="numeric" autoComplete="off" autoFocus value={pin} onChange={(e) => setPin(e.target.value)} />
        {err && <p className="err">{err}</p>}
        <button className="btn primary" type="submit">Desbloquear</button>
      </form>
    </div>
  );
}

function Shell() {
  const route = useHashRoute();
  const ctx = useAppMaybe();
  const pwa = usePwa();
  const [menu, setMenu] = useState(false);
  const current = ROUTES.find((r) => r.path === route) ?? ROUTES[0];
  const Page = current.el;
  useEffect(() => {
    document.title = `${current.label} · Finanzas Personales`;
    setMenu(false);
  }, [current]);
  return (
    <div className="shell">
      <aside className={`side ${menu ? 'open' : ''}`} aria-label="Navegación">
        <div className="brand">
          <span className="logo" aria-hidden>$</span>
          <span>Finanzas<br /><small>Personales</small></span>
        </div>
        <nav>
          {ROUTES.map((r) => (
            <a key={r.path} href={`#/${r.path}`} className={r.path === current.path ? 'active' : ''} aria-current={r.path === current.path ? 'page' : undefined}>
              <span className="ico" aria-hidden>{r.icon}</span> {r.label}
            </a>
          ))}
        </nav>
        <div className="side-foot">
          <span className={`net ${pwa.online ? 'on' : 'off'}`}>{pwa.online ? 'En línea' : 'Sin conexión'}</span>
          <small className="muted">Datos guardados solo en este dispositivo</small>
        </div>
      </aside>
      {menu && <div className="side-back" onClick={() => setMenu(false)} />}
      <div className="main">
        <header className="topbar">
          <button className="btn ghost icon only-mobile" onClick={() => setMenu(true)} aria-label="Abrir menú">☰</button>
          <h1>{current.label}</h1>
          <div className="topbar-r">
            <SyncBadge />
            {!pwa.online && <span className="badge badge-warn">Sin conexión</span>}
            {pwa.canInstall && (
              <button className="btn small" onClick={pwa.install}>Instalar app</button>
            )}
          </div>
        </header>
        {pwa.needRefresh && (
          <div className="banner">
            Hay una nueva versión disponible.
            <button className="btn small primary" onClick={pwa.update}>Actualizar</button>
            <button className="btn small ghost" onClick={pwa.dismiss}>Más tarde</button>
          </div>
        )}
        {pwa.offlineReady && <div className="banner ok">La aplicación quedó lista para usarse sin conexión.<button className="btn small ghost" onClick={pwa.dismiss}>Cerrar</button></div>}
        <main className="content" id="contenido">{ctx?.data ? <Page /> : <p className="muted">Cargando datos locales…</p>}</main>
        <nav className="bottom only-mobile" aria-label="Navegación principal">
          {ROUTES.filter((r) => 'main' in r && r.main).map((r) => (
            <a key={r.path} href={`#/${r.path}`} className={r.path === current.path ? 'active' : ''}>
              <span aria-hidden>{r.icon}</span>
              <small>{r.label.split(' ')[0]}</small>
            </a>
          ))}
          <button onClick={() => setMenu(true)}>
            <span aria-hidden>☰</span>
            <small>Más</small>
          </button>
        </nav>
      </div>
    </div>
  );
}

export function App() {
  const [toasts, setToasts] = useState<Array<{ id: number; msg: string; kind: string }>>([]);
  const [locked, setLocked] = useState<boolean | null>(null);
  const hiddenAt = useRef<number | null>(null);
  const toast = useCallback((msg: string, kind: 'ok' | 'error' = 'ok') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, msg, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 7000 : 3500);
  }, []);
  useEffect(() => {
    getLock().then((l) => setLocked(!!l));
    const onVis = async () => {
      const l = await getLock();
      if (!l) return;
      if (document.hidden) hiddenAt.current = Date.now();
      else if (hiddenAt.current && Date.now() - hiddenAt.current > l.timeoutMin * 60000) setLocked(true);
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);
  if (locked === null) return null;
  if (locked) return <LockScreen onUnlock={() => setLocked(false)} />;
  return (
    <AppProvider toast={toast}>
      <Shell />
      <ConfirmHost />
      <Toasts items={toasts} />
    </AppProvider>
  );
}
