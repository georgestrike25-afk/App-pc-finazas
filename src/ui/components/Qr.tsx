import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { Modal } from './ui';

/** QR para conectar el otro celular (se genera en el dispositivo, no sale a internet). */
export function QrCode({ text, label }: { text: string; label: string }) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    QRCode.toDataURL(text, { errorCorrectionLevel: 'M', margin: 2, width: 560, color: { dark: '#123c3a', light: '#ffffff' } }).then(setSrc, () => setSrc(''));
  }, [text]);
  return src ? <img className="qr" src={src} alt={label} width={240} height={240} /> : null;
}

/** Lee un QR con la cámara (todo en el celular). Devuelve el texto con onRead. */
export function QrScanner({ onRead, onClose }: { onRead: (text: string) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    let stream: MediaStream | null = null;
    let raf = 0;
    let done = false;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    (async () => {
      try {
        const { default: jsQR } = await import('jsqr');
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
        const v = video.current;
        if (!v) return;
        v.srcObject = stream;
        await v.play();
        const tick = () => {
          if (done || !ctx) return;
          if (v.readyState >= 2 && v.videoWidth) {
            const w = Math.min(720, v.videoWidth);
            const h = Math.round((v.videoHeight / v.videoWidth) * w);
            canvas.width = w;
            canvas.height = h;
            ctx.drawImage(v, 0, 0, w, h);
            const r = jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: 'dontInvert' });
            if (r?.data) {
              done = true;
              onRead(r.data);
              return;
            }
          }
          raf = requestAnimationFrame(tick);
        };
        tick();
      } catch {
        setErr('No se pudo abrir la cámara. Dale permiso a Brote para usar la cámara, o pegá el código a mano.');
      }
    })();
    return () => {
      done = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [onRead]);
  return (
    <Modal title="Escanear el QR" onClose={onClose} footer={<button className="btn ghost" onClick={onClose}>Cancelar</button>}>
      {err ? <p className="err">{err}</p> : <p className="muted small" style={{ marginTop: 0 }}>Apuntá la cámara al QR que muestra el otro celular.</p>}
      <video ref={video} className="qr-video" playsInline muted />
    </Modal>
  );
}
