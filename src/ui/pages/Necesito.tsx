import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../store';
import { saveRecord } from '../../db/repo';
import { cashStatus } from '../../domain/cash';
import { formatDate, monthLabel, todayIso } from '../../domain/dates';
import { ARCA_DEFAULT_MONTHLY, needForMonth } from '../../domain/necesito';
import type { Cents } from '../../domain/money';
import type { Settings } from '../../domain/types';
import { Badge, Card, Empty, Field, Money, MoneyInput, MonthNav } from '../components/ui';

/** Cuánto hay que tener en el mes para pagar todas las deudas. */
export function NecesitoPage() {
  const { data, month, setMonth, today, toast } = useApp();
  const need = useMemo(() => needForMonth(data, month, today), [data, month, today]);
  const cash = month === today ? cashStatus(data, todayIso()) : null;
  const [plan, setPlan] = useState<Cents | undefined>(need.arca?.plan);
  useEffect(() => setPlan(need.arca?.plan), [need.arca?.plan]);
  const savePlan = async () => {
    if (plan === undefined) return;
    await saveRecord<Settings>('settings', { ...data.settings, arcaMonthly: plan }, `Pago mensual a ARCA: ${(plan / 100).toLocaleString('es-AR')}`);
    toast('Listo: monto de ARCA actualizado.');
  };
  const diff = cash ? cash.left - need.total : 0;
  const diffArca = cash ? cash.left - need.totalWithArca : 0;

  return (
    <div className="page necesito">
      <MonthNav month={month} setMonth={setMonth} />
      <div className="kpis">
        <div className="kpi"><span>Necesitás en {monthLabel(month).split(' ')[0]}</span><Money value={need.total} /></div>
        {need.arca && <div className="kpi"><span>Con ARCA (opcional)</span><Money value={need.totalWithArca} /></div>}
      </div>

      {cash && (
        <Card title="Contra tu plata" help="Compara lo que tenés que pagar con la plata que anotaste en Este mes. Si no la anotaste, no puedo compararlo.">
          <ul className="answer-lines">
            <li><span>Tu plata hoy (la que anotaste)</span><Money value={cash.left} /></li>
            <li><span>Tenés que pagar este mes</span><span>− <Money value={need.total} /></span></li>
            <li className="strong"><span>{diff >= 0 ? 'Te sobran' : 'Te faltan'}</span><Money value={Math.abs(diff)} /></li>
            {need.arca && <li><span>{diffArca >= 0 ? 'Pagando también ARCA, te sobran' : 'Pagando también ARCA, te faltan'}</span><Money value={Math.abs(diffArca)} /></li>}
          </ul>
          <p className="muted small" style={{ margin: 0 }}>No cuenta tu próximo sueldo ni el día a día: es solo lo que ya tenés contra lo que vence.</p>
        </Card>
      )}

      <Card className="pay-month" title={`Lo que tenés que pagar · ${monthLabel(month)}`} help="Cada tarjeta por el total de su resumen (con las cuotas que trae adentro), cada préstamo aparte con su vencimiento, las facturas de servicios que subiste sin pagar y lo que venció antes y sigue sin pagarse.">
        {need.groups.length === 0 ? (
          <Empty title="No hay pagos cargados para este mes">Subí los resúmenes, cronogramas o facturas y acá vas a ver cuánto necesitás.</Empty>
        ) : (
          <>
            {need.groups.map((g) => (
              <div key={g.group} className="pay-entity">
                <div className="pay-head"><strong>{g.group}</strong><Money value={g.total} /></div>
                <ul className="list">
                  {g.lines.map((l, i) => (
                    <li key={i}>
                      <span>
                        {l.label} {l.overdue && <Badge tone="warn">Vencido</Badge>}
                        {l.due && <small className="muted d-block">vence el {formatDate(l.due).slice(0, 5)}</small>}
                        {l.detail && <small className="muted d-block">{l.detail}</small>}
                      </span>
                      <Money value={l.amount} estimated={l.estimated} />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            <div className="pay-total"><span>Total sin ARCA</span><Money value={need.total} /></div>
            {need.overdue > 0 && <p className="muted small" style={{ margin: '4px 0 0' }}>Incluye <Money value={need.overdue} /> que venció antes y sigue sin marcarse como pagado.</p>}
          </>
        )}
      </Card>

      {need.arca && (
        <Card title="ARCA (monotributo) · opcional" help="La deuda con ARCA no tiene cuotas fijas: pagás lo que puedas cada mes. Poné cuánto pensás pagar este mes y se suma aparte; no cambia lo que figura como deuda hasta que subas el PDF nuevo.">
          <p className="small" style={{ marginTop: 0 }}>Debés <strong><Money value={need.arca.balance} /></strong> en total.</p>
          <div className="form-grid">
            <Field label="Pensás pagar por mes">{(id) => <MoneyInput id={id} value={plan} onChange={setPlan} placeholder={String(ARCA_DEFAULT_MONTHLY / 100)} />}</Field>
          </div>
          <button className="btn small" onClick={savePlan} disabled={plan === undefined || plan === need.arca.plan}>Guardar</button>
          <ul className="answer-lines" style={{ marginTop: 12 }}>
            <li><span>Total sin ARCA</span><Money value={need.total} /></li>
            <li><span>ARCA este mes</span><span>+ <Money value={need.arca.plan} /></span></li>
            <li className="strong"><span>Total con ARCA</span><Money value={need.totalWithArca} /></li>
          </ul>
        </Card>
      )}
    </div>
  );
}
