import { useState } from 'react';
import { useApp } from '../store';
import { saveRecord, softDelete } from '../../db/repo';
import {
  buildSchedule,
  cancelObligation,
  computedBalance,
  derivedStatus,
  obligationIssues,
  OBLIGATION_TYPE_LABEL,
  payNextInstallment,
  reviseObligation,
} from '../../domain/obligations';
import { formatDate, monthLabel, monthOf, todayIso, type MonthKey } from '../../domain/dates';
import { formatARS, type Cents } from '../../domain/money';
import type { CardPayment, Obligation, ObligationStatus, ObligationType, Statement } from '../../domain/types';
import { Badge, Card, confirmDialog, Empty, Field, Modal, Money, MoneyInput, MonthSelect, Warnings } from '../components/ui';

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
    const rec = existing ? reviseObligation(existing, d, effectiveFrom, 'Edición manual', now, today) : { ...d, revisions: [] };
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
        <Field label="Saldo pendiente conocido (opcional)" hint="Informado por la entidad.">{(id) => <MoneyInput id={id} value={d.knownBalance} onChange={(v) => setD({ ...d, knownBalance: v })} />}</Field>
        <Field label="Fecha de origen">{(id) => <input id={id} type="date" value={d.originDate ?? ''} onChange={(e) => setD({ ...d, originDate: e.target.value || undefined })} />}</Field>
        <Field label="Cantidad total de cuotas" hint="Vacío si se desconoce (la proyección será estimada).">{(id) => <input id={id} name="totalInstallments" type="number" min={1} value={d.totalInstallments ?? ''} onChange={(e) => setD({ ...d, totalInstallments: num(e.target.value) })} />}</Field>
        <Field label="Cuotas ya pagadas" error={errors.paid}>{(id) => <input id={id} name="paidInstallments" type="number" min={0} value={d.paidInstallments} onChange={(e) => setD({ ...d, paidInstallments: num(e.target.value) ?? 0 })} />}</Field>
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
        <Field label="Los cambios de importe o calendario rigen desde" hint="Las cuotas de meses anteriores conservan su importe (no se alteran en silencio).">
          {(id) => <MonthSelect id={id} value={effectiveFrom} onChange={setEffectiveFrom} />}
        </Field>
      )}
      <Field label="Observaciones">{(id) => <textarea id={id} rows={2} value={d.notes ?? ''} onChange={(e) => setD({ ...d, notes: e.target.value })} />}</Field>
    </Modal>
  );
}

function ObligationDetail({ ob, onClose }: { ob: Obligation; onClose: () => void }) {
  const { today } = useApp();
  const sched = buildSchedule(ob, today);
  return (
    <Modal title={ob.concept} onClose={onClose} wide>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Cuota</th><th>Mes</th><th className="num">Importe</th><th>Estado</th></tr></thead>
          <tbody>
            {sched.map((i) => (
              <tr key={i.n} className={i.status === 'cancelada' ? 'dim' : ''}>
                <td>{i.n}{i.total ? `/${i.total}` : ''}</td>
                <td>{monthLabel(i.month)}</td>
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
  const { data, today } = useApp();
  const [editing, setEditing] = useState<ObDraft | null>(null);
  const [detail, setDetail] = useState<Obligation | null>(null);
  const [paying, setPaying] = useState<{ statement?: Statement } | null>(null);
  const obs = [...data.obligations].sort((a, b) => (a.nextDueMonth ?? '').localeCompare(b.nextDueMonth ?? ''));
  const statements = [...data.statements].sort((a, b) => b.month.localeCompare(a.month));
  const payments = [...data.cardPayments].sort((a, b) => b.date.localeCompare(a.date));
  const newOb = (): ObDraft => ({ entity: '', type: 'compra_cuotas', concept: '', paidInstallments: 0, frequency: 'mensual', status: 'pendiente', variableAmount: false, nextDueMonth: today });
  const now = () => new Date().toISOString();

  return (
    <div className="page">
      <div className="page-actions">
        <button className="btn primary" onClick={() => setEditing(newOb())}>+ Nueva obligación</button>
        <button className="btn" onClick={() => setPaying({})}>Registrar pago de resumen</button>
        <a className="btn" href="#/importar">Importar resumen</a>
      </div>

      <Card title="Préstamos, compras en cuotas y financiaciones">
        {obs.length === 0 ? (
          <Empty title="No hay obligaciones registradas">Agregue compras en cuotas, Plan V, préstamos o financiaciones, o impórtelas desde un resumen.</Empty>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Concepto</th><th>Tipo</th><th>Cuotas</th><th className="num">Cuota</th><th>Próximo venc.</th><th className="num">Saldo a pagar</th><th>Estado</th><th></th></tr>
              </thead>
              <tbody>
                {obs.map((o) => {
                  const st = derivedStatus(o, today);
                  const bal = computedBalance(o, today);
                  const issues = obligationIssues(o);
                  return (
                    <tr key={o.id}>
                      <td>
                        <strong>{o.concept}</strong>
                        <small className="muted d-block">{o.entity}</small>
                        {issues.filter((i) => i.code !== 'variable').map((i) => <small key={i.code} className="warn d-block">⚠ {i.message}</small>)}
                      </td>
                      <td>{OBLIGATION_TYPE_LABEL[o.type]}</td>
                      <td>{o.paidInstallments}{o.totalInstallments ? `/${o.totalInstallments}` : '/?'} pagadas</td>
                      <td className="num"><Money value={o.installmentAmount} estimated={o.variableAmount} /></td>
                      <td>{st === 'pagada' || st === 'cancelada' ? '—' : o.nextDueMonth ? monthLabel(o.nextDueMonth) : '—'}</td>
                      <td className="num">
                        <Money value={bal.amount} estimated={bal.estimated || !bal.complete} />
                        {o.knownBalance !== undefined && <small className="muted d-block">Informado: {formatARS(o.knownBalance)}</small>}
                      </td>
                      <td><Badge tone={STATUS_TONE[st]}>{STATUS_LABEL[st]}</Badge></td>
                      <td className="actions">
                        <button className="btn small" onClick={() => setDetail(o)}>Calendario</button>
                        {st !== 'pagada' && st !== 'cancelada' && o.nextDueMonth && (
                          <button className="btn small primary" onClick={async () => (await confirmDialog(`¿Registrar el pago de la cuota ${o.paidInstallments + 1}?`)) && saveRecord('obligations', payNextInstallment(o, now()), `Pago de cuota ${o.paidInstallments + 1} de "${o.concept}"`)}>
                            Pagar cuota
                          </button>
                        )}
                        <button className="btn small" onClick={() => setEditing(o)}>Editar</button>
                        {st !== 'cancelada' && st !== 'pagada' && (
                          <button className="btn small ghost" onClick={async () => (await confirmDialog(`¿Cancelar "${o.concept}" desde ${monthLabel(today)}?\nLas cuotas de meses anteriores no se modifican.`, { ok: 'Cancelar obligación' })) && saveRecord('obligations', cancelObligation(o, today, now(), today), `Cancelación de "${o.concept}"`)}>
                            Cancelar
                          </button>
                        )}
                        <button className="btn small ghost danger" onClick={async () => (await confirmDialog(`¿Eliminar definitivamente "${o.concept}" y todo su calendario?`, { danger: true, ok: 'Eliminar' })) && softDelete('obligations', o.id, `Eliminación de "${o.concept}"`)}>Eliminar</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Resúmenes de tarjeta">
        <Warnings items={statements.length ? ['El total del resumen es lo que exige la tarjeta. No se suma como deuda nueva: los consumos y cuotas ya se computan por separado.'] : []} />
        {statements.length === 0 ? (
          <Empty title="Sin resúmenes registrados">Los resúmenes se registran al importar un documento.</Empty>
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

      <Card title="Pagos de resúmenes registrados">
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
      {detail && <ObligationDetail ob={detail} onClose={() => setDetail(null)} />}
      {paying && <PaymentForm statement={paying.statement} onClose={() => setPaying(null)} />}
    </div>
  );
}
