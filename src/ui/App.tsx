import { ArrowDownToLine, CalendarClock, CircleHelp, CreditCard, History, Landmark, ListChecks, Menu, PiggyBank, Plane, Receipt, RefreshCw, Settings, Upload, Users, Wallet, type LucideIcon } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppProvider, useAppMaybe } from './store';
import { ConfirmHost, Help } from './components/ui';
import { Tour } from './components/Tour';
import { getLock, verifyPin } from './lock';
import { ResumenPage } from './pages/Resumen';
import { EsteMesPage } from './pages/EsteMes';
import { AyudaPage } from './pages/Ayuda';
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

type Nav = 'main' | 'more' | 'hidden';
interface RouteDef {
  path: string;
  label: string;
  short?: string;
  icon: LucideIcon;
  el: () => JSX.Element;
  nav: Nav;
  /** Sección principal a la que pertenece (para marcarla activa y mostrar pestañas). */
  group?: 'deudas' | 'plata';
  /** Qué es esta pantalla, para la burbuja de ayuda del título. */
  help: string;
}

export const ROUTES: RouteDef[] = [
  { path: 'inicio', label: 'Este mes', icon: Wallet, el: EsteMesPage, nav: 'main', help: 'Lo principal del mes: cuánto te queda, lo que entró, lo que gastaste, las cuotas y la lista de lo que falta hacer. Con las flechas de arriba podés ver otros meses.' },
  { path: 'importar', label: 'Subir documento', short: 'Subir', icon: Upload, el: ImportarPage, nav: 'main', help: 'Subí un PDF o una captura (resumen de tarjeta, cronograma de préstamo, movimientos del banco, plan de Mercado Pago). La app lo lee, te muestra lo que va a cargar y vos confirmás. Si subís algo dos veces, no se duplica.' },
  { path: 'entidades', label: 'Deuda por entidad', short: 'Deudas', icon: Landmark, el: EntidadesPage, nav: 'main', group: 'deudas', help: 'Cuánto le debés en total a cada banco o billetera, sumando préstamos, cuotas, planes de pago, resúmenes sin pagar y los consumos que vienen en el próximo resumen, y en qué mes terminás de pagar.' },
  { path: 'gastos', label: 'Gastos', icon: Receipt, el: GastosPage, nav: 'main', group: 'plata', help: 'Todos los gastos del mes. Lo de la tarjeta llega solo con el resumen; acá anotás lo que pagás en efectivo o transferencia.' },
  { path: 'viaje', label: 'Objetivo de viaje', short: 'Viaje', icon: Plane, el: ViajePage, nav: 'main', help: 'Tu objetivo de ahorro para el viaje: cuánto cuesta, cuánto llevás ahorrado y si llegás a la fecha.' },
  { path: 'ayuda', label: 'Cómo usar', icon: CircleHelp, el: AyudaPage, nav: 'more', help: 'Explicación corta de cómo usar la app y la guía paso a paso.' },
  { path: 'configuracion', label: 'Configuración', icon: Settings, el: ConfiguracionPage, nav: 'more', help: 'Nombre de tu pareja, cómo se reparten los gastos, el presupuesto diario, el PIN de bloqueo y otras opciones.' },
  { path: 'copias', label: 'Copias y sincronización', icon: RefreshCw, el: CopiasPage, nav: 'more', help: 'Guardá una copia de tus datos en un archivo (hacé una por mes) o conectá el celular con la PC para que tengan los mismos datos.' },
  { path: 'historial', label: 'Historial', icon: History, el: HistorialPage, nav: 'more', help: 'Todo lo que se cargó o se cambió, con fecha, y los documentos que subiste.' },
  // Pantallas a las que se llega desde las pestañas o desde "Este mes".
  { path: 'cuotas', label: 'Cuotas futuras', icon: CalendarClock, el: CuotasPage, nav: 'hidden', group: 'deudas', help: 'Cuánto vas a pagar de cuotas cada mes que viene, y si quedó alguna cuota vencida sin pagar.' },
  { path: 'deudas', label: 'Tarjetas y deudas', icon: CreditCard, el: DeudasPage, nav: 'hidden', group: 'deudas', help: 'Cada préstamo, compra en cuotas o plan, y los resúmenes de tarjeta. Tocá "Ver cuotas" para ver en qué cuota vas o corregir una cuota marcada por error.' },
  { path: 'ingresos', label: 'Ingresos', icon: ArrowDownToLine, el: IngresosPage, nav: 'hidden', group: 'plata', help: 'Tu sueldo y otros ingresos de cada mes. Si subís la captura de los movimientos del banco, el sueldo se carga solo.' },
  { path: 'compartidos', label: 'Gastos compartidos', icon: Users, el: CompartidosPage, nav: 'hidden', group: 'plata', help: 'Gastos que dividís con tu pareja (alquiler, luz, súper…). Solo se cuenta tu parte. También el cargo de Sancor Salud y lo que te devuelve.' },
  { path: 'presupuesto', label: 'Presupuesto mensual', icon: PiggyBank, el: PresupuestoPage, nav: 'hidden', group: 'plata', help: 'Cuánto querés gastar como máximo en el día a día (comida, transporte, salidas) y cuánto llevás.' },
  { path: 'resumen', label: 'Detalle del mes', icon: ListChecks, el: ResumenPage, nav: 'hidden', help: 'La cuenta completa del mes, línea por línea: de dónde sale el número de "Te quedan".' },
];

const TABS: Record<NonNullable<RouteDef['group']>, Array<[string, string]>> = {
  deudas: [['entidades', 'Por entidad'], ['cuotas', 'Cuotas por mes'], ['deudas', 'Préstamos y tarjetas']],
  plata: [['gastos', 'Gastos'], ['ingresos', 'Ingresos'], ['compartidos', 'Compartidos'], ['presupuesto', 'Presupuesto']],
};
const GROUP_HOME = { deudas: 'entidades', plata: 'gastos' } as const;

const tourId = (p: string) => `nav-${p === 'entidades' ? 'deudas' : p}`;

function useHashRoute(): string {
  const get = () => (window.location.hash.replace(/^#\/?/, '').split('?')[0] || 'inicio');
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
  // El aviso de "lista para usarse sin conexión" se va solo: es informativo y aparece una sola vez.
  useEffect(() => {
    if (!pwa.offlineReady) return;
    const t = setTimeout(pwa.dismiss, 6000);
    return () => clearTimeout(t);
  }, [pwa.offlineReady, pwa.dismiss]);
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
          {ROUTES.filter((r) => r.nav === 'main').map((r) => {
            const active = r.path === current.path || (!!r.group && r.group === current.group);
            return (
              <a key={r.path} href={`#/${r.path}`} className={active ? 'active' : ''} aria-current={active ? 'page' : undefined} data-tour={tourId(r.path)}>
                <r.icon className="ico" aria-hidden size={18} strokeWidth={1.8} /> {r.short ?? r.label}
              </a>
            );
          })}
          <div className="side-more" data-tour="nav-mas">
            <div className="side-sep">Más</div>
            {ROUTES.filter((r) => r.nav === 'more').map((r) => (
              <a key={r.path} href={`#/${r.path}`} className={r.path === current.path ? 'active' : ''} aria-current={r.path === current.path ? 'page' : undefined}>
                <r.icon className="ico" aria-hidden size={18} strokeWidth={1.8} /> {r.label}
              </a>
            ))}
          </div>
        </nav>
        <div className="side-foot">
          <span className={`net ${pwa.online ? 'on' : 'off'}`}>{pwa.online ? 'En línea' : 'Sin conexión'}</span>
          <small className="muted">Datos guardados solo en este dispositivo</small>
        </div>
      </aside>
      {menu && <div className="side-back" onClick={() => setMenu(false)} />}
      <div className="main">
        <header className="topbar">
          <button className="btn ghost icon only-mobile" onClick={() => setMenu(true)} aria-label="Abrir menú"><Menu size={22} strokeWidth={1.8} /></button>
          <div className="topbar-t" data-tour="ayuda-pagina">
            <h1>{current.label}</h1>
            <Help label={`Qué es la pantalla ${current.label}`}>{current.help}</Help>
          </div>
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
        <main className="content" id="contenido">
          {current.group && (
            <nav className="tabs" aria-label="Secciones">
              {TABS[current.group].map(([p, l]) => (
                <a key={p} href={`#/${p}`} className={p === current.path ? 'active' : ''} aria-current={p === current.path ? 'page' : undefined}>{l}</a>
              ))}
            </nav>
          )}
          {ctx?.data ? <Page /> : <p className="muted">Cargando datos locales…</p>}
        </main>
        <nav className="bottom only-mobile" aria-label="Navegación principal">
          {ROUTES.filter((r) => r.nav === 'main').map((r) => {
            const active = r.path === current.path || (!!r.group && r.group === current.group);
            return (
              <a key={r.path} href={`#/${r.group ? GROUP_HOME[r.group] : r.path}`} className={active ? 'active' : ''} data-tour={tourId(r.path)}>
                <span aria-hidden><r.icon size={20} strokeWidth={1.8} /></span>
                <small>{r.short ?? r.label}</small>
              </a>
            );
          })}
          <button onClick={() => setMenu(true)} data-tour="nav-mas">
            <span aria-hidden><Menu size={20} strokeWidth={1.8} /></span>
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
      <Tour />
      <Toasts items={toasts} />
    </AppProvider>
  );
}
