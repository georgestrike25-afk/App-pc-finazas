import { useMemo, useState } from 'react';
import { useApp } from '../store';
import { saveRecord } from '../../db/repo';
import { cashStatus } from '../../domain/cash';
import { addMonths, formatDate, todayIso } from '../../domain/dates';
import type { Cents } from '../../domain/money';
import type { Settings } from '../../domain/types';
import { Card, Field, Money, MoneyInput, Progress } from '../components/ui';

/** Próximo cobro sugerido: el mismo día del mes en que se cobró el último sueldo. */
function nextPayday(data: ReturnType<typeof useApp>['data'], today: string): string {
  const last = data.incomes.filter((i) => !i.deleted && i.receivedDate).map((i) => i.receivedDate!).sort().at(-1);
  if (!last) return '';
  const day = last.slice(8, 10);
  let m = today.slice(0, 7);
  if (`${m}-${day}` <= today) m = addMonths(m, 1);
  return `${m}-${day}`;
}

/** "Plata hasta cobrar": cuánto tenés hoy y cuánto podés gastar por día. */
export function CashCard() {
  const { data, toast } = useApp();
  const today = todayIso();
  const st = useMemo(() => cashStatus(data, today), [data, today]);
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState<Cents | undefined>();
  const [until, setUntil] = useState('');
  const [showItems, setShowItems] = useState(false);
  const open = () => {
    setAmount(st ? Math.max(0, st.left) : undefined);
    setUntil(data.settings.cash?.until && data.settings.cash.until >= today ? data.settings.cash.until : nextPayday(data, today));
    setEditing(true);
  };
  const save = async () => {
    if (amount === undefined) return;
    await saveRecord<Settings>('settings', { ...data.settings, cash: { amount, setAt: new Date().toISOString(), until: until || undefined } }, 'Plata hasta cobrar actualizada');
    setEditing(false);
    toast('Listo: desde ahora se descuenta lo que gastes.');
  };
  if (!st || editing)
    return (
      <Card title="Plata hasta cobrar" className="cash-card" help="Poné cuánta plata tenés hoy (en efectivo, en el banco y en billeteras) y hasta cuándo te tiene que alcanzar. Cada gasto que anotes o que la app detecte se descuenta solo. Las compras con tarjeta de crédito no se descuentan hasta que pagás el resumen.">
        <div className="form-grid">
          <Field label="¿Cuánta plata tenés hoy?">{(id) => <MoneyInput id={id} value={amount} onChange={setAmount} placeholder="0,00" />}</Field>
          <Field label="¿Hasta cuándo te tiene que alcanzar? (opcional)" hint="Por ejemplo, el día que cobrás.">{(id) => <input id={id} type="date" min={today} value={until} onChange={(e) => setUntil(e.target.value)} />}</Field>
        </div>
        <div className="row-actions" style={{ justifyContent: 'flex-start' }}>
          <button className="btn primary" onClick={save} disabled={amount === undefined}>Guardar</button>
          {st && <button className="btn ghost" onClick={() => setEditing(false)}>Cancelar</button>}
        </div>
      </Card>
    );
  const c = data.settings.cash!;
  return (
    <Card className="cash-card" title="Plata hasta cobrar" actions={<button className="btn small ghost" onClick={open}>Corregir</button>} help="Se descuenta cada gasto que anotes o que la app detecte desde que pusiste el monto (efectivo, débito, transferencias, billeteras y pagos de resumen). Las compras con tarjeta de crédito no, porque se pagan con el resumen. Si el número no coincide con lo que tenés, tocá Corregir.">
      <span className="hero-label">{st.left >= 0 ? 'Te quedan' : 'Te pasaste por'}</span>
      <Money value={Math.abs(st.left)} className={`hero-money ${st.left < 0 ? 'neg' : ''}`} />
      {st.days !== undefined && c.until && (
        <p className="cash-days">
          hasta el {formatDate(c.until)} · {st.days} día{st.days === 1 ? '' : 's'} · <strong><Money value={st.perDay!} /> por día</strong>
        </p>
      )}
      {st.items.length > 0 && <Progress value={st.spent} max={st.start + st.returned} />}
      {st.returned > 0 && <small className="ok-text">+ <Money value={st.returned} /> que te devolvieron (Sancor)</small>}
      {st.items.length === 0 ? (
        <small className="muted">Desde el {formatDate(c.setAt.slice(0, 10))} se descuenta cada gasto que anotes.</small>
      ) : (
        <button className="linklike small" onClick={() => setShowItems(!showItems)}>
          Gastaste <Money value={st.spent} /> desde el {formatDate(c.setAt.slice(0, 10))} ({st.items.length} gasto{st.items.length === 1 ? '' : 's'}) {showItems ? '▲' : '▼'}
        </button>
      )}
      {showItems && st.items.length > 0 && (
        <ul className="list small" data-testid="cash-items">
          {st.items.slice(0, 30).map((i, k) => (
            <li key={k}><span>{formatDate(i.date)} · {i.concept}</span><Money value={i.amount} /></li>
          ))}
        </ul>
      )}
    </Card>
  );
}
