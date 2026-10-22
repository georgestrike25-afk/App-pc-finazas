import { useEffect, useState } from 'react';
import { useApp } from '../store';
import { desktop, type DesktopPairing } from '../../platform';
import { runSync, saveSyncConfig, type StoredSyncConfig } from '../../sync/autoSync';
import { Card, Field } from '../components/ui';

/** App de escritorio: esta PC es el servidor; muestra el código para el celular. */
export function DesktopPairingCard({ cfg, setCfg }: { cfg: StoredSyncConfig; setCfg: (c: StoredSyncConfig) => void }) {
  const { toast } = useApp();
  const [p, setP] = useState<DesktopPairing | null>(null);
  const [phrase, setPhrase] = useState(cfg.passphrase);
  const [msg, setMsg] = useState('');
  useEffect(() => {
    desktop()?.pairing().then(setP);
  }, []);
  useEffect(() => setPhrase(cfg.passphrase), [cfg.passphrase]);
  if (!p) return null;
  const linked = cfg.serverUrl === p.localUrl && cfg.token === p.token && cfg.passphrase.length >= 8;
  const save = async () => {
    if (phrase.length < 8) return setMsg('La frase tiene que tener al menos 8 caracteres.');
    const next = { serverUrl: p.localUrl, space: p.space, token: p.token, passphrase: phrase, auto: true };
    await saveSyncConfig(next);
    setCfg(next);
    const s = await runSync(next);
    setMsg(s.state === 'ok' ? 'Listo: esta PC ya guarda la sincronización. Ahora conectá el celular.' : s.message);
  };
  const copy = async () => {
    if (!p.code) return;
    await desktop()!.copy(p.code);
    toast('Código copiado. Mandátelo al celular (por ejemplo, por WhatsApp) y pegalo en Más → Copias.');
  };
  return (
    <Card title="Conectar el celular con esta PC" help="Esta PC guarda la sincronización. El celular se conecta por el Wi-Fi de tu casa: tienen que estar en la misma red. Los datos viajan cifrados con tu frase y no salen a internet.">
      <ol className="steps">
        <li>
          <strong>Elegí una frase</strong> (la misma en la PC y en el celular, mínimo 8 caracteres). Guardala: sin ella no se pueden leer los datos sincronizados.
          <div className="row" style={{ marginTop: '0.4rem' }}>
            <Field label="Frase de sincronización">{(id) => <input id={id} type="password" value={phrase} onChange={(e) => setPhrase(e.target.value)} autoComplete="off" />}</Field>
            <button className="btn primary" style={{ alignSelf: 'flex-end' }} onClick={save}>{linked ? 'Guardar' : 'Activar'}</button>
          </div>
          {linked && <p className="ok-text small">✓ Activada en esta PC</p>}
        </li>
        <li>
          <strong>Copiá este código</strong> y pasalo al celular:
          {p.code ? (
            <div className="pair-code">
              <code data-testid="codigo-pc">{p.code}</code>
              <button className="btn small" onClick={copy}>Copiar código</button>
            </div>
          ) : (
            <p className="warn small">Esta PC no está conectada a una red. Conectala al Wi-Fi de tu casa y volvé a abrir la app.</p>
          )}
        </li>
        <li>En el celular: <strong>Más → Copias</strong> → pegá el código → <strong>Usar código</strong> → poné la misma frase → <strong>Sincronizar ahora</strong>.</li>
      </ol>
      {msg && <p className="small" role="status">{msg}</p>}
      <details className="more-opts small">
        <summary>El celular no se conecta</summary>
        <ol>
          <li>Que la PC y el celular estén en el <strong>mismo Wi-Fi</strong> (no en datos móviles) y esta app abierta en la PC.</li>
          <li>Si la dirección de la PC cambió, el celular la busca solo. Si igual no la encuentra, volvé a copiar el código de arriba y pegalo en el celular.</li>
          <li>
            <strong>Firewall de Windows:</strong> Inicio → escribí <em>"Permitir una aplicación a través de Firewall de Windows"</em> → <em>Cambiar la configuración</em> → buscá <strong>Finanzas Personales</strong> y marcá <strong>Privada</strong> y <strong>Pública</strong> → Aceptar.
          </li>
          <li>Usá la versión <strong>instalada</strong> (Instalador), no la portable: la portable cambia de lugar cada vez que se abre y Windows vuelve a bloquearla.</li>
        </ol>
      </details>
      <p className="small muted">
        Si Windows pregunta si permite el acceso a la red, elegí <strong>Permitir</strong> en redes privadas. Dirección de esta PC: {p.lanUrl ?? '—'}
        {p.otherUrls.length > 0 && <> (otras: {p.otherUrls.join(', ')})</>}. La PC tiene que tener la app abierta para que el celular sincronice.
      </p>
    </Card>
  );
}
