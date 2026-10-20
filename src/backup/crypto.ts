/**
 * Cifrado de copias de seguridad con Web Crypto API (estándar del navegador):
 * PBKDF2-SHA-256 (600.000 iteraciones) para derivar la clave y AES-GCM de 256 bits.
 * No se usan algoritmos propios.
 */
export const PBKDF2_ITERATIONS = 600_000;

export interface EncryptedEnvelope {
  kdf: { name: 'PBKDF2'; hash: 'SHA-256'; iterations: number; salt: string };
  cipher: { name: 'AES-GCM'; iv: string };
  payload: string;
}

export function toB64(bytes: Uint8Array): string {
  let s = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) s += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(s);
}

export function fromB64(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

async function deriveKey(password: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function encryptString(plain: string, password: string, iterations = PBKDF2_ITERATIONS): Promise<EncryptedEnvelope> {
  if (!password || password.length < 8) throw new Error('La contraseña debe tener al menos 8 caracteres.');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt, iterations);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, new TextEncoder().encode(plain));
  return {
    kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations, salt: toB64(salt) },
    cipher: { name: 'AES-GCM', iv: toB64(iv) },
    payload: toB64(new Uint8Array(ct)),
  };
}

export async function decryptString(env: EncryptedEnvelope, password: string): Promise<string> {
  if (env?.kdf?.name !== 'PBKDF2' || env?.cipher?.name !== 'AES-GCM') throw new Error('Formato de cifrado no reconocido.');
  const it = env.kdf.iterations;
  if (!Number.isInteger(it) || it < 100_000 || it > 10_000_000) throw new Error('Parámetros de cifrado inválidos.');
  const key = await deriveKey(password, fromB64(env.kdf.salt), it);
  try {
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(env.cipher.iv) as BufferSource }, key, fromB64(env.payload) as BufferSource);
    return new TextDecoder().decode(pt);
  } catch {
    throw new Error('Contraseña incorrecta o copia dañada.');
  }
}

/** Hash de PIN para el bloqueo de la interfaz (no cifra los datos). */
export async function hashPin(pin: string, saltB64?: string): Promise<{ salt: string; hash: string }> {
  const salt = saltB64 ? fromB64(saltB64) : crypto.getRandomValues(new Uint8Array(16));
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations: 200_000 }, base, 256);
  return { salt: toB64(salt), hash: toB64(new Uint8Array(bits)) };
}
