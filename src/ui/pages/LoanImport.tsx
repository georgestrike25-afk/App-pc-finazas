import { useApp } from '../store';
import { formatDate } from '../../domain/dates';
import type { LoanReview } from '../../importers/loanReview';
import { loanReviewSummary } from '../../importers/loanReview';
import { Badge, Card, Field, Money, Warnings } from '../components/ui';

/** Revisión de un cronograma de préstamo antes de incorporarlo. */
export function LoanReviewView({ review, setReview, onConfirm, onCancel, error }: { review: LoanReview; setReview: (r: LoanReview) => void; onConfirm: () => void; onCancel: () => void; error: string }) {
  const { data } = useApp();
  const sm = loanReviewSummary(review);
  return (
    <>
      <Card title="Cronograma de préstamo" actions={<button className="btn small ghost" onClick={onCancel}>Cancelar</button>}>
        <Warnings items={review.warnings} />
        <div className="form-grid">
          <Field label="Entidad" hint={review.entityInferred ? 'No figura en el documento: verifíquela.' : undefined}>
            {(id) => (
              <>
                <input id={id} list="entities-loan" value={review.entity} onChange={(e) => setReview({ ...review, entity: e.target.value, entityInferred: false })} />
                <datalist id="entities-loan">{[...new Set(['Banco Patagonia', ...data.obligations.map((o) => o.entity)])].map((x) => <option key={x} value={x} />)}</datalist>
              </>
            )}
          </Field>
          <Field label="Concepto">{(id) => <input id={id} value={review.concept} onChange={(e) => setReview({ ...review, concept: e.target.value })} />}</Field>
        </div>
        <div className="kpis">
          <div className="kpi"><span>Vas por la cuota</span><strong className="big">{sm.nextRow ? `${sm.nextRow.n} de ${sm.totalInstallments}` : 'Préstamo pagado'}</strong>{sm.nextRow && <small className="muted">vence el {formatDate(sm.nextRow.dueDate)}</small>}</div>
          <div className="kpi"><span>Próxima cuota</span><Money value={sm.nextRow?.total ?? 0} /></div>
          <div className="kpi"><span>Cuotas pagadas</span><strong className="big">{sm.paidCount} de {sm.totalInstallments}</strong></div>
          <div className="kpi"><span>Total que falta pagar</span><Money value={sm.remainingTotal} /><small className="muted">{sm.totalInstallments - sm.paidCount} cuota(s)</small></div>
          {sm.remainingCapital !== undefined && <div className="kpi"><span>Capital adeudado</span><Money value={sm.remainingCapital} /></div>}
          {sm.remainingInterestAndTaxes !== undefined && <div className="kpi"><span>Intereses e impuestos que faltan</span><Money value={sm.remainingInterestAndTaxes} /></div>}
          {sm.originalCapital !== undefined && <div className="kpi"><span>Capital del préstamo</span><Money value={sm.originalCapital} /></div>}
          <div className="kpi"><span>Última cuota</span><strong className="big">{formatDate(sm.lastRow.dueDate)}</strong></div>
        </div>
        {sm.overdue.length > 0 && <p className="err">⚠ {sm.overdue.length} cuota(s) vencida(s) sin pagar según el cronograma.</p>}
      </Card>
      <Card title={`Cuotas (${review.rows.length})`}>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Cuota</th><th>Vencimiento</th>{review.rows.some((r) => r.capital !== undefined) && <th className="num">Capital</th>}<th className="num">Total</th><th>Estado</th></tr></thead>
            <tbody>
              {review.rows.map((r) => (
                <tr key={r.n} className={r.status === 'pagada' ? 'dim' : ''}>
                  <td>{r.n}</td>
                  <td>{formatDate(r.dueDate)}</td>
                  {r.capital !== undefined && <td className="num"><Money value={r.capital} /></td>}
                  <td className="num"><Money value={r.total} /></td>
                  <td>
                    <select aria-label={`Estado cuota ${r.n}`} value={r.status} onChange={(e) => setReview({ ...review, rows: review.rows.map((x) => (x.n === r.n ? { ...x, status: e.target.value as typeof r.status } : x)) })}>
                      <option value="pagada">Pagada</option>
                      <option value="pendiente">Pendiente</option>
                      <option value="vencida">Vencida</option>
                    </select>
                    {r.n === sm.nextRow?.n && <Badge tone="info">próxima</Badge>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="small muted">Cada cuota se registra con su importe exacto del cronograma. El capital "no incluye impuestos" según el banco; el total sí.</p>
      </Card>
      <Card className="sticky-foot">
        {error && <p className="err">{error}</p>}
        <div className="row-actions">
          <span className="muted">{review.existing ? 'Se actualizará el préstamo existente' : 'Se creará un préstamo nuevo'} · {sm.totalInstallments - sm.paidCount} cuota(s) pendientes</span>
          <button className="btn ghost" onClick={onCancel}>Cancelar</button>
          <button className="btn primary" onClick={onConfirm}>{review.existing ? 'Actualizar préstamo' : 'Incorporar préstamo'}</button>
        </div>
      </Card>
    </>
  );
}
