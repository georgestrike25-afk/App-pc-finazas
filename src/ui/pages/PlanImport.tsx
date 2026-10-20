import { monthLabel } from '../../domain/dates';
import { OBLIGATION_TYPE_LABEL } from '../../domain/obligations';
import type { PlanReview } from '../../importers/planReview';
import { sum } from '../../domain/money';
import type { ObligationType } from '../../domain/types';
import { Card, Field, Money, Warnings } from '../components/ui';

/** Revisión de un plan de pagos mensual (p. ej. Mercado Pago) antes de incorporarlo. */
export function PlanReviewView({ review, setReview, onConfirm, onCancel, error }: { review: PlanReview; setReview: (r: PlanReview) => void; onConfirm: () => void; onCancel: () => void; error: string }) {
  const p = review.plan;
  const ok = p.declaredTotal === undefined || Math.abs(p.declaredTotal - p.computedTotal) <= 1;
  const included = review.categories.filter((c) => c.include);
  return (
    <>
      <Card title="Plan de pagos" actions={<button className="btn small ghost" onClick={onCancel}>Cancelar</button>}>
        <Warnings items={review.warnings} />
        <Field label="Entidad">{(id) => <input id={id} value={review.entity} onChange={(e) => setReview({ ...review, entity: e.target.value })} />}</Field>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Mes</th>{p.categories.map((c) => <th key={c} className="num">{c}</th>)}<th className="num">Total del mes</th></tr></thead>
            <tbody>
              {p.months.map((m) => (
                <tr key={m.month}>
                  <td>{monthLabel(m.month)}</td>
                  {p.categories.map((c) => <td key={c} className="num"><Money value={m.parts[c] ?? (c === 'Total' ? m.total : 0)} /></td>)}
                  <td className="num"><strong><Money value={m.total} /></strong></td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr><td>Total</td>{p.categories.map((c) => <td key={c} className="num"><Money value={sum(p.months.map((m) => m.parts[c] ?? (c === 'Total' ? m.total : 0)))} /></td>)}<td className="num"><Money value={p.computedTotal} /></td></tr></tfoot>
          </table>
        </div>
        {p.declaredTotal !== undefined && (
          <p className={ok ? 'ok-text' : 'warn'} data-testid="verif-plan">
            {ok ? '✓' : '⚠'} Suma de los meses <Money value={p.computedTotal} /> · total del plan informado <Money value={p.declaredTotal} />{ok ? ' — coincide.' : ' — no coincide: revise los importes.'}
          </p>
        )}
      </Card>
      <Card title="Deudas que se registrarán">
        {review.categories.map((c, i) => (
          <div key={c.name} className="rv-item">
            <label className="check"><input type="checkbox" checked={c.include} onChange={(e) => setReview({ ...review, categories: review.categories.map((x, j) => (j === i ? { ...x, include: e.target.checked } : x)) })} /> <strong>{c.concept}</strong></label>
            <div className="rv-grid">
              <Field label="Concepto">{(id) => <input id={id} value={c.concept} onChange={(e) => setReview({ ...review, categories: review.categories.map((x, j) => (j === i ? { ...x, concept: e.target.value } : x)) })} />}</Field>
              <Field label="Tipo">
                {(id) => (
                  <select id={id} value={c.type} onChange={(e) => setReview({ ...review, categories: review.categories.map((x, j) => (j === i ? { ...x, type: e.target.value as ObligationType } : x)) })}>
                    {Object.entries(OBLIGATION_TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                )}
              </Field>
            </div>
            <p className="small muted">
              {c.amounts.length} pago(s) mensual(es) de {monthLabel(c.amounts[0].month)} a {monthLabel(c.amounts[c.amounts.length - 1].month)} · total <Money value={sum(c.amounts.map((a) => a.amount))} />
              {c.existing ? ' · actualiza la deuda ya cargada' : ''}
            </p>
          </div>
        ))}
      </Card>
      <Card className="sticky-foot">
        {error && <p className="err">{error}</p>}
        <div className="row-actions">
          <span className="muted">{included.length} deuda(s) · total <Money value={sum(included.flatMap((c) => c.amounts.map((a) => a.amount)))} /></span>
          <button className="btn ghost" onClick={onCancel}>Cancelar</button>
          <button className="btn primary" disabled={!included.length} onClick={onConfirm}>Incorporar plan</button>
        </div>
      </Card>
    </>
  );
}
