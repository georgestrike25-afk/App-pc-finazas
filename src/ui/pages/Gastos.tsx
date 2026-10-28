import { useMemo, useState } from 'react';
import { useApp } from '../store';
import { saveRecord, softDelete } from '../../db/repo';
import { occurrencesForMonth, FREQUENCY_LABEL } from '../../domain/expenses';
import { formatDate, monthLabel } from '../../domain/dates';
import { sum } from '../../domain/money';
import type { Expense, ExpenseKind } from '../../domain/types';
import { Badge, Card, confirmDialog, Empty, Money, MonthNav, useNarrow } from '../components/ui';
import { DAILY_CATEGORIES, ExpenseForm, KIND_LABEL, METHOD_LABEL, newExpenseDraft, OccurrenceForm, type ExpenseDraft } from './ExpenseForm';
import { NotifReviewCard } from './Notificaciones';
import { categoryIcon } from '../components/categoryIcon';
import { usePareja } from './Pareja';
import { compartirConPareja } from '../../sync/pareja';
import { esDePareja } from '../../domain/pareja';

/** Gasto que pagaste vos entero y tu pareja te devuelve la mitad (marcado con el botón rápido). */
const isHalf = (e: Expense) => e.kind === 'hogar' && e.userPct === 50 && e.paidBy === 'usuario';

/** Botón rápido "½ con …": pasa el gasto a compartido 50 % (o lo vuelve a solo tuyo). */
function HalfButton({ e, partner }: { e: Expense; partner: string }) {
  const { toast } = useApp();
  const pareja = usePareja();
  const on = isHalf(e);
  // Los gastos del modo pareja se manejan en Gastos → Pareja (ahí está "No es compartido").
  if (esDePareja(e)) return <Badge tone="info">Con {pareja?.yo ? pareja.doc.nombres[pareja.yo === 'a' ? 'b' : 'a'] : partner}</Badge>;
  if (e.kind === 'hogar' && !on) return null;
  const toggle = async () => {
    // Con el modo pareja activo, el gasto se manda: a tu pareja le aparece su mitad.
    if (!on && pareja?.yo && (await compartirConPareja({ ...e, kind: 'hogar', userPct: 50, paidBy: 'usuario' }))) {
      toast(`Compartido con ${pareja.doc.nombres[pareja.yo === 'a' ? 'b' : 'a']}: le aparece su mitad.`);
      return;
    }
    await saveRecord<Expense>(
      'expenses',
      on ? { ...e, kind: DAILY_CATEGORIES.includes(e.category) ? 'cotidiano' : 'personal', userPct: 100, paidBy: undefined } : { ...e, kind: 'hogar', userPct: 50, paidBy: 'usuario' },
      `${on ? 'Gasto vuelve a ser solo tuyo' : `Gasto a medias con ${partner}`}: "${e.concept}"`,
    );
  };
  return (
    <button className={`btn small ${on ? 'primary' : 'ghost'}`} aria-pressed={on} onClick={toggle} title={on ? `Quitar: vuelve a ser solo tuyo` : `Lo pagaste vos y ${partner} te devuelve la mitad`} aria-label={`${on ? 'Quitar mitad con' : 'Mitad con'} ${partner}: ${e.concept}`}>
      ½ {partner}
    </button>
  );
}

export function ExpenseTable({ kinds, emptyText }: { kinds: ExpenseKind[]; emptyText: string }) {
  const { data, month } = useApp();
  const [editing, setEditing] = useState<ExpenseDraft | null>(null);
  const [occ, setOcc] = useState<Expense | null>(null);
  const items = useMemo(() => occurrencesForMonth(data.expenses.filter((e) => kinds.includes(e.kind)), month), [data.expenses, kinds, month]);
  const byId = new Map(data.expenses.map((e) => [e.id, e]));
  // Total y porcentaje solo aportan si este mes hay algún gasto compartido.
  const shared = kinds.includes('hogar') && items.some((o) => o.userPct !== 100);
  const canSplit = kinds.includes('hogar');
  const partner = (data.settings.partnerName || 'pareja').trim().split(/\s+/)[0];
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
                <li key={o.expenseId} className="exp-item">
                  <CatIcon category={o.category} />
                  <div className="exp-main">
                  <div className="exp-top">
                    <span className="exp-concept">{o.concept}</span>
                    <Money value={o.userShare} estimated={o.estimated} className="exp-amount" />
                  </div>
                  <div className="exp-sub">
                    {o.category} · {formatDate(e.date)} · {METHOD_LABEL[e.paymentMethod]}
                    {shared && o.userPct !== 100 && <> · tu parte {o.userPct.toLocaleString('es-AR', { maximumFractionDigits: 1 })} % de <Money value={o.total} /></>}
                  </div>
                  <div className="exp-foot">
                    <span className="exp-badges">
                      {o.paid ? null : e.paymentMethod === 'tarjeta' ? <Badge tone={e.provisional ? 'info' : 'neutral'}>{e.provisional ? 'Provisorio: se confirma con el resumen' : e.source === 'importado' ? 'Del resumen de la tarjeta' : 'Llega con el resumen'}</Badge> : <Badge tone="warn">Pendiente</Badge>}
                      {e.frequency !== 'unica' && <Badge tone="info">{FREQUENCY_LABEL[e.frequency]}</Badge>}
                      {o.estimated && <Badge tone="est">estimado</Badge>}
                    </span>
                    <span className="exp-acts">
                      {canSplit && <HalfButton e={e} partner={partner} />}
                      {e.frequency !== 'unica' && <button className="btn small ghost" onClick={() => setOcc(e)}>Este mes</button>}
                      <button className="btn small ghost" onClick={() => setEditing(e)} aria-label={`Editar ${e.concept}`}>Editar</button>
                      <button className="btn small ghost danger" onClick={() => remove(e)} aria-label={`Eliminar ${e.concept}`}>✕</button>
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
                  <tr key={o.expenseId}>
                    <td>
                      <div className="concept-cell">
                        <CatIcon category={o.category} />
                        <div>
                          <strong>{o.concept}</strong>
                          {e.frequency !== 'unica' && <Badge tone="info">{FREQUENCY_LABEL[e.frequency]}</Badge>}
                          {e.source === 'importado' && <Badge tone="neutral">{e.provisional ? 'provisorio' : 'importado'}</Badge>}
                          {!!e.linkedLineFingerprints?.length && e.source === 'manual' && <Badge tone="ok">vinculado a resumen</Badge>}
                          <small className="muted d-block">{o.category} · {formatDate(e.date)} · {METHOD_LABEL[e.paymentMethod]}{!shared && o.kind !== 'cotidiano' ? ` · ${KIND_LABEL[o.kind].split(' (')[0]}` : ''}</small>
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
                      {canSplit && <HalfButton e={e} partner={partner} />}
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
      <Card title={`Gastos de ${monthLabel(month)}`} help={<><p>Todos tus gastos del mes: los que anotaste a mano y los que llegaron con los resúmenes. Si es compartido con tu pareja, se cuenta solo tu parte (botón ½).</p><p>Nada se cuenta dos veces: una compra con tarjeta se cuenta una sola vez; el pago del resumen no es un gasto nuevo; si anotaste algo que después llega en el resumen (mismo importe, ±5 días), se vincula; las cuotas se cuentan una por una en Deudas.</p></>}>
        <ExpenseTable kinds={['cotidiano', 'personal', 'hogar']} emptyText="Anotá lo que pagás en efectivo o débito. Lo de la tarjeta llega solo cuando subís el resumen." />
      </Card>
      <ByCategory />
      </div>
      {editing && <ExpenseForm initial={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
