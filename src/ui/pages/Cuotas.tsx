import { useMemo, useState } from 'react';
import { useApp } from '../store';
import { buildSchedule, type Installment } from '../../domain/obligations';
import { addMonths, monthLabel, monthShort } from '../../domain/dates';
import { sum } from '../../domain/money';
import { Badge, BarChart, Card, Empty, Money } from '../components/ui';

export function CuotasPage() {
  const { data, today } = useApp();
  const [horizon, setHorizon] = useState(12);
  const months = Array.from({ length: horizon }, (_, i) => addMonths(today, i));
  const all = useMemo(() => data.obligations.flatMap((o) => buildSchedule(o, today)), [data.obligations, today]);
  const overdue = all.filter((i) => i.status === 'vencida');
  const byMonth = (m: string) => all.filter((i) => i.month === m && (i.status === 'pendiente' || i.status === 'vencida'));
  const chart = months.map((m) => {
    const xs = byMonth(m);
    return { label: monthShort(m), values: [{ name: 'Cuotas del mes', value: sum(xs.map((x) => x.amount)), color: 'var(--c-debt)', estimated: xs.some((x) => x.estimated) }] };
  });
  const row = (i: Installment) => (
    <li key={`${i.obligationId}-${i.n}`}>
      <span>{i.entity ? `${i.entity} · ` : ''}{i.concept} — cuota {i.n}{i.total ? `/${i.total}` : ''} {i.estimated && <Badge tone="est">estimada</Badge>}</span>
      <Money value={i.amount} estimated={i.estimated} />
    </li>
  );
  if (!data.obligations.length)
    return (
      <div className="page">
        <Card><Empty title="No hay cuotas futuras" action={<a className="btn primary" href="#/deudas">Agregar obligación</a>}>Las cuotas se generan a partir de las obligaciones registradas o importadas.</Empty></Card>
      </div>
    );
  return (
    <div className="page">
      <div className="page-actions">
        <label>Horizonte:&nbsp;
          <select value={horizon} onChange={(e) => setHorizon(Number(e.target.value))}>
            <option value={6}>6 meses</option><option value={12}>12 meses</option><option value={24}>24 meses</option><option value={36}>36 meses</option>
          </select>
        </label>
      </div>
      <Card title="Cuotas por mes"><BarChart data={chart} ariaLabel="Cuotas futuras por mes" /></Card>
      {overdue.length > 0 && (
        <Card title="Cuotas vencidas sin pago registrado" className="alert">
          <ul className="list">{overdue.map(row)}</ul>
        </Card>
      )}
      {months.map((m) => {
        const xs = byMonth(m).filter((i) => i.status === 'pendiente');
        if (!xs.length) return null;
        return (
          <Card key={m} title={monthLabel(m)} actions={<Money value={sum(xs.map((x) => x.amount))} estimated={xs.some((x) => x.estimated)} />}>
            <ul className="list">{xs.map(row)}</ul>
          </Card>
        );
      })}
    </div>
  );
}
