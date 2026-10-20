import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { formatARS, formatPlain, parseUserAmount, type Cents } from '../../domain/money';
import { monthLabel, type MonthKey } from '../../domain/dates';

export function Money({ value, estimated, className }: { value: Cents | undefined | null; estimated?: boolean; className?: string }) {
  const neg = typeof value === 'number' && value < 0;
  return (
    <span className={`money ${neg ? 'neg' : ''} ${estimated ? 'est' : ''} ${className ?? ''}`} title={estimated ? 'Valor estimado' : undefined}>
      {formatARS(value)}
      {estimated ? <sup aria-label="estimado">≈</sup> : null}
    </span>
  );
}

export function Badge({ tone = 'neutral', children }: { tone?: 'ok' | 'warn' | 'bad' | 'info' | 'neutral' | 'est'; children: ReactNode }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function Card({ title, actions, children, className }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card ${className ?? ''}`}>
      {(title || actions) && (
        <header className="card-h">
          {title && <h2>{title}</h2>}
          {actions && <div className="card-actions">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <p className="empty-t">{title}</p>
      {children && <p className="muted">{children}</p>}
      {action}
    </div>
  );
}

export function Field({ label, hint, error, children }: { label: string; hint?: ReactNode; error?: string; children: (id: string) => ReactNode }) {
  const id = useId();
  return (
    <div className={`field ${error ? 'has-error' : ''}`}>
      <label htmlFor={id}>{label}</label>
      {children(id)}
      {hint && !error && <small className="muted">{hint}</small>}
      {error && <small className="err">{error}</small>}
    </div>
  );
}

/** Campo de importe en pesos: acepta 1.234,56 o 1234.56. */
export function MoneyInput({ id, value, onChange, required, allowNegative, placeholder, name }: { id?: string; value: Cents | undefined; onChange: (v: Cents | undefined) => void; required?: boolean; allowNegative?: boolean; placeholder?: string; name?: string }) {
  const [text, setText] = useState(value === undefined ? '' : formatPlain(value));
  const [err, setErr] = useState('');
  const last = useRef(value);
  useEffect(() => {
    if (value !== last.current) {
      setText(value === undefined ? '' : formatPlain(value));
      last.current = value;
    }
  }, [value]);
  const commit = (t: string) => {
    if (!t.trim()) {
      setErr(required ? 'Requerido' : '');
      last.current = undefined;
      onChange(undefined);
      return;
    }
    const v = parseUserAmount(t);
    if (v === null || (!allowNegative && v < 0)) {
      setErr('Importe inválido');
      return;
    }
    setErr('');
    last.current = v;
    onChange(v);
  };
  return (
    <div className="money-input">
      <span className="prefix">$</span>
      <input
        id={id}
        name={name}
        inputMode="decimal"
        autoComplete="off"
        placeholder={placeholder ?? '0,00'}
        value={text}
        aria-invalid={!!err}
        onChange={(e) => {
          setText(e.target.value);
          const v = parseUserAmount(e.target.value);
          if (v !== null && (allowNegative || v >= 0)) {
            setErr('');
            last.current = v;
            onChange(v);
          }
        }}
        onBlur={(e) => {
          commit(e.target.value);
          const v = parseUserAmount(e.target.value);
          if (v !== null) setText(formatPlain(v));
        }}
      />
      {err && <small className="err">{err}</small>}
    </div>
  );
}

export function MonthSelect({ value, onChange, id }: { value: MonthKey; onChange: (m: MonthKey) => void; id?: string }) {
  return <input id={id} type="month" value={value} onChange={(e) => e.target.value && onChange(e.target.value)} />;
}

export function MonthNav({ month, setMonth }: { month: MonthKey; setMonth: (m: MonthKey) => void }) {
  const shift = (n: number) => {
    const [y, m] = month.split('-').map(Number);
    const d = new Date(y, m - 1 + n, 1);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };
  return (
    <div className="month-nav" role="group" aria-label="Mes">
      <button className="btn ghost icon" onClick={() => shift(-1)} aria-label="Mes anterior">‹</button>
      <label className="month-nav-label">
        <span className="sr-only">Seleccionar mes</span>
        <strong>{monthLabel(month)}</strong>
        <input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} aria-label="Seleccionar mes" />
      </label>
      <button className="btn ghost icon" onClick={() => shift(1)} aria-label="Mes siguiente">›</button>
    </div>
  );
}

export function Modal({ title, onClose, children, footer, wide }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <header className="modal-h">
          <h2>{title}</h2>
          <button className="btn ghost icon" onClick={onClose} aria-label="Cerrar">✕</button>
        </header>
        <div className="modal-b">{children}</div>
        {footer && <footer className="modal-f">{footer}</footer>}
      </div>
    </div>
  );
}

let confirmImpl: ((msg: string, opts?: { danger?: boolean; ok?: string }) => Promise<boolean>) | null = null;
export function confirmDialog(msg: string, opts?: { danger?: boolean; ok?: string }): Promise<boolean> {
  if (confirmImpl) return confirmImpl(msg, opts);
  return Promise.resolve(window.confirm(msg));
}

export function ConfirmHost() {
  const [state, setState] = useState<{ msg: string; danger?: boolean; ok?: string; resolve: (v: boolean) => void } | null>(null);
  useEffect(() => {
    confirmImpl = (msg, opts) => new Promise((resolve) => setState({ msg, ...opts, resolve }));
    return () => {
      confirmImpl = null;
    };
  }, []);
  if (!state) return null;
  const done = (v: boolean) => {
    state.resolve(v);
    setState(null);
  };
  return (
    <Modal
      title="Confirmar"
      onClose={() => done(false)}
      footer={
        <>
          <button className="btn ghost" onClick={() => done(false)}>Cancelar</button>
          <button className={`btn ${state.danger ? 'danger' : 'primary'}`} onClick={() => done(true)} autoFocus>
            {state.ok ?? 'Aceptar'}
          </button>
        </>
      }
    >
      <p style={{ whiteSpace: 'pre-line' }}>{state.msg}</p>
    </Modal>
  );
}

export interface BarDatum {
  label: string;
  values: Array<{ value: number; color: string; name: string; estimated?: boolean }>;
}

/** Gráfico de barras agrupadas en SVG (sin dependencias). */
export function BarChart({ data, height = 180, ariaLabel }: { data: BarDatum[]; height?: number; ariaLabel: string }) {
  const max = Math.max(1, ...data.flatMap((d) => d.values.map((v) => Math.abs(v.value))));
  const groupW = 100 / Math.max(1, data.length);
  const series = data[0]?.values.length ?? 1;
  const barW = (groupW * 0.75) / series;
  const legend = data[0]?.values ?? [];
  return (
    <figure className="chart">
      <svg viewBox={`0 0 100 ${height / 3}`} preserveAspectRatio="none" role="img" aria-label={ariaLabel} style={{ height }}>
        {data.map((d, i) =>
          d.values.map((v, j) => {
            const h = (Math.abs(v.value) / max) * (height / 3 - 2);
            return (
              <rect
                key={`${i}-${j}`}
                x={i * groupW + groupW * 0.125 + j * barW}
                y={height / 3 - h}
                width={barW * 0.92}
                height={h}
                fill={v.color}
                opacity={v.estimated ? 0.45 : 1}
              >
                <title>{`${d.label} · ${v.name}: ${formatARS(v.value)}${v.estimated ? ' (estimado)' : ''}`}</title>
              </rect>
            );
          }),
        )}
      </svg>
      <div className="chart-x">
        {data.map((d, i) => (
          <span key={d.label} style={{ width: `${groupW}%` }}>{data.length > 8 && i % 2 ? '' : d.label}</span>
        ))}
      </div>
      <figcaption className="chart-legend">
        {legend.map((l) => (
          <span key={l.name}><i style={{ background: l.color }} /> {l.name}</span>
        ))}
      </figcaption>
    </figure>
  );
}

export function Progress({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div className="progress" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <div style={{ width: `${pct}%` }} />
      <span>{pct.toFixed(1).replace('.', ',')} %</span>
    </div>
  );
}

export function Warnings({ items }: { items: string[] }) {
  if (!items.length) return null;
  return (
    <ul className="warnings" aria-label="Advertencias">
      {items.map((w, i) => (
        <li key={i}>⚠ {w}</li>
      ))}
    </ul>
  );
}
