import { monthLabel, monthOf } from '../../domain/dates';
import { sum } from '../../domain/money';
import { setSharedMe, type SharedReview } from '../../importers/sharedSheet';
import { Badge, Card, Help, Money, Warnings } from '../components/ui';

const pctText = (p: number) => `${p.toLocaleString('es-AR', { maximumFractionDigits: 1 })} %`;

/** Revisión de una planilla de gastos compartidos antes de incorporarla. */
export function SharedReviewView({ review, setReview, onConfirm, onCancel, error }: { review: SharedReview; setReview: (r: SharedReview) => void; onConfirm: () => void; onCancel: () => void; error: string }) {
  const partner = review.sheet.people.find((p) => p !== review.me) ?? 'tu pareja';
  const included = review.rows.filter((r) => r.include);
  const months = [...new Set(review.rows.map((r) => r.month))];
  const current = months.find((m) => m <= monthOf(new Date().toISOString())) ?? months[0];
  const toggle = (key: string, include: boolean) => setReview({ ...review, rows: review.rows.map((r) => (r.key === key ? { ...r, include } : r)) });
  return (
    <>
      <Card
        title="Planilla de gastos compartidos"
        actions={<button className="btn small ghost" onClick={onCancel}>Cancelar</button>}
        help={<><p>Cada gasto de la planilla se carga en su mes.</p><ul><li><strong>Compartidos</strong> (alquiler, luz, gas, internet): se guarda el total de la factura y tu parte. Solo tu parte cuenta como gasto tuyo.</li><li><strong>Solo tuyos</strong> (como el consultorio): se cargan enteros.</li></ul><p>Si volvés a subir la planilla con meses nuevos o importes cambiados, se actualiza sin duplicar.</p></>}
      >
        <Warnings items={review.warnings} />
        <p className="muted small">{review.file.name} · {review.sheet.groups.length} gastos · {months.length} meses de {review.sheet.year}</p>
        <div className="who" data-testid="planilla-quien">
          <strong>¿Quién sos vos en la planilla?</strong>
          <div className="row-actions" style={{ justifyContent: 'flex-start' }}>
            {review.sheet.people.map((p) => (
              <button key={p} className={`btn ${review.me === p ? 'primary' : ''}`} aria-pressed={review.me === p} onClick={async () => setReview(await setSharedMe(review, p))}>
                {review.me === p ? '✓ ' : ''}{p}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {review.me && (
        <>
          <Card title="Qué se va a cargar">
            <ul className="list" data-testid="planilla-resumen">
              <li><span>Tu parte de los gastos compartidos (pagados por {partner})</span><Money value={sum(included.filter((r) => r.kind === 'hogar').map((r) => r.user))} /></li>
              <li><span>Gastos solo tuyos</span><Money value={sum(included.filter((r) => r.kind !== 'hogar').map((r) => r.user))} /></li>
            </ul>
            {review.skipped.length > 0 && (
              <div className="small muted">
                <p style={{ margin: '0.5rem 0 0.25rem' }}>No se cargan:</p>
                <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>{review.skipped.map((s) => <li key={s}>{s}</li>)}</ul>
              </div>
            )}
          </Card>
          {months.map((m) => {
            const rows = review.rows.filter((r) => r.month === m);
            const inc = rows.filter((r) => r.include);
            return (
            <details key={m} className="card month-fold" open={m === current}>
              <summary>
                <strong>{monthLabel(m)}</strong>
                <span className="muted small">{inc.length} de {rows.length} · tu parte <Money value={sum(inc.map((r) => r.user))} /></span>
              </summary>
              <ul className="exp-list">
                {review.rows.filter((r) => r.month === m).map((r) => (
                  <li key={r.key} className="exp-item">
                    <div className="exp-top">
                      <label className="check" style={{ margin: 0 }}>
                        <input type="checkbox" checked={r.include} onChange={(e) => toggle(r.key, e.target.checked)} aria-label={`Cargar ${r.concept} de ${monthLabel(m)}`} />
                        <span className="exp-concept">{r.concept}</span>
                      </label>
                      <Money value={r.user} className="exp-amount" />
                    </div>
                    <div className="exp-sub">
                      {r.kind === 'hogar' ? <>Total <Money value={r.total} /> · tu parte {pctText(r.userPct)}</> : 'Solo tuyo'} · {r.category}
                    </div>
                    {(r.note || r.existing) && (
                      <div className="exp-foot">
                        <span className="exp-badges">{r.existing && <Badge tone="info">{r.note === 'Ya estaba cargado.' ? 'Ya cargado' : 'Se actualiza'}</Badge>}</span>
                        {r.note && r.note !== 'Ya estaba cargado.' && !r.note.startsWith('Ya estaba cargado con') && <small className="muted" style={{ flexBasis: '100%' }}>{r.note}</small>}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </details>
            );
          })}
        </>
      )}
      <Card className="sticky-foot">
        {error && <p className="err">{error}</p>}
        <div className="row-actions">
          <span className="muted inline-help">
            {included.length} gasto(s) · tu parte <Money value={sum(included.map((r) => r.user))} />
            <Help label="Qué se suma">Es lo que vas a ver como gasto tuyo en cada mes. En los compartidos se cuenta solo tu parte, no la factura entera.</Help>
          </span>
          <button className="btn ghost" onClick={onCancel}>Cancelar</button>
          <button className="btn primary" disabled={!review.me || !included.length} onClick={onConfirm}>Incorporar gastos</button>
        </div>
      </Card>
    </>
  );
}
