import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import { ensureInitialized } from './db/repo';
import { registerPwa } from './ui/pwa';
import { startAutoSync } from './sync/autoSync';
import '@fontsource-variable/bricolage-grotesque/wght.css';
import '@fontsource-variable/public-sans/wght.css';
import './ui/styles.css';
import { startNotificationIngest } from './notifications/native';

// Los errores no controlados se muestran sin exponer datos financieros en la consola.
window.addEventListener('unhandledrejection', (e) => {
  console.error('[app] Error no controlado:', (e.reason as Error)?.name ?? 'desconocido');
});

async function start() {
  const root = createRoot(document.getElementById('root')!);
  try {
    await ensureInitialized();
    if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
  } catch {
    root.render(
      <div className="fatal">
        <h1>No se puede abrir el almacenamiento local</h1>
        <p>El navegador bloqueó IndexedDB (por ejemplo, en modo incógnito o con el almacenamiento deshabilitado). Abra la aplicación en una ventana normal.</p>
      </div>,
    );
    return;
  }
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
  registerPwa();
  startAutoSync();
  startNotificationIngest();
}
start();
