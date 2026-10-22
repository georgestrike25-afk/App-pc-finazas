import { useEffect, useState } from 'react';
import { useApp } from '../store';
import { saveRecord, wipeAll } from '../../db/repo';
import type { Settings } from '../../domain/types';
import { clearLock, getLock, setLock } from '../lock';
import { prefetchOcrAssets } from '../../importers/ocr';
import { Card, confirmDialog, Field, MoneyInput } from '../components/ui';
import { NotificationsSettingsCard } from './Notificaciones';

export function ConfiguracionPage() {
  const { data, toast } = useApp();
  const [s, setS] = useState<Settings>(data.settings);
  const [pin, setPin] = useState('');
  const [timeout, setTimeoutMin] = useState(5);
  const [hasLock, setHasLock] = useState(false);
  const [storage, setStorage] = useState<{ persisted?: boolean; usage?: number; quota?: number }>({});
  const [ocrState, setOcrState] = useState('');
  const [newCat, setNewCat] = useState('');
  useEffect(() => setS(data.settings), [data.settings]);
  useEffect(() => {
    getLock().then((l) => setHasLock(!!l));
    (async () => {
      const persisted = await navigator.storage?.persisted?.();
      const est = await navigator.storage?.estimate?.();
      setStorage({ persisted, usage: est?.usage, quota: est?.quota });
    })();
  }, []);
  const save = async () => {
    if (s.defaultUserPct < 0 || s.defaultUserPct > 100 || s.sancorPartnerPct < 0 || s.sancorPartnerPct > 100) return toast('Los porcentajes deben estar entre 0 y 100', 'error');
    await saveRecord<Settings>('settings', s, 'Configuración general');
    toast('Configuración guardada');
  };
  return (
    <div className="page">
      <NotificationsSettingsCard />
      <Card title="Preferencias">
        <div className="form-grid">
          <Field label="Nombre de la pareja (para los repartos)">{(id) => <input id={id} value={s.partnerName} onChange={(e) => setS({ ...s, partnerName: e.target.value })} />}</Field>
          <Field label="Tu nombre y apellido" help="Para reconocer las transferencias entre tus propias cuentas (por ejemplo, de Patagonia a Ualá) y que no se cuenten como gastos ni ingresos.">{(id) => <input id={id} value={s.ownNames ?? ''} placeholder="Ej.: Jorge Exequiel Aguero" onChange={(e) => setS({ ...s, ownNames: e.target.value })} />}</Field>
          <Field label="Reparto por defecto de gastos del hogar (% del usuario)" help="Qué parte de los gastos compartidos pagás vos. 50 = mitad y mitad. Se puede cambiar en cada gasto.">{(id) => <input id={id} type="number" min={0} max={100} value={s.defaultUserPct} onChange={(e) => setS({ ...s, defaultUserPct: Number(e.target.value) })} />}</Field>
          <Field label="Sancor Salud: % que corresponde a la pareja">{(id) => <input id={id} type="number" min={0} max={100} value={s.sancorPartnerPct} onChange={(e) => setS({ ...s, sancorPartnerPct: Number(e.target.value) })} />}</Field>
          <Field label="Presupuesto cotidiano por defecto" hint="Valor inicial orientativo: $700.000 (editable).">{(id) => <MoneyInput id={id} value={s.dailyBudgetDefault} onChange={(v) => setS({ ...s, dailyBudgetDefault: v ?? 0, dailyBudgetIsInitialValue: false })} />}</Field>
          <Field label="Ingreso mensual estimado (solo para proyecciones)" help="Cuánto creés que vas a cobrar en los meses que vienen. Solo se usa para el viaje y las proyecciones; nunca se suma como cobrado.">{(id) => <MoneyInput id={id} value={s.projectedMonthlyIncome} onChange={(v) => setS({ ...s, projectedMonthlyIncome: v ?? 0 })} />}</Field>
        </div>
        <label className="check"><input type="checkbox" checked={s.storeDocumentBlobs} onChange={(e) => setS({ ...s, storeDocumentBlobs: e.target.checked })} /> Guardar una copia del documento original importado en este dispositivo</label>
        <h3>Categorías</h3>
        <div className="chips">
          {s.categories.map((c) => (
            <span key={c} className="chip">{c} <button className="x" aria-label={`Quitar ${c}`} onClick={() => setS({ ...s, categories: s.categories.filter((x) => x !== c) })}>✕</button></span>
          ))}
        </div>
        <div className="row">
          <input placeholder="Nueva categoría" value={newCat} onChange={(e) => setNewCat(e.target.value)} aria-label="Nueva categoría" />
          <button className="btn small" onClick={() => { if (newCat.trim() && !s.categories.includes(newCat.trim())) setS({ ...s, categories: [...s.categories, newCat.trim()] }); setNewCat(''); }}>Agregar</button>
        </div>
        <button className="btn primary" onClick={save}>Guardar configuración</button>
      </Card>

      <Card title="Bloqueo de la interfaz" help="Pide un PIN para abrir la app, así nadie que agarre tu celular ve tus números.">
        <p className="muted small">El PIN impide abrir la interfaz en este dispositivo. No cifra la base de datos del navegador: para proteger la información use también el bloqueo del sistema operativo y copias cifradas.</p>
        {hasLock ? (
          <button className="btn danger" onClick={async () => { await clearLock(); setHasLock(false); toast('Bloqueo desactivado'); }}>Desactivar bloqueo</button>
        ) : (
          <div className="form-grid">
            <Field label="PIN (4 a 12 dígitos)">{(id) => <input id={id} type="password" inputMode="numeric" value={pin} onChange={(e) => setPin(e.target.value)} autoComplete="new-password" />}</Field>
            <Field label="Bloquear tras minutos en segundo plano">{(id) => <input id={id} type="number" min={0} max={240} value={timeout} onChange={(e) => setTimeoutMin(Number(e.target.value))} />}</Field>
            <button className="btn primary" onClick={async () => { try { await setLock(pin, timeout); setHasLock(true); setPin(''); toast('Bloqueo activado'); } catch (e) { toast((e as Error).message, 'error'); } }}>Activar bloqueo</button>
          </div>
        )}
      </Card>

      <Card title="OCR sin conexión" help="El OCR es lo que lee el texto de las capturas y fotos. Funciona dentro del dispositivo, sin internet.">
        <p className="muted small">El OCR (Tesseract.js, español) funciona dentro del navegador. Sus recursos (~10 MB) se sirven desde esta misma aplicación; descárguelos ahora para poder usar OCR sin internet.</p>
        <button className="btn" onClick={async () => { setOcrState('Descargando…'); try { await prefetchOcrAssets(); setOcrState('Listo: OCR disponible sin conexión.'); } catch (e) { setOcrState((e as Error).message); } }}>Preparar OCR sin conexión</button>
        {ocrState && <p className="small">{ocrState}</p>}
      </Card>

      <Card title="Almacenamiento local">
        <ul className="small">
          <li>Almacenamiento persistente: {storage.persisted === undefined ? 'no informado por el navegador' : storage.persisted ? 'concedido (el navegador no borrará los datos automáticamente)' : 'no concedido: instale la app o haga copias periódicas'}</li>
          {storage.usage !== undefined && <li>Uso: {(storage.usage / 1048576).toFixed(1)} MB de {((storage.quota ?? 0) / 1048576).toFixed(0)} MB disponibles</li>}
          <li>Los datos se guardan en IndexedDB de este navegador. Borrar los datos del sitio los elimina: haga copias de seguridad.</li>
        </ul>
        <button
          className="btn danger"
          onClick={async () => {
            if (!(await confirmDialog('Se eliminarán TODOS los datos de este dispositivo (ingresos, gastos, deudas, documentos, objetivo).\nEsta acción no se puede deshacer. ¿Hizo una copia de seguridad?', { danger: true, ok: 'Continuar' }))) return;
            if (!(await confirmDialog('Confirmación final: ¿borrar todos los datos?', { danger: true, ok: 'Borrar todo' }))) return;
            await wipeAll();
            toast('Datos eliminados');
          }}
        >
          Borrar todos los datos
        </button>
      </Card>
    </div>
  );
}
