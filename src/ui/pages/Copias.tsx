import { useEffect, useRef, useState } from 'react';
import { useApp } from '../store';
import { buildBackup, isEncryptedBackup, parseBackup, restoreBackup, serializeBackup } from '../../backup/backup';
import { checkServer, parsePairingCode } from '../../sync/syncClient';
import { getSyncStatus, loadSyncConfig, onSyncStatus, runSync, saveSyncConfig, type StoredSyncConfig, type SyncStatus } from '../../sync/autoSync';
import { isNative, saveFile, saveToDocuments } from '../../platform';
import { getDb } from '../../db/db';
import { Badge, Card, confirmDialog, Field } from '../components/ui';

export function CopiasPage() {
  const { toast } = useApp();
  const native = isNative();
  const [pwd, setPwd] = useState('');
  const [pwd2, setPwd2] = useState('');
  const [includeDocs, setIncludeDocs] = useState(false);
  const [restorePwd, setRestorePwd] = useState('');
  const [mode, setMode] = useState<'fusionar' | 'reemplazar'>('fusionar');
  const [msg, setMsg] = useState('');
  const [needPwd, setNeedPwd] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [cfg, setCfg] = useState<StoredSyncConfig>({ serverUrl: '', space: '', token: '', passphrase: '', auto: false });
  const [code, setCode] = useState('');
  const [syncMsg, setSyncMsg] = useState('');
  const [status, setStatus] = useState<SyncStatus>(getSyncStatus());

  useEffect(() => {
    loadSyncConfig().then((c) => c && setCfg(c));
    return onSyncStatus(setStatus);
  }, []);

  const backupText = async () => {
    if (pwd && pwd !== pwd2) throw new Error('Las contraseñas no coinciden');
    if (pwd && pwd.length < 8) throw new Error('La contraseña debe tener al menos 8 caracteres');
    const text = await serializeBackup(await buildBackup({ includeBlobs: includeDocs }), pwd || undefined);
    const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
    return { text, name: `finanzas-copia-${stamp}${pwd ? '-cifrada' : ''}.json` };
  };
  const exportNow = async (where: 'compartir' | 'documentos') => {
    try {
      const { text, name } = await backupText();
      toast(where === 'documentos' ? await saveToDocuments(name, text) : await saveFile(name, text, 'application/json'));
      await getDb().meta.put({ key: 'lastBackup', value: new Date().toISOString() });
    } catch (e) {
      toast((e as Error).message || 'No se pudo guardar la copia', 'error');
    }
  };

  const doRestore = async (text: string, password?: string) => {
    try {
      const b = await parseBackup(text, password);
      const ok = await confirmDialog(
        mode === 'reemplazar'
          ? 'Se reemplazarán TODOS los datos de este dispositivo por los de la copia. ¿Continuar?'
          : 'Se fusionarán los datos de la copia con los de este dispositivo (gana la versión más reciente de cada registro). ¿Continuar?',
        { danger: mode === 'reemplazar', ok: mode === 'reemplazar' ? 'Reemplazar' : 'Fusionar' },
      );
      if (!ok) return;
      const r = await restoreBackup(b, mode);
      const n = Object.values(r.stats).reduce((a, s) => a + s.added + s.updated, 0);
      setMsg(`Copia ${mode === 'reemplazar' ? 'restaurada' : 'fusionada'}: ${n} registro(s) incorporados.`);
      setPending(null);
      setNeedPwd(false);
      setRestorePwd('');
    } catch (e) {
      setMsg((e as Error).message);
    }
  };

  const onFile = async (f: File) => {
    setMsg('');
    if (f.size > 200 * 1024 * 1024) return setMsg('Archivo demasiado grande.');
    const text = await f.text();
    if (fileRef.current) fileRef.current.value = '';
    if (isEncryptedBackup(text)) {
      setPending(text);
      setNeedPwd(true);
      return;
    }
    await doRestore(text);
  };

  const applyCode = () => {
    try {
      const p = parsePairingCode(code);
      setCfg({ ...cfg, ...p });
      setCode('');
      setSyncMsg('Código aplicado. Ingrese la frase de sincronización y toque "Sincronizar ahora".');
    } catch (e) {
      setSyncMsg((e as Error).message);
    }
  };

  const sync = async () => {
    await saveSyncConfig(cfg);
    const s = await runSync(cfg);
    setSyncMsg(s.state === 'ok' ? `Sincronización completa: ${s.message}.` : s.message);
  };

  const ready = !!cfg.serverUrl && !!cfg.space && !!cfg.token && cfg.passphrase.length >= 8;

  return (
    <div className="page">
      <Card title="Sincronizar con la PC">
        <p className="small muted">
          La sincronización usa un servidor que corre en su propia PC (gratis, sin servicios externos). Los datos viajan cifrados con la frase de sincronización: nadie más puede leerlos.
        </p>
        <Field label="Código de emparejamiento (lo muestra la app de PC)" hint="Cópielo desde la PC (por ejemplo, enviándoselo por WhatsApp) y péguelo aquí.">
          {(id) => (
            <div className="row">
              <input id={id} placeholder="FP1-…" value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" />
              <button className="btn" onClick={applyCode} disabled={!code.trim()}>Usar código</button>
            </div>
          )}
        </Field>
        <div className="form-grid">
          <Field label="Dirección del servidor">{(id) => <input id={id} placeholder="http://192.168.0.10:8787" value={cfg.serverUrl} onChange={(e) => setCfg({ ...cfg, serverUrl: e.target.value.trim() })} inputMode="url" />}</Field>
          <Field label="Espacio (mismo nombre en ambos dispositivos)">{(id) => <input id={id} placeholder="hogar" value={cfg.space} onChange={(e) => setCfg({ ...cfg, space: e.target.value.trim() })} />}</Field>
          <Field label="Token de acceso del servidor">{(id) => <input id={id} type="password" value={cfg.token} onChange={(e) => setCfg({ ...cfg, token: e.target.value })} autoComplete="off" />}</Field>
          <Field label="Frase de sincronización" hint="La misma en todos los dispositivos, mínimo 8 caracteres.">{(id) => <input id={id} type="password" value={cfg.passphrase} onChange={(e) => setCfg({ ...cfg, passphrase: e.target.value })} autoComplete="off" />}</Field>
        </div>
        <label className="check">
          <input type="checkbox" checked={cfg.auto} onChange={(e) => setCfg({ ...cfg, auto: e.target.checked })} />
          Sincronizar automáticamente (al abrir la app, al volver a ella, tras cada cambio y cada 5 minutos). La frase queda guardada en este dispositivo.
        </label>
        <div className="row-actions">
          <button className="btn" onClick={async () => { try { setSyncMsg((await checkServer(cfg)) ? 'PC accesible y token válido.' : 'El servidor rechazó el token.'); } catch { setSyncMsg('No se pudo conectar con la PC. Verifique la dirección y que ambos estén en la misma red Wi-Fi.'); } }} disabled={!cfg.serverUrl}>Probar conexión</button>
          <button className="btn primary" onClick={sync} disabled={!ready || status.state === 'sincronizando'}>{status.state === 'sincronizando' ? 'Sincronizando…' : 'Sincronizar ahora'}</button>
        </div>
        {syncMsg && <p className="small" role="status">{syncMsg}</p>}
        <p className="small muted">
          Estado: {status.state === 'ok' ? <Badge tone="ok">sincronizado</Badge> : status.state === 'error' ? <Badge tone="bad">error</Badge> : status.state === 'sincronizando' ? <Badge tone="info">sincronizando</Badge> : <Badge>sin sincronizar</Badge>}
          {status.at && <> · última vez: {new Date(status.at).toLocaleString('es-AR')}</>}
          {status.state === 'error' && <> · {status.message}</>}
        </p>
        <p className="small muted">La PC debe estar encendida con la app de escritorio (o <code>npm run sync-server</code>) y ambos dispositivos en la misma red Wi-Fi. Mientras tanto la app funciona normalmente sin conexión y se pone al día en la próxima sincronización.</p>
      </Card>

      <Card title="Exportar copia de seguridad">
        <p className="muted small">Genera un archivo con todos sus datos. Recomendado: cifrarlo con contraseña (AES-GCM 256 bits). Si olvida la contraseña, la copia no podrá recuperarse.</p>
        <div className="form-grid">
          <Field label="Contraseña (opcional, mínimo 8 caracteres)">{(id) => <input id={id} type="password" autoComplete="new-password" value={pwd} onChange={(e) => setPwd(e.target.value)} />}</Field>
          <Field label="Repetir contraseña">{(id) => <input id={id} type="password" autoComplete="new-password" value={pwd2} onChange={(e) => setPwd2(e.target.value)} />}</Field>
        </div>
        <label className="check"><input type="checkbox" checked={includeDocs} onChange={(e) => setIncludeDocs(e.target.checked)} /> Incluir los documentos originales importados (archivo más grande)</label>
        <div className="row-actions">
          {native ? (
            <>
              <button className="btn primary" onClick={() => exportNow('compartir')}>Guardar o enviar copia…</button>
              <button className="btn" onClick={() => exportNow('documentos')}>Guardar en Documentos</button>
            </>
          ) : (
            <button className="btn primary" onClick={() => exportNow('compartir')}>Descargar copia</button>
          )}
        </div>
      </Card>

      <Card title="Restaurar o fusionar una copia">
        <div className="form-grid">
          <Field label="Modo">
            {(id) => (
              <select id={id} value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}>
                <option value="fusionar">Fusionar con los datos actuales (sincronización manual)</option>
                <option value="reemplazar">Reemplazar todos los datos</option>
              </select>
            )}
          </Field>
        </div>
        <input ref={fileRef} type="file" accept=".json,application/json" aria-label="Archivo de copia" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
        {needPwd && pending && (
          <div className="form-grid">
            <Field label="Contraseña de la copia">{(id) => <input id={id} type="password" value={restorePwd} onChange={(e) => setRestorePwd(e.target.value)} />}</Field>
            <button className="btn primary" onClick={() => doRestore(pending, restorePwd)}>Descifrar y continuar</button>
          </div>
        )}
        {msg && <p className="small" role="status">{msg}</p>}
        <p className="small muted">Sin servidor también puede sincronizar a mano: exporte una copia en un dispositivo, pásela al otro y restáurela en modo <strong>Fusionar</strong>.</p>
      </Card>
    </div>
  );
}
