import { ArrowRightLeft, Check, ScanLine, Copy, Flame, HandCoins, HeartPulse, House, Info, Link2, Pencil, PiggyBank, Plus, RefreshCw, Settings2, Shapes, ShieldCheck, Stethoscope, Trash2, Users, Wifi, Zap, type LucideIcon } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useApp } from '../store';
import { desktop, isNative } from '../../platform';
import { iniciarHost, type HostInfo } from '../../sync/parejaHost';
import { loadSyncConfig } from '../../sync/autoSync';
import { cambiarPareja, codigoDe, compartirConPareja, crearPareja, noMandar, sinMandar, elegirYo, loadPareja, onPareja, runParejaSync, salirPareja, unirPareja, type ParejaEstado } from '../../sync/pareja';
import { fijosDelMes, leerCodigoPareja, otro, partes, saldo, type FilaFijo, type Miembro, type ParejaGasto, type ParejaItem, type ParejaPago } from '../../domain/pareja';
import { addMonths, formatDate, monthLabel, monthOf, todayIso, type MonthKey } from '../../domain/dates';
import { formatARS, type Cents } from '../../domain/money';
import { uid } from '../../domain/text';
import { QrCode, QrScanner } from '../components/Qr';
import { Badge, Card, confirmDialog, Empty, Field, Modal, Money, MoneyInput, MonthNav } from '../components/ui';

const ICONOS: Record<string, LucideIcon> = { House, Zap, Flame, Wifi, PiggyBank, HeartPulse, Stethoscope, Shapes };
const Ic = ({ name }: { name: string }) => {
  const I = ICONOS[name] ?? Shapes;
  return <I aria-hidden />;
};
const now = () => new Date().toISOString();
const mesNombre = (m: MonthKey) => monthLabel(m).split(' de ')[0];
const pct = (n: number) => n.toLocaleString('es-AR', { maximumFractionDigits: 1 });

export function usePareja(): ParejaEstado | null | undefined {
  const [st, setSt] = useState<ParejaEstado | null | undefined>(undefined);
  useEffect(() => {
    loadPareja().then(setSt);
    return onPareja(setSt);
  }, []);
  return st;
}

function Av({ name }: { name: string }) {
  return <span className="pj-av" aria-hidden>{(name || '?').trim().charAt(0).toUpperCase()}</span>;
}

// ----- Conectar -----

function Conectar() {
  const { data, toast } = useApp();
  const [yo, setYo] = useState(data.settings.ownNames?.trim().split(/\s+/)[0] ?? '');
  const [el, setEl] = useState(data.settings.partnerName ?? '');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const crear = async () => {
    setBusy(true);
    setMsg('');
    try {
      // Si este celular ya está conectado con tu PC, la PC también guarda los compartidos (opcional).
      const pc = desktop() ? null : await loadSyncConfig();
      await crearPareja({ yo, otro: el, servidores: pc?.serverUrl ? [pc.serverUrl] : [] });
      await runParejaSync();
      toast('Modo pareja activado. Ahora pasale el código a tu pareja.');
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const [scan, setScan] = useState(false);
  const leido = useCallback((t: string) => {
    setScan(false);
    setCode(t);
    void unir(t);
  }, []);
  const unir = async (c = code) => {
    setBusy(true);
    setMsg('');
    try {
      await unirPareja(leerCodigoPareja(c));
      const r = await runParejaSync();
      if (r && !r.conectados.length) setMsg('Todavía no se encontró el otro celular. Fijate que estén en el mismo Wi-Fi y que tenga Brote abierto, y tocá "Probar de nuevo".');
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page pareja">
      <div className="cols cols-main">
        <Card title={<span className="card-t"><Link2 aria-hidden size={18} />Unirme con el código</span>}>
          <p className="small muted" style={{ marginTop: 0 }}>Si tu pareja ya activó el modo pareja, escaneá el QR que le aparece en su Brote (los dos en el mismo Wi-Fi), o pegá el código que te mandó.</p>
          {!!navigator.mediaDevices?.getUserMedia && <button className="btn primary" disabled={busy} onClick={() => setScan(true)}><ScanLine aria-hidden />Escanear QR</button>}
          <Field label="O pegá el código">{(id) => <textarea id={id} rows={3} value={code} onChange={(e) => setCode(e.target.value)} placeholder="BROTE2-…" autoComplete="off" spellCheck={false} />}</Field>
          <button className="btn" disabled={busy || !code.trim()} onClick={() => unir()}><Link2 aria-hidden />Unirme</button>
          {scan && <QrScanner onRead={leido} onClose={() => setScan(false)} />}
        </Card>
        {desktop() && (
          <p className="pj-note" style={{ gridColumn: '1 / -1' }}>
            <Info aria-hidden />
            <span><strong>En la PC:</strong> si ya activaste el modo pareja en tu celular, no lo crees acá. En tu celular: Gastos → Compartidos → "Mandar el código por WhatsApp (o para la PC)", copialo y pegalo en "Unirme con el código". Después elegí "Soy" con tu nombre.</span>
          </p>
        )}
        <Card title={<span className="card-t"><Users aria-hidden size={18} />Crear el modo pareja</span>} help="Lo crea uno de los dos; el otro se une con el código. Los celulares se sincronizan entre ellos cuando están en el mismo Wi-Fi (o con el hotspot de uno). La PC es opcional.">
          <div className="form-grid">
            <Field label="Tu nombre">{(id) => <input id={id} value={yo} onChange={(e) => setYo(e.target.value)} />}</Field>
            <Field label="Nombre de tu pareja">{(id) => <input id={id} value={el} onChange={(e) => setEl(e.target.value)} />}</Field>
          </div>
          <button className="btn primary" disabled={busy || !yo.trim() || !el.trim()} onClick={crear}><Check aria-hidden />Activar modo pareja</button>
        </Card>
      </div>
      {msg && <p className="err" role="alert">{msg}</p>}
      <Card title={<span className="card-t"><ShieldCheck aria-hidden size={18} />Qué se comparte</span>}>
        <ol className="steps">
          <li><span>Solo los gastos que marquen como <strong>compartidos</strong>, la planilla de gastos fijos y los pagos entre ustedes.</span></li>
          <li><span>Tu sueldo, tus gastos personales, tus deudas y tu plata hasta cobrar <strong>no se comparten</strong>.</span></li>
          <li><span>Viaja cifrado de un celular al otro por el Wi-Fi (no pasa por internet): nadie más lo puede leer. Lo que anoten afuera se guarda y se sincroniza cuando vuelvan a estar en el mismo Wi-Fi. Si la PC está prendida, también se guarda ahí.</span></li>
        </ol>
      </Card>
    </div>
  );
}

function ElegirYo({ st }: { st: ParejaEstado }) {
  const [busy, setBusy] = useState(false);
  const n = st.doc.nombres;
  if (!n.a) {
    return (
      <div className="page pareja">
        <Card title="Conectando…">
          {st.error ? <p className="err">{st.error}</p> : <p className="muted">Buscando el celular de tu pareja en este Wi-Fi. Tiene que tener Brote abierto (o la lectura de notificaciones activada).</p>}
          <div className="row-actions" style={{ justifyContent: 'flex-start' }}>
            <button className="btn primary" disabled={busy} onClick={async () => { setBusy(true); await runParejaSync(); setBusy(false); }}><RefreshCw aria-hidden />Probar de nuevo</button>
            <button className="btn ghost" onClick={() => salirPareja()}>Cancelar</button>
          </div>
        </Card>
      </div>
    );
  }
  return (
    <div className="page pareja">
      <Card title="¿Quién sos?">
        <p className="muted small" style={{ marginTop: 0 }}>Así Brote sabe qué parte es tuya.</p>
        <div className="row-actions" style={{ justifyContent: 'flex-start' }}>
          {(['a', 'b'] as Miembro[]).map((m) => (
            <button key={m} className="btn" onClick={() => elegirYo(m)}><Av name={n[m]} />Soy {n[m]}</button>
          ))}
        </div>
      </Card>
    </div>
  );
}

// ----- Hojas -----

function Mitades({ total, paga, pctPaga, yo, nombres }: { total: Cents; paga: Miembro; pctPaga: number; yo: Miembro; nombres: Record<Miembro, string> }) {
  const p = partes({ total, paga, pctPaga });
  return (
    <div className="pj-halves">
      <div><Av name={nombres[yo]} /><span>{paga === yo ? 'Pagás vos' : 'Le ponés a ' + nombres[paga]}<strong><Money value={paga === yo ? total : p[yo]} /></strong></span></div>
      <div><Av name={nombres[otro(yo)]} /><span>{paga === yo ? `${nombres[otro(yo)]} te pone` : `Pagó ${nombres[paga]}`}<strong><Money value={paga === yo ? p[otro(yo)] : total} /></strong></span></div>
    </div>
  );
}

function FijoSheet({ fila, mes, st, onClose }: { fila: FilaFijo; mes: MonthKey; st: ParejaEstado; onClose: () => void }) {
  const { data, toast } = useApp();
  const yo = st.yo!;
  const { item, gasto, anterior } = fila;
  const paga: Miembro = gasto?.paga ?? (item.paga === 'ambos' ? yo : item.paga);
  const [total, setTotal] = useState<Cents | undefined>(gasto?.total);
  const resumen = item.sancor ? data.sancor.find((c) => c.month === mes)?.chargeAmount : undefined;
  const save = async (v = total) => {
    if (!v || v <= 0) return;
    const t = now();
    await cambiarPareja((d) => {
      const g: ParejaGasto = gasto
        ? { ...gasto, total: v, updatedAt: t }
        : { id: `${item.id}-${mes}`, createdAt: t, updatedAt: t, autor: yo, paga, pctPaga: item.pctPaga, concepto: item.nombre, total: v, fecha: mes === monthOf(todayIso()) ? todayIso() : `${mes}-01`, mes, categoria: item.categoria, itemId: item.id };
      return { ...d, gastos: [...d.gastos.filter((x) => x.id !== g.id), g] };
    });
    toast(`${item.nombre} de ${mesNombre(mes)} cargado`);
    onClose();
  };
  const quitar = async () => {
    if (!gasto) return;
    await cambiarPareja((d) => ({ ...d, gastos: d.gastos.map((x) => (x.id === gasto.id ? { ...x, deleted: true, updatedAt: now() } : x)) }));
    onClose();
  };
  const quien = paga === yo ? 'Lo pagás vos' : `Lo paga ${st.doc.nombres[paga]}`;
  return (
    <Modal
      title={`${item.nombre} de ${mesNombre(mes)}`}
      onClose={onClose}
      className="pj-sheet"
      footer={
        <>
          {anterior && !gasto ? <button className="btn" onClick={() => save(anterior)}>Igual que {mesNombre(addMonths(mes, -1))}</button> : gasto ? <button className="btn ghost danger" onClick={quitar}><Trash2 aria-hidden />Quitar</button> : <button className="btn ghost" onClick={onClose}>Cancelar</button>}
          <button className="btn primary" disabled={!total} onClick={() => save()}><Check aria-hidden />Guardar</button>
        </>
      }
    >
      <p className="muted small" style={{ marginTop: 0 }}>{quien}{item.sancor && paga === yo ? ' con la tarjeta' : ''} · {item.pctPaga === 50 ? 'mitad y mitad' : item.pctPaga === 0 ? `es todo de ${paga === yo ? st.doc.nombres[otro(yo)] : 'vos'}` : `${pct(item.pctPaga)} % de quien paga`}</p>
      <Field label="Monto total">{(id) => <MoneyInput id={id} value={total} onChange={setTotal} />}</Field>
      {!!total && <Mitades total={total} paga={paga} pctPaga={item.pctPaga} yo={yo} nombres={st.doc.nombres} />}
      {resumen && resumen !== total && paga === yo && (
        <p className="pj-note"><Info aria-hidden /><span>En el resumen de la tarjeta de {mesNombre(mes)} vino <strong>{formatARS(resumen)}</strong>. <button className="linklike" onClick={() => setTotal(resumen)}>Usar el del resumen</button></span></p>
      )}
      {item.sancor && paga === yo && <p className="pj-note"><Info aria-hidden /><span>Tu parte ya llega con el resumen de la tarjeta: no se cuenta dos veces.</span></p>}
      {anterior && <p className="pj-note"><Info aria-hidden /><span>El mes pasado fue <strong>{formatARS(anterior)}</strong>.</span></p>}
    </Modal>
  );
}

function AnotarSheet({ st, mes, gasto, onClose }: { st: ParejaEstado; mes: MonthKey; gasto?: ParejaGasto; onClose: () => void }) {
  const { data, toast } = useApp();
  const yo = st.yo!;
  const el = st.doc.nombres[otro(yo)];
  const hoy = todayIso();
  const [g, setG] = useState<Pick<ParejaGasto, 'concepto' | 'paga' | 'pctPaga' | 'categoria' | 'fecha'> & { total?: Cents }>(
    gasto ?? { concepto: '', paga: yo, pctPaga: 50, categoria: 'Gasto diario', fecha: monthOf(hoy) === mes ? hoy : `${mes}-01` },
  );
  const [err, setErr] = useState('');
  const cats = useMemo(() => [...new Set(['Gasto diario', 'Supermercado', 'Servicios del hogar', 'Hogar', 'Salidas', ...data.settings.categories])], [data.settings.categories]);
  const save = async () => {
    if (!g.total || g.total <= 0) return setErr('Poné el monto');
    const t = now();
    const full: ParejaGasto = gasto
      ? { ...gasto, ...g, total: g.total, mes: monthOf(g.fecha), updatedAt: t }
      : { id: uid(), createdAt: t, updatedAt: t, autor: yo, ...g, total: g.total, concepto: g.concepto.trim() || 'Compartido', mes: monthOf(g.fecha) };
    await cambiarPareja((d) => ({ ...d, gastos: [...d.gastos.filter((x) => x.id !== full.id), full] }));
    toast(gasto ? 'Gasto compartido corregido' : `Anotado. A ${el} le aparece su parte.`);
    onClose();
  };
  return (
    <Modal title={gasto ? 'Corregir gasto compartido' : `Gasto compartido con ${el}`} onClose={onClose} className="pj-sheet" footer={<><button className="btn ghost" onClick={onClose}>Cancelar</button><button className="btn primary" onClick={save}><Check aria-hidden />Guardar</button></>}>
      <div className="form-grid">
        <Field label="Qué fue">{(id) => <input id={id} value={g.concepto} onChange={(e) => setG({ ...g, concepto: e.target.value })} placeholder="Supermercado" />}</Field>
        <Field label="Monto total" error={err}>{(id) => <MoneyInput id={id} value={g.total} onChange={(total) => setG({ ...g, total })} />}</Field>
        <Field label="Fecha">{(id) => <input id={id} type="date" value={g.fecha} onChange={(e) => setG({ ...g, fecha: e.target.value || g.fecha })} />}</Field>
        <Field label="Categoría">{(id) => <select id={id} value={g.categoria} onChange={(e) => setG({ ...g, categoria: e.target.value })}>{cats.map((c) => <option key={c}>{c}</option>)}</select>}</Field>
      </div>
      <div className="seg" role="radiogroup" aria-label="Quién pagó" style={{ marginTop: 12 }}>
        <button role="radio" aria-checked={g.paga === yo} onClick={() => setG({ ...g, paga: yo })}>Lo pagué yo</button>
        <button role="radio" aria-checked={g.paga !== yo} onClick={() => setG({ ...g, paga: otro(yo) })}>Lo pagó {el}</button>
      </div>
      <Field label="Parte de quien pagó (%)" hint="50 = mitad y mitad">{(id) => <input id={id} type="number" min={0} max={100} step="any" value={g.pctPaga} onChange={(e) => setG({ ...g, pctPaga: Math.min(100, Math.max(0, Number(e.target.value))) })} />}</Field>
      {!!g.total && <Mitades total={g.total} paga={g.paga} pctPaga={g.pctPaga} yo={yo} nombres={st.doc.nombres} />}
    </Modal>
  );
}

function PagoSheet({ st, neto, mes, onClose }: { st: ParejaEstado; neto: Cents; mes: MonthKey; onClose: () => void }) {
  const { toast } = useApp();
  const yo = st.yo!;
  const el = st.doc.nombres[otro(yo)];
  // neto < 0: le debés; > 0: te debe (marcás que te lo pasó).
  const de: Miembro = neto <= 0 ? yo : otro(yo);
  const [monto, setMonto] = useState<Cents | undefined>(Math.abs(neto) || undefined);
  const [medio, setMedio] = useState<ParejaPago['medio']>('transferencia');
  const save = async () => {
    if (!monto || monto <= 0) return;
    const t = now();
    const p: ParejaPago = { id: uid(), createdAt: t, updatedAt: t, de, a: otro(de), monto, fecha: todayIso(), mes, medio };
    await cambiarPareja((d) => ({ ...d, pagos: [...d.pagos, p] }));
    toast(de === yo ? `Listo: le pasaste ${formatARS(monto)} a ${el}` : `Listo: ${el} te pasó ${formatARS(monto)}`);
    onClose();
  };
  return (
    <Modal
      title={de === yo ? `¿Le pasaste la plata a ${el}?` : `¿${el} te pasó la plata?`}
      onClose={onClose}
      className="pj-sheet"
      footer={<><button className="btn ghost" onClick={onClose}>Cancelar</button><button className="btn primary" disabled={!monto} onClick={save}><Check aria-hidden />{de === yo ? 'Sí, ya se lo pasé' : 'Sí, me lo pasó'}</button></>}
    >
      <Field label="Monto">{(id) => <MoneyInput id={id} value={monto} onChange={setMonto} />}</Field>
      <div className="seg" role="radiogroup" aria-label="Cómo" style={{ marginTop: 4 }}>
        <button role="radio" aria-checked={medio === 'transferencia'} onClick={() => setMedio('transferencia')}>Transferencia</button>
        <button role="radio" aria-checked={medio === 'efectivo'} onClick={() => setMedio('efectivo')}>Efectivo</button>
      </div>
      <div className="pj-registra">
        <div><Av name={st.doc.nombres[de]} /><span><strong>{de === yo ? 'En tu app' : `En la app de ${el}`}</strong>{de === yo ? `Sale de tu plata hasta cobrar como "Pago a ${el}". No es un gasto nuevo: tu parte ya estaba en Gastos.` : `Sale de su plata hasta cobrar como "Pago a ${st.doc.nombres[yo]}".`}</span></div>
        <div><Av name={st.doc.nombres[otro(de)]} /><span><strong>{de === yo ? `En la app de ${el}` : 'En tu app'}</strong>{de === yo ? 'Le entra a su plata hasta cobrar y el saldo queda al día.' : 'Entra a tu plata hasta cobrar y el saldo queda al día. No se suma al sueldo, para no contarlo dos veces.'}</span></div>
      </div>
    </Modal>
  );
}

function PlanillaSheet({ st, onClose }: { st: ParejaEstado; onClose: () => void }) {
  const yo = st.yo!;
  const n = st.doc.nombres;
  const [items, setItems] = useState<ParejaItem[]>(st.doc.items.filter((i) => !i.deleted));
  const set = (id: string, p: Partial<ParejaItem>) => setItems(items.map((i) => (i.id === id ? { ...i, ...p } : i)));
  const save = async () => {
    const t = now();
    await cambiarPareja((d) => {
      const prev = new Map(d.items.map((i) => [i.id, i]));
      const vivos = new Set(items.map((i) => i.id));
      const out = items.map((i) => (JSON.stringify(prev.get(i.id)) === JSON.stringify(i) ? i : { ...i, nombre: i.nombre.trim() || 'Gasto fijo', updatedAt: t }));
      const borrados = d.items.filter((i) => !vivos.has(i.id) && !i.deleted).map((i) => ({ ...i, deleted: true, updatedAt: t }));
      return { ...d, items: [...out, ...borrados, ...d.items.filter((i) => i.deleted)] };
    });
    onClose();
  };
  const agregar = () => setItems([...items, { id: `fijo-${uid().slice(0, 8)}`, updatedAt: '', nombre: '', icono: 'Shapes', categoria: 'Hogar', paga: otro(yo), pctPaga: 50, orden: Math.max(0, ...items.map((i) => i.orden)) + 1 }]);
  return (
    <Modal title="Planilla de gastos fijos" wide onClose={onClose} className="pj-sheet" footer={<><button className="btn ghost" onClick={onClose}>Cancelar</button><button className="btn primary" onClick={save}><Check aria-hidden />Guardar planilla</button></>}>
      <p className="muted small" style={{ marginTop: 0 }}>Se repite todos los meses y {n[otro(yo)]} la ve igual. Sin monto fijo, el monto lo pone cada mes quien paga.</p>
      <div className="pj-plan">
        {items.map((i) => (
          <div key={i.id} className="pj-plan-row">
            <span className="cat-ic"><Ic name={i.icono} /></span>
            <div className="form-grid">
              <Field label="Nombre">{(id) => <input id={id} value={i.nombre} onChange={(e) => set(i.id, { nombre: e.target.value })} />}</Field>
              <Field label="Lo paga">{(id) => (
                <select id={id} value={i.paga} onChange={(e) => set(i.id, { paga: e.target.value as ParejaItem['paga'] })}>
                  <option value={yo}>{n[yo]} (vos)</option>
                  <option value={otro(yo)}>{n[otro(yo)]}</option>
                  <option value="ambos">Cualquiera de los dos</option>
                </select>
              )}</Field>
              <Field label="Reparto">{(id) => (
                <select id={id} value={i.pctPaga === 50 ? '50' : i.pctPaga >= 100 ? '100' : i.pctPaga <= 0 ? '0' : 'otro'} onChange={(e) => set(i.id, { pctPaga: e.target.value === 'otro' ? 60 : Number(e.target.value) })}>
                  <option value="50">Mitad y mitad</option>
                  <option value="100">Solo de quien paga</option>
                  <option value="0">Todo del otro (se lo debe a quien paga)</option>
                  <option value="otro">Otro %</option>
                </select>
              )}</Field>
              {i.pctPaga !== 50 && i.pctPaga > 0 && i.pctPaga < 100 && <Field label="% de quien paga">{(id) => <input id={id} type="number" min={1} max={99} value={i.pctPaga} onChange={(e) => set(i.id, { pctPaga: Math.min(99, Math.max(1, Number(e.target.value))) })} />}</Field>}
              <Field label="Monto fijo (opcional)" hint="Se carga solo todos los meses">{(id) => <MoneyInput id={id} value={i.fijo} onChange={(fijo) => set(i.id, { fijo })} />}</Field>
            </div>
            <button className="btn ghost icon danger" aria-label={`Quitar ${i.nombre}`} onClick={() => setItems(items.filter((x) => x.id !== i.id))}><Trash2 aria-hidden /></button>
          </div>
        ))}
      </div>
      <button className="btn" onClick={agregar}><Plus aria-hidden />Agregar un gasto fijo</button>
    </Modal>
  );
}

// ----- Pantalla principal -----

function SyncTag({ st, el }: { st: ParejaEstado; el: string }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const cuando = st.ultima ? new Date(st.ultima) : null;
  const hoy = cuando && cuando.toDateString() === new Date().toDateString();
  const hora = cuando ? cuando.toLocaleString('es-AR', hoy ? { hour: '2-digit', minute: '2-digit' } : { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : null;
  const sync = async () => {
    setBusy(true);
    setMsg('');
    const r = await runParejaSync();
    setBusy(false);
    if (r && !r.conectados.length) setMsg(`No se encontró el celular de ${el} en este Wi-Fi. Lo anotado queda guardado y se manda cuando estén conectados a la misma red.`);
  };
  return (
    <div className="pj-sync">
      {st.error ? <Badge tone="warn">Sin sincronizar</Badge> : hora ? <Badge tone="ok">Sincronizado {hoy ? 'hoy' : 'el'} {hora}</Badge> : <Badge>Todavía sin sincronizar con {el}</Badge>}
      <button className="btn small ghost" disabled={busy} onClick={sync}><RefreshCw aria-hidden className={busy ? 'spin' : ''} />{busy ? 'Buscando…' : 'Sincronizar'}</button>
      {(st.error || msg) && <small className="muted d-block">{st.error ?? msg}</small>}
    </div>
  );
}

/** Qué dispositivos respondieron la última vez (para saber por qué no llega algo). */
function Diagnostico({ st, el }: { st: ParejaEstado; el: string }) {
  const nombre = (url: string) => {
    if (url === st.host?.local) return 'Este dispositivo (lo que te dejaron)';
    const s = st.doc.servidores?.find((x) => x.url === url);
    if (url.endsWith(':8797')) return s ? `Celular (${url.replace(/^https?:\/\//, '')})` : `Celular de ${el} (${url.replace(/^https?:\/\//, '')})`;
    return `PC (${url.replace(/^https?:\/\//, '')})`;
  };
  const filas = Object.entries(st.contactos ?? {});
  return (
    <div className="pj-diag" data-testid="pareja-diagnostico">
      <p><strong>Conexión</strong></p>
      <p>Tu dirección en este Wi-Fi: <strong>{st.host?.publica?.replace(/^https?:\/\//, '') ?? 'sin red (o la app no pudo abrir el puerto)'}</strong></p>
      {filas.length === 0 ? (
        <p>Todavía no se intentó sincronizar.</p>
      ) : (
        <ul>
          {filas.map(([url, c]) => (
            <li key={url}>
              {c.ok ? '✓' : '✗'} {nombre(url)}: {c.ok ? 'conectado' : c.motivo ?? 'no responde'} · {new Date(c.at).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
            </li>
          ))}
        </ul>
      )}
      <p className="muted">Si el celular de {el} "no responde": que tenga Brote abierto, que estén en la misma red (no en datos móviles ni en la red de invitados del router) y que las dos direcciones empiecen igual (por ejemplo, 192.168.0.…).</p>
    </div>
  );
}

/** Gastos marcados como compartidos en Gastos (½ o la tilde) que quedaron solo en este celular. */
function SinMandar({ el, st }: { el: string; st: ParejaEstado }) {
  const { data, month, toast } = useApp();
  const lista = sinMandar(data.expenses, month, st.noMandar);
  if (!lista.length) return null;
  const mandar = async (ids: string[]) => {
    let n = 0;
    for (const e of lista.filter((x) => ids.includes(x.id))) if (await compartirConPareja(e)) n++;
    toast(n === 1 ? `Mandado: a ${el} le aparece su parte.` : `${n} gastos mandados a ${el}.`);
  };
  return (
    <Card title={`Compartidos que ${el} todavía no ve`} className="pj-pend" help={`Son gastos que marcaste como compartidos antes de usar el modo pareja (con el botón ½, la tilde de compartido o la planilla que subías). Quedaron solo en tu app. "Mandar" se lo pasa a ${el} para que le aparezca su mitad. Si ${el} ya lo cargó (por ejemplo, el alquiler en la planilla del mes), tocá "No mandar" para no duplicarlo.`}>
      <p className="small muted" style={{ marginTop: 0 }}>Están solo en tu app. Mandá los que {el} todavía no cargó; si ya los cargó, tocá "No mandar".</p>
      <ul className="pj-list">
        {lista.map((e) => (
          <li key={e.id} className="pj-item">
            <span className="grow">
              <span className="t">{e.concept}</span>
              <span className="s">{formatDate(e.date)} · {e.paidBy === 'pareja' ? `pagó ${el}` : 'pagaste vos'} · {formatARS(e.totalAmount)}</span>
            </span>
            <span className="row-actions">
              <button className="btn small ghost" onClick={() => noMandar([e.id])}>No mandar</button>
              <button className="btn small" onClick={() => mandar([e.id])}>Mandar</button>
            </span>
          </li>
        ))}
      </ul>
      {lista.length > 1 && <button className="btn primary" onClick={() => mandar(lista.map((e) => e.id))}>Mandar todos a {el}</button>}
    </Card>
  );
}

/** Lo que hay que ponerle al otro por un gasto: si pagó el otro, vos le ponés tu parte; si pagaste vos, te pone la suya. */
function Poner({ g, yo, n }: { g: ParejaGasto; yo: Miembro; n: Record<Miembro, string> }) {
  const p = partes(g);
  const pagueYo = g.paga === yo;
  return (
    <span className="m">
      <Money value={pagueYo ? p[otro(yo)] : p[yo]} />
      <small>{pagueYo ? `${n[otro(yo)]} te pone` : `le ponés a ${n[g.paga]}`}</small>
    </span>
  );
}

function Principal({ st }: { st: ParejaEstado }) {
  const { month, setMonth } = useApp();
  const yo = st.yo!;
  const n = st.doc.nombres;
  const el = n[otro(yo)];
  const [fijo, setFijo] = useState<FilaFijo | null>(null);
  const [anotar, setAnotar] = useState<{ gasto?: ParejaGasto } | null>(null);
  const [pagar, setPagar] = useState(false);
  const [plan, setPlan] = useState(false);
  const [host, setHost] = useState<HostInfo>({});
  useEffect(() => {
    iniciarHost(st.cfg.token, st.cfg.space).then(setHost);
  }, [st.cfg.token, st.cfg.space]);

  const total = saldo(st.doc, yo);
  const mes = saldo(st.doc, yo, month);
  const filas = fijosDelMes(st.doc, month, yo);
  const compartidas = filas.filter((f) => f.item.pctPaga < 100);
  const cargados = compartidas.filter((f) => f.gasto).length;
  const sueltos = st.doc.gastos.filter((g) => !g.deleted && g.mes === month && !g.itemId).sort((a, b) => b.fecha.localeCompare(a.fecha));
  const pagos = st.doc.pagos.filter((x) => !x.deleted && x.mes === month);
  const code = codigoDe(st, host);

  const noEsCompartido = async (g: ParejaGasto) => {
    if (!(await confirmDialog(`¿"${g.concepto}" no era compartido?\nSe saca de los gastos de los dos.`, { danger: true, ok: 'No es compartido' }))) return;
    await cambiarPareja((d) => ({ ...d, gastos: d.gastos.map((x) => (x.id === g.id ? { ...x, deleted: true, updatedAt: now() } : x)) }));
  };
  const borrarPago = async (x: ParejaPago) => {
    if (!(await confirmDialog('¿Borrar este pago?', { danger: true, ok: 'Borrar' }))) return;
    await cambiarPareja((d) => ({ ...d, pagos: d.pagos.map((y) => (y.id === x.id ? { ...y, deleted: true, updatedAt: now() } : y)) }));
  };
  const copiar = async () => {
    if (desktop()) await desktop()!.copy(code);
    else if (isNative() && navigator.share) await navigator.share({ text: code }).catch(() => {});
    else await navigator.clipboard?.writeText(code).catch(() => {});
  };

  const conectar = (
    <Card title={<span className="card-t"><Link2 aria-hidden size={18} />{st.ultima ? 'Conectar otro dispositivo' : `Conectá el celular de ${el}`}</span>}>
      <div className="pj-qr">
        <QrCode text={code} label={`QR para conectar a ${el}`} />
        <p className="small muted">
          En el celular de {el}: Brote → Gastos → Compartidos → <strong>Escanear QR</strong>. Tienen que estar en el mismo Wi-Fi. Es privado: no lo compartas con nadie más.
        </p>
      </div>
      <details className="more-opts small">
        <summary>Mandar el código por WhatsApp (o para la PC)</summary>
        <div className="pair-code">
          <code data-testid="codigo-pareja">{code}</code>
          <button className="btn small" onClick={copiar}><Copy aria-hidden />{isNative() ? 'Compartir' : 'Copiar'}</button>
        </div>
      </details>
      <details className="more-opts small">
        <summary>Más opciones</summary>
        <Diagnostico st={st} el={el} />
        <p>Sos <strong>{n[yo]}</strong> en este dispositivo. Se sincroniza cuando los dos celulares están en el mismo Wi-Fi (o con el hotspot de uno) y uno de los dos abre Brote; el otro lo recibe aunque tenga Brote cerrado, si tiene activada la lectura de notificaciones. La PC es opcional: si está prendida con Brote abierto, también guarda los compartidos.</p>
        <button className="btn small ghost danger" onClick={async () => (await confirmDialog('¿Salir del modo pareja en este dispositivo?\nLos gastos que ya están en tu lista quedan.', { danger: true, ok: 'Salir' })) && salirPareja()}>Salir del modo pareja</button>
      </details>
    </Card>
  );

  return (
    <div className="page pareja">
      <MonthNav month={month} setMonth={setMonth} />
      <SinMandar el={el} st={st} />
      {!st.ultima && conectar}
      <div className="cols cols-main">
        <section className="cash-card pj-hero" aria-label={`Saldo con ${el}`}>
          <span className="pj-pair"><Av name={n[yo]} /><ArrowRightLeft aria-hidden size={16} /><Av name={el} />Saldo con {el}</span>
          {total.neto === 0 ? (
            <strong className="hero-money pj-mano">Están a mano ✓</strong>
          ) : (
            <>
              <span className="hero-label">{total.neto < 0 ? `Le tenés que pasar a ${el}` : `${el} te tiene que pasar`}</span>
              <Money value={Math.abs(total.neto)} className="hero-money" />
            </>
          )}
          <SyncTag st={st} el={el} />
          <div className="row-actions" style={{ justifyContent: 'flex-start' }}>
            {total.neto !== 0 && <button className="btn lime" onClick={() => setPagar(true)}><Check aria-hidden />{total.neto < 0 ? 'Pagado' : 'Me lo pasó'}</button>}
            <button className="btn ghost-hero" onClick={() => setAnotar({})}><Plus aria-hidden />Anotar compartido</button>
          </div>
        </section>
        <div className="pj-split">
          <div className="card"><span className="pj-l"><Av name={el} />Pagó {el} en {mesNombre(month)}</span><Money value={mes.pagoElOtro} className="amount" /><small className="muted">vos le ponés: {formatARS(mes.tuParteDeLoSuyo)}</small></div>
          <div className="card"><span className="pj-l"><Av name={n[yo]} />Pagaste vos</span><Money value={mes.pagasteVos} className="amount" /><small className="muted">{el} te pone: {formatARS(mes.suParteDeLoTuyo)}</small></div>
        </div>
      </div>

      <div className="cols cols-main">
        <Card
          title={`Gastos fijos de ${mesNombre(month)}`}
          help={`Se arma sola cada mes. Quien paga pone el monto y al otro le aparece su parte. Lo que todavía no se cargó queda "Pendiente" y no suma nada.`}
          actions={<button className="btn small" onClick={() => setPlan(true)}><Settings2 aria-hidden />Planilla</button>}
        >
          {compartidas.length > 0 && (
            <div className="pj-prog"><span><strong>{cargados} de {compartidas.length}</strong> cargados</span><div className="progress"><div style={{ width: `${(cargados / compartidas.length) * 100}%` }} /></div></div>
          )}
          <ul className="pj-list">
            {filas.map((f) => {
              const quien: Miembro = f.gasto?.paga ?? (f.item.paga === 'ambos' ? yo : f.item.paga);
              const puedo = f.item.paga === 'ambos' || f.item.paga === yo;
              const solo = f.item.pctPaga >= 100;
              return (
                <li key={f.item.id}>
                  <button className="pj-row" onClick={() => !solo && setFijo(f)} disabled={solo}>
                    <span className={`cat-ic ${f.gasto || solo ? '' : 'dash'}`}><Ic name={f.item.icono} /></span>
                    <span className="grow">
                      <span className="t">{f.item.nombre}</span>
                      <span className="s">
                        {solo ? `solo tuyo · fijo, se carga solo` : f.item.paga === 'ambos' ? 'los dos · ' : `${quien === yo ? 'lo pagás vos' : `lo paga ${n[quien]}`} · `}
                        {!solo && (f.item.pctPaga === 0 ? `todo ${quien === yo ? `de ${n[otro(yo)]}` : 'tuyo'}${f.item.fijo ? ' · fijo, se carga solo' : ''}` : f.gasto ? `${formatARS(f.gasto.total)} en total · ${f.item.pctPaga === 50 ? 'mitad y mitad' : `${pct(f.item.pctPaga)} / ${pct(100 - f.item.pctPaga)}`}` : f.item.opcional ? 'opcional' : 'falta el monto')}
                      </span>
                    </span>
                    {solo ? (
                      <span className="m"><Money value={f.item.fijo} /></span>
                    ) : f.gasto ? (
                      <Poner g={f.gasto} yo={yo} n={n} />
                    ) : puedo ? (
                      <span className="pj-falta"><Plus aria-hidden />Poner</span>
                    ) : (
                      <Badge>Pendiente</Badge>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </Card>

        <Card title={`Compartidos de ${mesNombre(month)}`} actions={<button className="btn small primary" onClick={() => setAnotar({})}><Plus aria-hidden />Anotar</button>}>
          {sueltos.length === 0 && pagos.length === 0 ? (
            <Empty title="Todavía nada este mes" icon={Users}>Lo que anoten como compartido (acá, en el widget o en el aviso de Brote) aparece en las dos apps.</Empty>
          ) : (
            <ul className="pj-list">
              {sueltos.map((g) => (
                <li key={g.id} className="pj-item">
                  <span className="cat-ic"><Av name={n[g.paga]} /></span>
                  <span className="grow">
                    <span className="t">{g.concepto}</span>
                    <span className="s">{formatDate(g.fecha)} · {g.paga === yo ? 'pagaste vos' : `pagó ${n[g.paga]}`} · {formatARS(g.total)}</span>
                    <span className="pj-acts">
                      <button className="linklike" onClick={() => setAnotar({ gasto: g })}><Pencil aria-hidden size={14} />Corregir</button>
                      <button className="linklike" onClick={() => noEsCompartido(g)}>No es compartido</button>
                    </span>
                  </span>
                  <Poner g={g} yo={yo} n={n} />
                </li>
              ))}
              {pagos.map((x) => (
                <li key={x.id} className="pj-item">
                  <span className="cat-ic pj-ok"><HandCoins aria-hidden /></span>
                  <span className="grow">
                    <span className="t">{x.de === yo ? `Le pasaste a ${el}` : `${el} te pasó`}</span>
                    <span className="s">{formatDate(x.fecha)} · {x.medio}</span>
                    <span className="pj-acts"><button className="linklike" onClick={() => borrarPago(x)}>Borrar</button></span>
                  </span>
                  <span className="m"><Money value={x.monto} className={x.a === yo ? 'pos' : ''} /></span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {st.ultima && conectar}

      {fijo && <FijoSheet fila={fijo} mes={month} st={st} onClose={() => setFijo(null)} />}
      {anotar && <AnotarSheet st={st} mes={month} gasto={anotar.gasto} onClose={() => setAnotar(null)} />}
      {pagar && <PagoSheet st={st} neto={total.neto} mes={month} onClose={() => setPagar(false)} />}
      {plan && <PlanillaSheet st={st} onClose={() => setPlan(false)} />}
    </div>
  );
}

export function ParejaPage() {
  const st = usePareja();
  if (st === undefined) return <p className="muted">Cargando…</p>;
  if (!st) return <Conectar />;
  if (!st.yo) return <ElegirYo st={st} />;
  return <Principal st={st} />;
}

/** Resumen corto para "Este mes" y Compartidos: el saldo con la pareja. */
export function ParejaResumen() {
  const st = usePareja();
  if (!st?.yo) return null;
  const el = st.doc.nombres[otro(st.yo)];
  const s = saldo(st.doc, st.yo);
  return (
    <a className="card link-card pj-mini" href="#/compartidos">
      <span className="pj-pair"><Users aria-hidden size={18} />Con {el}</span>
      <strong>{s.neto === 0 ? 'Están a mano' : s.neto < 0 ? `Le debés ${formatARS(-s.neto)}` : `Te debe ${formatARS(s.neto)}`}</strong>
      <span className="card-link">Ver gastos compartidos</span>
    </a>
  );
}

