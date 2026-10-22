import { useMemo, useState } from 'react';
import { useApp } from '../store';
import { saveRecord } from '../../db/repo';
import { savingsCapacity } from '../../domain/capacity';
import { monthLabel, monthShort } from '../../domain/dates';
import { sum, type Cents } from '../../domain/money';
import type { Settings } from '../../domain/types';
import { BarChart, Card, Field, Money, MoneyInput, useNarrow } from '../components/ui';

/** Viaje: cuánto se podría ahorrar cada mes a medida que se terminan las deudas. */
export function CapacityCard() {
  const { data, today, toast } = useApp();
  const narrow = useNarrow();
  const c = useMemo(() => savingsCapacity(data, today), [data, today]);
  const [edit, setEdit] = useState(false);
  const [income, setIncome] = useState<Cents | undefined>(c.income || undefined);
  const [min, setMin] = useState<Cents | undefined>(c.budget.min);
  const [max, setMax] = useState<Cents | undefined>(c.budget.max);
  const goal = data.goal;
  const untilTarget = c.months.filter((m) => m.month < goal.targetMonth);
  const totLow = sum(untilTarget.map((m) => Math.max(0, m.saveLow)));
  const totHigh = sum(untilTarget.map((m) => Math.max(0, m.saveHigh)));
  const save = async () => {
    if (!min || !max) return;
    await saveRecord<Settings>('settings', { ...data.settings, projectedMonthlyIncome: income ?? 0, dailyBudgetRange: { min: Math.min(min, max), max: Math.max(min, max) } }, 'Datos para calcular el ahorro posible');
    setEdit(false);
    toast('Listo: cálculo actualizado.');
  };
  const chart = c.months.map((m) => ({
    label: monthShort(m.month),
    values: [
      { name: 'Gastando el máximo del día a día', value: Math.max(0, m.saveLow), color: 'var(--c-income)' },
      { name: 'Extra si gastás el mínimo', value: Math.max(0, m.saveHigh - Math.max(0, m.saveLow)), color: 'var(--c-accent)' },
    ],
  }));
  return (
    <Card
      title="Cuánto podés ahorrar cada mes"
      actions={<button className="btn small ghost" onClick={() => setEdit(!edit)}>{edit ? 'Cerrar' : 'Cambiar datos'}</button>}
      help={
        <>
          <p>Para cada mes: <strong>ingreso − gastos fijos − cuotas, préstamos y resúmenes − presupuesto del día a día</strong>.</p>
          <ul>
            <li>Gastos fijos: tu parte del alquiler y servicios, y lo de la planilla (consultorio, obra social). Si un mes todavía no está cargado, se usa el promedio de los últimos meses.</li>
            <li>Cuotas: las mismas de Deudas (préstamos, planes, compras en cuotas y lo que viene en los resúmenes).</li>
            <li>Se muestra un rango: gastando el máximo y el mínimo de tu presupuesto del día a día.</li>
          </ul>
          <p>A medida que terminás deudas, esa plata queda libre para ahorrar.</p>
        </>
      }
      className="capacity"
    >
      {edit || !c.income ? (
        <>
          <div className="form-grid">
            <Field label="Ingreso mensual (sueldo neto)" hint={c.incomeSource === 'ultimo_cobro' ? 'Tomado de tu último sueldo cargado.' : undefined}>{(id) => <MoneyInput id={id} value={income} onChange={setIncome} />}</Field>
            <Field label="Presupuesto del día a día: mínimo">{(id) => <MoneyInput id={id} value={min} onChange={setMin} />}</Field>
            <Field label="Presupuesto del día a día: máximo">{(id) => <MoneyInput id={id} value={max} onChange={setMax} />}</Field>
          </div>
          <button className="btn primary" onClick={save} disabled={!income || !min || !max}>Calcular</button>
        </>
      ) : (
        <>
          <p className="small muted" style={{ marginTop: 0 }}>
            Con un ingreso de <Money value={c.income} /> y un presupuesto del día a día de <Money value={c.budget.min} /> a <Money value={c.budget.max} />.
          </p>
          {untilTarget.length > 0 && goal.estimatedCost > 0 && (
            <p data-testid="capacity-total">
              Hasta {monthLabel(goal.targetMonth)} podrías juntar entre <strong><Money value={totLow} /></strong> y <strong><Money value={totHigh} /></strong> (el viaje cuesta <Money value={goal.estimatedCost} />).
            </p>
          )}
          <BarChart data={chart} height={160} ariaLabel="Ahorro posible por mes" />
          {narrow ? (
            <ul className="exp-list" data-testid="capacity-months">
              {c.months.map((m) => (
                <li key={m.month} className="exp-item">
                  <div className="exp-top">
                    <span className="exp-concept">{monthLabel(m.month)}</span>
                    <span className="exp-amount">{range(m.saveLow, m.saveHigh)}</span>
                  </div>
                  <div className="exp-sub">
                    Cuotas y deudas <Money value={m.debts} /> · fijos <Money value={m.fixed} estimated={m.fixedEstimated} />
                    {m.freed > 0 && <> · <span className="ok-text">se liberan <Money value={m.freed} /></span></>}
                  </div>
                  {m.ended.length > 0 && <div className="exp-sub ok-text">Terminaste: {m.ended.join(', ')}</div>}
                </li>
              ))}
            </ul>
          ) : (
            <div className="table-wrap">
              <table data-testid="capacity-months">
                <thead><tr><th>Mes</th><th className="num">Gastos fijos</th><th className="num">Cuotas y deudas</th><th className="num">Se liberan</th><th className="num">Podés ahorrar</th><th></th></tr></thead>
                <tbody>
                  {c.months.map((m) => (
                    <tr key={m.month}>
                      <td>{monthLabel(m.month)}</td>
                      <td className="num"><Money value={m.fixed} estimated={m.fixedEstimated} /></td>
                      <td className="num"><Money value={m.debts} /></td>
                      <td className="num">{m.freed > 0 ? <span className="ok-text"><Money value={m.freed} /></span> : '—'}</td>
                      <td className="num"><strong>{range(m.saveLow, m.saveHigh)}</strong></td>
                      <td className="small ok-text">{m.ended.length ? `Terminaste: ${m.ended.join(', ')}` : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="small muted">≈ = gastos fijos estimados con el promedio de los últimos meses. Los resúmenes de tarjeta futuros solo incluyen lo que ya está cargado (cuotas y consumos vistos en la app).</p>
        </>
      )}
    </Card>
  );
}

function range(low: Cents, high: Cents) {
  const f = (v: Cents) => (v / 100).toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });
  if (high <= 0) return 'No alcanza';
  if (low <= 0) return `hasta ${f(high)}`;
  return `${f(low)} a ${f(high)}`;
}
