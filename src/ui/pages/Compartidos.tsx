import { useMemo, useState } from 'react';
import { useApp } from '../store';
import { saveRecord, softDelete } from '../../db/repo';
import { occurrencesForMonth, partnerBalance } from '../../domain/expenses';
import { formatDate, monthLabel, todayIso, type MonthKey } from '../../domain/dates';
import { chargeCoupons, partnerCoupon, pctForCoupon, sancorSummary } from '../../domain/sancor';
import { formatARS, sum, type Cents } from '../../domain/money';
import { uid } from '../../domain/text';
import type { SancorCharge } from '../../domain/types';
import { Badge, Card, confirmDialog, Empty, Field, Modal, Money, MoneyInput, MonthNav, MonthSelect } from '../components/ui';
import { ExpenseForm, newExpenseDraft, type ExpenseDraft } from './ExpenseForm';
import { ExpenseTable } from './Gastos';
import { ParejaResumen, usePareja } from './Pareja';

function SancorForm({ initial, onClose }: { initial: Partial<SancorCharge> & { month: MonthKey; partnerPct: number }; onClose: () => void }) {
  const { toast } = useApp();
  const [d, setD] = useState(initial);
  const [err, setErr] = useState('');
  const save = async () => {
    if (!d.chargeAmount || d.chargeAmount <= 0) return setErr('Ingrese el importe del cupón');
    // Si se cambia el total a mano, el detalle por cupón deja de valer.
    const coupons = d.coupons && sum(d.coupons.map((k) => k.amount)) === d.chargeAmount ? d.coupons : undefined;
    await saveRecord<SancorCharge>('sancor', { received: [], ...d, coupons, chargeAmount: d.chargeAmount } as SancorCharge, `Cargo Sancor Salud ${monthLabel(d.month)}`);
    toast('Cargo de Sancor Salud guardado');
    onClose();
  };
  return (
    <Modal title="Cargo de Sancor Salud" onClose={onClose} footer={<><button className="btn ghost" onClick={onClose}>Cancelar</button><button className="btn primary" onClick={save}>Guardar</button></>}>
      <div className="form-grid">
        <Field label="Mes del resumen">{(id) => <MonthSelect id={id} value={d.month} onChange={(month) => setD({ ...d, month })} />}</Field>
        <Field label={d.coupons && d.coupons.length > 1 ? 'Total cobrado en la tarjeta (suma de los cupones)' : 'Importe total del cupón (cobrado en la tarjeta)'} error={err}>{(id) => <MoneyInput id={id} value={d.chargeAmount} onChange={(v) => setD({ ...d, chargeAmount: v })} />}</Field>
        <Field label="Porcentaje que corresponde a la pareja" help="Qué parte de la cuota de Sancor le toca pagar a tu pareja (y te la devuelve).">{(id) => <input id={id} type="number" min={0} max={100} step="any" value={d.partnerPct} onChange={(e) => setD({ ...d, partnerPct: Number(e.target.value) })} />}</Field>
      </div>
      <Field label="Observaciones">{(id) => <textarea id={id} rows={2} value={d.notes ?? ''} onChange={(e) => setD({ ...d, notes: e.target.value })} />}</Field>
    </Modal>
  );
}

function ReimbursementForm({ charge, onClose }: { charge: SancorCharge; onClose: () => void }) {
  const s = sancorSummary(charge);
  const [amount, setAmount] = useState<Cents | undefined>(s.pending || undefined);
  const [date, setDate] = useState(todayIso());
  const [err, setErr] = useState('');
  const save = async () => {
    if (!amount || amount <= 0) return setErr('Ingrese el importe recibido');
    await saveRecord<SancorCharge>('sancor', { ...charge, received: [...charge.received, { date, amount, at: new Date().toISOString() }] }, `Reintegro Sancor recibido (${formatARS(amount)})`);
    onClose();
  };
  return (
    <Modal title="Registrar reintegro recibido" onClose={onClose} footer={<><button className="btn ghost" onClick={onClose}>Cancelar</button><button className="btn primary" onClick={save}>Guardar</button></>}>
      <p className="muted">Pendiente de cobro: {formatARS(s.pending)}. El reintegro se suma como ingreso en el mes en que se recibe; nunca reduce el importe de la tarjeta.</p>
      <div className="form-grid">
        <Field label="Importe recibido" error={err}>{(id) => <MoneyInput id={id} value={amount} onChange={setAmount} />}</Field>
        <Field label="Fecha de cobro">{(id) => <input id={id} type="date" value={date} onChange={(e) => setDate(e.target.value)} />}</Field>
      </div>
    </Modal>
  );
}

export function CompartidosPage() {
  const { data, month, setMonth } = useApp();
  const [editing, setEditing] = useState<ExpenseDraft | null>(null);
  const [sancorEdit, setSancorEdit] = useState<(Partial<SancorCharge> & { month: MonthKey; partnerPct: number }) | null>(null);
  const [reimb, setReimb] = useState<SancorCharge | null>(null);
  const occ = useMemo(() => occurrencesForMonth(data.expenses.filter((e) => e.kind === 'hogar'), month), [data.expenses, month]);
  const bal = partnerBalance(occ);
  const charges = data.sancor.filter((c) => c.month === month);
  const allPending = sum(data.sancor.map((c) => sancorSummary(c).pending));
  const p = data.settings.partnerName;
  const pareja = usePareja();

  return (
    <div className="page">
      <MonthNav month={month} setMonth={setMonth} />
      <div className="page-actions">
        <button className="btn primary" onClick={() => setEditing(newExpenseDraft('hogar', month, data.settings.defaultUserPct))}>+ Gasto del hogar</button>
      </div>
      <ParejaResumen />
      <div className="kpis">
        <div className="kpi"><span>Total gastos del hogar</span><Money value={sum(occ.map((o) => o.total))} /></div>
        <div className="kpi"><span>Mi parte</span><Money value={sum(occ.map((o) => o.userShare))} /></div>
        <div className="kpi"><span>Parte de {p}</span><Money value={sum(occ.map((o) => o.partnerShare))} /></div>
        <div className="kpi"><span>{bal >= 0 ? `${p} me debe` : `Le debo a ${p}`}</span><Money value={Math.abs(bal)} /></div>
      </div>
      <Card title="Gastos del hogar (alquiler, servicios, supermercado compartido…)" help="Gastos que dividís con tu pareja. En cada uno podés elegir qué parte es tuya (por defecto 50 %) y quién lo pagó; arriba ves quién le debe a quién.">
        <ExpenseTable kinds={['hogar']} emptyText="Registre alquiler, electricidad, gas, internet, supermercado compartido u otros. El reparto inicial es 50/50 y se puede editar en cada gasto." />
      </Card>

      <Card
        title="Sancor Salud"
        help="La tarjeta te cobra la cuota entera de Sancor, pero tu pareja te devuelve su parte. Acá ves cuánto te tienen que devolver y anotás cuando te lo dan."
        actions={<button className="btn small" onClick={() => setSancorEdit({ id: uid(), month, partnerPct: data.settings.sancorPartnerPct })}>+ Asociar cargo manualmente</button>}
      >
        {pareja?.yo && <p className="small warn">Con el modo pareja activado, lo que te devuelve tu pareja se marca con <a href="#/pareja">Pagado</a>: no lo registres acá también como reintegro, para no contarlo dos veces.</p>}
        <p className="muted small">
          Al importar un resumen de Visa, el cargo de Sancor Salud se detecta automáticamente. Si no se detecta, asócielo manualmente. El total de la tarjeta nunca se reduce por un reintegro no recibido.
        </p>
        {charges.length === 0 ? (
          <Empty title={`Sin cargos de Sancor Salud en ${monthLabel(month)}`} />
        ) : (
          charges.map((c) => {
            const s = sancorSummary(c);
            const coupons = chargeCoupons(c);
            const theirs = partnerCoupon(c);
            const sameAmounts = coupons.every((k) => k.amount === coupons[0].amount);
            return (
              <div key={c.id} className="sancor" data-testid="sancor-cargo">
                {coupons.length > 1 && (
                  <p className="small" style={{ marginTop: 0 }}>
                    En la tarjeta vienen <strong>{coupons.length} cupones</strong>{sameAmounts ? <> de <Money value={coupons[0].amount} /></> : <>: {coupons.map((k, i) => <span key={i}>{i ? ' y ' : ''}<Money value={k.amount} /></span>)}</>}.
                    {theirs ? ` Uno es de ${p} y te lo devuelve entero.` : ` ${p} te devuelve el ${c.partnerPct.toLocaleString('es-AR', { maximumFractionDigits: 1 })} % del total.`}
                  </p>
                )}
                {coupons.length > 1 && !sameAmounts && (
                  <div className="row-actions" style={{ justifyContent: 'flex-start' }}>
                    {coupons.map((k, i) => (
                      <button key={i} className={`btn small ${theirs === k ? 'primary' : ''}`} onClick={() => saveRecord<SancorCharge>('sancor', { ...c, partnerPct: pctForCoupon(c, k.amount) }, `Cupón de Sancor de ${p}: ${formatARS(k.amount)}`)}>
                        {theirs === k ? '✓ ' : ''}El de {formatARS(k.amount)} es de {p}
                      </button>
                    ))}
                  </div>
                )}
                <dl className="dl three">
                  <dt>Total que cobra la tarjeta</dt><dd><Money value={s.cardAmount} /></dd>
                  <dt>Te devuelve {p}{theirs ? ' (su cupón)' : ` (${c.partnerPct.toLocaleString('es-AR', { maximumFractionDigits: 1 })} %)`}</dt><dd><Money value={s.expected} /></dd>
                  <dt>Reintegro recibido</dt><dd><Money value={s.received} /></dd>
                  <dt>Pendiente de cobro</dt><dd><Money value={s.pending} /> {s.pending > 0 ? <Badge tone="warn">pendiente</Badge> : <Badge tone="ok">completo</Badge>}</dd>
                  <dt>Lo que te queda a vos</dt><dd><Money value={s.netEstimated} estimated={s.pending > 0} /></dd>
                </dl>
                {c.received.length > 0 && (
                  <ul className="small">{c.received.map((r, i) => <li key={i}>Recibido el {formatDate(r.date)}: {formatARS(r.amount)}</li>)}</ul>
                )}
                <div className="row-actions">
                  <button className="btn small primary" onClick={() => setReimb(c)}>Registrar reintegro recibido</button>
                  <button className="btn small" onClick={() => setSancorEdit(c)}>Editar</button>
                  <button className="btn small ghost danger" onClick={async () => (await confirmDialog('¿Eliminar este cargo de Sancor Salud?', { danger: true, ok: 'Eliminar' })) && softDelete('sancor', c.id, 'Eliminación de cargo Sancor')}>Eliminar</button>
                </div>
              </div>
            );
          })
        )}
        {allPending > 0 && <p className="muted">Reintegros pendientes en total (todos los meses): <strong>{formatARS(allPending)}</strong></p>}
      </Card>
      {editing && <ExpenseForm initial={editing} onClose={() => setEditing(null)} />}
      {sancorEdit && <SancorForm initial={sancorEdit} onClose={() => setSancorEdit(null)} />}
      {reimb && <ReimbursementForm charge={reimb} onClose={() => setReimb(null)} />}
    </div>
  );
}
