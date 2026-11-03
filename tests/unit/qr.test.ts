import { describe, expect, it } from 'vitest';
import QRCode from 'qrcode';
import jsQR from 'jsqr';
import { makePairingCode, parsePairingCode } from '../../src/sync/syncClient';

describe('QR para conectar el celular con la PC', () => {
  it('el código de la PC entra en un QR y se lee de vuelta', () => {
    const p = { serverUrl: 'http://192.168.0.10:8787', space: 'hogar', token: 'x'.repeat(32) };
    const code = makePairingCode(p);
    const qr = QRCode.create(code, { errorCorrectionLevel: 'M' });
    const n = qr.modules.size;
    const scale = 6;
    const margin = 4;
    const size = (n + margin * 2) * scale;
    const data = new Uint8ClampedArray(size * size * 4).fill(255);
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++)
        if (qr.modules.get(y, x))
          for (let dy = 0; dy < scale; dy++)
            for (let dx = 0; dx < scale; dx++) {
              const i = (((y + margin) * scale + dy) * size + (x + margin) * scale + dx) * 4;
              data[i] = data[i + 1] = data[i + 2] = 0;
            }
    const r = jsQR(data, size, size);
    expect(r?.data).toBe(code);
    expect(parsePairingCode(r!.data)).toEqual(p);
  });
});
