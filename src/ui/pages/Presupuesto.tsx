import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../store';
import { saveRecord } from '../../db/repo';
import { budgetForMonth } from '../../domain/monthly';
import { occurrencesForMonth } from '../../domain/expenses';
import { monthLabel } from '../../domain/dates';
import { sum, type Cents } from '../../domain/money';
import type { Settings } from '../../domain/types';
import { Badge, Card, Field, Money, MoneyInput, MonthNav, Progress } from '../components/ui';
import { ExpenseForm, newExpenseDraft, type ExpenseDraft } from './ExpenseForm';

export function PresupuestoPage() {
  const { data, month, setMonth, today, toast } = useApp();
  const s = data.settings;
  const b = budgetForMonth(s, month, today);
  const [amount, setAmount] = useState<Cents | undefined>(b.amount);
  const [def, setDef] = useState<Cents | undefined>(s.dailyBudgetDefault);
  const [editing, setEditing] = useState<ExpenseDraft | null>(null);
  useEffect(() => setAmount(b.amount), [b.amount, month]);
  useEffect(() => setDef(s.dailyBudgetDefault), [s.dailyBudgetDefault]);
  const occ = useMemo(() => occurrencesForMonth(data.expenses.filter((e) => e.kind === 'cotidiano'), month), [data.expenses, month]);
  const registered = sum(occ.map((o) => o.userShare));
  const byCat = new Map<string, number>();
  for (const o of occ) byCat.set(o.category, (byCat.get(o.category) ?? 0) + o.userShare);
  const cardPending = occ.filter((o) => !o.paid && data.expenses.find((e) => e.id === o.expenseId)?.paymentMethod === 'tarjeta');
  const saveSettings = (patch: Partial<Settings>, msg: string) => saveRecord<Settings>('settings', { ...s, ...patch }, msg).then(() => toast('Presupuesto actualizado'));

  return (
    <div className="page">
      <MonthNav month={month} setMonth={setMonth} />
      <div className="kpis">
        <div className="kpi"><span>Presupuesto estimado {b.isInitialValue && <Badge tone="info">valor inicial editable</Badge>}</span><Money value={b.amount} /></div>
        <div className="kpi"><span>Gastos efectivamente registrados</span><Money value={registered} /></div>
        <div className="kpi"><span>Consumos con tarjeta pendientes de pago</span><Money value={sum(cardPending.map((o) => o.userShare))} /></div>
        <div className={`kpi ${b.amount - registered < 0 ? 'bad' : 'good'}`}><span>Disponible del presupuesto</span><Money value={b.amount - registered} /></div>
      </div>
      <Card title={`Avance de ${monthLabel(month)}`}>
        <Progress value={registered} max={b.amount} />
        <p className="muted small">
          Modo del mes: <strong>{b.mode === 'estimado' ? 'estimado' : 'real'}</strong>. En modo estimado, la calculadora suma lo registrado más la parte del presupuesto aún no consumida (identificada como estimación). En modo real, solo lo registrado.
        </p>
        <div className="form-grid">
          <Field label={`Presupuesto de ${monthLabel(month)}`}>{(id) => <MoneyInput id={id} value={amount} onChange={setAmount} />}</Field>
          <Field label="Modo del mes">
            {(id) => (
              <select id={id} value={b.mode} onChange={(e) => saveSettings({ monthBudgets: { ...s.monthBudgets, [month]: { amount: s.monthBudgets[month]?.amount ?? b.amount, mode: e.target.value as 'real' | 'estimado' } } }, `Modo de presupuesto ${monthLabel(month)}`)}>
                <option value="estimado">Estimado (completa con presupuesto)</option>
                <option value="real">Real (solo lo registrado)</option>
              </select>
            )}
          </Field>
        </div>
        <button className="btn primary" onClick={() => amount !== undefined && saveSettings({ monthBudgets: { ...s.monthBudgets, [month]: { amount, mode: b.mode } } }, `Presupuesto de ${monthLabel(month)}`)}>Guardar presupuesto del mes</button>
      </Card>
      <Card title="Presupuesto por defecto">
        <p className="muted small">Se aplica a los meses sin presupuesto propio. El valor inicial de $700.000 es orientativo: no es un gasto registrado.</p>
        <Field label="Presupuesto cotidiano mensual por defecto">{(id) => <MoneyInput id={id} value={def} onChange={setDef} />}</Field>
        <button className="btn" onClick={() => def !== undefined && saveSettings({ dailyBudgetDefault: def, dailyBudgetIsInitialValue: false }, 'Presupuesto por defecto')}>Guardar valor por defecto</button>
      </Card>
      <Card title="Gastos cotidianos por categoría" actions={<button className="btn small primary" onClick={() => setEditing(newExpenseDraft('cotidiano', month, s.defaultUserPct))}>+ Registrar gasto</button>}>
        {byCat.size === 0 ? (
          <p className="muted">Sin gastos cotidianos registrados en el mes.</p>
        ) : (
          <ul className="list">
            {[...byCat.entries()].sort((a, b) => b[1] - a[1]).map(([c, v]) => (
              <li key={c}><span>{c}</span><Money value={v} /></li>
            ))}
          </ul>
        )}
        <p className="muted small">Si un gasto cotidiano se pagó con tarjeta, se computa aquí una sola vez. Al importar el resumen, la línea correspondiente se vincula y no se vuelve a sumar.</p>
      </Card>
      {editing && <ExpenseForm initial={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
