import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { useApp } from '../store';
import { todayIso } from '../../domain/dates';
import { GUIDE, liveAnswers, searchAnswers, type Answer } from '../../domain/asistente';
import { Card, Money } from '../components/ui';

/** "Preguntale a Brote": preguntas con tus números y cómo funciona cada cosa. Sin IA y sin internet. */
export function AsistentePage() {
  const { data, today } = useApp();
  const live = useMemo(() => liveAnswers(data, today, todayIso()), [data, today]);
  const all = useMemo(() => [...live, ...GUIDE], [live]);
  const [text, setText] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const found = useMemo(() => searchAnswers(all, text), [all, text]);
  const topics = useMemo(() => [...new Set(GUIDE.map((g) => g.topic))], []);
  const shown = open ? all.find((a) => a.id === open) : undefined;

  return (
    <div className="page asistente">
      <Card>
        <label className="ask" htmlFor="ask">
          <Search aria-hidden />
          <input id="ask" type="search" placeholder="Escribí tu pregunta… (ej.: cuánto puedo juntar)" value={text} onChange={(e) => { setText(e.target.value); setOpen(null); }} autoComplete="off" />
        </label>
        <p className="muted small" style={{ margin: '8px 0 0' }}>Responde con tus números y explica cada parte de la app. Todo se calcula en este dispositivo.</p>
      </Card>

      {shown && <AnswerCard a={shown} onClose={() => setOpen(null)} />}

      {text.trim() && !shown && (
        <Card title={found.length ? 'Esto encontré' : 'No encontré esa pregunta'}>
          {found.length ? (
            <ul className="q-list">{found.map((a) => <QItem key={a.id} a={a} onOpen={setOpen} />)}</ul>
          ) : (
            <p className="muted" style={{ margin: 0 }}>Probá con otras palabras (por ejemplo: "deuda", "viaje", "sueldo", "sincronizar") o elegí una de abajo.</p>
          )}
        </Card>
      )}

      {!shown && (
        <>
          <Card title="Con tus números">
            <div className="q-chips">
              {live.map((a) => (
                <button key={a.id} className="q-chip" onClick={() => setOpen(a.id)}>{a.q}</button>
              ))}
            </div>
          </Card>
          <Card title="Cómo funciona la app">
            {topics.map((t) => (
              <details key={t} className="q-topic">
                <summary>{t}</summary>
                <ul className="q-list">{GUIDE.filter((g) => g.topic === t).map((a) => <QItem key={a.id} a={a} onOpen={setOpen} />)}</ul>
              </details>
            ))}
          </Card>
        </>
      )}
    </div>
  );
}

function QItem({ a, onOpen }: { a: Answer; onOpen: (id: string) => void }) {
  return (
    <li>
      <button className="linklike q-item" onClick={() => onOpen(a.id)}>{a.q}</button>
    </li>
  );
}

function AnswerCard({ a, onClose }: { a: Answer; onClose: () => void }) {
  return (
    <Card title={a.q} className="answer-card" actions={<button className="btn small ghost" onClick={onClose}>Otra pregunta</button>}>
      <p className="answer-short">{a.short}</p>
      {!!a.lines?.length && (
        <ul className="answer-lines">
          {a.lines.map((l, i) => (
            <li key={i} className={l.strong ? 'strong' : ''}>
              <span>{l.label}</span>
              {l.amount !== undefined && <span>{l.minus ? '− ' : ''}<Money value={l.amount} /></span>}
            </li>
          ))}
        </ul>
      )}
      {a.note && <p className="muted small">{a.note}</p>}
      {a.href && <a className="btn small" href={a.href}>{a.hrefLabel ?? 'Ir'}</a>}
    </Card>
  );
}
