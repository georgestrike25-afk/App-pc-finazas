import { useMemo } from 'react';
import { useApp } from '../store';
import { addMonths, formatDate, monthLabel, monthShort } from '../../domain/dates';
import { debtByEntity, entityGroup, expenseCardEntity, OBLIGATION_TYPE_LABEL } from '../../domain/obligations';
import { sum } from '../../domain/money';
import { Badge, BarChart, Card, Empty, Money } from '../components/ui';

/** Cuánto falta para saldar todas las deudas con cada entidad (préstamos y cuotas de tarjetas). */
export function EntidadesPage() {
  const { data, today } = useApp();
  const debts = useMemo(() => debtByEntity(data.obligations, today, data), [data, today]);
  const total = sum(debts.map((d) => d.remaining));
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
  const colors = ['var(--c-debt)', 'var(--c-expense)', 'var(--c-accent)', 'var(--c-income)', 'var(--c-est)'];
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
        <div className="kpi"><span>Entidades</span><strong className="big">{debts.length}</strong></div>
        <div className="kpi"><span>Este mes</span><Money value={sum(debts.map((d) => d.byMonth[today] ?? 0))} /></div>
        <div className="kpi"><span>Libre de deudas en</span><strong className="big">{last ? monthLabel(last) : '—'}</strong></div>
      </div>
      {missingCard}
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
            {d.card.map((c, i) => (
              <li key={`c${i}`} data-testid="entity-card-item">
                <span>
                  <strong>{c.label}</strong> <Badge tone={c.kind === 'consumos' ? 'info' : 'warn'}>{c.kind === 'consumos' ? 'Tarjeta: próximo resumen' : 'Tarjeta: resumen'}</Badge>
                  <small className="muted d-block">{c.detail}</small>
                </span>
                <Money value={c.amount} />
              </li>
            ))}
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
      <p className="small muted">Incluye las cuotas pendientes de préstamos, compras en cuotas, Plan V y planes de pago, los resúmenes de tarjeta sin pagar y los consumos que ya hiciste y vienen en el próximo resumen (si subiste el video o las capturas de la app de la tarjeta).</p>
    </div>
  );
}
