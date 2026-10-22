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
import { Card, confirmDialog, Help, Money, MonthNav, Progress } from '../components/ui';
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
  const debts = useMemo(() => debtByEntity(data.obligations, today), [data.obligations, today]);
  const debtTotal = sum(debts.map((d) => d.remaining));
  const debtEnd = debts.map((d) => d.lastMonth).filter(Boolean).sort().at(-1);
  const goal = data.goal;
  const proj = useMemo(() => (goal.estimatedCost > 0 ? projectGoal(data, goal, today, goal.scenarios.find((s) => s.key === 'intermedio') ?? goal.scenarios[0]) : null), [data, goal, today]);
  const isCurrent = month === today;
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

  return (
    <div className="page">
      <MonthNav month={month} setMonth={setMonth} />
      {isCurrent && <CashCard />}
      <Card className={`hero ${cash ? 'hero-secondary' : ''}`}>
        <span className="hero-label inline-help">
          {cash ? 'Según lo cargado este mes' : isCurrent ? 'Te quedan este mes' : `Resultado de ${monthLabel(month)}`}
          <Help label="Cómo se calcula lo que te queda">
            <p><strong>Te quedan</strong> = lo que entró − lo que gastaste − las cuotas y préstamos del mes.</p>
            <ul>
              <li><strong>Entró:</strong> el sueldo y otros ingresos ya cobrados.</li>
              <li><strong>Gastaste:</strong> tu parte de los gastos del hogar, tus gastos personales y los del día a día.</li>
              <li><strong>Cuotas y préstamos:</strong> lo que vence este mes de préstamos, tarjetas y planes.</li>
            </ul>
            <p>Solo cuenta lo que ya pasó, no estimaciones. Tocá cada línea para ver el detalle.</p>
          </Help>
        </span>
        <Money value={r.available} className="hero-money" />
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
        <div className="hero-budget">
          <span className="inline-help small muted">
            Presupuesto del día a día
            <Help label="Qué es el presupuesto del día a día">Es el máximo que querés gastar en el mes en comida, transporte, salidas y demás gastos chicos. La barra muestra cuánto llevás. Lo cambiás en Gastos → Presupuesto.</Help>
          </span>
          <a href="#/presupuesto" className="muted small">Día a día: gastaste <Money value={r.info.dailyRegistered} /> de <Money value={r.info.dailyBudget} /></a>
          <Progress value={r.info.dailyRegistered} max={r.info.dailyBudget} />
        </div>
        <div className="row-actions" style={{ justifyContent: 'flex-start' }}>
          <a className="btn primary" href="#/importar">Subir documento</a>
          <button className="btn" onClick={() => setEditing(newExpenseDraft('cotidiano', month, data.settings.defaultUserPct))}>+ Anotar gasto</button>
          <a className="btn ghost small" href="#/resumen">Ver el detalle →</a>
        </div>
      </Card>

      {isCurrent && <Pendientes items={checklist} />}
      {isCurrent && <NotifReviewCard />}

      <div className="grid2">
        <a className="card link-card" href="#/entidades">
          <span className="muted small">Deudas</span>
          <Money value={debtTotal} className="big-money" />
          <small className="muted">{debtEnd ? `Terminás de pagar todo en ${monthLabel(debtEnd)}` : 'Sin deudas pendientes'}</small>
        </a>
        <a className="card link-card" href="#/viaje">
          <span className="muted small">{goal.name}</span>
          {proj ? (
            <>
              <strong className={proj.reachable ? 'ok-text' : 'warn'}>{proj.reachable ? '✓ Llegás con lo planeado' : `Faltan ${Math.round((proj.missing / Math.max(1, goal.estimatedCost)) * 100)} %`}</strong>
              <Progress value={goalProgress(goal)} max={goal.estimatedCost} />
              {!proj.reachable && <small className="muted">Ahorrá <Money value={proj.requiredMonthly} /> por mes para llegar</small>}
            </>
          ) : (
            <small className="muted">Poné cuánto cuesta para saber si llegás →</small>
          )}
        </a>
      </div>
      {editing && <ExpenseForm initial={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
