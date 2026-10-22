/**
 * Tema de la interfaz (sistema, claro u oscuro). Es una preferencia de este dispositivo:
 * se guarda en localStorage (no viaja con la sincronización ni cambia los datos).
 * public/theme-init.js lo aplica antes de pintar; acá se cambia y se sigue al sistema.
 */
export type ThemePref = 'system' | 'light' | 'dark';
const KEY = 'fp.tema';

export function getThemePref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

const systemDark = () => typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;

export function applyTheme(pref: ThemePref = getThemePref()) {
  const dark = pref === 'dark' || (pref === 'system' && systemDark());
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0d1714' : '#123c3a');
}

export function setThemePref(pref: ThemePref) {
  try {
    if (pref === 'system') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, pref);
  } catch {
    /* sin almacenamiento: el cambio dura hasta cerrar la app */
  }
  applyTheme(pref);
}

/** Si se sigue al sistema, cambia solo cuando el sistema pasa de claro a oscuro. */
export function watchSystemTheme(): () => void {
  if (typeof matchMedia !== 'function') return () => {};
  const mq = matchMedia('(prefers-color-scheme: dark)');
  const on = () => getThemePref() === 'system' && applyTheme('system');
  mq.addEventListener('change', on);
  return () => mq.removeEventListener('change', on);
}
