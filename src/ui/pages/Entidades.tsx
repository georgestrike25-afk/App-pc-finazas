import { useMemo } from 'react';
import { useApp } from '../store';
import { addMonths, formatDate, monthLabel, monthShort } from '../../domain/dates';
import { debtByEntity, OBLIGATION_TYPE_LABEL } from '../../domain/obligations';
import { sum } from '../../domain/money';
import { Badge, BarChart, Card, Empty, Money } from '../components/ui';

/** Cuánto falta para saldar todas las deudas con cada entidad (préstamos y cuotas de tarjetas). */
export function EntidadesPage() {
  const { data, today } = useApp();
  const debts = useMemo(() => debtByEntity(data.obligations, today), [data.obligations, today]);
  const total = sum(debts.map((d) => d.remaining));
  const last = debts.map((d) => d.lastMonth).filter(Boolean).sort().at(-1);
  const months = Array.from({ length: 12 }, (_, i) => addMonths(today, i));
  const colors = ['var(--c-debt)', 'var(--c-expense)', 'var(--c-accent)', 'var(--c-income)', 'var(--c-est)'];
  const chart = months.map((m) => ({
    label: monthShort(m),
    values: debts.slice(0, 5).map((d, i) => ({ name: d.group, value: d.byMonth[m] ?? 0, color: colors[i] })),
  }));
  if (!debts.length)
    return (
      <div className="page">
        <Card><Empty title="No hay deudas pendientes" action={<a className="btn primary" href="#/importar">Importar resumen, cronograma o plan de pagos</a>}>Cuando cargue préstamos, compras en cuotas o planes de pago, aquí verá cuánto le falta con cada entidad.</Empty></Card>
      </div>
    );
  return (
    <div className="page">
      <div className="kpis">
        <div className="kpi"><span>Deuda total pendiente</span><Money value={total} estimated={debts.some((d) => d.estimated)} /></div>
        <div className="kpi"><span>Entidades</span><strong className="big">{debts.length}</strong></div>
        <div className="kpi"><span>Este mes</span><Money value={sum(debts.map((d) => d.byMonth[today] ?? 0))} /></div>
        <div className="kpi"><span>Libre de deudas en</span><strong className="big">{last ? monthLabel(last) : '—'}</strong></div>
      </div>
      <Card title="Cuotas por mes y entidad (próximos 12 meses)" help="Cuánto vas a pagar cada mes a cada entidad. Cuando una deuda termina, la barra baja: esa plata te queda libre.">
        <BarChart data={chart} ariaLabel="Cuotas por mes y entidad" />
      </Card>
      {debts.map((d) => (
        <Card key={d.group} title={d.group} actions={<Money value={d.remaining} estimated={d.estimated} />} className="entity-card">
          <p className="small muted">
            Para saldar todo con {d.group} faltan <strong><Money value={d.remaining} /></strong>
            {d.lastMonth && <> · último pago en <strong>{monthLabel(d.lastMonth)}</strong></>}
            {d.overdue > 0 && <> · <span className="err">vencido sin pagar: <Money value={d.overdue} /></span></>}
          </p>
          <ul className="list" data-testid="entity-items">
            {d.items.map(({ ob, progress: p }) => (
              <li key={ob.id}>
                <span>
                  <strong>{ob.concept}</strong> <Badge tone="neutral">{OBLIGATION_TYPE_LABEL[ob.type]}</Badge>
                  <small className="muted d-block">
                    {p.currentN ? `Vas por la cuota ${p.currentN}${p.total ? ` de ${p.total}` : ''} · ` : ''}
                    faltan {p.remainingCount} cuota(s)
                    {p.nextAmount !== undefined && <> · próxima <Money value={p.nextAmount} />{p.nextDueDate ? ` el ${formatDate(p.nextDueDate)}` : p.nextDueMonth ? ` en ${monthLabel(p.nextDueMonth)}` : ''}</>}
                    {p.lastDueMonth && <> · termina {p.lastDueDate ? formatDate(p.lastDueDate) : monthLabel(p.lastDueMonth)}</>}
                  </small>
                </span>
                <Money value={p.remainingTotal} />
              </li>
            ))}
          </ul>
          <details className="small">
            <summary>Pagos mes a mes</summary>
            <ul className="list">
              {Object.entries(d.byMonth).sort(([a], [b]) => a.localeCompare(b)).map(([m, v]) => (
                <li key={m}><span>{monthLabel(m)}</span><Money value={v} /></li>
              ))}
            </ul>
          </details>
        </Card>
      ))}
      <p className="small muted">Incluye las cuotas pendientes de préstamos, compras en cuotas, Plan V y planes de pago cargados. No incluye consumos futuros que todavía no figuran en un resumen.</p>
    </div>
  );
}
