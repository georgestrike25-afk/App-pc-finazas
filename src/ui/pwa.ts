import { useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: BeforeInstallPromptEvent | null = null;
let updateFn: ((reload?: boolean) => Promise<void>) | null = null;
const state = { needRefresh: false, offlineReady: false };
const subs = new Set<() => void>();
const emit = () => subs.forEach((s) => s());

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    emit();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    emit();
  });
}

/** Registra el service worker con estrategia de actualización "a pedido del usuario". */
export async function registerPwa() {
  if (!('serviceWorker' in navigator) || import.meta.env.DEV) return;
  const { registerSW } = await import('virtual:pwa-register');
  updateFn = registerSW({
    immediate: true,
    onNeedRefresh() {
      state.needRefresh = true;
      emit();
    },
    onOfflineReady() {
      state.offlineReady = true;
      emit();
    },
    onRegisteredSW(_url, reg) {
      // Busca actualizaciones cada hora mientras la app está abierta.
      if (reg) setInterval(() => reg.update().catch(() => {}), 3600_000);
    },
  });
}

export function usePwa() {
  const [, force] = useState(0);
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const s = () => force((x) => x + 1);
    subs.add(s);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      subs.delete(s);
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return {
    online,
    canInstall: !!deferred,
    needRefresh: state.needRefresh,
    offlineReady: state.offlineReady,
    install: async () => {
      if (!deferred) return;
      await deferred.prompt();
      await deferred.userChoice;
      deferred = null;
      emit();
    },
    update: () => updateFn?.(true),
    dismiss: () => {
      state.needRefresh = false;
      state.offlineReady = false;
      emit();
    },
  };
}
