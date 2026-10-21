import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../store';
import { saveRecord } from '../../db/repo';
import { goalProgress, projectGoal } from '../../domain/savings';
import { formatDate, monthLabel, monthOf, monthShort, todayIso } from '../../domain/dates';
import { formatARS, type Cents } from '../../domain/money';
import { uid } from '../../domain/text';
import type { SavingsGoal, Settings } from '../../domain/types';
import { Badge, BarChart, Card, confirmDialog, Field, Money, MoneyInput, MonthSelect, Progress, Warnings } from '../components/ui';

export function ViajePage() {
  const { data, today, toast } = useApp();
  const [g, setG] = useState<SavingsGoal>(data.goal);
  const [income, setIncome] = useState<Cents | undefined>(data.settings.projectedMonthlyIncome);
  const [scenarioKey, setScenarioKey] = useState<'conservador' | 'intermedio' | 'optimista'>('intermedio');
  const [cAmount, setCAmount] = useState<Cents | undefined>();
  const [cDate, setCDate] = useState(todayIso());
  useEffect(() => setG(data.goal), [data.goal]);
  const saved = data.goal;
  const projections = useMemo(() => saved.scenarios.map((s) => projectGoal(data, saved, today, s)), [data, saved, today]);
  const p = projections.find((x) => x.scenario.key === scenarioKey) ?? projections[1];
  const progress = goalProgress(saved);
  const dirty = JSON.stringify(g) !== JSON.stringify(saved);

  const save = async () => {
    await saveRecord<SavingsGoal>('goals', g, 'Configuración del objetivo de viaje');
    toast('Objetivo guardado');
  };
  const saveIncome = async () => {
    await saveRecord<Settings>('settings', { ...data.settings, projectedMonthlyIncome: income ?? 0 }, 'Ingreso mensual estimado para proyecciones');
    toast('Estimación guardada');
  };
  const addContribution = async () => {
    if (!cAmount || cAmount <= 0) return;
    await saveRecord<SavingsGoal>('goals', { ...saved, contributions: [...saved.contributions, { id: uid(), date: cDate, month: monthOf(cDate), amount: cAmount }] }, `Aporte al viaje (${formatARS(cAmount)})`);
    setCAmount(undefined);
    toast('Aporte registrado');
  };
  const chart = p.months.map((m) => ({
    label: monthShort(m.month),
    values: projections.map((x, i) => ({
      name: x.scenario.label,
      value: x.months.find((y) => y.month === m.month)?.accumulated ?? 0,
      color: ['var(--c-expense)', 'var(--c-income)', 'var(--c-accent)'][i],
      estimated: true,
    })),
  }));

  return (
    <div className="page">
      <Card className="hero" title={saved.name}>
        {saved.estimatedCost <= 0 ? (
          <p data-testid="viaje-respuesta">Poné abajo <strong>cuánto cuesta el viaje</strong> y cuánto querés ahorrar por mes para saber si llegás a {monthLabel(saved.targetMonth)}.</p>
        ) : (
          <>
            <strong className={`answer ${p.reachable ? 'ok-text' : 'warn'}`} data-testid="viaje-respuesta">
              {p.reachable ? `✓ Llegás a ${monthLabel(saved.targetMonth)} con lo que planeás ahorrar` : `Con lo planeado no llegás a ${monthLabel(saved.targetMonth)}`}
            </strong>
            <span>Tenés <Money value={progress} /> de <Money value={saved.estimatedCost} /> ({saved.estimatedCost ? Math.round((progress / saved.estimatedCost) * 100) : 0} %).</span>
            <Progress value={progress} max={saved.estimatedCost} />
            {!p.reachable && (
              <span>Para llegar, ahorrá <strong><Money value={p.requiredMonthly} /></strong> por mes durante {p.monthsRemaining} meses.</span>
            )}
            <small className="muted">Cálculo con tus ingresos, gastos y cuotas cargados. Es una estimación, no un resultado garantizado.</small>
          </>
        )}
      </Card>
      <details className="card more-opts">
        <summary>Ver escenarios y proyección mes a mes</summary>
      <div className="kpis">
        <div className="kpi"><span>Costo estimado</span><Money value={saved.estimatedCost} /></div>
        <div className="kpi"><span>Ahorrado y reservado</span><Money value={progress} /><Progress value={progress} max={saved.estimatedCost} /></div>
        <div className="kpi"><span>Saldo faltante</span><Money value={Math.max(0, saved.estimatedCost - progress)} /></div>
        <div className="kpi"><span>Aporte mensual necesario ({p.monthsRemaining} meses)</span><Money value={p.requiredMonthly} /></div>
      </div>

      <Card title={`¿Es alcanzable? — ${saved.name}`}>
        <div className="scen-grid">
          {projections.map((x) => (
            <button key={x.scenario.key} className={`scen ${x.scenario.key === scenarioKey ? 'sel' : ''}`} onClick={() => setScenarioKey(x.scenario.key)}>
              <strong>{x.scenario.label}</strong>
              <Money value={x.finalAccumulated} estimated />
              {saved.estimatedCost > 0 ? (x.reachable ? <Badge tone="ok">Alcanzable</Badge> : <Badge tone="bad">No alcanza</Badge>) : <Badge tone="neutral">Sin costo cargado</Badge>}
            </button>
          ))}
        </div>
        <p className="muted small">Los escenarios son estimaciones configurables, nunca resultados garantizados. Se proyecta hasta {monthLabel(saved.targetMonth)} (aportes hasta el mes anterior al viaje).</p>
        <Warnings items={p.warnings} />
        <BarChart data={chart} ariaLabel="Ahorro acumulado proyectado por escenario" />
      </Card>

      <Card title={`Proyección mes a mes — escenario ${p.scenario.label.toLowerCase()}`}>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Mes</th><th className="num">Ingreso</th><th className="num">Gastos</th><th className="num">Cuotas</th><th className="num">Saldo</th><th className="num">Liberado</th><th className="num">Aporte</th><th className="num">Acumulado</th></tr></thead>
            <tbody>
              {p.months.map((m) => (
                <tr key={m.month}>
                  <td>{monthLabel(m.month)}</td>
                  <td className="num"><Money value={m.income} estimated={m.incomeSource !== 'confirmado'} />{m.incomeSource === 'sin_dato' && <Badge tone="warn">sin dato</Badge>}</td>
                  <td className="num"><Money value={m.expenses} estimated /></td>
                  <td className="num"><Money value={m.obligations} /></td>
                  <td className="num"><Money value={m.available} estimated={m.incomeSource !== 'confirmado'} /></td>
                  <td className="num"><Money value={m.freed} /></td>
                  <td className="num"><Money value={m.contribution} estimated={m.contributionKind === 'proyectado'} />{m.capped && <Badge tone="warn">limitado</Badge>}{m.contributionKind === 'real' && <Badge tone="ok">real</Badge>}</td>
                  <td className="num"><strong><Money value={m.accumulated} /></strong></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      </details>

      <div className="grid2">
        <Card title="Configuración del objetivo">
          <div className="form-grid">
            <Field label="Nombre">{(id) => <input id={id} value={g.name} onChange={(e) => setG({ ...g, name: e.target.value })} />}</Field>
            <Field label="Fecha objetivo">{(id) => <MonthSelect id={id} value={g.targetMonth} onChange={(targetMonth) => setG({ ...g, targetMonth })} />}</Field>
            <Field label="Costo estimado del viaje">{(id) => <MoneyInput id={id} name="estimatedCost" value={g.estimatedCost} onChange={(v) => setG({ ...g, estimatedCost: v ?? 0 })} />}</Field>
            <Field label="Ahorro inicial">{(id) => <MoneyInput id={id} value={g.initialSaving} onChange={(v) => setG({ ...g, initialSaving: v ?? 0 })} />}</Field>
            <Field label="Dinero reservado" hint="Adicional a los aportes registrados.">{(id) => <MoneyInput id={id} value={g.reserved} onChange={(v) => setG({ ...g, reserved: v ?? 0 })} />}</Field>
            <Field label="Aporte mensual previsto">{(id) => <MoneyInput id={id} name="planned" value={g.plannedMonthlyContribution} onChange={(v) => setG({ ...g, plannedMonthlyContribution: v ?? 0 })} />}</Field>
            <Field label="% del dinero liberado por cuotas finalizadas que se destina al viaje" hint="0 % = el dinero liberado no se ahorra automáticamente.">
              {(id) => <input id={id} type="number" min={0} max={100} value={g.reinvestPct} onChange={(e) => setG({ ...g, reinvestPct: Math.min(100, Math.max(0, Number(e.target.value))) })} />}
            </Field>
          </div>
          <h3>Escenarios</h3>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Escenario</th><th>Factor de ingresos</th><th>Factor de gastos</th></tr></thead>
              <tbody>
                {g.scenarios.map((s, i) => (
                  <tr key={s.key}>
                    <td>{s.label}</td>
                    <td><input aria-label={`Factor de ingresos ${s.label}`} type="number" step={0.01} min={0} max={3} value={s.incomeFactor} onChange={(e) => setG({ ...g, scenarios: g.scenarios.map((x, j) => (j === i ? { ...x, incomeFactor: Number(e.target.value) } : x)) })} /></td>
                    <td><input aria-label={`Factor de gastos ${s.label}`} type="number" step={0.01} min={0} max={3} value={s.expenseFactor} onChange={(e) => setG({ ...g, scenarios: g.scenarios.map((x, j) => (j === i ? { ...x, expenseFactor: Number(e.target.value) } : x)) })} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button className="btn primary" disabled={!dirty} onClick={save}>Guardar objetivo</button>
        </Card>
        <div>
          <Card title="Ingreso mensual estimado para proyecciones">
            <p className="muted small">Se usa solo en meses sin ingreso cargado. No es un ingreso cobrado.</p>
            <Field label="Ingreso mensual estimado">{(id) => <MoneyInput id={id} name="projectedIncome" value={income} onChange={setIncome} />}</Field>
            <button className="btn" onClick={saveIncome}>Guardar estimación</button>
          </Card>
          <Card title="Aportes efectivamente realizados">
            <div className="form-grid">
              <Field label="Importe">{(id) => <MoneyInput id={id} value={cAmount} onChange={setCAmount} />}</Field>
              <Field label="Fecha">{(id) => <input id={id} type="date" value={cDate} onChange={(e) => setCDate(e.target.value)} />}</Field>
            </div>
            <button className="btn primary" onClick={addContribution}>Registrar aporte</button>
            {saved.contributions.length === 0 ? (
              <p className="muted">Sin aportes registrados.</p>
            ) : (
              <ul className="list">
                {[...saved.contributions].sort((a, b) => b.date.localeCompare(a.date)).map((c) => (
                  <li key={c.id}>
                    <span>{formatDate(c.date)}</span>
                    <span><Money value={c.amount} /> <button className="btn small ghost danger" aria-label="Eliminar aporte" onClick={async () => (await confirmDialog('¿Eliminar este aporte?', { danger: true, ok: 'Eliminar' })) && saveRecord<SavingsGoal>('goals', { ...saved, contributions: saved.contributions.filter((x) => x.id !== c.id) }, 'Eliminación de aporte')}>✕</button></span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
