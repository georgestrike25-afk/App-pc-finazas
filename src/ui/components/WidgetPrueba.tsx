import { Minus, Plus, ShoppingCart, Bus, Zap, Shapes, Users, type LucideIcon } from 'lucide-react';
import { useState } from 'react';
import { useApp } from '../store';
import { usePareja } from '../pages/Pareja';
import { registrarRapidas } from '../../notifications/native';
import { runParejaSync } from '../../sync/pareja';
import { otro, saldo } from '../../domain/pareja';
import { formatARS, type Cents } from '../../domain/money';
import { uid } from '../../domain/text';
import type { QuickEntry } from '../../notifications/quick';
import { Modal, MoneyInput } from './ui';

const CATS: Array<[NonNullable<QuickEntry['categoria']>, string, LucideIcon]> = [
  ['dia', 'Día a día', ShoppingCart],
  ['transporte', 'Transporte', Bus],
  ['servicios', 'Servicios', Zap],
  ['otros', 'Otros', Shapes],
];

/**
 * Celular de prueba de la PC: imita el widget de Android (Gasto / Ingreso / Con …) y la hoja de
 * anotación rápida. Lo guardado sigue el mismo camino que el widget real.
 */
export function WidgetPrueba() {
  const { toast } = useApp();
  const st = usePareja();
  const [tipo, setTipo] = useState<QuickEntry['tipo'] | null>(null);
  const [monto, setMonto] = useState<Cents | undefined>();
  const [cat, setCat] = useState<NonNullable<QuickEntry['categoria']>>('dia');
  const [pagoPareja, setPagoPareja] = useState(false);
  const el = st?.yo ? st.doc.nombres[otro(st.yo)] : '';
  const neto = st?.yo ? saldo(st.doc, st.yo).neto : 0;
  const m = (c: Cents) => formatARS(c).replace(/,00$/, '');

  const abrir = (t: QuickEntry['tipo']) => {
    setTipo(t);
    setMonto(undefined);
    setCat('dia');
    setPagoPareja(false);
  };
  const guardar = async () => {
    if (!tipo || !monto) return;
    const etiqueta = CATS.find((c) => c[0] === cat)![1];
    await registrarRapidas([{ id: uid(), accion: 'guardar', tipo, categoria: cat, monto, descripcion: tipo === 'ingreso' ? 'Ingreso' : etiqueta, fecha: Date.now(), transferencia: false, ...(tipo === 'compartido' ? { pagoPareja } : {}) }]);
    setTipo(null);
    toast(tipo === 'compartido' ? `Anotado. Mandándoselo a ${el}…` : `Anotado: ${m(monto)}`);
    // Como el widget real: se abre Brote un momento y se sincroniza.
    if (tipo === 'compartido') runParejaSync();
  };
  const delOtro = monto ? Math.floor(monto / 2) : 0;

  return (
    <section className="w-prueba" aria-label="Widget de prueba">
      <div className="w-prueba-h">
        <strong>Widget de prueba</strong>
        <small>(como el de Android)</small>
      </div>
      {st?.yo && (
        <p className="w-prueba-saldo">
          <Users aria-hidden size={16} />
          {neto === 0 ? `Con ${el}: están a mano` : neto < 0 ? `Le debés a ${el} ${m(-neto)}` : `${el} te debe ${m(neto)}`}
        </p>
      )}
      <div className="w-prueba-btns">
        <button className="btn lime" onClick={() => abrir('gasto')}><Minus aria-hidden />Gasto</button>
        <button className="btn" onClick={() => abrir('ingreso')}><Plus aria-hidden />Ingreso</button>
        <button className="btn" onClick={() => abrir('compartido')} disabled={!st?.yo}><Users aria-hidden />{st?.yo ? `Con ${el}` : 'Compartido'}</button>
      </div>
      {tipo && (
        <Modal title="Anotar" onClose={() => setTipo(null)} className="pj-sheet" footer={<><button className="btn ghost" onClick={() => setTipo(null)}>Cancelar</button><button className="btn primary" disabled={!monto} onClick={guardar}>Guardar</button></>}>
          <div className="seg" role="radiogroup" aria-label="Tipo">
            <button role="radio" aria-checked={tipo === 'gasto'} onClick={() => setTipo('gasto')}>Gasto</button>
            <button role="radio" aria-checked={tipo === 'ingreso'} onClick={() => setTipo('ingreso')}>Ingreso</button>
            {st?.yo && <button role="radio" aria-checked={tipo === 'compartido'} onClick={() => setTipo('compartido')}>Con {el}</button>}
          </div>
          <div style={{ marginTop: 12 }}>
            <MoneyInput value={monto} onChange={setMonto} name="monto-widget" />
          </div>
          {tipo === 'compartido' && (
            <>
              {!!monto && <p className="small" style={{ textAlign: 'center' }}><strong>{pagoPareja ? `Le ponés a ${el} ${m(delOtro)} (la mitad)` : `${el} te pone ${m(delOtro)} (la mitad)`}</strong></p>}
              <div className="seg" role="radiogroup" aria-label="Quién pagó">
                <button role="radio" aria-checked={!pagoPareja} onClick={() => setPagoPareja(false)}>Lo pagué yo</button>
                <button role="radio" aria-checked={pagoPareja} onClick={() => setPagoPareja(true)}>Lo pagó {el}</button>
              </div>
            </>
          )}
          {tipo !== 'ingreso' && (
            <div className="w-prueba-cats">
              {CATS.map(([v, l, I]) => (
                <button key={v} className={`btn ${cat === v ? 'primary' : ''}`} aria-pressed={cat === v} onClick={() => setCat(v)}><I aria-hidden />{l}</button>
              ))}
            </div>
          )}
        </Modal>
      )}
    </section>
  );
}
