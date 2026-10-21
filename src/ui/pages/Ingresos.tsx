import { useMemo, useState } from 'react';
import { useApp } from '../store';
import { saveRecord, softDelete } from '../../db/repo';
import { incomeNet, reviseIncome } from '../../domain/income';
import { addMonths, formatDate, monthLabel, monthShort, todayIso, type MonthKey } from '../../domain/dates';
import { formatARS, type Cents } from '../../domain/money';
import type { Income, IncomeLine } from '../../domain/types';
import { Badge, BarChart, Card, confirmDialog, Empty, Field, Modal, Money, MoneyInput, MonthSelect } from '../components/ui';

type Draft = Omit<Income, 'id' | 'createdAt' | 'updatedAt' | 'revisions'> & { id?: string };

function LinesEditor({ title, lines, onChange }: { title: string; lines: IncomeLine[]; onChange: (l: IncomeLine[]) => void }) {
  return (
    <fieldset className="lines-ed">
      <legend>{title}</legend>
      {lines.map((l, i) => (
        <div key={i} className="row">
          <input aria-label="Concepto" placeholder="Concepto" value={l.concept} onChange={(e) => onChange(lines.map((x, j) => (j === i ? { ...x, concept: e.target.value } : x)))} />
          <MoneyInput value={l.amount} onChange={(v) => onChange(lines.map((x, j) => (j === i ? { ...x, amount: v ?? 0 } : x)))} />
          <button type="button" className="btn ghost icon" aria-label="Quitar" onClick={() => onChange(lines.filter((_, j) => j !== i))}>✕</button>
        </div>
      ))}
      <button type="button" className="btn small" onClick={() => onChange([...lines, { concept: '', amount: 0 }])}>+ Agregar</button>
    </fieldset>
  );
}

export function IncomeForm({ initial, onClose }: { initial: Draft; onClose: () => void }) {
  const { data, toast } = useApp();
  const [d, setD] = useState<Draft>(initial);
  const [err, setErr] = useState('');
  const save = async () => {
    if (d.amountReceived === undefined || d.amountReceived < 0) return setErr('Ingrese el importe (puede ser 0).');
    const existing = d.id ? data.incomes.find((i) => i.id === d.id) : undefined;
    const clean = { ...d, extras: d.extras.filter((x) => x.amount || x.concept), deductions: d.deductions.filter((x) => x.amount || x.concept) };
    const rec = existing ? reviseIncome(existing, clean, new Date().toISOString()) : { ...clean, revisions: [] };
    await saveRecord<Income>('incomes', rec, `${existing ? 'Modificación' : 'Registro'} de ingreso de ${monthLabel(d.month)}`);
    toast('Ingreso guardado');
    onClose();
  };
  return (
    <Modal
      title={d.id ? 'Editar ingreso' : 'Registrar ingreso'}
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>Cancelar</button>
          <button className="btn primary" onClick={save}>Guardar</button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="Mes">{(id) => <MonthSelect id={id} value={d.month} onChange={(month) => setD({ ...d, month })} />}</Field>
        <Field label="Estado" hint="Confirmado = efectivamente cobrado. Estimado = previsto, no se suma como cobrado.">
          {(id) => (
            <select id={id} value={d.status} onChange={(e) => setD({ ...d, status: e.target.value as Income['status'] })}>
              <option value="confirmado">Confirmado (cobrado)</option>
              <option value="estimado">Estimado</option>
            </select>
          )}
        </Field>
        <Field label={d.status === 'confirmado' ? 'Ingreso efectivamente cobrado' : 'Ingreso estimado'} error={err}>
          {(id) => <MoneyInput id={id} name="amountReceived" value={d.amountReceived} onChange={(v) => setD({ ...d, amountReceived: v ?? 0 })} required />}
        </Field>
        <Field label="Fecha de cobro">{(id) => <input id={id} type="date" value={d.receivedDate ?? ''} onChange={(e) => setD({ ...d, receivedDate: e.target.value || undefined })} />}</Field>
      </div>
      <LinesEditor title="Ingresos adicionales" lines={d.extras} onChange={(extras) => setD({ ...d, extras })} />
      <LinesEditor title="Descuentos o deducciones" lines={d.deductions} onChange={(deductions) => setD({ ...d, deductions })} />
      <Field label="Observaciones">{(id) => <textarea id={id} rows={2} value={d.notes ?? ''} onChange={(e) => setD({ ...d, notes: e.target.value })} />}</Field>
      <p className="total-line">Ingreso total neto disponible: <strong>{formatARS(incomeNet(d))}</strong></p>
    </Modal>
  );
}

export function IngresosPage() {
  const { data, today } = useApp();
  const [editing, setEditing] = useState<Draft | null>(null);
  const [history, setHistory] = useState<Income | null>(null);
  const sorted = useMemo(() => [...data.incomes].sort((a, b) => b.month.localeCompare(a.month)), [data.incomes]);
  const months: MonthKey[] = Array.from({ length: 12 }, (_, i) => addMonths(today, i - 11));
  const byMonth = (m: MonthKey) => data.incomes.filter((i) => i.month === m);
  const chart = months.map((m) => {
    const recs = byMonth(m);
    const conf = recs.filter((r) => r.status === 'confirmado');
    const est = recs.filter((r) => r.status === 'estimado');
    return {
      label: monthShort(m),
      values: [
        { name: 'Cobrado', value: conf.reduce((a, r) => a + incomeNet(r), 0), color: 'var(--c-income)' },
        { name: 'Estimado', value: est.reduce((a, r) => a + incomeNet(r), 0), color: 'var(--c-est)', estimated: true },
      ],
    };
  });
  const newDraft = (month: MonthKey = today): Draft => ({ month, status: 'confirmado', amountReceived: undefined as unknown as Cents, receivedDate: todayIso(), extras: [], deductions: [] });

  return (
    <div className="page">
      <div className="page-actions">
        <button className="btn primary" onClick={() => setEditing(newDraft())}>+ Registrar ingreso</button>
      </div>
      <Card title="Evolución mensual (últimos 12 meses)">
        <BarChart data={chart} ariaLabel="Evolución de ingresos" />
        <div className="month-status">
          {months.map((m) => {
            const recs = byMonth(m);
            const st = recs.some((r) => r.status === 'confirmado') ? 'confirmado' : recs.length ? 'estimado' : 'sin_cargar';
            return (
              <button key={m} className={`chip chip-${st}`} onClick={() => (recs[0] ? setEditing(recs[0]) : setEditing(newDraft(m)))} title={monthLabel(m)}>
                {monthShort(m)} · {st === 'confirmado' ? 'Confirmado' : st === 'estimado' ? 'Estimado' : 'Sin cargar'}
              </button>
            );
          })}
        </div>
        <p className="muted small">El ingreso de un mes nunca se copia automáticamente al siguiente.</p>
      </Card>
      <Card title="Registros" help="Un registro por mes. El sueldo se carga solo cuando subís la captura de los movimientos del banco; también lo podés cargar a mano.">
        {sorted.length === 0 ? (
          <Empty title="Todavía no hay ingresos registrados" action={<button className="btn primary" onClick={() => setEditing(newDraft())}>Registrar el primer ingreso</button>}>
            Cargue el ingreso efectivamente cobrado de cada mes. Puede registrar también estimaciones, que se muestran por separado.
          </Empty>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Mes</th><th>Estado</th><th>Cobro</th><th className="num">Principal</th><th className="num">Adicionales</th><th className="num">Deducciones</th><th className="num">Neto</th><th></th></tr>
              </thead>
              <tbody>
                {sorted.map((i) => (
                  <tr key={i.id}>
                    <td>{monthLabel(i.month)}</td>
                    <td><Badge tone={i.status === 'confirmado' ? 'ok' : 'est'}>{i.status === 'confirmado' ? 'Confirmado' : 'Estimado'}</Badge></td>
                    <td>{formatDate(i.receivedDate)}</td>
                    <td className="num"><Money value={i.amountReceived} /></td>
                    <td className="num"><Money value={i.extras.reduce((a, x) => a + x.amount, 0)} /></td>
                    <td className="num"><Money value={i.deductions.reduce((a, x) => a + x.amount, 0)} /></td>
                    <td className="num"><strong><Money value={incomeNet(i)} /></strong></td>
                    <td className="actions">
                      <button className="btn small" onClick={() => setEditing(i)}>Editar</button>
                      {i.revisions.length > 0 && <button className="btn small ghost" onClick={() => setHistory(i)}>Historial ({i.revisions.length})</button>}
                      <button
                        className="btn small ghost danger"
                        onClick={async () => (await confirmDialog(`¿Eliminar el ingreso de ${monthLabel(i.month)}?`, { danger: true, ok: 'Eliminar' })) && softDelete('incomes', i.id, `Eliminación de ingreso de ${monthLabel(i.month)}`)}
                      >
                        Eliminar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {editing && <IncomeForm initial={editing} onClose={() => setEditing(null)} />}
      {history && (
        <Modal title={`Historial de ${monthLabel(history.month)}`} onClose={() => setHistory(null)}>
          <ul className="timeline">
            {[...history.revisions].reverse().map((r, i) => (
              <li key={i}>
                <strong>{new Date(r.at).toLocaleString('es-AR')}</strong> — versión anterior: {r.snapshot.status}, neto {formatARS(incomeNet(r.snapshot))}
                {r.snapshot.notes ? ` · ${r.snapshot.notes}` : ''}
              </li>
            ))}
          </ul>
        </Modal>
      )}
    </div>
  );
}
