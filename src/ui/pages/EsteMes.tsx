import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../store';
import { computeMonth } from '../../domain/monthly';
import { monthChecklist, type CheckItem } from '../../domain/checklist';
import { debtByEntity, markPaidThrough } from '../../domain/obligations';
import { goalProgress, projectGoal } from '../../domain/savings';
import { monthLabel, todayIso } from '../../domain/dates';
import { sum } from '../../domain/money';
import { getDb } from '../../db/db';
import { notify, saveRecord } from '../../db/repo';
import { markStatementPaid } from '../../db/cardPayments';
import { Card, confirmDialog, Empty, Help, InHeader, Money, MonthNav, Ring } from '../components/ui';
import { ArrowDownToLine, ArrowUpRight, ChevronRight, Plus, Receipt, Upload } from 'lucide-react';
import { TripScene } from '../components/TripScene';
import { occurrencesForMonth } from '../../domain/expenses';
import { startTour } from '../components/Tour';
import { ExpenseForm, newExpenseDraft, type ExpenseDraft } from './ExpenseForm';
import type { Obligation } from '../../domain/types';
import { NotifReviewCard } from './Notificaciones';
import { CashCard } from './CashCard';
import { cashStatus } from '../../domain/cash';
import { uid } from '../../domain/text';
import { formatARS } from '../../domain/money';
import type { Expense } from '../../domain/types';

function Pendientes({ items }: { items: CheckItem[] }) {
  const { data, toast } = useApp();
  const pending = items.filter((i) => !i.done);
  const done = items.filter((i) => i.done);
  const payStatement = async (id: string) => {
    const st = data.statements.find((s) => s.id === id);
    if (!st) return;
    if (!(await confirmDialog(`¿Ya pagaste el resumen de ${st.entity}?\nSe registra el pago total de hoy y sus cuotas quedan pagadas.`, { ok: 'Sí, ya lo pagué' }))) return;
    await markStatementPaid(getDb(), st, todayIso(), new Date().toISOString());
    notify();
    toast('Resumen marcado como pagado.');
  };
  const payInstallment = async (obId: string, n: number) => {
    const ob = data.obligations.find((o) => o.id === obId);
    if (!ob) return;
    if (!(await confirmDialog(`¿Ya pagaste la cuota ${n} de ${ob.concept}?`, { ok: 'Sí, la pagué' }))) return;
    await saveRecord<Obligation>('obligations', markPaidThrough(ob, n, new Date().toISOString(), `Pago de cuota ${n} (confirmado por el usuario)`), `Pago de cuota ${n} de "${ob.concept}"`);
    toast('Cuota marcada como pagada.');
  };
  return (
    <Card title={pending.length ? `Pendientes (${pending.length})` : 'Todo al día ✓'} className="checklist" tour="pendientes" help="Lo que falta hacer este mes. Se va tildando solo cuando subís los documentos. Si ya pagaste algo y no tenés el comprobante, tocá Ya lo pagué.">
      <ul className="check-list" data-testid="pendientes">
        {[...pending, ...done].map((i) => (
          <li key={i.key} className={i.done ? 'done' : ''}>
            <span className="mark" aria-hidden>{i.done ? '✓' : '○'}</span>
            <span className="txt">
              {i.title}
              {i.detail && <small className="muted d-block">{i.detail}</small>}
            </span>
            {!i.done && (
              <span className="acts">
                {i.payStatementId && <button className="btn small primary" onClick={() => payStatement(i.payStatementId!)}>Ya lo pagué</button>}
                {i.payInstallment && <button className="btn small primary" onClick={() => payInstallment(i.payInstallment!.obligationId, i.payInstallment!.n)}>Ya la pagué</button>}
                {i.href && <a className="btn small" href={i.href}>{i.hrefLabel ?? 'Ir'}</a>}
              </span>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function EsteMesPage() {
  const { data, month, setMonth, today, toast } = useApp();
  const [editing, setEditing] = useState<ExpenseDraft | null>(null);
  const [lastBackup, setLastBackup] = useState<string | undefined>();
  useEffect(() => {
    getDb().meta.get('lastBackup').then((r) => setLastBackup(r?.value as string | undefined));
  }, [data]);
  const r = useMemo(() => computeMonth(data, month, today), [data, month, today]);
  const get = (k: string) => r.sections.find((s) => s.key === k)!.total;
  const spent = get('fijos') + get('personales') + get('cotidiano');
  const checklist = useMemo(() => monthChecklist(data, today, todayIso(), lastBackup), [data, today, lastBackup]);
  const debts = useMemo(() => debtByEntity(data.obligations, today, data), [data, today]);
  const debtTotal = sum(debts.map((d) => d.remaining));
  const debtEnd = debts.map((d) => d.lastMonth).filter(Boolean).sort().at(-1);
  const goal = data.goal;
  const proj = useMemo(() => (goal.estimatedCost > 0 ? projectGoal(data, goal, today, goal.scenarios.find((s) => s.key === 'intermedio') ?? goal.scenarios[0]) : null), [data, goal, today]);
  const isCurrent = month === today;
  const daysLeft = goal.targetMonth ? Math.max(0, Math.round((new Date(`${goal.targetMonth}-01T00:00:00`).getTime() - new Date(`${todayIso()}T00:00:00`).getTime()) / 86400000)) : null;
  // Si el usuario cargó cuánta plata tiene, ese es el número principal; las cuentas del mes quedan como referencia.
  const cash = isCurrent ? cashStatus(data, todayIso()) : null;
  const diff = cash ? r.available - cash.left : 0;
  const adjust = async () => {
    if (!(await confirmDialog(`¿Anotar ${formatARS(diff)} como "gastos sin detalle" de este mes?\nAsí las cuentas del mes coinciden con la plata que tenés. No se descuenta de tu plata (ya lo gastaste).`, { ok: 'Anotar' }))) return;
    const now = new Date().toISOString();
    const t = todayIso();
    await saveRecord<Expense>('expenses', { id: uid(), createdAt: now, updatedAt: now, kind: 'personal', category: 'Otros', concept: 'Gastos sin detalle (ajuste)', date: t, month: t.slice(0, 7), totalAmount: diff, userPct: 100, paid: true, frequency: 'unica', paymentMethod: 'efectivo', source: 'manual', cashAdjust: true, notes: 'Diferencia entre las cuentas del mes y la plata real.' }, 'Ajuste: gastos sin detalle');
    toast('Listo: las cuentas del mes coinciden con tu plata.');
  };
  const empty = !data.incomes.length && !data.expenses.length && !data.obligations.length && !data.statements.length;

  if (empty)
    return (
      <div className="page">
        <Card className="welcome" title="Primeros pasos" tour="primeros-pasos">
          <p>La app empieza vacía. Cargá estas cuatro cosas y después solo vas a tener que subir tus resúmenes cada mes.</p>
          <ol className="steps">
            <li><a href="#/importar">Subí los <strong>cronogramas de tus préstamos</strong></a> (PDF del banco).</li>
            <li><a href="#/importar">Subí el último <strong>resumen de cada tarjeta</strong></a> (Visa, Naranja X, Ualá…) y el plan de Mercado Pago.</li>
            <li><a href="#/compartidos">Anotá tus <strong>gastos fijos del hogar</strong></a> (alquiler, luz, gas, internet).</li>
            <li><a href="#/viaje">Poné <strong>cuánto cuesta tu viaje</strong></a> y cuánto querés ahorrar por mes.</li>
          </ol>
          <p className="muted small">Todo se guarda solo en este dispositivo. ¿Dudas? Mirá <a href="#/ayuda">Cómo usar</a> o <button type="button" className="linklike" onClick={startTour}>la guía paso a paso</button>.</p>
        </Card>
        <CashCard />
      </div>
    );

  const label = cash ? 'Según lo cargado este mes' : isCurrent ? 'Te quedan este mes' : `Resultado de ${monthLabel(month)}`;
  const calcHelp = (
    <Help label="Cómo se calcula lo que te queda">
      <p><strong>Te quedan</strong> = lo que entró − lo que gastaste − las cuotas y préstamos del mes.</p>
      <ul>
        <li><strong>Entró:</strong> el sueldo y otros ingresos ya cobrados.</li>
        <li><strong>Gastaste:</strong> tu parte de los gastos del hogar, tus gastos personales y los del día a día.</li>
        <li><strong>Cuotas y préstamos:</strong> lo que vence este mes de préstamos, tarjetas y planes.</li>
      </ul>
      <p>Solo cuenta lo que ya pasó, no estimaciones. Tocá cada línea para ver el detalle.</p>
    </Help>
  );
  const accounts = (
    <>
      {cash && Math.abs(diff) >= 100 && (
        <div className="cash-diff" data-testid="cash-diff">
          {diff > 0 ? (
            <>
              <p className="small" style={{ margin: 0 }}>
                Es <strong><Money value={diff} /></strong> más de lo que tenés: seguramente son gastos que no anotaste.
              </p>
              <button className="btn small" onClick={adjust}>Anotar la diferencia como "gastos sin detalle"</button>
            </>
          ) : (
            <p className="small muted" style={{ margin: 0 }}>Tenés <Money value={-diff} /> más de lo que dicen las cuentas del mes (por ejemplo, plata ahorrada de antes).</p>
          )}
        </div>
      )}
      {r.incomeStatus !== 'confirmado' && <small className="warn d-block">Todavía no está cargado el sueldo de este mes.</small>}
      <ul className="hero-lines">
        <li><a href="#/ingresos"><span>Entró</span><Money value={get('ingresos')} /></a></li>
        <li><a href="#/gastos"><span>Gastaste</span><Money value={spent} /></a></li>
        <li><a href="#/entidades"><span>Cuotas y préstamos</span><Money value={get('obligaciones')} /></a></li>
      </ul>
      <a className="card-link" href="#/resumen">Ver la cuenta completa<ChevronRight aria-hidden /></a>
    </>
  );
  const newExpense = () => setEditing(newExpenseDraft('cotidiano', month, data.settings.defaultUserPct));

  return (
    <div className="page home">
      <InHeader>
        <a className="btn" href="#/importar"><Upload aria-hidden />Subir documento</a>
        <button className="btn primary" onClick={newExpense}><Plus aria-hidden />Anotar gasto</button>
      </InHeader>
      <MonthNav month={month} setMonth={setMonth} />
      <div className="cols cols-home-1">
        {isCurrent && <div className="o-1 cell"><CashCard /></div>}
        <section className="card io o-1" aria-label="Entró y gastaste">
          <a href="#/ingresos">
            <span className="io-ic in" aria-hidden><ArrowDownToLine /></span>
            <span className="hero-label">Entró</span>
            <Money value={get('ingresos')} className="amount pos" />
            <small className="muted">{r.incomeStatus === 'confirmado' ? `Sueldo de ${monthLabel(month).split(' de ')[0]}` : 'Falta cargar el sueldo'}</small>
          </a>
          <a href="#/gastos">
            <span className="io-ic out" aria-hidden><ArrowUpRight /></span>
            <span className="hero-label">Gastaste</span>
            <Money value={spent} className="amount neg-text" />
            <small className="muted">Tu parte, sin cuotas</small>
          </a>
        </section>
        <section className={`card hero o-3 ${cash ? 'hero-secondary' : ''}`}>
          {cash ? (
            // Con la plata cargada, "Te quedan" es la tarjeta principal: las cuentas del mes quedan plegadas.
            <details className="hero-fold">
              <summary>
                <span className="hero-label inline-help">{label}{calcHelp}</span>
                <Money value={r.available} className="hero-money" />
              </summary>
              {accounts}
            </details>
          ) : (
            <>
              <span className="hero-label inline-help">{label}{calcHelp}</span>
              <Money value={r.available} className="hero-money" />
              {accounts}
            </>
          )}
        </section>
      </div>
      <button className="btn primary only-mobile o-1" onClick={newExpense}><Plus aria-hidden />Anotar gasto</button>

      <div className="cols cols-home-2">
        <Card title={`Día a día en ${monthLabel(month).split(' de ')[0]}`} className="chart-card o-4">
          <DailyChart month={month} budget={r.info.dailyBudget} />
        </Card>
        <Card title="Presupuesto del mes" className="o-2" help="Es el máximo que querés gastar en el mes en comida, transporte, salidas y demás gastos chicos. Lo cambiás en Presupuesto.">
          <Ring value={r.info.dailyRegistered} max={r.info.dailyBudget} label="Usaste del presupuesto del día a día" />
          <div className="hero-budget" style={{ textAlign: 'center' }}>
            <a href="#/presupuesto" className="small">Día a día: gastaste <Money value={r.info.dailyRegistered} /> de <Money value={r.info.dailyBudget} /></a>
          </div>
          <a className="card-link" href="#/presupuesto">Ver por categoría<ChevronRight aria-hidden /></a>
        </Card>
        {isCurrent ? <div className="o-2 cell"><Pendientes items={checklist} /></div> : <div />}
      </div>
      {isCurrent && <NotifReviewCard />}

      <div className="cols cols-home-3">
        <a className="card link-card o-3" href="#/entidades">
          <span className="hero-label">Deudas</span>
          <Money value={debtTotal} className="big-money" />
          <small className="muted">{debtEnd ? `Terminás de pagar todo en ${monthLabel(debtEnd)}` : 'Sin deudas pendientes'}</small>
          <span className="card-link">Ver por entidad<ChevronRight aria-hidden /></span>
        </a>
        <a className="card trip o-3" href="#/viaje">
          <TripScene />
          <div className="in">
            <div>
              {daysLeft !== null && <div className="days">Faltan {daysLeft} días</div>}
              <h3>{goal.name}</h3>
            </div>
            {proj ? (
              <div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                  <Money value={goalProgress(goal)} className="amount" />
                  <span className="of">de <Money value={goal.estimatedCost} /></span>
                </div>
                <div className="bar"><i style={{ width: `${Math.min(100, (goalProgress(goal) / Math.max(1, goal.estimatedCost)) * 100)}%` }} /></div>
                <div className="trip-foot">
                  <span className="go">Ver el plan</span>
                  <span className="of">{proj.reachable ? '✓ Llegás con lo planeado' : <>Para llegar, ahorrá <Money value={proj.requiredMonthly} /> por mes</>}</span>
                </div>
              </div>
            ) : (
              <div className="trip-foot"><span className="go">Poné cuánto cuesta</span><span className="of">para saber si llegás</span></div>
            )}
          </div>
        </a>
      </div>
      {editing && <ExpenseForm initial={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

/** Gastos del día a día de cada día del mes, con la línea del promedio que permite el presupuesto. */
function DailyChart({ month, budget }: { month: string; budget: number }) {
  const { data } = useApp();
  const byDay = useMemo(() => {
    const ids = new Map(data.expenses.map((e) => [e.id, e]));
    const days = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();
    const out = new Array<number>(days).fill(0);
    for (const o of occurrencesForMonth(data.expenses.filter((e) => e.kind === 'cotidiano'), month)) {
      const e = ids.get(o.expenseId);
      const d = e && e.month === month ? Number(e.date.slice(8, 10)) : 1;
      out[Math.min(days, Math.max(1, d)) - 1] += o.userShare;
    }
    return out;
  }, [data.expenses, month]);
  const n = byDay.length;
  const avg = budget > 0 ? budget / n : 0;
  const max = Math.max(1, avg * 1.6, ...byDay);
  const W = 560, H = 220, pad = 30, bw = (W - pad) / n;
  const y = (v: number) => H - 20 - (v / max) * (H - 34);
  const k = (v: number) => (v >= 100_000_00 ? `${Math.round(v / 100_000_00)} M` : `${Math.round(v / 100_000)} k`);
  if (!byDay.some(Boolean)) return <Empty title="Todavía no hay gastos del día a día" icon={Receipt}>Lo que anotes o detecte la app aparece acá, día por día.</Empty>;
  return (
    <>
      <svg className="daily-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Gastos del día a día por día del mes">
        {[0, max / 2, max].map((v) => (
          <g key={v}>
            <line x1={pad} x2={W} y1={y(v)} y2={y(v)} stroke="var(--border)" />
            <text x={0} y={y(v) + 3} fontSize="10" fill="var(--muted)">{k(v)}</text>
          </g>
        ))}
        {byDay.map((v, i) => v > 0 && <rect key={i} x={pad + i * bw + bw * 0.2} y={y(v)} width={bw * 0.6} height={H - 20 - y(v)} rx={2} fill="var(--bar)"><title>{`Día ${i + 1}: ${formatARS(v)}`}</title></rect>)}
        {avg > 0 && <line x1={pad} x2={W} y1={y(avg)} y2={y(avg)} stroke="var(--lime)" strokeWidth={2} strokeDasharray="5 4" />}
        {[1, 5, 10, 15, 20, 25, n].map((d) => <text key={d} x={pad + (d - 1) * bw + bw / 2} y={H - 4} fontSize="10" textAnchor="middle" fill="var(--muted)">{d}</text>)}
      </svg>
      <div className="legend"><span><i className="sw" style={{ background: 'var(--bar)' }} />Gastos del día</span>{avg > 0 && <span><i className="sw" style={{ background: 'var(--lime)' }} />Promedio que permite el presupuesto</span>}</div>
    </>
  );
}
