import { useMemo } from 'react';
import { getDeviceId, notify } from '../../db/repo';
import { getDb } from '../../db/db';
import { payEntityMonth } from '../../db/cardPayments';
import { formatARS } from '../../domain/money';
import { useApp } from '../store';
import { addMonths, formatDate, monthLabel, monthShort, todayIso } from '../../domain/dates';
import { debtByEntity, entityGroup, expenseCardEntity, monthToPay, OBLIGATION_TYPE_LABEL } from '../../domain/obligations';
import { sum } from '../../domain/money';
import { Badge, BarChart, Card, confirmDialog, Empty, Money, Progress } from '../components/ui';
import { CreditCard, Landmark } from 'lucide-react';

/** Cuánto falta para saldar todas las deudas con cada entidad (préstamos y cuotas de tarjetas). */
export function EntidadesPage() {
  const { data, today, toast } = useApp();
  const debts = useMemo(() => debtByEntity(data.obligations, today, data), [data, today]);
  const total = sum(debts.map((d) => d.remaining));
  const toPay = useMemo(() => monthToPay(debts, today, data.statements), [debts, today, data.statements]);
  // Tarjetas que usás (tienen resúmenes o consumos cargados) pero sin nada pendiente cargado.
  const missing = useMemo(() => {
    const known = new Set([...data.statements.filter((s) => !s.deleted).map((s) => entityGroup(s.entity)), ...data.expenses.filter((e) => !e.deleted).map(expenseCardEntity).filter((x): x is string => !!x).map(entityGroup)]);
    return [...known].filter((g) => g !== 'Sin entidad' && !debts.some((d) => d.group === g)).sort();
  }, [data.statements, data.expenses, debts]);
  const missingCard = missing.length > 0 && (
    <Card className="alert" title={`Sin deuda cargada: ${missing.join(', ')}`} help="La app solo sabe lo que le subiste. Si usaste la tarjeta después del último resumen, subí el video o las capturas de 'Tus consumos' de su app, o el resumen nuevo cuando llegue.">
      <p className="small" style={{ marginTop: 0 }} data-testid="entidades-sin-datos">
        De {missing.join(', ')} no hay nada pendiente cargado (el último resumen ya venció). Para ver cuánto le debés mes a mes, subí el <strong>video o las capturas de "Tus consumos"</strong> de su app, o el <strong>resumen nuevo</strong>.
      </p>
      <a className="btn primary" href="#/importar">Subir</a>
    </Card>
  );
  const last = debts.map((d) => d.lastMonth).filter(Boolean).sort().at(-1);
  const months = Array.from({ length: 12 }, (_, i) => addMonths(today, i));
  const colors = ['var(--cat1)', 'var(--cat3)', 'var(--cat4)', 'var(--cat2)', 'var(--cat6)'];
  const chart = months.map((m) => ({
    label: monthShort(m),
    values: debts.slice(0, 5).map((d, i) => ({ name: d.group, value: d.byMonth[m] ?? 0, color: colors[i] })),
  }));
  if (!debts.length)
    return (
      <div className="page">
        {missingCard}
        <Card><Empty title="No hay deudas pendientes" action={<a className="btn primary" href="#/importar">Importar resumen, cronograma o plan de pagos</a>}>Cuando cargue préstamos, compras en cuotas o planes de pago, aquí verá cuánto le falta con cada entidad.</Empty></Card>
      </div>
    );
  return (
    <div className="page">
      <div className="kpis">
        <div className="kpi"><span>Deuda total pendiente</span><Money value={total} estimated={debts.some((d) => d.estimated)} /></div>
        <div className="kpi"><span>Este mes</span><Money value={sum(debts.map((d) => d.byMonth[today] ?? 0))} /></div>
        <div className="kpi"><span>Libre de deudas en</span><strong className="big">{last ? monthLabel(last) : '—'}</strong></div>
      </div>
      {missingCard}
      {toPay.length > 0 && (
        <Card title={`Este mes pagás · ${monthLabel(today)}`} help="Lo que tenés que pagar este mes a cada entidad: el resumen de la tarjeta por su total (con las cuotas que trae adentro) y aparte cada préstamo, con su vencimiento." className="pay-month">
          {toPay.map((e) => (
            <div key={e.group} className="pay-entity">
              <div className="pay-head"><strong>{e.group}</strong><Money value={e.total} estimated={e.lines.some((l) => l.estimated)} /></div>
              {e.lines.some((l) => l.pays) && (
                <button className="btn small pay-all" onClick={async () => {
                  if (!(await confirmDialog(`¿Ya pagaste todo lo de ${e.group} de ${monthLabel(today).toLowerCase()} (${formatARS(e.total)})?\nQueda pagado y se descuenta de tu plata hasta cobrar.`, { ok: 'Sí, ya pagué todo' }))) return;
                  const db = getDb();
                  await payEntityMonth(db, e, todayIso(), new Date().toISOString(), await getDeviceId(db));
                  notify();
                  toast(`${e.group}: todo lo de ${monthLabel(today).toLowerCase()} quedó pagado.`);
                }}>Ya pagué todo</button>
              )}
              <ul className="list">
                {e.lines.map((l, i) => (
                  <li key={i}>
                    <span>
                      {l.label}
                      {l.due && <small className="muted d-block">vence el {l.due.slice(8, 10)}/{l.due.slice(5, 7)}</small>}
                      {l.detail && <small className="muted d-block">{l.detail}</small>}
                    </span>
                    <Money value={l.amount} estimated={l.estimated} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <div className="pay-total"><span>Total del mes</span><Money value={sum(toPay.map((e) => e.total))} /></div>
        </Card>
      )}
      <Card title="Cuotas por mes y entidad (próximos 12 meses)" help="Cuánto vas a pagar cada mes a cada entidad. Cuando una deuda termina, la barra baja: esa plata te queda libre.">
        <BarChart data={chart} ariaLabel="Cuotas por mes y entidad" />
      </Card>
      {debts.map((d) => (
        <Card key={d.group} title={<span className="entity-head"><span className="cat-ic" aria-hidden>{d.card.length || /naranja|visa|master|uala|ualá|mercado|tarjeta/i.test(d.group) ? <CreditCard /> : <Landmark />}</span>{d.group}</span>} actions={<Money value={d.remaining} estimated={d.estimated} />} className="entity-card">
          <p className="small muted">
            {d.lastMonth ? <>Último pago en <strong>{monthLabel(d.lastMonth)}</strong></> : 'Sin fecha de fin'}
            {d.overdue > 0 && <> · <span className="err">vencido sin pagar: <Money value={d.overdue} /></span></>}
          </p>
          <ul className="list" data-testid="entity-items">
            {d.card.map((c, i) => (
              <li key={`c${i}`} data-testid="entity-card-item">
                <span>
                  <strong>{c.label}</strong> <Badge tone={c.kind === 'consumos' ? 'info' : 'warn'}>{c.kind === 'consumos' ? 'Tarjeta: próximo resumen' : 'Tarjeta: resumen'}</Badge>
                  <small className="muted d-block">{c.detail}</small>
                </span>
                <Money value={c.amount} />
              </li>
            ))}
            {d.items.map(({ ob, progress: p, balance }) => balance !== undefined ? (
              <li key={ob.id} data-testid="entity-balance-item">
                <span>
                  <strong>{ob.concept}</strong> <Badge tone="neutral">Saldo</Badge>
                  <small className="muted d-block">{ob.notes ? `${ob.notes} · ` : ''}se actualiza cada vez que subís el PDF nuevo</small>
                </span>
                <Money value={balance} />
              </li>
            ) : (
              <li key={ob.id}>
                <span>
                  <strong>{ob.concept}</strong> <Badge tone="neutral">{OBLIGATION_TYPE_LABEL[ob.type]}</Badge>
                  <small className="muted d-block">
                    {p.currentN ? `Vas por la cuota ${p.currentN}${p.total ? ` de ${p.total}` : ''} · ` : ''}
                    faltan {p.remainingCount} cuota(s)
                    {p.nextAmount !== undefined && <> · próxima <Money value={p.nextAmount} />{p.nextDueDate ? ` el ${formatDate(p.nextDueDate)}` : p.nextDueMonth ? ` en ${monthLabel(p.nextDueMonth)}` : ''}</>}
                    {p.lastDueMonth && <> · termina {p.lastDueDate ? formatDate(p.lastDueDate) : monthLabel(p.lastDueMonth)}</>}
                  </small>
                  {!!p.total && <span className="d-block" style={{ marginTop: 8, maxWidth: 420 }}><Progress value={p.total - p.remainingCount} max={p.total} /></span>}
                </span>
                <Money value={p.remainingTotal} />
              </li>
            ))}
          </ul>
{Object.keys(d.byMonth).length > 0 && (
          <details className="small">
            <summary>Pagos mes a mes</summary>
            <ul className="list">
              {Object.entries(d.byMonth).sort(([a], [b]) => a.localeCompare(b)).map(([m, v]) => (
                <li key={m}><span>{monthLabel(m)}</span><Money value={v} /></li>
              ))}
            </ul>
          </details>
          )}
        </Card>
      ))}
    </div>
  );
}
