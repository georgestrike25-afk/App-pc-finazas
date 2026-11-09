import { useMemo, useState } from 'react';
import { useApp } from '../store';
import { getDeviceId, saveRecord, softDelete } from '../../db/repo';
import { getDb } from '../../db/db';
import { debtPaymentExpense } from '../../domain/payments';
import { capitalize, occurrencesForMonth, otherPerson, partnerLedger } from '../../domain/expenses';
import { formatDate, todayIso } from '../../domain/dates';
import { formatARS, sum, type Cents } from '../../domain/money';
import type { Expense } from '../../domain/types';
import { Card, confirmDialog, Field, Modal, Money, MoneyInput, MonthNav } from '../components/ui';
import { ExpenseForm, newExpenseDraft, type ExpenseDraft } from './ExpenseForm';
import { ExpenseTable } from './Gastos';

/** Lo que es solo tuyo pero pagó la otra persona (p. ej. el alquiler del consultorio, de la planilla): se lo debés entero. */
const owedToPartner = (e: Expense) => e.paidBy === 'pareja' && !e.settlement;

export function CompartidosPage() {
  const { data, month, setMonth, today, toast } = useApp();
  const [editing, setEditing] = useState<ExpenseDraft | null>(null);
  const [paying, setPaying] = useState(false);
  const ledger = useMemo(() => partnerLedger(data.expenses, today), [data.expenses, today]);
  // Se arreglaron por fuera de la app: el saldo queda en cero sin tocar tu plata.
  const evenUp = async () => {
    if (!(await confirmDialog(`¿Ya están a mano con ${otherPerson(data.settings.partnerName)}?\nEl saldo queda en cero. No cambia tu plata ni tus gastos.`, { ok: 'Sí, estamos a mano' }))) return;
    const amount = Math.abs(ledger.net);
    const exp: Expense = { ...debtPaymentExpense('Quedamos a mano', amount, todayIso(), new Date().toISOString(), await getDeviceId(getDb())), category: 'Pago a pareja', settlement: ledger.net < 0 ? 'a_pareja' : 'de_pareja', cashAdjust: true };
    await saveRecord<Expense>('expenses', exp, 'Saldo con la otra persona en cero');
    toast('Listo: están a mano.');
  };
  const occ = useMemo(() => occurrencesForMonth(data.expenses.filter((e) => e.kind === 'hogar'), month), [data.expenses, month]);
  const p = otherPerson(data.settings.partnerName);
  const P = capitalize(p);

  return (
    <div className="page">
      <MonthNav month={month} setMonth={setMonth} />
      <Card className="saldo-card" title={`Saldo con ${P}`} help={`Lo que pagó ${p} y te toca (tu mitad de lo compartido y lo que es todo tuyo, como el consultorio), menos lo que le fuiste pagando. Se arma con la planilla y con los gastos donde ${p} figura como quien pagó.`}>
        <div className="saldo-row" data-testid="saldo-pareja">
          <div>
            <span className="hero-label">{ledger.net < 0 ? 'Le debés' : ledger.net > 0 ? `${P} te debe` : 'Están a mano'}</span>
            {ledger.net !== 0 && <Money value={Math.abs(ledger.net)} className="big-money" />}
          </div>
          <span className="row-actions" style={{ gap: 8 }}>
            {ledger.net < 0 && <button className="btn primary" onClick={() => setPaying(true)}>Le pagué a {P}</button>}
            {ledger.net !== 0 && <button className="btn small ghost" onClick={evenUp}>Ya estamos a mano</button>}
          </span>
        </div>
        {ledger.payments.length > 0 && (
          <details className="small" style={{ marginTop: 8 }}>
            <summary>Lo que le pagaste ({ledger.payments.length})</summary>
            <ul className="list">
              {ledger.payments.slice(0, 12).map((x) => (
                <li key={x.id}>
                  <span>{formatDate(x.date)} · {x.concept}</span>
                  <span className="exp-acts"><Money value={x.totalAmount} /><button className="btn small ghost danger" onClick={async () => (await confirmDialog(`¿Borrar el pago de ${formatARS(x.totalAmount)}?`, { danger: true, ok: 'Borrar' })) && softDelete('expenses', x.id, `Pago a ${P} borrado`)}>Borrar</button></span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </Card>
      <div className="page-actions">
        <button className="btn primary" onClick={() => setEditing(newExpenseDraft('hogar', month, data.settings.defaultUserPct))}>+ Gasto del hogar</button>
      </div>
      <div className="kpis">
        <div className="kpi"><span>Total gastos del hogar</span><Money value={sum(occ.map((o) => o.total))} /></div>
        <div className="kpi"><span>Mi parte</span><Money value={sum(occ.map((o) => o.userShare))} /></div>
        <div className="kpi"><span>Parte de {p}</span><Money value={sum(occ.map((o) => o.partnerShare))} /></div>
      </div>
      <Card title="Gastos del hogar (alquiler, servicios, supermercado compartido…)" help="Gastos que dividís con otra persona, y lo que es solo tuyo pero pagó ella (como el alquiler del consultorio): ese se lo debés entero. En cada uno podés elegir qué parte es tuya (por defecto 50 %) y quién lo pagó; arriba ves quién le debe a quién.">
        <ExpenseTable kinds={['hogar']} also={owedToPartner} emptyText="Registre alquiler, electricidad, gas, internet, supermercado compartido u otros. El reparto inicial es 50/50 y se puede editar en cada gasto." />
      </Card>
      {paying && <PayPartnerModal name={P} initial={Math.max(0, -ledger.net)} onClose={() => setPaying(false)} onSave={async (amount, date) => {
        const exp: Expense = { ...debtPaymentExpense(`Pago a ${P}`, amount, date, new Date().toISOString(), await getDeviceId(getDb())), category: 'Pago a pareja', settlement: 'a_pareja' };
        await saveRecord<Expense>('expenses', exp, `Pago a ${P}: ${formatARS(amount)}`);
        setPaying(false);
        toast(`Listo: le pagaste ${formatARS(amount)} a ${P}.`);
      }} />}
      {editing && <ExpenseForm initial={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

/** "Le pagué": cuánto y cuándo. Baja lo que le debés y también tu plata hasta cobrar. */
function PayPartnerModal({ name, initial, onClose, onSave }: { name: string; initial: Cents; onClose: () => void; onSave: (amount: Cents, date: string) => void | Promise<void> }) {
  const [amount, setAmount] = useState<Cents | undefined>(initial || undefined);
  const [date, setDate] = useState(todayIso());
  return (
    <Modal title={`Le pagué a ${name}`} onClose={onClose} footer={<><button className="btn ghost" onClick={onClose}>Cancelar</button><button className="btn primary" disabled={!amount || amount <= 0} onClick={() => amount && onSave(amount, date)}>Guardar</button></>}>
      <div className="form-grid">
        <Field label="Cuánto le pagaste" hint="Viene lo que le debés; cambialo si le pagaste una parte.">{(id) => <MoneyInput id={id} value={amount} onChange={setAmount} />}</Field>
        <Field label="Cuándo">{(id) => <input id={id} type="date" value={date} max={todayIso()} onChange={(e) => e.target.value && setDate(e.target.value)} />}</Field>
      </div>
      <p className="muted small">Baja lo que le debés y también tu plata hasta cobrar. No es un gasto nuevo: tu parte ya está en los gastos del mes.</p>
    </Modal>
  );
}
