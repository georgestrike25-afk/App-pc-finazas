import { useState } from 'react';
import { useApp } from '../store';
import { notify, saveRecord, softDelete } from '../../db/repo';
import { getDb } from '../../db/db';
import { applyStatementPayment } from '../../db/cardPayments';
import {
  buildSchedule,
  cancelObligation,
  computedBalance,
  derivedStatus,
  obligationIssues,
  obligationProgress,
  OBLIGATION_TYPE_LABEL,
  installmentDueDate,
  installmentsDueBy,
  setPaidCount,
  undoLastPayment,
  payNextInstallment,
  reviseObligation,
} from '../../domain/obligations';
import { addMonths, formatDate, monthLabel, monthOf, todayIso, type MonthKey } from '../../domain/dates';
import { formatARS, type Cents } from '../../domain/money';
import type { CardPayment, Obligation, ObligationStatus, ObligationType, Statement } from '../../domain/types';
import { Badge, Card, confirmDialog, Empty, Field, Modal, Money, MoneyInput, MonthSelect, useNarrow } from '../components/ui';

const STATUS_TONE: Record<ObligationStatus, 'ok' | 'warn' | 'bad' | 'info' | 'neutral'> = {
  pendiente: 'info',
  pagada: 'ok',
  vencida: 'bad',
  cancelada: 'neutral',
  por_confirmar: 'warn',
};
const STATUS_LABEL: Record<ObligationStatus, string> = { pendiente: 'Pendiente', pagada: 'Pagada', vencida: 'Vencida', cancelada: 'Cancelada', por_confirmar: 'Por confirmar' };

type ObDraft = Omit<Obligation, 'id' | 'createdAt' | 'updatedAt' | 'revisions'> & { id?: string; revisions?: Obligation['revisions'] };

function ObligationForm({ initial, onClose }: { initial: ObDraft; onClose: () => void }) {
  const { data, today, toast } = useApp();
  const [d, setD] = useState<ObDraft>(initial);
  const [effectiveFrom, setEffectiveFrom] = useState<MonthKey>(today);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const existing = d.id ? data.obligations.find((o) => o.id === d.id) : undefined;
  const save = async () => {
    const e: Record<string, string> = {};
    if (!d.concept.trim()) e.concept = 'Ingrese un concepto';
    if (d.totalInstallments !== undefined && d.paidInstallments > d.totalInstallments) e.paid = 'Supera el total de cuotas';
    if (d.paidInstallments < 0) e.paid = 'Valor inválido';
    setErrors(e);
    if (Object.keys(e).length) return;
    const now = new Date().toISOString();
    // Si solo cambió la cantidad de cuotas pagadas, el calendario se mantiene (la próxima cuota avanza o retrocede).
    const changes = { ...d };
    if (existing && d.paidInstallments !== existing.paidInstallments && d.nextDueMonth === existing.nextDueMonth && existing.nextDueMonth) {
      const step = { mensual: 1, bimestral: 2, trimestral: 3, anual: 12 }[d.frequency];
      changes.nextDueMonth = addMonths(existing.nextDueMonth, (d.paidInstallments - existing.paidInstallments) * step);
      if (existing.status === 'pagada' && (!d.totalInstallments || d.paidInstallments < d.totalInstallments)) changes.status = 'pendiente';
    }
    const rec = existing ? reviseObligation(existing, changes, effectiveFrom, 'Edición manual', now, today) : { ...d, revisions: [] };
    await saveRecord<Obligation>('obligations', rec as Obligation, `${existing ? 'Modificación' : 'Alta'} de obligación "${d.concept}"`);
    toast('Obligación guardada');
    onClose();
  };
  const num = (v: string) => (v === '' ? undefined : Math.max(0, Math.floor(Number(v))));
  return (
    <Modal title={existing ? 'Editar obligación' : 'Nueva obligación'} onClose={onClose} wide footer={<><button className="btn ghost" onClick={onClose}>Cancelar</button><button className="btn primary" onClick={save}>Guardar</button></>}>
      <div className="form-grid">
        <Field label="Entidad financiera">{(id) => <input id={id} name="entity" list="entities" value={d.entity} onChange={(e) => setD({ ...d, entity: e.target.value })} placeholder="Ej.: Visa Banco Patagonia" />}</Field>
        <datalist id="entities">{['Visa Banco Patagonia', 'Mercado Pago', 'Mercado Crédito', 'Naranja X', 'Plan V'].map((x) => <option key={x} value={x} />)}</datalist>
        <Field label="Tipo">
          {(id) => (
            <select id={id} value={d.type} onChange={(e) => setD({ ...d, type: e.target.value as ObligationType })}>
              {Object.entries(OBLIGATION_TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          )}
        </Field>
        <Field label="Concepto" error={errors.concept}>{(id) => <input id={id} name="concept" value={d.concept} onChange={(e) => setD({ ...d, concept: e.target.value })} />}</Field>
        <Field label="Importe original (opcional)">{(id) => <MoneyInput id={id} value={d.originalAmount} onChange={(v) => setD({ ...d, originalAmount: v })} />}</Field>
        <Field label="Saldo pendiente conocido (opcional)" help="Si el banco te dice cuánto debés en total, ponelo acá. Si no, la app lo calcula con las cuotas." hint="Informado por la entidad.">{(id) => <MoneyInput id={id} value={d.knownBalance} onChange={(v) => setD({ ...d, knownBalance: v })} />}</Field>
        <Field label="Fecha de origen">{(id) => <input id={id} type="date" value={d.originDate ?? ''} onChange={(e) => setD({ ...d, originDate: e.target.value || undefined })} />}</Field>
        <Field label="Cantidad total de cuotas" hint="Vacío si se desconoce (la proyección será estimada).">{(id) => <input id={id} name="totalInstallments" type="number" min={1} value={d.totalInstallments ?? ''} onChange={(e) => setD({ ...d, totalInstallments: num(e.target.value) })} />}</Field>
        <Field label="Cuotas ya pagadas" help="Cuántas cuotas pagaste hasta hoy. Por ejemplo, si vas por la cuota 5 y ya la pagaste, poné 5." error={errors.paid}>{(id) => <input id={id} name="paidInstallments" type="number" min={0} value={d.paidInstallments} onChange={(e) => setD({ ...d, paidInstallments: num(e.target.value) ?? 0 })} />}</Field>
        <Field label="Importe de cada cuota">{(id) => <MoneyInput id={id} name="installmentAmount" value={d.installmentAmount} onChange={(v) => setD({ ...d, installmentAmount: v })} />}</Field>
        <Field label={`Mes de vencimiento de la cuota ${d.paidInstallments + 1}`}>{(id) => <MonthSelect id={id} value={d.nextDueMonth ?? today} onChange={(m) => setD({ ...d, nextDueMonth: m })} />}</Field>
        <Field label="Día de vencimiento (opcional)">{(id) => <input id={id} type="number" min={1} max={31} value={d.dueDay ?? ''} onChange={(e) => setD({ ...d, dueDay: num(e.target.value) })} />}</Field>
        <Field label="Frecuencia">
          {(id) => (
            <select id={id} value={d.frequency} onChange={(e) => setD({ ...d, frequency: e.target.value as Obligation['frequency'] })}>
              <option value="mensual">Mensual</option><option value="bimestral">Bimestral</option><option value="trimestral">Trimestral</option><option value="anual">Anual</option>
            </select>
          )}
        </Field>
        <Field label="Estado">
          {(id) => (
            <select id={id} value={d.status} onChange={(e) => setD({ ...d, status: e.target.value as ObligationStatus })}>
              {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          )}
        </Field>
      </div>
      <label className="check"><input type="checkbox" checked={d.variableAmount} onChange={(e) => setD({ ...d, variableAmount: e.target.checked })} /> Importe variable (intereses, ajustes): las cuotas futuras se marcan como estimadas</label>
      {existing && (
        <Field label="Los cambios de importe o calendario rigen desde" help="Desde qué mes vale el cambio. Los meses anteriores no se tocan." hint="Las cuotas de meses anteriores conservan su importe (no se alteran en silencio).">
          {(id) => <MonthSelect id={id} value={effectiveFrom} onChange={setEffectiveFrom} />}
        </Field>
      )}
      <Field label="Observaciones">{(id) => <textarea id={id} rows={2} value={d.notes ?? ''} onChange={(e) => setD({ ...d, notes: e.target.value })} />}</Field>
    </Modal>
  );
}

function ObligationDetail({ ob, onClose, onPay }: { ob: Obligation; onClose: () => void; onPay: (o: Obligation) => void }) {
  const { today } = useApp();
  const { toast } = useApp();
  const sched = buildSchedule(ob, today);
  const pr = obligationProgress(ob, today);
  const dueBy = installmentsDueBy(ob, todayIso());
  const [paidInput, setPaidInput] = useState(String(ob.paidInstallments));
  const nowS = () => new Date().toISOString();
  const applyCount = async (k: number, why: string) => {
    if (!(await confirmDialog(`¿Dejar ${k} cuota(s) pagada(s)${ob.totalInstallments ? ` de ${ob.totalInstallments}` : ''}?\nLa próxima a pagar será la ${k + 1}.`, { ok: 'Corregir' }))) return;
    await saveRecord('obligations', setPaidCount(ob, k, nowS(), `Corrección: pagadas: ${k} (${why})`), `Corrección de cuotas pagadas de "${ob.concept}"`);
    toast('Cuotas pagadas corregidas.');
    onClose();
  };
  const cap = ob.capitalByInstallment;
  return (
    <Modal title={ob.concept} onClose={onClose} wide>
      <p className="muted small">{ob.entity} · {OBLIGATION_TYPE_LABEL[ob.type]}</p>
      <div className="kpis" data-testid="progreso">
        <div className="kpi"><span>Vas por la cuota</span><strong className="big">{pr.currentN ? `${pr.currentN}${pr.total ? ` de ${pr.total}` : ''}` : 'Completada'}</strong>{pr.nextDueDate && <small className="muted">vence el {formatDate(pr.nextDueDate)}</small>}</div>
        <div className="kpi"><span>Próxima cuota</span><Money value={pr.nextAmount ?? 0} /></div>
        <div className="kpi"><span>Cuotas pagadas</span><strong className="big">{pr.paid}{pr.total ? ` de ${pr.total}` : ''}</strong>{pr.paidPct !== undefined && <small className="muted">{String(pr.paidPct).replace('.', ',')} % {cap ? 'del capital' : 'de las cuotas'}</small>}</div>
        <div className="kpi"><span>Total que falta pagar</span><Money value={pr.remainingTotal} /><small className="muted">{pr.remainingCount} cuota(s)</small></div>
        {pr.remainingCapital !== undefined && <div className="kpi"><span>Capital adeudado</span><Money value={pr.remainingCapital} /></div>}
        {pr.remainingInterest !== undefined && <div className="kpi"><span>Intereses e impuestos que faltan</span><Money value={pr.remainingInterest} /></div>}
        <div className="kpi"><span>Última cuota</span><strong className="big">{pr.lastDueDate ? formatDate(pr.lastDueDate) : pr.lastDueMonth ? monthLabel(pr.lastDueMonth) : '—'}</strong></div>
      </div>
      {pr.overdueCount > 0 && <p className="err">⚠ {pr.overdueCount} cuota(s) vencida(s) sin pago registrado.</p>}
      <p className="small muted">Las cuotas se marcan pagadas solas cuando subís el resumen de la tarjeta o la captura del banco.</p>
      <details className="fix-paid" open={ob.paidInstallments > dueBy}>
        <summary>Corregir cuotas pagadas</summary>
        {ob.status !== 'pagada' && ob.status !== 'cancelada' && ob.nextDueMonth && (!ob.totalInstallments || ob.paidInstallments < ob.totalInstallments) && (
          <button className="btn small" onClick={() => onPay(ob)}>Marcar la cuota {ob.paidInstallments + 1} como pagada</button>
        )}
        {ob.paidInstallments > dueBy && <p className="warn small">Figuran {ob.paidInstallments} pagadas, pero hasta hoy vencieron {dueBy}.</p>}
        <div className="row-actions" style={{ justifyContent: 'flex-start' }}>
          <button className="btn small primary" disabled={dueBy === ob.paidInstallments} onClick={() => applyCount(dueBy, 'vencidas hasta hoy')}>Dejar pagadas las vencidas hasta hoy ({dueBy})</button>
          <button
            className="btn small"
            disabled={ob.paidInstallments === 0}
            onClick={async () => {
              const u = undoLastPayment(ob, nowS());
              if (!u) return;
              await saveRecord('obligations', u, `Deshacer pago de "${ob.concept}"`);
              toast(`Listo: quedan ${u.paidInstallments} cuota(s) pagada(s).`);
              onClose();
            }}
          >
            Deshacer último pago (cuota {ob.paidInstallments})
          </button>
        </div>
        <div className="row" style={{ marginTop: '0.5rem', maxWidth: 360 }}>
          <input aria-label="Cuotas pagadas" type="number" min={0} max={ob.totalInstallments} value={paidInput} onChange={(e) => setPaidInput(e.target.value)} />
          <button className="btn small" onClick={() => applyCount(Math.max(0, Math.floor(Number(paidInput) || 0)), 'manual')}>Guardar cantidad pagada</button>
        </div>
      </details>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Cuota</th><th>Vencimiento</th>{cap && <th className="num">Capital</th>}<th className="num">Importe</th><th>Estado</th></tr></thead>
          <tbody>
            {sched.map((i) => (
              <tr key={i.n} className={i.status === 'cancelada' || i.status === 'pagada' ? 'dim' : ''}>
                <td>{i.n}{i.total ? `/${i.total}` : ''}</td>
                <td>{ob.dueDates?.[i.n] ? formatDate(ob.dueDates[i.n]) : monthLabel(i.month)}</td>
                {cap && <td className="num"><Money value={cap[i.n]} /></td>}
                <td className="num"><Money value={i.amount} estimated={i.estimated} /></td>
                <td><Badge tone={i.status === 'pagada' ? 'ok' : i.status === 'vencida' ? 'bad' : i.status === 'cancelada' ? 'neutral' : 'info'}>{i.status}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {ob.revisions.length > 0 && (
        <>
          <h3>Historial de cambios</h3>
          <ul className="timeline">
            {[...ob.revisions].reverse().map((r, i) => (
              <li key={i}><strong>{new Date(r.at).toLocaleString('es-AR')}</strong> — {r.reason}{r.effectiveFrom ? ` (desde ${monthLabel(r.effectiveFrom)})` : ''}. Antes: cuota {formatARS(r.snapshot.installmentAmount)}, pagadas {r.snapshot.paidInstallments}{r.snapshot.totalInstallments ? `/${r.snapshot.totalInstallments}` : ''}</li>
            ))}
          </ul>
        </>
      )}
    </Modal>
  );
}

function PaymentForm({ statement, onClose }: { statement?: Statement; onClose: () => void }) {
  const [amount, setAmount] = useState<Cents | undefined>(statement?.total);
  const [date, setDate] = useState(todayIso());
  const [entity, setEntity] = useState(statement?.entity ?? '');
  const [err, setErr] = useState('');
  const save = async () => {
    if (!amount || amount <= 0) return setErr('Ingrese el importe pagado');
    await saveRecord<CardPayment>('cardPayments', { entity, statementId: statement?.id, date, month: monthOf(date), amount, source: 'manual' } as CardPayment, `Pago de resumen ${entity} (${formatARS(amount)})`);
    if (statement) {
      const db = getDb();
      await db.transaction('rw', db.obligations, () => applyStatementPayment(db, statement, amount, new Date().toISOString()));
      notify();
    }
    onClose();
  };
  return (
    <Modal title="Registrar pago de resumen" onClose={onClose} footer={<><button className="btn ghost" onClick={onClose}>Cancelar</button><button className="btn primary" onClick={save}>Guardar</button></>}>
      <p className="muted">El pago del resumen no se resta como gasto: cancela consumos y cuotas que ya fueron imputados.</p>
      <div className="form-grid">
        <Field label="Entidad">{(id) => <input id={id} value={entity} onChange={(e) => setEntity(e.target.value)} />}</Field>
        <Field label="Importe pagado" error={err}>{(id) => <MoneyInput id={id} value={amount} onChange={setAmount} />}</Field>
        <Field label="Fecha de pago">{(id) => <input id={id} type="date" value={date} onChange={(e) => setDate(e.target.value)} />}</Field>
      </div>
    </Modal>
  );
}

export function DeudasPage() {
  const narrow = useNarrow();
  const { data, today, toast } = useApp();
  const [editing, setEditing] = useState<ObDraft | null>(null);
  const [detail, setDetail] = useState<Obligation | null>(null);
  const [paying, setPaying] = useState<{ statement?: Statement } | null>(null);
  const obs = [...data.obligations].sort((a, b) => (a.nextDueMonth ?? '').localeCompare(b.nextDueMonth ?? ''));
  const statements = [...data.statements].sort((a, b) => b.month.localeCompare(a.month));
  const payments = [...data.cardPayments].sort((a, b) => b.date.localeCompare(a.date));
  const newOb = (): ObDraft => ({ entity: '', type: 'compra_cuotas', concept: '', paidInstallments: 0, frequency: 'mensual', status: 'pendiente', variableAmount: false, nextDueMonth: today });
  const now = () => new Date().toISOString();
  const payOne = async (o: Obligation) => {
    const n = o.paidInstallments + 1;
    const inst = buildSchedule(o, today).find((i) => i.n === n);
    const due = inst ? installmentDueDate(o, n, inst.month) : undefined;
    const early = !!due && due > todayIso();
    const msg = early
      ? `⚠ La cuota ${n} vence el ${formatDate(due)} y todavía no venció.\n¿Seguro que ya la pagaste (pago adelantado)?`
      : `¿Registrar el pago de la cuota ${n}${o.totalInstallments ? ` de ${o.totalInstallments}` : ''}${due ? ` (vencimiento ${formatDate(due)})` : ''}?`;
    if (!(await confirmDialog(msg, { ok: early ? 'Sí, la pagué' : 'Registrar pago', danger: early }))) return;
    await saveRecord('obligations', payNextInstallment(o, now()), `Pago de cuota ${n} de "${o.concept}"`);
    toast(`Cuota ${n} registrada como pagada. Si fue un error, use "Deshacer último pago" en Calendario.`);
  };
  const ahead = obs.filter((o) => o.status !== 'cancelada' && o.paidInstallments > installmentsDueBy(o, todayIso()));
  const fixAhead = async () => {
    const list = ahead.map((o) => `• ${o.concept}: ${o.paidInstallments} → ${installmentsDueBy(o, todayIso())} pagadas`).join('\n');
    if (!(await confirmDialog(`Se dejarán como pagadas solo las cuotas vencidas hasta hoy:\n${list}`, { ok: 'Corregir' }))) return;
    for (const o of ahead) await saveRecord('obligations', setPaidCount(o, installmentsDueBy(o, todayIso()), now(), `Corrección: pagadas: ${installmentsDueBy(o, todayIso())} (vencidas hasta hoy)`), `Corrección de cuotas pagadas de "${o.concept}"`);
    toast('Cuotas pagadas corregidas.');
  };
  const actions = (o: Obligation, st: ObligationStatus) => (
    <>
                        <button className="btn small" onClick={() => setDetail(o)}>Ver cuotas</button>
                        <button className="btn small" onClick={() => setEditing(o)}>Editar</button>
                        {st !== 'cancelada' && st !== 'pagada' && (
                          <button className="btn small ghost" onClick={async () => (await confirmDialog(`¿Cancelar "${o.concept}" desde ${monthLabel(today)}?\nLas cuotas de meses anteriores no se modifican.`, { ok: 'Cancelar obligación' })) && saveRecord('obligations', cancelObligation(o, today, now(), today), `Cancelación de "${o.concept}"`)}>
                            Cancelar
                          </button>
                        )}
                        <button className="btn small ghost danger" onClick={async () => (await confirmDialog(`¿Eliminar definitivamente "${o.concept}" y todo su calendario?`, { danger: true, ok: 'Eliminar' })) && softDelete('obligations', o.id, `Eliminación de "${o.concept}"`)}>Eliminar</button>
    </>
  );

  return (
    <div className="page">
      <div className="page-actions">
        <button className="btn primary" onClick={() => setEditing(newOb())}>+ Nueva deuda</button>
        <button className="btn" onClick={() => setPaying({})}>Registrar pago de resumen</button>
      </div>

      {ahead.length > 0 && (
        <Card className="alert" title="Hay cuotas marcadas como pagadas antes de vencer">
          <ul className="small">
            {ahead.map((o) => (
              <li key={o.id}>{o.concept}: {o.paidInstallments} pagadas, pero vencieron {installmentsDueBy(o, todayIso())} hasta hoy.</li>
            ))}
          </ul>
          <p className="small muted">Si las marcó por error, corríjalas de una vez. Si realmente pagó por adelantado, ignore este aviso.</p>
          <button className="btn primary" onClick={fixAhead}>Dejar pagadas solo las vencidas hasta hoy</button>
        </Card>
      )}
      <Card title="Préstamos, compras en cuotas y financiaciones" help="Cada deuda con sus cuotas. Tocá Ver cuotas para ver en qué cuota vas, cuánto falta o corregir una cuota que marcaste como pagada por error.">
        {obs.length > 0 && (
          <div className="ob-cards">
            {obs.map((o) => {
              const st = derivedStatus(o, today);
              const pr = obligationProgress(o, today);
              const active = st !== 'pagada' && st !== 'cancelada';
              return (
                <div key={o.id} className="ob-card" data-testid="ob-card">
                  <div className="ob-card-h">
                    <strong>{o.concept}</strong>
                    <Badge tone={STATUS_TONE[st]}>{STATUS_LABEL[st]}</Badge>
                  </div>
                  <small className="muted">{o.entity} · {OBLIGATION_TYPE_LABEL[o.type]}</small>
                  <dl className="dl">
                    {active && pr.currentN && <><dt>Vas por la cuota</dt><dd>{pr.currentN}{pr.total ? ` de ${pr.total}` : ''}</dd></>}
                    {active && <><dt>Próxima cuota{pr.nextDueDate ? ` (${formatDate(pr.nextDueDate)})` : pr.nextDueMonth ? ` (${monthLabel(pr.nextDueMonth)})` : ''}</dt><dd><Money value={pr.nextAmount} estimated={o.variableAmount} /></dd></>}
                    <dt>Falta pagar ({pr.remainingCount} cuota{pr.remainingCount === 1 ? '' : 's'})</dt><dd><Money value={pr.remainingTotal} /></dd>
                    {pr.remainingCapital !== undefined && <><dt>Capital adeudado</dt><dd><Money value={pr.remainingCapital} /></dd></>}
                    {active && pr.lastDueMonth && <><dt>Termina</dt><dd>{pr.lastDueDate ? formatDate(pr.lastDueDate) : monthLabel(pr.lastDueMonth)}</dd></>}
                  </dl>
                  {obligationIssues(o).filter((i) => i.code !== 'variable').map((i) => <small key={i.code} className="warn d-block">⚠ {i.message}</small>)}
                  <div className="row-actions">{actions(o, st)}</div>
                </div>
              );
            })}
          </div>
        )}
        {obs.length === 0 ? (
          <Empty title="No hay obligaciones registradas">Agregue compras en cuotas, Plan V, préstamos o financiaciones, o impórtelas desde un resumen.</Empty>
        ) : (
          <div className="table-wrap ob-table">
            <table>
              <thead>
                <tr><th>Concepto</th><th>Tipo</th><th>Cuotas</th><th className="num">Próxima cuota</th><th>Próximo venc.</th><th className="num">Saldo a pagar</th><th>Estado</th><th></th></tr>
              </thead>
              <tbody>
                {obs.map((o) => {
                  const st = derivedStatus(o, today);
                  const bal = computedBalance(o, today);
                  const issues = obligationIssues(o);
                  const pr = obligationProgress(o, today);
                  return (
                    <tr key={o.id}>
                      <td>
                        <strong>{o.concept}</strong>
                        <small className="muted d-block">{o.entity}</small>
                        {issues.filter((i) => i.code !== 'variable').map((i) => <small key={i.code} className="warn d-block">⚠ {i.message}</small>)}
                      </td>
                      <td>{OBLIGATION_TYPE_LABEL[o.type]}</td>
                      <td>
                        {o.paidInstallments}{o.totalInstallments ? `/${o.totalInstallments}` : '/?'} pagadas
                        {pr.currentN && st !== 'cancelada' && <small className="muted d-block">Vas por la {pr.currentN}{pr.total ? ` de ${pr.total}` : ''}</small>}
                      </td>
                      <td className="num"><Money value={st === 'pagada' || st === 'cancelada' ? o.installmentAmount : pr.nextAmount ?? o.installmentAmount} estimated={o.variableAmount} /></td>
                      <td>{st === 'pagada' || st === 'cancelada' ? '—' : pr.nextDueDate ? formatDate(pr.nextDueDate) : o.nextDueMonth ? monthLabel(o.nextDueMonth) : '—'}{pr.lastDueMonth && st !== 'pagada' && st !== 'cancelada' && <small className="muted d-block">termina {pr.lastDueDate ? formatDate(pr.lastDueDate) : monthLabel(pr.lastDueMonth)}</small>}</td>
                      <td className="num">
                        <Money value={bal.amount} estimated={bal.estimated || !bal.complete} />
                        {pr.remainingCapital !== undefined ? <small className="muted d-block">Capital: {formatARS(pr.remainingCapital)}</small> : o.knownBalance !== undefined && <small className="muted d-block">Informado: {formatARS(o.knownBalance)}</small>}
                      </td>
                      <td><Badge tone={STATUS_TONE[st]}>{STATUS_LABEL[st]}</Badge></td>
                      <td className="actions">{actions(o, st)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Resúmenes de tarjeta" help="Los resúmenes que subiste: total a pagar, vencimiento y si ya está pagado. El total no se suma como deuda nueva: los consumos y cuotas ya se cuentan por separado.">
        {statements.length === 0 ? (
          <Empty title="Sin resúmenes registrados">Los resúmenes se registran al importar un documento.</Empty>
        ) : narrow ? (
          <ul className="exp-list">
            {statements.map((s) => {
              const paid = data.cardPayments.filter((p) => p.statementId === s.id).reduce((a, p) => a + p.amount, 0);
              return (
                <li key={s.id} className="exp-item">
                  <div className="exp-top">
                    <span className="exp-concept">{s.entity} · {monthLabel(s.month)}</span>
                    <Money value={s.total} className="exp-amount" />
                  </div>
                  <div className="exp-sub">
                    Vence {formatDate(s.dueDate)} · cerró {formatDate(s.closingDate)}
                    {s.minimumPayment !== undefined && <> · mínimo <Money value={s.minimumPayment} /></>}
                  </div>
                  <div className="exp-foot">
                    <span className="exp-badges">
                      {s.total !== undefined && s.total <= 0 ? <Badge tone="ok">Nada para pagar</Badge> : paid ? <Badge tone={s.total && paid >= s.total ? 'ok' : 'warn'}>Pagado {formatARS(paid)}</Badge> : <Badge tone="warn">Sin pago</Badge>}
                    </span>
                    <span className="exp-acts">
                      <button className="btn small ghost" onClick={() => setPaying({ statement: s })}>Registrar pago</button>
                      <button className="btn small ghost danger" aria-label={`Eliminar resumen de ${s.entity}`} onClick={async () => (await confirmDialog('¿Eliminar este resumen? (no elimina los gastos ni cuotas importados)', { danger: true, ok: 'Eliminar' })) && softDelete('statements', s.id, `Eliminación de resumen ${s.entity}`)}>✕</button>
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Entidad</th><th>Mes</th><th>Cierre</th><th>Vencimiento</th><th className="num">Total a pagar</th><th className="num">Pago mínimo</th><th>Pago</th><th></th></tr></thead>
              <tbody>
                {statements.map((s) => {
                  const paid = data.cardPayments.filter((p) => p.statementId === s.id).reduce((a, p) => a + p.amount, 0);
                  return (
                    <tr key={s.id}>
                      <td>{s.entity}</td>
                      <td>{monthLabel(s.month)}</td>
                      <td>{formatDate(s.closingDate)}</td>
                      <td>{formatDate(s.dueDate)}</td>
                      <td className="num"><Money value={s.total} /></td>
                      <td className="num"><Money value={s.minimumPayment} /></td>
                      <td>{paid ? <Badge tone={s.total && paid >= s.total ? 'ok' : 'warn'}>{formatARS(paid)}</Badge> : <Badge tone="warn">Sin pago</Badge>}</td>
                      <td className="actions">
                        <button className="btn small" onClick={() => setPaying({ statement: s })}>Registrar pago</button>
                        <button className="btn small ghost danger" onClick={async () => (await confirmDialog('¿Eliminar este resumen? (no elimina los gastos ni cuotas importados)', { danger: true, ok: 'Eliminar' })) && softDelete('statements', s.id, `Eliminación de resumen ${s.entity}`)}>Eliminar</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Pagos de resúmenes registrados" help="Los pagos de tarjeta que se registraron, desde la captura del banco o con Ya lo pagué. No se cuentan como gasto: el gasto son las compras del resumen.">
        {payments.length === 0 ? (
          <Empty title="Sin pagos registrados" />
        ) : (
          <ul className="list">
            {payments.map((p) => (
              <li key={p.id}>
                <span>{formatDate(p.date)} · {p.entity} {p.source === 'importado' && <Badge tone="neutral">importado</Badge>}</span>
                <span><Money value={p.amount} /> <button className="btn small ghost danger" onClick={async () => (await confirmDialog('¿Eliminar este pago?', { danger: true, ok: 'Eliminar' })) && softDelete('cardPayments', p.id, 'Eliminación de pago de resumen')}>✕</button></span>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {editing && <ObligationForm initial={editing} onClose={() => setEditing(null)} />}
      {detail && <ObligationDetail ob={detail} onClose={() => setDetail(null)} onPay={(o) => { setDetail(null); payOne(o); }} />}
      {paying && <PaymentForm statement={paying.statement} onClose={() => setPaying(null)} />}
    </div>
  );
}
