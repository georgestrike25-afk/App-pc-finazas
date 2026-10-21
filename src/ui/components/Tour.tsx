import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';

/** Un paso de la guía: qué pantalla abrir, qué resaltar y qué explicar. */
interface Step {
  route?: string;
  /** Valores de data-tour a resaltar; se usa el primero que esté visible. */
  target?: string[];
  title: string;
  text: string;
}

const STEPS: Step[] = [
  {
    title: '¡Hola! Te muestro cómo funciona',
    text: 'Son unos pocos pasos cortos. Podés salir cuando quieras y volver a verla desde Más → Cómo usar.',
  },
  {
    route: 'inicio',
    target: ['nav-inicio'],
    title: 'Este mes',
    text: 'Es la pantalla principal. Te dice cuánta plata te queda este mes, cuánto entró, cuánto gastaste y cuánto se va en cuotas.',
  },
  {
    route: 'inicio',
    target: ['pendientes', 'primeros-pasos'],
    title: 'Qué te falta hacer',
    text: 'Acá aparece lo que falta: cobrar el sueldo, pagar los resúmenes, las cuotas del mes. Cuando ya pagaste algo, tocá "Ya lo pagué" y se tilda.',
  },
  {
    route: 'importar',
    target: ['nav-importar'],
    title: 'Subir documento',
    text: 'Casi todo se carga solo subiendo tus documentos: resúmenes de tarjeta, cronogramas de préstamos, capturas de los movimientos del banco o el plan de Mercado Pago.',
  },
  {
    route: 'importar',
    target: ['subir-archivo'],
    title: 'Elegí el archivo',
    text: 'Tocá acá y elegí el PDF o la captura. La app te muestra qué va a cargar y si los números coinciden. No se guarda nada hasta que tocás Confirmar.',
  },
  {
    route: 'entidades',
    target: ['nav-deudas'],
    title: 'Deudas',
    text: 'Cuánto le debés a cada banco o billetera (Patagonia, Mercado Pago, Naranja X, Ualá) y en qué mes terminás de pagar. Arriba hay pestañas para ver las cuotas mes a mes.',
  },
  {
    route: 'gastos',
    target: ['nav-gastos'],
    title: 'Gastos',
    text: 'Lo que pagaste con tarjeta llega solo con el resumen. Acá anotás lo demás: efectivo o transferencias. En las pestañas de arriba están los ingresos, los gastos compartidos con tu pareja y el presupuesto.',
  },
  {
    route: 'gastos',
    target: ['anotar-gasto'],
    title: 'Anotar un gasto',
    text: 'Tocá "+ Anotar gasto", poné cuánto y en qué, y listo.',
  },
  {
    route: 'viaje',
    target: ['nav-viaje'],
    title: 'Viaje',
    text: 'Poné cuánto cuesta el viaje y cuánto ahorrás por mes. La app te dice si llegás y cuánto te falta.',
  },
  {
    route: 'inicio',
    target: ['nav-mas'],
    title: 'Más',
    text: 'Acá están: Cómo usar, Configuración, Copias de seguridad (hacé una por mes) y la sincronización con la PC.',
  },
  {
    route: 'inicio',
    target: ['ayuda-pagina'],
    title: 'El signo ?',
    text: 'Cuando no entiendas algo, tocá el ? que está al lado de los títulos y datos. Te aparece una burbuja que explica qué es.',
  },
  {
    title: '¡Listo!',
    text: 'Para empezar, subí el resumen de una tarjeta o el cronograma de un préstamo. Lo demás te lo va pidiendo la app en "Este mes".',
  },
];

const SEEN_KEY = 'fp.guiaVista';
const START_EVENT = 'fp:guia';

/** Abre la guía paso a paso desde cualquier pantalla. */
export function startTour() {
  window.dispatchEvent(new Event(START_EVENT));
}

function markSeen() {
  try {
    localStorage.setItem(SEEN_KEY, '1');
  } catch {
    /* sin almacenamiento: se mostrará de nuevo la próxima vez */
  }
}

function alreadySeen(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === '1';
  } catch {
    return true;
  }
}

function findTarget(names?: string[]): HTMLElement | null {
  for (const n of names ?? []) {
    for (const el of document.querySelectorAll<HTMLElement>(`[data-tour="${n}"]`)) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0 && r.right > 0 && r.left < window.innerWidth) return el;
    }
  }
  return null;
}

export function Tour() {
  const [step, setStep] = useState<number | null>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [cardH, setCardH] = useState(0);
  const card = useRef<HTMLDivElement>(null);
  const next = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const open = () => setStep(0);
    window.addEventListener(START_EVENT, open);
    if (!alreadySeen()) open();
    return () => window.removeEventListener(START_EVENT, open);
  }, []);

  const close = useCallback(() => {
    markSeen();
    setStep(null);
    setRect(null);
  }, []);

  const s = step === null ? null : STEPS[step];

  // Abre la pantalla del paso y busca el elemento a resaltar (puede tardar en aparecer).
  useEffect(() => {
    if (!s) return;
    if (s.route && (window.location.hash.replace(/^#\/?/, '').split('?')[0] || 'inicio') !== s.route) window.location.hash = `#/${s.route}`;
    let tries = 0;
    let timer = 0;
    const look = () => {
      const el = findTarget(s.target);
      if (el) {
        const r0 = el.getBoundingClientRect();
        if (r0.top < 60 || r0.bottom > window.innerHeight - 80) el.scrollIntoView({ block: 'center' });
        setRect(el.getBoundingClientRect());
      } else if (s.target && tries++ < 15) timer = window.setTimeout(look, 80);
      else setRect(null);
    };
    setRect(null);
    timer = window.setTimeout(look, 30);
    const onMove = () => {
      const el = findTarget(s.target);
      setRect(el ? el.getBoundingClientRect() : null);
    };
    window.addEventListener('resize', onMove);
    window.addEventListener('scroll', onMove, true);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('resize', onMove);
      window.removeEventListener('scroll', onMove, true);
    };
  }, [s]);

  useLayoutEffect(() => {
    if (card.current) setCardH(card.current.offsetHeight);
    next.current?.focus({ preventScroll: true });
  }, [step, rect]);

  useEffect(() => {
    if (step === null) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowRight') setStep((x) => (x === null ? x : Math.min(STEPS.length - 1, x + 1)));
      else if (e.key === 'ArrowLeft') setStep((x) => (x === null ? x : Math.max(0, x - 1)));
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [step, close]);

  if (step === null || !s) return null;
  const last = step === STEPS.length - 1;
  const pad = 6;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const cardW = Math.min(360, vw - 24);
  let style: CSSProperties;
  if (rect) {
    const below = rect.bottom + pad + 12;
    const above = rect.top - pad - 12 - cardH;
    const top = rect.top < vh / 2 ? Math.min(below, vh - cardH - 12) : Math.max(12, above);
    const left = Math.max(12, Math.min(rect.left + rect.width / 2 - cardW / 2, vw - cardW - 12));
    style = { top, left };
  } else style = { top: Math.max(12, (vh - cardH) / 2), left: (vw - cardW) / 2 };

  return (
    <>
      <div className="tour-block" onClick={(e) => e.stopPropagation()} />
      {rect ? (
        <div className="tour-spot" style={{ top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }} />
      ) : (
        <div className="tour-dim" />
      )}
      <div ref={card} className="tour-card" role="dialog" aria-modal="true" aria-labelledby="tour-t" aria-describedby="tour-d" style={style} data-testid="guia">
        <div className="tour-dots" aria-hidden>
          {STEPS.map((_, i) => <i key={i} className={i === step ? 'on' : ''} />)}
        </div>
        <h2 id="tour-t">{s.title}</h2>
        <p id="tour-d">{s.text}</p>
        <div className="tour-foot">
          <span className="tour-step">Paso {step + 1} de {STEPS.length}</span>
          <span className="row-actions">
            {!last && <button className="btn small ghost" onClick={close}>Salir</button>}
            {step > 0 && <button className="btn small" onClick={() => setStep(step - 1)}>Anterior</button>}
            <button
              ref={next}
              className="btn small primary"
              onClick={() => {
                if (last) {
                  close();
                  window.location.hash = '#/inicio';
                } else setStep(step + 1);
              }}
            >
              {last ? 'Empezar' : step === 0 ? 'Empezar la guía' : 'Siguiente'}
            </button>
          </span>
        </div>
      </div>
    </>
  );
}
