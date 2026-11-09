import { formatDate, monthLabel, todayIso } from '../../domain/dates';
import { sum } from '../../domain/money';
import type { MpReview } from '../../importers/mpReview';
import { Badge, Card, Money, Warnings } from '../components/ui';

/** Revisión de las pantallas de Mercado Pago (créditos y tarjeta) antes de corregir lo que tenía la app. */
export function MpReviewView({ review, setReview, error, onCancel, onConfirm }: { review: MpReview; setReview: (r: MpReview) => void; error: string; onCancel: () => void; onConfirm: () => void }) {
  const r = review;
  const byDue = new Map<string, number>();
  for (const c of r.credits) if (c.due) byDue.set(c.due, (byDue.get(c.due) ?? 0) + c.installment);
  const lp = r.loansPlan;
  return (
    <div className="mp-review">
      <Warnings items={r.warnings} />
      {r.credits.length > 0 && (
        <Card title="Créditos de Mercado Pago">
          <p className="muted small">Cada crédito queda como una deuda aparte, con las cuotas que ya pagaste según Mercado Pago.</p>
          <ul className="mp-list">
            {r.credits.map((c) => {
              const paid = c.nextN - 1;
              const before = c.existing?.paidInstallments;
              return (
                <li key={c.requestedOn}>
                  <div className="mp-head">
                    <strong>{c.concept}</strong>
                    {c.existing ? (before === paid ? <Badge tone="ok">Ya estaba bien</Badge> : <Badge tone="warn">En la app: {before} pagadas → {paid}</Badge>) : <Badge tone="info">Nuevo</Badge>}
                  </div>
                  <ul className="answer-lines">
                    <li><span>Ya pagaste</span><span>{paid} de {c.totalN} cuotas{c.paidAmount !== undefined && <> · <Money value={c.paidAmount} /></>}</span></li>
                    <li><span>Próxima: cuota {c.nextN}{c.due ? `, vence el ${formatDate(c.due)}` : ''}</span><Money value={c.installment} /></li>
                    {c.remaining !== undefined && <li><span>Falta pagar</span><Money value={c.remaining} /></li>}
                  </ul>
                </li>
              );
            })}
          </ul>
          {[...byDue.entries()].map(([due, total]) => (
            <p key={due} className="mp-total"><span>Total que vence el {formatDate(due)}</span><Money value={total} /></p>
          ))}
          <p className="mp-total muted"><span>Te falta pagar de todos los créditos</span><Money value={sum(r.credits.map((c) => c.remaining ?? 0))} /></p>
        </Card>
      )}
      {(lp || r.card.length > 0) && (
        <Card title="Lo que tenía la app y cómo queda">
          <ul className="mp-fix">
            {lp && (
              <li>
                <strong>{lp.ob.concept}</strong>
                <span className="muted small d-block">
                  Juntaba todos los préstamos en una sola deuda.
                  {lp.month && <> La cuota de {monthLabel(r.today).toLowerCase()} (<Money value={lp.month.amount} />) figuraba {lp.month.paid ? 'pagada' : 'sin pagar'}.</>}
                  {' '}Se reemplaza por los {r.credits.length} créditos de arriba.
                </span>
              </li>
            )}
            {r.card.map((m) => (
              <li key={m.month}>
                <strong>Tarjeta · {monthLabel(m.month)}</strong> <Money value={m.total} />
                <span className="muted small d-block">
                  {m.closing === todayIso() ? 'Cierra hoy' : m.closing ? `Cierra el ${formatDate(m.closing)}` : ''}{m.closing ? ' · ' : ''}vence el {formatDate(m.due)}.{' '}
                  {m.before ? (
                    <>En la app: <Money value={m.before.amount} />{m.before.paid ? ', marcada como pagada' : ', sin pagar'}. {m.before.paid ? 'Queda sin pagar (en Mercado Pago todavía no se pagó).' : m.before.amount !== m.total ? 'Se corrige el total.' : ''}</>
                  ) : (
                    'No estaba en la app: se agrega.'
                  )}
                </span>
              </li>
            ))}
          </ul>
          {r.unpaidInApp !== undefined && (
            <label className="check mp-pay">
              <input type="checkbox" checked={r.payMonth} onChange={(e) => setReview({ ...r, payMonth: e.target.checked })} />
              <span>
                Ya me cobraron las cuotas de {monthLabel(r.today).toLowerCase()} (<Money value={r.unpaidInApp} />): bajarlas de la plata hasta cobrar.
                <small className="muted d-block">Mercado Pago ya las cobró, pero en la app no estaban marcadas como pagadas. Tildalo si no las descontaste a mano.</small>
              </span>
            </label>
          )}
        </Card>
      )}
      {error && <p className="err">{error}</p>}
      <div className="page-actions">
        <button className="btn ghost" onClick={onCancel}>Cancelar</button>
        <button className="btn primary" onClick={onConfirm}>Corregir Mercado Pago</button>
      </div>
    </div>
  );
}
