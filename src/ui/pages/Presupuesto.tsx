import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../store';
import { saveRecord } from '../../db/repo';
import { budgetForMonth } from '../../domain/monthly';
import { dailyOccurrencesForMonth } from '../../domain/expenses';
import { cycleMonthOf, cycleRange, paydayOf } from '../../domain/payday';
import { formatDate, monthLabel, todayIso } from '../../domain/dates';
import { cashStatus } from '../../domain/cash';
import { formatARS } from '../../domain/money';
import { sum, type Cents } from '../../domain/money';
import type { Settings } from '../../domain/types';
import { Card, Field, Money, MoneyInput, MonthNav, Progress, Ring } from '../components/ui';
import { categoryIcon } from '../components/categoryIcon';
import { ExpenseForm, newExpenseDraft, type ExpenseDraft } from './ExpenseForm';

export function PresupuestoPage() {
  const { data, month, setMonth, today, toast } = useApp();
  const s = data.settings;
  const b = budgetForMonth(s, month, today);
  const [amount, setAmount] = useState<Cents | undefined>(b.amount);
  const [asDefault, setAsDefault] = useState(false);
  const [editing, setEditing] = useState<ExpenseDraft | null>(null);
  useEffect(() => setAmount(b.amount), [b.amount, month]);
  const occ = useMemo(() => dailyOccurrencesForMonth(data.expenses, month, s), [data.expenses, month, s]);
  const cycle = cycleRange(month, s);
  // Antes de cobrar este mes, lo que se gasta todavía cuenta en el ciclo anterior.
  const active = cycleMonthOf(todayIso(), s);
  const registered = sum(occ.map((o) => o.userShare));
  const byCat = new Map<string, number>();
  for (const o of occ) byCat.set(o.category, (byCat.get(o.category) ?? 0) + o.userShare);
  const cardPending = occ.filter((o) => !o.paid && data.expenses.find((e) => e.id === o.expenseId)?.paymentMethod === 'tarjeta');
  const cash = month === today ? cashStatus(data, todayIso()) : null;
  const available = b.amount - registered;
  const adjustToCash = () =>
    cash &&
    saveSettings({ monthBudgets: { ...s.monthBudgets, [month]: { amount: registered + Math.max(0, cash.left), mode: b.mode } } }, `Presupuesto de ${monthLabel(month)} ajustado a la plata disponible (${formatARS(cash.left)})`);
  const saveSettings = (patch: Partial<Settings>, msg: string) => saveRecord<Settings>('settings', { ...s, ...patch }, msg).then(() => toast('Presupuesto actualizado'));
  const saveBudget = (v: Cents | undefined) =>
    v !== undefined && saveSettings({ monthBudgets: { ...s.monthBudgets, [month]: { amount: v, mode: b.mode } }, ...(asDefault ? { dailyBudgetDefault: v, dailyBudgetIsInitialValue: false } : {}) }, `Presupuesto de ${monthLabel(month)}`);

  return (
    <div className="page">
      <MonthNav month={month} setMonth={setMonth} />
      <Card className="cycle-card" title="Ciclo del día a día" help="El presupuesto del día a día va de un cobro al siguiente. El cobro es el día hábil que pusiste en Configuración (por defecto el 4.º). Un gasto de efectivo, débito o transferencia hecho antes de cobrar cuenta en el ciclo anterior; los de tarjeta cuentan en el mes del resumen.">
        <p style={{ margin: 0 }} data-testid="ciclo">Del <strong>{formatDate(cycle.from)}</strong> al <strong>{formatDate(cycle.to)}</strong></p>
        {month === today && active !== month && (
          <p className="small" style={{ margin: '8px 0 0' }} data-testid="ciclo-activo">
            Todavía no cobraste {monthLabel(month).split(' de ')[0]}: hasta el {formatDate(paydayOf(month, s)).slice(0, 5)}, lo que gastes en efectivo, débito o transferencia cuenta en el ciclo de {monthLabel(active).split(' de ')[0]}.{' '}
            <button type="button" className="linklike" onClick={() => setMonth(active)}>Ver el ciclo de {monthLabel(active).split(' de ')[0]}</button>
          </p>
        )}
        <Field label="Cobré el" hint={s.paydays?.[month] ? 'Fecha cargada a mano para este mes.' : `Calculado: ${s.paydayNth ?? 4}.º día hábil. Cambialo si cobraste otro día.`}>
          {(id) => (
            <input
              id={id}
              type="date"
              value={paydayOf(month, s)}
              onChange={(e) => e.target.value && saveSettings({ paydays: { ...(s.paydays ?? {}), [month]: e.target.value } }, `Fecha de cobro de ${monthLabel(month)}: ${e.target.value}`)}
            />
          )}
        </Field>
      </Card>
      <div className="kpis">
        <div className="kpi"><span>Presupuesto</span><Money value={b.amount} /></div>
        <div className="kpi"><span>Gastado</span><Money value={registered} /></div>
        {cardPending.length > 0 && <div className="kpi"><span>Con tarjeta, sin pagar</span><Money value={sum(cardPending.map((o) => o.userShare))} /></div>}
        <div className={`kpi ${available < 0 ? 'bad' : 'good'}`}><span>Disponible</span><Money value={available} /></div>
      </div>
      {cash && Math.abs(available - cash.left) >= 100 && (
        <Card className="cash-diff-card" title="El presupuesto no es tu plata" help="El presupuesto es un límite que te ponés para el día a día. 'Tu plata hasta cobrar' es lo que tenés de verdad (lo cargaste en Este mes). Si tenés menos de lo que el presupuesto te deja gastar, lo que manda es tu plata.">
          <p className="small" style={{ marginTop: 0 }} data-testid="presupuesto-vs-plata">
            {available > cash.left ? (
              <>El presupuesto todavía te deja gastar <strong><Money value={available} /></strong>, pero tenés <strong><Money value={cash.left} /></strong>. Para no pasarte, guiate por tu plata.</>
            ) : (
              <>Tenés <strong><Money value={cash.left} /></strong> y el presupuesto del día a día te deja gastar <strong><Money value={available} /></strong>: el resto de tu plata es para cuotas, servicios o ahorro.</>
            )}
          </p>
          {available > cash.left && <button className="btn primary" onClick={adjustToCash}>Ajustar el presupuesto a mi plata</button>}
        </Card>
      )}
      <Card title={`Presupuesto de ${monthLabel(month)}`} help="Es el máximo que querés gastar en el mes en comida, transporte, salidas y demás gastos chicos. La barra muestra cuánto llevás.">
        <Ring value={registered} max={b.amount} label="Usaste del presupuesto" />
        <div className="form-grid" style={{ marginTop: '0.75rem' }}>
          <Field label="Monto del mes">{(id) => <MoneyInput id={id} value={amount} onChange={setAmount} onEnter={saveBudget} />}</Field>
          <Field label="Modo del mes" help="Real: solo cuenta lo que anotaste. Estimado: además supone que vas a gastar lo que te queda del presupuesto (sirve para planear meses que todavía no pasaron).">
            {(id) => (
              <select id={id} value={b.mode} onChange={(e) => saveSettings({ monthBudgets: { ...s.monthBudgets, [month]: { amount: s.monthBudgets[month]?.amount ?? b.amount, mode: e.target.value as 'real' | 'estimado' } } }, `Modo de presupuesto ${monthLabel(month)}`)}>
                <option value="estimado">Estimado (completa con presupuesto)</option>
                <option value="real">Real (solo lo registrado)</option>
              </select>
            )}
          </Field>
        </div>
        <label className="check">
          <input type="checkbox" checked={asDefault} onChange={(e) => setAsDefault(e.target.checked)} />
          Usar este monto también en los meses siguientes
        </label>
        <button
          className="btn primary"
          onClick={() => saveBudget(amount)}
        >
          Guardar presupuesto
        </button>
      </Card>
      <Card title="Gastos cotidianos por categoría" actions={<button className="btn small primary" onClick={() => setEditing(newExpenseDraft('cotidiano', month, s.defaultUserPct))}>+ Registrar gasto</button>}>
        {byCat.size === 0 ? (
          <p className="muted">Sin gastos cotidianos registrados en el mes.</p>
        ) : (
          <ul className="list">
            {[...byCat.entries()].sort((a, b) => b[1] - a[1]).map(([c, v]) => {
              const Icon = categoryIcon(c);
              return (
                <li key={c} style={{ alignItems: 'center' }}>
                  <span className="cat-ic" aria-hidden><Icon /></span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><strong>{c}</strong><Money value={v} /></span>
                    <span className="d-block" style={{ marginTop: 6 }}><Progress value={v} max={Math.max(registered, 1)} /></span>
                    <small className="muted">{Math.round((v / Math.max(registered, 1)) * 100)} % de lo gastado en el día a día</small>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      {editing && <ExpenseForm initial={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
