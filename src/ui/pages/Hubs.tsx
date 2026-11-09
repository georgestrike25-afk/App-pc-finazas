import { useEffect, type ReactNode } from 'react';
import { EntidadesPage } from './Entidades';
import { NecesitoPage } from './Necesito';
import { DeudasPage } from './Deudas';
import { CompartidosPage } from './Compartidos';
import { DevolucionesPage } from './Devoluciones';

/** Sección plegable de una pantalla unida; si se llegó por su dirección (#/necesito, #/deudas…), viene abierta. */
function Section({ id, open, title, hint, children }: { id: string; open: boolean; title: string; hint: string; children: ReactNode }) {
  useEffect(() => {
    if (open) setTimeout(() => document.getElementById(id)?.scrollIntoView({ block: 'start' }), 60);
  }, [id, open]);
  return (
    <details id={id} className="card hub-sec" open={open}>
      <summary>
        <span className="hub-t">{title}</span>
        <small className="muted">{hint}</small>
      </summary>
      <div className="hub-body">{children}</div>
    </details>
  );
}

/** Deudas en una sola pantalla: lo de este mes y cada entidad arriba; el detalle y la administración, plegados. */
export function DeudasHub({ open }: { open?: 'necesito' | 'admin' }) {
  return (
    <div className="page hub">
      <EntidadesPage />
      <Section id="sec-necesito" open={open === 'necesito'} title="Cuánto necesito este mes" hint="Todo junto: deudas, facturas, lo vencido y ARCA">
        <NecesitoPage />
      </Section>
      <Section id="sec-admin" open={open === 'admin'} title="Préstamos, tarjetas y pagos" hint="Agregar o editar deudas, ver cuotas, resúmenes y pagos">
        <DeudasPage />
      </Section>
    </div>
  );
}

/** Cuentas con otras personas: lo compartido y lo que te tienen que devolver, en una sola pantalla. */
export function ConOtrosHub({ open }: { open?: 'devoluciones' }) {
  return (
    <div className="page hub">
      <CompartidosPage />
      <Section id="sec-devoluciones" open={open === 'devoluciones'} title="Te tienen que devolver" hint="Gastos que pagaste vos y te devuelven (el hospital, un amigo…)">
        <DevolucionesPage />
      </Section>
    </div>
  );
}
