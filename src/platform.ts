import { Capacitor } from '@capacitor/core';
import { toB64 } from './backup/crypto';

/** true dentro de la app nativa (APK de Android). */
export function isNative(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

export function platformName(): 'android' | 'web' | 'escritorio' {
  if (isNative()) return 'android';
  return (window as unknown as { finanzasDesktop?: unknown }).finanzasDesktop ? 'escritorio' : 'web';
}

export interface DesktopPairing {
  localUrl: string;
  lanUrl: string | null;
  otherUrls: string[];
  space: string;
  token: string;
  code: string | null;
  version: string;
}

interface DesktopBridge {
  pairing(): Promise<DesktopPairing>;
  copy(text: string): Promise<boolean>;
}

/** Puente con la app de escritorio de Windows (null en el navegador o el celular). */
export function desktop(): DesktopBridge | null {
  return (window as unknown as { finanzasDesktop?: DesktopBridge }).finanzasDesktop ?? null;
}

async function toBase64(data: Blob | string): Promise<string> {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(await data.arrayBuffer());
  return toB64(bytes);
}

function sanitizeName(name: string) {
  return name.replace(/[\\/:*?"<>|]+/g, '_').slice(0, 120);
}

/**
 * Guarda un archivo generado por la app.
 * - Navegador / escritorio: descarga normal.
 * - Android: abre el menú "Compartir" (Drive, WhatsApp, correo, Archivos…).
 */
export async function saveFile(name: string, data: Blob | string, mime: string): Promise<string> {
  const safe = sanitizeName(name);
  if (isNative()) {
    const { Filesystem, Directory } = await import('@capacitor/filesystem');
    const { Share } = await import('@capacitor/share');
    const res = await Filesystem.writeFile({ path: safe, data: await toBase64(data), directory: Directory.Cache });
    try {
      await Share.share({ title: safe, files: [res.uri], dialogTitle: 'Guardar o enviar el archivo' });
    } catch (e) {
      if (!/cancel/i.test(String((e as Error)?.message))) throw e;
      return 'Operación cancelada.';
    }
    return 'Archivo listo para guardar o enviar.';
  }
  const blob = typeof data === 'string' ? new Blob([data], { type: mime }) : data;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = safe;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return 'Archivo descargado.';
}

/** Android: guarda una copia en la carpeta pública Documentos/FinanzasPersonales. */
export async function saveToDocuments(name: string, data: Blob | string): Promise<string> {
  const { Filesystem, Directory } = await import('@capacitor/filesystem');
  const path = `FinanzasPersonales/${sanitizeName(name)}`;
  await Filesystem.writeFile({ path, data: await toBase64(data), directory: Directory.Documents, recursive: true });
  return `Guardado en Documentos/${path.split('/')[0]}`;
}
