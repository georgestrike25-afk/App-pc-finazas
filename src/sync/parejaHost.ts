import { registerPlugin } from '@capacitor/core';
import { desktop, isNative } from '../platform';

/**
 * Cada dispositivo del modo pareja también recibe la sincronización:
 * - el celular, con un servidor chico dentro de la app de Android (sigue andando en segundo plano
 *   mientras esté activada la lectura de notificaciones);
 * - la PC, con el servidor de la app de escritorio.
 */
interface Host {
  servidorPareja(o: { token: string; space: string }): Promise<{ urls: string[]; puerto: number }>;
  detenerPareja(): Promise<void>;
  quitarAviso(o: { clave: string }): Promise<void>;
}
const Native = registerPlugin<Host>('Notificaciones');

export const PUERTO_CELULAR = 8797;

export interface HostInfo {
  /** Desde este mismo dispositivo. */
  local?: string;
  /** Para los demás, en el Wi-Fi. */
  publica?: string;
}

export async function iniciarHost(token: string, space: string): Promise<HostInfo> {
  try {
    if (isNative()) {
      const r = await Native.servidorPareja({ token, space });
      return { local: `http://127.0.0.1:${r.puerto}`, publica: r.urls[0] };
    }
    const d = desktop();
    if (d) {
      const p = await d.pairing();
      return { local: p.localUrl, publica: p.lanUrl ?? undefined };
    }
  } catch {
    // versión anterior o sin red
  }
  return {};
}

export async function detenerHost() {
  if (isNative()) await Native.detenerPareja().catch(() => {});
}

/** Ya se abrió Brote: se saca el aviso "… actualizó los gastos compartidos" (los detalles llegan como avisos propios). */
export async function quitarAvisoLlegada() {
  if (isNative()) await Native.quitarAviso({ clave: 'parejallegada' }).catch(() => {});
}
