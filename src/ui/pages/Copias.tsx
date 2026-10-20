import { useEffect, useRef, useState } from 'react';
import { useApp } from '../store';
import { buildBackup, isEncryptedBackup, parseBackup, restoreBackup, serializeBackup } from '../../backup/backup';
import { getDb } from '../../db/db';
import { checkServer, syncNow, type SyncConfig } from '../../sync/syncClient';
import { Card, confirmDialog, Field } from '../components/ui';

function download(name: string, text: string) {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function CopiasPage() {
  const { toast } = useApp();
  const [pwd, setPwd] = useState('');
  const [pwd2, setPwd2] = useState('');
  const [includeDocs, setIncludeDocs] = useState(false);
  const [restorePwd, setRestorePwd] = useState('');
  const [mode, setMode] = useState<'fusionar' | 'reemplazar'>('fusionar');
  const [msg, setMsg] = useState('');
  const [needPwd, setNeedPwd] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [cfg, setCfg] = useState<SyncConfig>({ serverUrl: '', space: '', token: '', passphrase: '' });
  const [syncMsg, setSyncMsg] = useState('');
  const [lastSync, setLastSync] = useState<string | null>(null);

  useEffect(() => {
    getDb().meta.get('syncConfig').then((r) => r && setCfg({ ...(r.value as SyncConfig), passphrase: '' }));
    getDb().meta.get('lastSync').then((r) => r && setLastSync(r.value as string));
  }, []);

  const exportNow = async () => {
    if (pwd && pwd !== pwd2) return toast('Las contraseñas no coinciden', 'error');
    if (pwd && pwd.length < 8) return toast('La contraseña debe tener al menos 8 caracteres', 'error');
    const text = await serializeBackup(await buildBackup({ includeBlobs: includeDocs }), pwd || undefined);
    const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
    download(`finanzas-copia-${stamp}${pwd ? '-cifrada' : ''}.json`, text);
    toast('Copia de seguridad descargada');
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

  const saveCfg = async () => {
    const { passphrase: _p, ...rest } = cfg;
    await getDb().meta.put({ key: 'syncConfig', value: { ...rest, passphrase: '' } });
  };

  const sync = async () => {
    setSyncMsg('Sincronizando…');
    try {
      await saveCfg();
      const r = await syncNow(cfg);
      const at = new Date().toISOString();
      await getDb().meta.put({ key: 'lastSync', value: at });
      setLastSync(at);
      setSyncMsg(`Sincronización completa (versión ${r.pushedVersion}). ${r.pulled ? `${r.incorporated} cambio(s) recibidos.` : 'Primera subida.'}`);
    } catch (e) {
      setSyncMsg(e instanceof TypeError ? 'No se pudo conectar con el servidor. Verifique la dirección, la red y que use HTTPS si la app se abrió por HTTPS.' : (e as Error).message);
    }
  };

  return (
    <div className="page">
      <Card title="Exportar copia de seguridad">
        <p className="muted small">Descarga un archivo con todos sus datos. Recomendado: cifrarlo con contraseña (AES-GCM 256 bits, Web Crypto). Si olvida la contraseña, la copia no podrá recuperarse.</p>
        <div className="form-grid">
          <Field label="Contraseña (opcional, mínimo 8 caracteres)">{(id) => <input id={id} type="password" autoComplete="new-password" value={pwd} onChange={(e) => setPwd(e.target.value)} />}</Field>
          <Field label="Repetir contraseña">{(id) => <input id={id} type="password" autoComplete="new-password" value={pwd2} onChange={(e) => setPwd2(e.target.value)} />}</Field>
        </div>
        <label className="check"><input type="checkbox" checked={includeDocs} onChange={(e) => setIncludeDocs(e.target.checked)} /> Incluir los documentos originales importados (archivo más grande)</label>
        <button className="btn primary" onClick={exportNow}>Descargar copia</button>
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
      </Card>

      <Card title="Sincronizar PC y celular">
        <h3>Opción A — Sin servidor (siempre disponible)</h3>
        <ol className="small">
          <li>En el dispositivo con los cambios: exporte una copia cifrada.</li>
          <li>Pase el archivo al otro dispositivo (cable USB, Google Drive, correo propio, etc.).</li>
          <li>En el otro dispositivo: “Restaurar o fusionar” en modo <strong>Fusionar</strong>. Se conserva la versión más reciente de cada registro y se propagan las eliminaciones.</li>
        </ol>
        <h3>Opción B — Servidor autohospedado gratuito (automática a pedido)</h3>
        <p className="small muted">Ejecute en su PC <code>npm run sync-server</code> (ver README). Los datos se cifran en el dispositivo con la frase de sincronización: el servidor solo guarda información ilegible. Si la app se abrió por HTTPS, el servidor también debe usar HTTPS.</p>
        <div className="form-grid">
          <Field label="Dirección del servidor">{(id) => <input id={id} placeholder="https://mi-pc.tailnet.ts.net" value={cfg.serverUrl} onChange={(e) => setCfg({ ...cfg, serverUrl: e.target.value.trim() })} />}</Field>
          <Field label="Espacio (mismo nombre en ambos dispositivos)">{(id) => <input id={id} placeholder="hogar" value={cfg.space} onChange={(e) => setCfg({ ...cfg, space: e.target.value.trim() })} />}</Field>
          <Field label="Token de acceso del servidor">{(id) => <input id={id} type="password" value={cfg.token} onChange={(e) => setCfg({ ...cfg, token: e.target.value })} autoComplete="off" />}</Field>
          <Field label="Frase de sincronización (no se guarda)" hint="La misma en todos los dispositivos, mínimo 8 caracteres.">{(id) => <input id={id} type="password" value={cfg.passphrase} onChange={(e) => setCfg({ ...cfg, passphrase: e.target.value })} autoComplete="off" />}</Field>
        </div>
        <div className="row-actions">
          <button className="btn" onClick={async () => { try { setSyncMsg((await checkServer(cfg)) ? 'Servidor accesible y token válido.' : 'El servidor rechazó el token.'); } catch { setSyncMsg('No se pudo conectar con el servidor.'); } }}>Probar conexión</button>
          <button className="btn primary" onClick={sync} disabled={!cfg.serverUrl || !cfg.space || !cfg.token || cfg.passphrase.length < 8}>Sincronizar ahora</button>
        </div>
        {syncMsg && <p className="small" role="status">{syncMsg}</p>}
        {lastSync && <p className="small muted">Última sincronización: {new Date(lastSync).toLocaleString('es-AR')}</p>}
        <p className="small muted">La sincronización no es en segundo plano: se ejecuta al tocar “Sincronizar ahora” en cada dispositivo.</p>
      </Card>
    </div>
  );
}
