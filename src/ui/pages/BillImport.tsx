import { useState } from 'react';
import type { BillCheck, BillDoc } from '../../importers/facturas';
import { formatDate } from '../../domain/dates';
import { Card, Money } from '../components/ui';

/** Confirmación de la deuda de ARCA o de una factura de servicio (Claro…). */
export function BillReviewView({ bill, check, error, onCancel, onConfirm }: { bill: BillDoc; check: BillCheck; error: string; onCancel: () => void; onConfirm: (opts: { paid: boolean }) => void }) {
  const [paid, setPaid] = useState(false);
  if (bill.kind === 'arca')
    return (
      <Card title="Deuda con ARCA (monotributo)" className="bill-review">
        <ul className="answer-lines">
          {bill.capital !== undefined && <li><span>Cuotas del monotributo</span><Money value={bill.capital} /></li>}
          {bill.interest !== undefined && <li><span>Intereses</span><Money value={bill.interest} /></li>}
          <li className="strong"><span>Total que debés al {formatDate(bill.date)}</span><Money value={bill.total} /></li>
        </ul>
        <p className="muted small">
          {check.existing
            ? <>Ya estaba cargada (<Money value={check.existing.knownBalance ?? 0} />{check.existing.originDate ? ` al ${formatDate(check.existing.originDate)}` : ''}): se actualiza el saldo, no se suma otra deuda.</>
            : 'Se carga en Deudas como "ARCA · Monotributo" con este saldo. Cada vez que subas el PDF nuevo, se actualiza.'}
          {bill.period ? ` Períodos ${bill.period}.` : ''}
        </p>
        {error && <p className="err">{error}</p>}
        <div className="page-actions">
          <button className="btn ghost" onClick={onCancel}>Cancelar</button>
          <button className="btn primary" onClick={() => onConfirm({ paid: false })}>{check.existing ? 'Actualizar saldo' : 'Confirmar'}</button>
        </div>
      </Card>
    );
  return (
    <Card title={`Factura de ${bill.provider}`} className="bill-review">
      <ul className="answer-lines">
        <li><span>{bill.concept}{bill.invoice ? ` · N.º ${bill.invoice}` : ''}</span><span /></li>
        {bill.periodFrom && bill.periodTo && <li><span>Período</span><span>{formatDate(bill.periodFrom)} al {formatDate(bill.periodTo)}</span></li>}
        <li><span>Vence</span><span>{formatDate(bill.due)}</span></li>
        <li className="strong"><span>Total a pagar</span><Money value={bill.total} /></li>
      </ul>
      {check.alreadyImported ? (
        <p className="muted small">Esta factura ya está cargada: no se vuelve a sumar.</p>
      ) : (
        <>
          <p className="muted small">Se anota como gasto de {formatDate(bill.due).slice(3)} (categoría Telefonía). Si no está pagada, aparece en Pendientes de Este mes hasta que toques "Ya lo pagué".</p>
          <label className="check"><input type="checkbox" checked={paid} onChange={(e) => setPaid(e.target.checked)} /> Ya la pagué</label>
        </>
      )}
      {error && <p className="err">{error}</p>}
      <div className="page-actions">
        <button className="btn ghost" onClick={onCancel}>{check.alreadyImported ? 'Volver' : 'Cancelar'}</button>
        {!check.alreadyImported && <button className="btn primary" onClick={() => onConfirm({ paid })}>Confirmar</button>}
      </div>
    </Card>
  );
}
