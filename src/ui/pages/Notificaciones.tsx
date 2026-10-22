import { useEffect, useState } from 'react';
import { useApp } from '../store';
import { getDb } from '../../db/db';
import { getDeviceId, notify, nowIso, subscribe } from '../../db/repo';
import { isNative } from '../../platform';
import { formatARS } from '../../domain/money';
import { expenseFromDetected } from '../../notifications/ingest';
import type { LogNotif, ReviewNotif } from '../../notifications/ingest';
import { getNotifConfig, getNotifLog, getNotifReview, ingestNotifications, Notificaciones, setNotifConfig, setNotifReview } from '../../notifications/native';
import { Card, Money, MoneyInput } from '../components/ui';
import type { Cents } from '../../domain/money';

/** Configuración: activar la lectura de notificaciones (solo en el celular). */
export function NotificationsSettingsCard() {
  const { toast } = useApp();
  const [permitido, setPermitido] = useState<boolean | null>(null);
  const [activo, setActivo] = useState(false);
  const [log, setLog] = useState<LogNotif[]>([]);
  const refresh = async () => {
    setPermitido((await Notificaciones.estado()).permitido);
    setActivo((await getNotifConfig()).activo);
    setLog(await getNotifLog());
  };
  useEffect(() => {
    if (!isNative()) return;
    refresh();
    const on = () => !document.hidden && refresh();
    document.addEventListener('visibilitychange', on);
    const un = subscribe(refresh);
    return () => {
      document.removeEventListener('visibilitychange', on);
      un();
    };
  }, []);
  if (!isNative()) return null;
  const toggle = async (v: boolean) => {
    await setNotifConfig({ activo: v });
    setActivo(v);
    if (v) {
      const n = await ingestNotifications();
      if (n) toast(`${n} gasto(s) registrados desde las notificaciones.`);
    }
  };
  return (
    <Card
      title="Gastos automáticos (notificaciones)"
      help="Como hacía Mis Finanzas: cuando Ualá, Mercado Pago, Naranja X, Banco Patagonia, BNA+ o Google Pay te avisan de un pago, la app lo anota sola como gasto del día a día. Las compras con tarjeta se reconocen después en el resumen, sin contarse dos veces. Nada sale del teléfono."
    >
      <ol className="steps">
        <li>
          {permitido ? <span className="ok-text">✓ Permiso para leer notificaciones dado</span> : <>Dale permiso a la app para leer notificaciones: <button className="btn small primary" onClick={() => Notificaciones.abrirAjustes()}>Dar permiso</button> → buscá <strong>Brote</strong> y activalo.</>}
        </li>
        <li>
          <label className="check">
            <input type="checkbox" checked={activo} onChange={(e) => toggle(e.target.checked)} disabled={!permitido} /> Anotar los gastos automáticamente
          </label>
        </li>
      </ol>
      <p className="small muted">Solo se leen las notificaciones de esas apps; el resto se ignora sin guardarse. Si usabas Mis Finanzas, subí su copia (.json) en <strong>Subir</strong> para traer lo anterior y después podés desinstalarla.</p>
      {log.length > 0 && (
        <details className="more-opts">
          <summary>Últimas notificaciones leídas ({log.length})</summary>
          <ul className="list small" data-testid="notif-log">
            {log.slice(0, 30).map((l, i) => (
              <li key={i}>
                <span>
                  <strong>{l.resultado}</strong>
                  <small className="muted d-block">{new Date(l.fecha).toLocaleString('es-AR')} · {l.cuenta} · {l.texto}</small>
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </Card>
  );
}

/** Movimientos detectados que necesitan una decisión (p. ej. transferencias enviadas). */
export function NotifReviewCard() {
  const { toast } = useApp();
  const [items, setItems] = useState<ReviewNotif[]>([]);
  const [amounts, setAmounts] = useState<Record<string, Cents | undefined>>({});
  useEffect(() => {
    if (!isNative()) return;
    const load = () => getNotifReview().then(setItems);
    load();
    const un = subscribe(load);
    return () => {
      un();
    };
  }, []);
  if (!items.length) return null;
  const drop = async (id: string) => {
    const next = items.filter((x) => x.id !== id);
    await setNotifReview(next);
    setItems(next);
  };
  const asExpense = async (r: ReviewNotif) => {
    const monto = r.monto || amounts[r.id];
    if (!monto) return toast('Poné cuánto fue la transferencia.', 'error');
    const db = getDb();
    const transfer = /^Transferencia/.test(r.descripcion);
    await db.expenses.put(expenseFromDetected({ fecha: r.fecha, monto, tipo: 'GASTO', descripcion: r.descripcion, cuenta: r.cuenta, textoOriginal: r.texto, transferencia: transfer ? 'ENVIADA' : undefined }, nowIso(), await getDeviceId(db)));
    await drop(r.id);
    notify();
    toast(`Gasto anotado: ${r.descripcion} (${formatARS(monto)}).`);
  };
  return (
    <Card title={`Detectados para revisar (${items.length})`} help="Movimientos que la app vio en las notificaciones pero no sabe si son un gasto. Por ejemplo, una transferencia a Antonella por el alquiler ya está en los gastos compartidos: en ese caso tocá 'No es gasto'.">
      <ul className="exp-list" data-testid="notif-revisar">
        {items.map((r) => (
          <li key={r.id} className="exp-item">
            <div className="exp-top">
              <span className="exp-concept">{r.descripcion}</span>
              {r.monto ? <Money value={r.monto} className="exp-amount" /> : <span className="exp-amount warn">¿Cuánto?</span>}
            </div>
            {!r.monto && (
              <div style={{ maxWidth: 220 }}>
                <MoneyInput value={amounts[r.id]} onChange={(v) => setAmounts({ ...amounts, [r.id]: v })} placeholder="Importe" />
              </div>
            )}
            <div className="exp-sub">{new Date(r.fecha).toLocaleString('es-AR')} · {r.cuenta} · {r.motivo}</div>
            <div className="exp-foot">
              <span />
              <span className="exp-acts">
                <button className="btn small primary" onClick={() => asExpense(r)}>Es un gasto</button>
                <button className="btn small ghost" onClick={() => drop(r.id)}>No es gasto</button>
              </span>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
