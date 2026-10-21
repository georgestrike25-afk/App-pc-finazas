import { useMemo, useState } from 'react';
import { useApp } from '../store';
import { softDelete } from '../../db/repo';
import { occurrencesForMonth, FREQUENCY_LABEL } from '../../domain/expenses';
import { formatDate, monthLabel } from '../../domain/dates';
import { sum } from '../../domain/money';
import type { Expense, ExpenseKind } from '../../domain/types';
import { Badge, Card, confirmDialog, Empty, Money, MonthNav } from '../components/ui';
import { ExpenseForm, KIND_LABEL, METHOD_LABEL, newExpenseDraft, OccurrenceForm, type ExpenseDraft } from './ExpenseForm';

export function ExpenseTable({ kinds, emptyText }: { kinds: ExpenseKind[]; emptyText: string }) {
  const { data, month } = useApp();
  const [editing, setEditing] = useState<ExpenseDraft | null>(null);
  const [occ, setOcc] = useState<Expense | null>(null);
  const items = useMemo(() => occurrencesForMonth(data.expenses.filter((e) => kinds.includes(e.kind)), month), [data.expenses, kinds, month]);
  const byId = new Map(data.expenses.map((e) => [e.id, e]));
  const shared = kinds.includes('hogar');
  return (
    <>
      {items.length === 0 ? (
        <Empty title={`Sin gastos en ${monthLabel(month)}`}>{emptyText}</Empty>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Concepto</th><th>Categoría</th><th>Fecha</th><th>Medio</th>
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
                      {o.concept}
                      {e.frequency !== 'unica' && <Badge tone="info">{FREQUENCY_LABEL[e.frequency]}</Badge>}
                      {e.source === 'importado' && <Badge tone="neutral">importado</Badge>}
                      {!!e.linkedLineFingerprints?.length && e.source === 'manual' && <Badge tone="ok">vinculado a resumen</Badge>}
                      {!shared && <small className="muted d-block">{KIND_LABEL[o.kind].split(' (')[0]}</small>}
                    </td>
                    <td>{o.category}</td>
                    <td>{formatDate(e.date)}</td>
                    <td>{METHOD_LABEL[e.paymentMethod]}</td>
                    {shared && <td className="num"><Money value={o.total} estimated={o.estimated} /></td>}
                    {shared && <td className="num">{o.userPct} %</td>}
                    <td className="num"><Money value={o.userShare} estimated={o.estimated} /></td>
                    <td>
                      {o.paid ? <Badge tone="ok">Pagado</Badge> : e.paymentMethod === 'tarjeta' ? <Badge tone="warn">Consumo de tarjeta pendiente</Badge> : <Badge tone="warn">Pendiente</Badge>}
                      {o.estimated && <Badge tone="est">estimado</Badge>}
                    </td>
                    <td className="actions">
                      {e.frequency !== 'unica' && <button className="btn small" onClick={() => setOcc(e)}>Ajustar mes</button>}
                      <button className="btn small" onClick={() => setEditing(e)}>Editar</button>
                      <button
                        className="btn small ghost danger"
                        onClick={async () =>
                          (await confirmDialog(`¿Eliminar "${e.concept}"?${e.frequency !== 'unica' ? '\nSe eliminarán todas sus ocurrencias. Para un solo mes use "Ajustar mes" → "No corresponde".' : ''}`, { danger: true, ok: 'Eliminar' })) &&
                          softDelete('expenses', e.id, `Eliminación de gasto "${e.concept}"`)
                        }
                      >
                        Eliminar
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={shared ? 6 : 4}>Total del mes</td>
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

export function GastosPage() {
  const { data, month, setMonth } = useApp();
  const [editing, setEditing] = useState<ExpenseDraft | null>(null);
  return (
    <div className="page">
      <MonthNav month={month} setMonth={setMonth} />
      <div className="page-actions">
        <button className="btn primary" onClick={() => setEditing(newExpenseDraft('cotidiano', month, data.settings.defaultUserPct))}>+ Anotar gasto</button>
      </div>
      <Card title={`Gastos de ${monthLabel(month)}`}>
        <ExpenseTable kinds={['cotidiano', 'personal', 'hogar']} emptyText="Anotá lo que pagás en efectivo o débito. Lo de la tarjeta llega solo cuando subís el resumen." />
      </Card>
      <details className="card more-opts">
        <summary>¿Cómo evita la app contar dos veces un gasto?</summary>
        <ul className="rules small">
          <li>Una compra con tarjeta se cuenta <strong>una sola vez</strong>, como gasto del mes.</li>
          <li>El <strong>pago del resumen</strong> no es un gasto nuevo: cancela lo que ya se contó.</li>
          <li>Si anotaste a mano algo que después llega en el resumen (mismo importe, ±5 días), se <strong>vincula</strong> y no se duplica.</li>
          <li>Las compras en cuotas se cuentan cuota por cuota, en Deudas.</li>
        </ul>
      </details>
      {editing && <ExpenseForm initial={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
