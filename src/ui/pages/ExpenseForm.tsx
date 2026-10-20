import { useState } from 'react';
import { useApp } from '../store';
import { saveRecord } from '../../db/repo';
import { monthOf, todayIso, monthLabel, type MonthKey } from '../../domain/dates';
import { splitShared, FREQUENCY_LABEL } from '../../domain/expenses';
import { formatARS } from '../../domain/money';
import type { Expense, ExpenseKind, Frequency, PaidBy, PaymentMethod } from '../../domain/types';
import { Field, Modal, MoneyInput, MonthSelect } from '../components/ui';

export type ExpenseDraft = Omit<Expense, 'id' | 'createdAt' | 'updatedAt' | 'totalAmount'> & { id?: string; totalAmount?: number };

export const KIND_LABEL: Record<ExpenseKind, string> = {
  personal: 'Personal (no se divide)',
  cotidiano: 'Cotidiano (dentro del presupuesto)',
  hogar: 'Del hogar (compartido)',
};

export const METHOD_LABEL: Record<PaymentMethod, string> = {
  efectivo: 'Efectivo',
  debito: 'Débito',
  transferencia: 'Transferencia',
  tarjeta: 'Tarjeta de crédito',
  otro: 'Otro',
};

export function newExpenseDraft(kind: ExpenseKind, month: MonthKey, defaultUserPct: number): ExpenseDraft {
  const date = month === monthOf(todayIso()) ? todayIso() : `${month}-01`;
  return {
    kind,
    category: kind === 'hogar' ? 'Alquiler' : kind === 'cotidiano' ? 'Supermercado' : 'Otros',
    concept: '',
    date,
    month,
    userPct: kind === 'hogar' ? defaultUserPct : 100,
    paidBy: kind === 'hogar' ? 'cada_uno' : undefined,
    paid: kind !== 'hogar',
    frequency: kind === 'hogar' ? 'mensual' : 'unica',
    paymentMethod: 'efectivo',
    source: 'manual',
  };
}

export function ExpenseForm({ initial, onClose }: { initial: ExpenseDraft; onClose: () => void }) {
  const { data, toast } = useApp();
  const [d, setD] = useState<ExpenseDraft>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const shared = d.kind === 'hogar';
  // Las bonificaciones importadas se guardan con importe negativo (restan del gasto).
  const isCredit = (initial.totalAmount ?? 0) < 0;
  const split = d.totalAmount !== undefined ? splitShared(d.totalAmount, d.userPct) : null;

  const save = async () => {
    const e: Record<string, string> = {};
    if (!d.concept.trim()) e.concept = 'Ingrese un concepto';
    if (d.totalAmount === undefined || d.totalAmount === 0 || (!isCredit && d.totalAmount < 0)) e.amount = isCredit ? 'Ingrese el importe de la bonificación (negativo)' : 'Ingrese un importe mayor a cero';
    if (shared && (d.userPct < 0 || d.userPct > 100)) e.pct = 'Porcentaje entre 0 y 100';
    if (d.endMonth && d.endMonth < d.month) e.end = 'El fin no puede ser anterior al inicio';
    setErrors(e);
    if (Object.keys(e).length) return;
    await saveRecord<Expense>('expenses', { ...d, totalAmount: d.totalAmount!, userPct: shared ? d.userPct : 100 } as Expense, `${d.id ? 'Modificación' : 'Registro'} de gasto "${d.concept}"`);
    toast('Gasto guardado');
    onClose();
  };

  return (
    <Modal
      title={d.id ? 'Editar gasto' : 'Registrar gasto'}
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>Cancelar</button>
          <button className="btn primary" onClick={save}>Guardar</button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="Tipo de gasto">
          {(id) => (
            <select id={id} value={d.kind} onChange={(e) => {
              const kind = e.target.value as ExpenseKind;
              setD({ ...d, kind, userPct: kind === 'hogar' ? data.settings.defaultUserPct : 100 });
            }}>
              {Object.entries(KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          )}
        </Field>
        <Field label="Concepto" error={errors.concept}>{(id) => <input id={id} name="concept" value={d.concept} onChange={(e) => setD({ ...d, concept: e.target.value })} placeholder="Ej.: Alquiler, supermercado…" />}</Field>
        <Field label="Categoría">
          {(id) => (
            <>
              <input id={id} list="cats" value={d.category} onChange={(e) => setD({ ...d, category: e.target.value })} />
              <datalist id="cats">{data.settings.categories.map((c) => <option key={c} value={c} />)}</datalist>
            </>
          )}
        </Field>
        <Field label={shared ? 'Importe total' : 'Importe'} error={errors.amount}>{(id) => <MoneyInput id={id} name="amount" value={d.totalAmount} allowNegative={isCredit} onChange={(v) => setD({ ...d, totalAmount: v })} />}</Field>
        <Field label="Fecha">{(id) => <input id={id} type="date" value={d.date} onChange={(e) => e.target.value && setD({ ...d, date: e.target.value, month: d.id ? d.month : monthOf(e.target.value) })} />}</Field>
        <Field label="Mes de imputación" hint="Mes en que se computa el gasto.">{(id) => <MonthSelect id={id} value={d.month} onChange={(month) => setD({ ...d, month })} />}</Field>
        <Field label="Medio de pago" hint={d.paymentMethod === 'tarjeta' ? 'Se computa como consumo ahora; el pago del resumen no se resta otra vez.' : undefined}>
          {(id) => (
            <select id={id} value={d.paymentMethod} onChange={(e) => setD({ ...d, paymentMethod: e.target.value as PaymentMethod })}>
              {Object.entries(METHOD_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          )}
        </Field>
        <Field label="Frecuencia">
          {(id) => (
            <select id={id} value={d.frequency} onChange={(e) => setD({ ...d, frequency: e.target.value as Frequency })}>
              {Object.entries(FREQUENCY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          )}
        </Field>
        {d.frequency !== 'unica' && (
          <Field label="Último mes (opcional)" error={errors.end} hint="Vacío = continúa hasta que lo modifique.">
            {(id) => <input id={id} type="month" value={d.endMonth ?? ''} onChange={(e) => setD({ ...d, endMonth: e.target.value || undefined })} />}
          </Field>
        )}
        {shared && (
          <>
            <Field label="Porcentaje del usuario" error={errors.pct}>
              {(id) => <input id={id} name="userPct" type="number" min={0} max={100} step={1} value={d.userPct} onChange={(e) => setD({ ...d, userPct: Number(e.target.value) })} />}
            </Field>
            <Field label={`Porcentaje de ${data.settings.partnerName}`}>{(id) => <input id={id} type="number" value={100 - d.userPct} min={0} max={100} onChange={(e) => setD({ ...d, userPct: 100 - Number(e.target.value) })} />}</Field>
            <Field label="¿Quién pagó?">
              {(id) => (
                <select id={id} value={d.paidBy ?? 'cada_uno'} onChange={(e) => setD({ ...d, paidBy: e.target.value as PaidBy })}>
                  <option value="cada_uno">Cada uno pagó su parte</option>
                  <option value="usuario">Lo pagué yo (total)</option>
                  <option value="pareja">Lo pagó {data.settings.partnerName} (total)</option>
                </select>
              )}
            </Field>
          </>
        )}
        <Field label="Estado de pago">
          {(id) => (
            <select id={id} value={d.paid ? '1' : '0'} onChange={(e) => setD({ ...d, paid: e.target.value === '1' })}>
              <option value="1">Pagado</option>
              <option value="0">Pendiente</option>
            </select>
          )}
        </Field>
      </div>
      {shared && split && (
        <p className="total-line">
          Corresponde al usuario: <strong>{formatARS(split.user)}</strong> · a {data.settings.partnerName}: <strong>{formatARS(split.partner)}</strong>
        </p>
      )}
      <Field label="Observaciones">{(id) => <textarea id={id} rows={2} value={d.notes ?? ''} onChange={(e) => setD({ ...d, notes: e.target.value })} />}</Field>
      {d.documentId && <p className="muted small">Comprobante asociado: {data.documents.find((x) => x.id === d.documentId)?.name ?? 'documento'}</p>}
    </Modal>
  );
}

/** Ajuste de una ocurrencia de un gasto recurrente (sin modificar los demás meses). */
export function OccurrenceForm({ expense, month, onClose }: { expense: Expense; month: MonthKey; onClose: () => void }) {
  const ov = expense.overrides?.[month] ?? {};
  const [amount, setAmount] = useState<number | undefined>(ov.amount ?? expense.totalAmount);
  const [paid, setPaid] = useState(!!ov.paid);
  const [skip, setSkip] = useState(!!ov.skip);
  const save = async () => {
    const overrides = { ...(expense.overrides ?? {}), [month]: { amount, paid, skip } };
    await saveRecord<Expense>('expenses', { ...expense, overrides }, `Ajuste de "${expense.concept}" en ${monthLabel(month)}`);
    onClose();
  };
  return (
    <Modal title={`${expense.concept} — ${monthLabel(month)}`} onClose={onClose} footer={<><button className="btn ghost" onClick={onClose}>Cancelar</button><button className="btn primary" onClick={save}>Guardar</button></>}>
      <Field label="Importe de este mes" hint="Al confirmarlo, deja de ser una estimación.">{(id) => <MoneyInput id={id} value={amount} onChange={setAmount} />}</Field>
      <label className="check"><input type="checkbox" checked={paid} onChange={(e) => setPaid(e.target.checked)} /> Pagado</label>
      <label className="check"><input type="checkbox" checked={skip} onChange={(e) => setSkip(e.target.checked)} /> No corresponde este mes</label>
    </Modal>
  );
}
