import { useMemo, useState } from 'react';
import { useApp } from '../store';
import { computeMonth } from '../../domain/monthly';
import { addMonths, monthLabel, monthShort } from '../../domain/dates';
import { computedBalance } from '../../domain/obligations';
import { goalProgress } from '../../domain/savings';
import { sum } from '../../domain/money';
import { Badge, BarChart, Card, Money, MonthNav, Progress, Warnings } from '../components/ui';

export function ResumenPage() {
  const { data, month, setMonth, today } = useApp();
  const r = useMemo(() => computeMonth(data, month, today), [data, month, today]);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const get = (k: string) => r.sections.find((s) => s.key === k)!;
  const gastos = get('fijos').total + get('personales').total + get('cotidiano').total;
  const debt = useMemo(() => {
    const b = data.obligations.filter((o) => o.status !== 'cancelada').map((o) => computedBalance(o, today));
    return { amount: sum(b.map((x) => x.amount)), estimated: b.some((x) => x.estimated || !x.complete) };
  }, [data.obligations, today]);
  const progress = goalProgress(data.goal);
  const empty = !data.incomes.length && !data.expenses.length && !data.obligations.length && !data.sancor.length;
  const chart = useMemo(
    () =>
      Array.from({ length: 6 }, (_, i) => addMonths(month, i - 5)).map((m) => {
        const x = computeMonth(data, m, today);
        const out = x.sections.filter((s) => s.sign === -1).reduce((a, s) => a + s.total, 0);
        return {
          label: monthShort(m),
          values: [
            { name: 'Ingresos cobrados', value: x.sections[0].total, color: 'var(--c-income)' },
            { name: 'Egresos imputados', value: out, color: 'var(--c-expense)', estimated: x.hasEstimates },
          ],
        };
      }),
    [data, month, today],
  );

  return (
    <div className="page">
      <MonthNav month={month} setMonth={setMonth} />
      {empty && (
        <Card className="welcome">
          <h2>Bienvenido/a</h2>
          <p>La aplicación comienza vacía: no hay ingresos, gastos, deudas ni saldos precargados. Todo se guarda solo en este dispositivo.</p>
          <ol>
            <li><a href="#/ingresos">Registre el ingreso cobrado</a> de este mes.</li>
            <li><a href="#/importar">Importe un resumen</a> de tarjeta o cargue <a href="#/deudas">sus deudas y cuotas</a>.</li>
            <li>Revise el <a href="#/presupuesto">presupuesto cotidiano</a> (valor inicial orientativo de $700.000, editable).</li>
            <li>Configure el <a href="#/viaje">objetivo del viaje de abril de 2027</a>.</li>
          </ol>
        </Card>
      )}
      <div className="kpis">
        <div className="kpi">
          <span>Ingresos cobrados</span>
          <Money value={get('ingresos').total} />
          {r.incomeStatus !== 'confirmado' && <Badge tone={r.incomeStatus === 'estimado' ? 'est' : 'warn'}>{r.incomeStatus === 'estimado' ? 'Solo estimado' : 'Sin cargar'}</Badge>}
        </div>
        <div className="kpi">
          <span>Gastos del mes</span>
          <Money value={gastos} estimated={[get('fijos'), get('personales'), get('cotidiano')].some((s) => s.lines.some((l) => l.estimated))} />
        </div>
        <div className="kpi">
          <span>Cuotas y obligaciones</span>
          <Money value={get('obligaciones').total} estimated={get('obligaciones').lines.some((l) => l.estimated)} />
        </div>
        <div className={`kpi ${r.available < 0 ? 'bad' : 'good'}`}>
          <span>Saldo disponible antes del ahorro</span>
          <Money value={r.available} estimated={r.hasEstimates} />
          {r.incomeStatus !== 'confirmado' && r.estimatedIncome > 0 && (
            <small className="muted">Con ingreso estimado: <Money value={r.projectedAvailable} estimated /></small>
          )}
        </div>
        <a className="kpi kpi-link" href="#/entidades">
          <span>Deudas pendientes (cuotas a pagar)</span>
          <Money value={debt.amount} estimated={debt.estimated} />
          <small className="muted">Ver por entidad →</small>
        </a>
        <div className="kpi">
          <span>Ahorro del viaje</span>
          <Money value={progress} />
          <Progress value={progress} max={data.goal.estimatedCost} />
        </div>
      </div>

      <Warnings items={r.warnings} />

      <Card title={`Cálculo de ${monthLabel(month)}`} actions={<small className="muted">≈ = valor estimado</small>}>
        <div className="calc">
          {r.sections.map((s) => (
            <div key={s.key} className="calc-sec">
              <button className="calc-row head" onClick={() => setOpen((o) => ({ ...o, [s.key]: !o[s.key] }))} aria-expanded={!!open[s.key]}>
                <span>{s.sign === 1 ? '+' : '−'} {s.title} <small className="muted">({s.lines.length})</small></span>
                <Money value={s.total} estimated={s.lines.some((l) => l.estimated)} />
              </button>
              {open[s.key] && (
                <ul className="calc-lines">
                  {s.lines.length === 0 && <li className="muted">Sin movimientos.</li>}
                  {s.lines.map((l, i) => (
                    <li key={i}>
                      <span>
                        {l.label}
                        {l.estimated && <Badge tone="est">estimado</Badge>}
                        {l.note && <small className="muted d-block">{l.note}</small>}
                      </span>
                      <Money value={l.amount} estimated={l.estimated} />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
          <div className="calc-row total">
            <span>= Saldo mensual disponible antes del ahorro</span>
            <Money value={r.available} estimated={r.hasEstimates} />
          </div>
        </div>
        <p className="muted small">Toque cada concepto para ver las operaciones que lo componen.</p>
      </Card>

      <div className="grid2">
        <Card title="Información separada (no altera el saldo)">
          <dl className="dl">
            <dt>Total exigido por resúmenes de tarjeta del mes</dt>
            <dd><Money value={r.info.statementsTotal} /></dd>
            <dt>Pagos de resumen registrados <small className="muted">(cancelan consumos ya imputados)</small></dt>
            <dd><Money value={r.info.cardPaymentsTotal} /></dd>
            <dt>Reintegro Sancor esperado</dt>
            <dd><Money value={r.info.sancorExpected} /></dd>
            <dt>Reintegro Sancor recibido</dt>
            <dd><Money value={r.info.sancorReceived} /></dd>
            <dt>Reintegro Sancor pendiente</dt>
            <dd><Money value={r.info.sancorPending} /></dd>
          </dl>
        </Card>
        <Card title="Presupuesto cotidiano">
          <dl className="dl">
            <dt>Presupuesto del mes {r.info.dailyBudgetIsInitialValue && <Badge tone="info">valor inicial editable</Badge>}</dt>
            <dd><Money value={r.info.dailyBudget} /></dd>
            <dt>Gastos cotidianos registrados</dt>
            <dd><Money value={r.info.dailyRegistered} /></dd>
            <dt>Estimación aún no registrada</dt>
            <dd><Money value={r.info.dailyEstimatedRemainder} estimated /></dd>
          </dl>
          <a className="btn small" href="#/presupuesto">Ajustar presupuesto</a>
        </Card>
      </div>

      <Card title="Últimos 6 meses">
        <BarChart data={chart} ariaLabel="Ingresos y egresos de los últimos seis meses" />
      </Card>
    </div>
  );
}
