import { describe, expect, it } from 'vitest';
import QRCode from 'qrcode';
import jsQR from 'jsqr';
import { codigoPareja, leerCodigoPareja } from '../../src/domain/pareja';

describe('QR del modo pareja', () => {
  it('el código entra en un QR y se lee de vuelta', () => {
    const cfg = { servidores: ['http://192.168.0.23:8797', 'http://192.168.0.10:8787'], space: 'pareja-Ab12Cd34Ef56Gh78', token: 'x'.repeat(32), passphrase: 'y'.repeat(24) };
    const code = codigoPareja(cfg);
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
    expect(leerCodigoPareja(r!.data)).toEqual(cfg);
  });
});
