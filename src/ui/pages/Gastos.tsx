import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../store';
import { getDeviceId, saveRecord, softDelete } from '../../db/repo';
import { getDb } from '../../db/db';
import { householdPayment, payHousehold, unpayHousehold } from '../../domain/payments';
import { occurrencesForMonth, FREQUENCY_LABEL, happenedAt, noticeClock, otherPerson } from '../../domain/expenses';
import { formatDate, monthLabel, todayIso, type MonthKey } from '../../domain/dates';
import { formatARS, sum, type Cents } from '../../domain/money';
import type { Expense, ExpenseKind } from '../../domain/types';
import { Badge, Card, confirmDialog, Empty, Money, MonthNav, useNarrow } from '../components/ui';
import { DAILY_CATEGORIES, ExpenseForm, KIND_LABEL, METHOD_LABEL, newExpenseDraft, OccurrenceForm, type ExpenseDraft } from './ExpenseForm';
import { NotifReviewCard } from './Notificaciones';
import { RefundButton } from './Devoluciones';
import { categoryIcon } from '../components/categoryIcon';

/** Cómo se pagó, o de qué aviso vino si lo detectó la app (para reconocer un repetido: mismo aviso, misma hora). */
const origin = (e: Expense) => {
  const m = e.importedFrom === 'notificacion' ? e.notes?.match(/^Notificación de (.+?) · (\d{1,2}:\d{2})/) : null;
  // La hora sale del momento real del aviso, siempre en 24 horas (las notas viejas la guardaban en 12 horas, sin "a. m." ni "p. m.").
  return m ? `aviso de ${m[1]} ${noticeClock(e) ?? m[2]}` : METHOD_LABEL[e.paymentMethod];
};

/** Gasto que pagaste vos entero y tu pareja te devuelve la mitad (marcado con el botón rápido). */
const isHalf = (e: Expense) => e.kind === 'hogar' && e.userPct === 50 && e.paidBy === 'usuario';

/** Botón rápido "½ con …": pasa el gasto a compartido 50 % (o lo vuelve a solo tuyo). */
function HalfButton({ e, partner }: { e: Expense; partner: string }) {
  const on = isHalf(e);
  if (e.kind === 'hogar' && !on) return null;
  const toggle = () =>
    saveRecord<Expense>(
      'expenses',
      on ? { ...e, kind: DAILY_CATEGORIES.includes(e.category) ? 'cotidiano' : 'personal', userPct: 100, paidBy: undefined } : { ...e, kind: 'hogar', userPct: 50, paidBy: 'usuario' },
      `${on ? 'Gasto vuelve a ser solo tuyo' : 'Gasto a medias'}: "${e.concept}"`,
    );
  return (
    <button className={`btn small ${on ? 'primary' : 'ghost'}`} aria-pressed={on} onClick={toggle} title={on ? `Quitar: vuelve a ser solo tuyo` : `Lo pagaste vos y te devuelven la mitad`} aria-label={`${on ? 'Quitar a medias' : 'A medias'}: ${e.concept}`}>
      ½ {partner || 'a medias'}
    </button>
  );
}

/**
 * "Pagado" en un gasto del hogar: tu parte baja la plata hasta cobrar. Si lo pagó la otra persona
 * (planilla), cuenta como pago a ella y baja lo que le debés. Ya pagado: "Pagado ✓" con Deshacer.
 */
function HouseholdPay({ e, month, share, paid, partner }: { e: Expense; month: MonthKey; share: Cents; paid: boolean; partner: string }) {
  const { data, toast } = useApp();
  // Gastos del hogar, y lo que es solo tuyo pero pagó la otra persona (el alquiler del consultorio).
  if ((e.kind !== 'hogar' && e.paidBy !== 'pareja') || share <= 0) return null;
  const done = householdPayment(data.expenses, e.id, month);
  if (done)
    return (
      <>
        <Badge tone="ok">Pagado ✓</Badge>
        <button className="btn small ghost" aria-label={`Deshacer pago de ${e.concept}`} onClick={async () => {
          if (!(await confirmDialog(`¿Deshacer el pago de ${e.concept} (${formatARS(done.totalAmount)})?\nVuelve a tu plata hasta cobrar.`, { ok: 'Deshacer' }))) return;
          await softDelete('expenses', done.id, `Se deshizo el pago de "${e.concept}"`);
          const back = unpayHousehold(e, done);
          if (back) await saveRecord<Expense>('expenses', back, `"${e.concept}" vuelve a pendiente`);
          toast('Pago deshecho.');
        }}>Deshacer</button>
      </>
    );
  // Ya estaba pagado de antes (lo pagaste vos al anotarlo): no hay nada que marcar.
  if (paid && e.paidBy !== 'pareja') return null;
  const toPartner = e.paidBy === 'pareja';
  return (
    <button className="btn small primary" aria-label={`Pagado: ${e.concept}`} onClick={async () => {
      const msg = toPartner
        ? `¿Ya le pagaste a ${partner} tu parte de ${e.concept} (${formatARS(share)})?\nSe descuenta de tu plata hasta cobrar y de lo que le debés.`
        : `¿Ya pagaste tu parte de ${e.concept} (${formatARS(share)})?\nSe descuenta de tu plata hasta cobrar.`;
      if (!(await confirmDialog(msg, { ok: 'Sí, pagado' }))) return;
      const r = payHousehold(e, month, share, paid, partner, todayIso(), new Date().toISOString(), await getDeviceId(getDb()));
      if (r.expense) await saveRecord<Expense>('expenses', r.expense, `"${e.concept}" pagado`);
      await saveRecord<Expense>('expenses', r.payment, `Pago de "${e.concept}" (${formatARS(share)})`);
      toast(`Listo: se descontaron ${formatARS(share)} de tu plata hasta cobrar.`);
    }}>Pagado</button>
  );
}

export function ExpenseTable({ kinds, emptyText, also }: { kinds: ExpenseKind[]; emptyText: string; also?: (e: Expense) => boolean }) {
  const { data, month, setMonth } = useApp();
  const [editing, setEditing] = useState<ExpenseDraft | null>(null);
  const [occ, setOcc] = useState<Expense | null>(null);
  // Al tocar el aviso "Se anotó…" la app abre `#/gastos?foco=<id>`: va al mes del gasto, lo muestra y lo resalta.
  const [foco, setFoco] = useState(() => new URLSearchParams(window.location.hash.split('?')[1] ?? '').get('foco'));
  useEffect(() => {
    // Si ya estás en Gastos, tocar otro aviso solo cambia la dirección: se escucha ese cambio.
    const leer = () => setFoco(new URLSearchParams(window.location.hash.split('?')[1] ?? '').get('foco'));
    window.addEventListener('hashchange', leer);
    return () => window.removeEventListener('hashchange', leer);
  }, []);
  const enfocado = useRef('');
  useEffect(() => {
    if (!foco) {
      enfocado.current = ''; // el próximo aviso que toques vuelve a resaltar
      return;
    }
    if (enfocado.current === foco) return;
    const e = data.expenses.find((x) => x.id === foco && !x.deleted);
    if (!e) return;
    if (e.month !== month) {
      setMonth(e.month);
      return;
    }
    const t = setTimeout(() => {
      const el = document.querySelector(`[data-expense-id="${foco}"]`);
      if (!el) return;
      enfocado.current = foco;
      el.scrollIntoView({ block: 'center' });
      el.classList.add('exp-focus');
      window.history.replaceState(null, '', '#/gastos');
      setFoco(null);
      setTimeout(() => el.classList.remove('exp-focus'), 4000);
    }, 200);
    return () => clearTimeout(t);
  }, [foco, data.expenses, month, setMonth]);
  const byId = new Map(data.expenses.map((e) => [e.id, e]));
  // Del más nuevo al más viejo (y lo anotado último primero, si es del mismo día).
  const items = useMemo(() => {
    const ids = new Map(data.expenses.map((e) => [e.id, e]));
    const fecha = (e: Expense) => (e.month === month ? e.date : `${month}-${e.date.slice(8, 10)}`);
    // Lo que te devuelve otra persona (hospital) no es un gasto tuyo: está en Devoluciones.
    return occurrencesForMonth(data.expenses.filter((e) => (kinds.includes(e.kind) || !!also?.(e)) && !e.refund), month).sort((a, b) => {
      const x = ids.get(a.expenseId)!;
      const y = ids.get(b.expenseId)!;
      // Del más nuevo al más viejo; el mismo día, por la hora real (la del aviso, no la de cuando se abrió la app).
      return fecha(y).localeCompare(fecha(x)) || happenedAt(y) - happenedAt(x);
    });
  }, [data.expenses, kinds, month, also]);
  // Total y porcentaje solo aportan si este mes hay algún gasto compartido.
  const shared = kinds.includes('hogar') && items.some((o) => o.userPct !== 100);
  const canSplit = kinds.includes('hogar');
  const name = otherPerson(data.settings.partnerName);
  const partner = name === 'la otra persona' ? '' : name.split(/\s+/)[0];
  const narrow = useNarrow();
  const remove = async (e: Expense) =>
    (await confirmDialog(`¿Eliminar "${e.concept}"?${e.frequency !== 'unica' ? '\nSe eliminarán todas sus ocurrencias. Para un solo mes use "Ajustar mes" → "No corresponde".' : ''}`, { danger: true, ok: 'Eliminar' })) &&
    softDelete('expenses', e.id, `Eliminación de gasto "${e.concept}"`);
  return (
    <>
      {items.length === 0 ? (
        <Empty title={`Sin gastos en ${monthLabel(month)}`}>{emptyText}</Empty>
      ) : narrow ? (
        <>
          <ul className="exp-list" data-testid="gastos-lista">
            {items.map((o) => {
              const e = byId.get(o.expenseId)!;
              return (
                <li key={o.expenseId} className="exp-item" data-expense-id={o.expenseId}>
                  <CatIcon category={o.category} />
                  <div className="exp-main">
                  <div className="exp-top">
                    <span className="exp-concept">{o.concept}</span>
                    <Money value={o.userShare} estimated={o.estimated} className="exp-amount" />
                  </div>
                  <div className="exp-sub">
                    {o.category} · {formatDate(e.date)} · {origin(e)}
                    {shared && o.userPct !== 100 && <> · tu parte {o.userPct.toLocaleString('es-AR', { maximumFractionDigits: 1 })} % de <Money value={o.total} /></>}
                  </div>
                  <div className="exp-foot">
                    <span className="exp-badges">
                      {o.paid ? null : e.paymentMethod === 'tarjeta' ? <Badge tone={e.provisional ? 'info' : 'neutral'}>{e.provisional ? 'Provisorio: se confirma con el resumen' : e.source === 'importado' ? 'Del resumen de la tarjeta' : 'Llega con el resumen'}</Badge> : <Badge tone="warn">Pendiente</Badge>}
                      {e.frequency !== 'unica' && <Badge tone="info">{FREQUENCY_LABEL[e.frequency]}</Badge>}
                      {o.estimated && <Badge tone="est">estimado</Badge>}
                    </span>
                    <span className="exp-acts">
                      <HouseholdPay e={e} month={month} share={o.userShare} paid={o.paid} partner={partner || name} />
                      {canSplit && <HalfButton e={e} partner={partner} />}
                      {canSplit && e.kind !== 'hogar' && e.frequency === 'unica' && <RefundButton e={e} />}
                      {e.frequency !== 'unica' && <button className="btn small ghost" onClick={() => setOcc(e)}>Este mes</button>}
                      <button className="btn small ghost" onClick={() => setEditing(e)} aria-label={`Editar ${e.concept}`}>Editar</button>
                      <button className="btn small ghost danger" onClick={() => remove(e)} aria-label={`Eliminar ${e.concept}`}>Borrar</button>
                    </span>
                  </div>
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="exp-total">
            <span>Total del mes{shared ? ' (tu parte)' : ''}</span>
            <strong><Money value={sum(items.map((i) => i.userShare))} /></strong>
          </div>
        </>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Concepto</th>
                {shared && <th className="num">Total</th>}
                {shared && <th className="num">%</th>}
                <th className="num">{shared ? 'Mi parte' : 'Importe'}</th><th>Estado</th><th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((o) => {
                const e = byId.get(o.expenseId)!;
                return (
                  <tr key={o.expenseId} data-expense-id={o.expenseId}>
                    <td>
                      <div className="concept-cell">
                        <CatIcon category={o.category} />
                        <div>
                          <strong>{o.concept}</strong>
                          {e.frequency !== 'unica' && <Badge tone="info">{FREQUENCY_LABEL[e.frequency]}</Badge>}
                          {e.source === 'importado' && <Badge tone="neutral">{e.provisional ? 'provisorio' : 'importado'}</Badge>}
                          {!!e.linkedLineFingerprints?.length && e.source === 'manual' && e.importedFrom !== 'notificacion' && <Badge tone="ok">vinculado a resumen</Badge>}
                          <small className="muted d-block">{o.category} · {formatDate(e.date)} · {origin(e)}{!shared && o.kind !== 'cotidiano' ? ` · ${KIND_LABEL[o.kind].split(' (')[0]}` : ''}</small>
                        </div>
                      </div>
                    </td>
                    {shared && <td className="num"><Money value={o.total} estimated={o.estimated} /></td>}
                    {shared && <td className="num">{o.userPct.toLocaleString('es-AR', { maximumFractionDigits: 1 })} %</td>}
                    <td className="num"><Money value={o.userShare} estimated={o.estimated} /></td>
                    <td>
                      {o.paid ? null : e.paymentMethod === 'tarjeta' ? <Badge tone="neutral">Llega con el resumen</Badge> : <Badge tone="warn">Pendiente</Badge>}
                      {o.estimated && <Badge tone="est">estimado</Badge>}
                    </td>
                    <td className="actions">
                      <HouseholdPay e={e} month={month} share={o.userShare} paid={o.paid} partner={partner || name} />
                      {canSplit && <HalfButton e={e} partner={partner} />}
                      {canSplit && e.kind !== 'hogar' && e.frequency === 'unica' && <RefundButton e={e} />}
                      {e.frequency !== 'unica' && <button className="btn small" onClick={() => setOcc(e)}>Ajustar mes</button>}
                      <button className="btn small" onClick={() => setEditing(e)}>Editar</button>
                      <button className="btn small ghost danger" onClick={() => remove(e)}>
                        Eliminar
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={shared ? 3 : 1}>Total del mes</td>
                <td className="num"><strong><Money value={sum(items.map((i) => i.userShare))} /></strong></td>
                <td colSpan={2}></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      {editing && <ExpenseForm initial={editing} onClose={() => setEditing(null)} />}
      {occ && <OccurrenceForm expense={occ} month={month} onClose={() => setOcc(null)} />}
    </>
  );
}

function CatIcon({ category }: { category: string }) {
  const Icon = categoryIcon(category);
  return <span className="cat-ic" aria-hidden><Icon strokeWidth={1.8} /></span>;
}

/** Tu parte de los gastos del mes por categoría (gráfico circular + lista). */
function ByCategory() {
  const { data, month } = useApp();
  const rows = useMemo(() => {
    const m = new Map<string, number>();
    for (const o of occurrencesForMonth(data.expenses, month)) m.set(o.category, (m.get(o.category) ?? 0) + o.userShare);
    const all = [...m.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
    // Más de seis categorías: el resto se agrupa en "Otras".
    return all.length > 6 ? [...all.slice(0, 5), ['Otras', sum(all.slice(5).map((x) => x[1]))] as [string, number]] : all;
  }, [data.expenses, month]);
  const total = sum(rows.map((r) => r[1]));
  if (!total) return null;
  const r = 46;
  const c = 2 * Math.PI * r;
  let off = 0;
  return (
    <Card title="Por categoría">
      <div className="donut-row">
        <svg viewBox="0 0 120 120" width="120" height="120" style={{ transform: 'rotate(-90deg)', flexShrink: 0 }} role="img" aria-label="Tu parte de los gastos por categoría">
          {rows.map(([n, v], i) => {
            const len = (v / total) * c;
            const el = <circle key={n} cx="60" cy="60" r={r} fill="none" stroke={`var(--cat${i + 1})`} strokeWidth="16" strokeDasharray={`${Math.max(0, len - 2)} ${c}`} strokeDashoffset={-off} />;
            off += len;
            return el;
          })}
        </svg>
        <div>
          <div className="hero-label">Total del mes (tu parte)</div>
          <Money value={total} className="amount" />
        </div>
      </div>
      <ul className="list">
        {rows.map(([n, v], i) => (
          <li key={n}>
            <span className="inline-help"><i className="sw" style={{ background: `var(--cat${i + 1})` }} />{n}</span>
            <span className="inline-help"><small className="muted">{Math.round((v / total) * 100)} %</small><Money value={v} /></span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function GastosPage() {
  const { data, month, setMonth } = useApp();
  const [editing, setEditing] = useState<ExpenseDraft | null>(null);
  return (
    <div className="page">
      <NotifReviewCard />
      <MonthNav month={month} setMonth={setMonth} />
      <div className="page-actions">
        <button className="btn primary" data-tour="anotar-gasto" onClick={() => setEditing(newExpenseDraft('cotidiano', month, data.settings.defaultUserPct))}>+ Anotar gasto</button>
      </div>
      <div className="cols cols-main">
      <Card title={`Gastos de ${monthLabel(month)}`} help={<><p>Todos tus gastos del mes: los que anotaste a mano y los que llegaron con los resúmenes. Si es compartido, se cuenta solo tu parte (botón ½).</p><p>Nada se cuenta dos veces: una compra con tarjeta se cuenta una sola vez; el pago del resumen no es un gasto nuevo; si anotaste algo que después llega en el resumen (mismo importe, ±5 días), se vincula; las cuotas se cuentan una por una en Deudas.</p></>}>
        <ExpenseTable kinds={['cotidiano', 'personal', 'hogar']} emptyText="Anotá lo que pagás en efectivo o débito. Lo de la tarjeta llega solo cuando subís el resumen." />
      </Card>
      <ByCategory />
      </div>
      {editing && <ExpenseForm initial={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
