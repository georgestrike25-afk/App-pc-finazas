import { useEffect, useMemo, useState } from 'react';
import { Camera, Receipt } from 'lucide-react';
import { useApp } from '../store';
import { getDb } from '../../db/db';
import { getDeviceId, notify, nowIso, saveRecord } from '../../db/repo';
import { formatDate, monthLabel, monthOf, todayIso } from '../../domain/dates';
import { sum, type Cents } from '../../domain/money';
import { markRefund, receiveRefunds, refundSummary, reopenRefund, undoRefund } from '../../domain/refunds';
import { uid } from '../../domain/text';
import type { DocumentMeta, Expense, Income, Settings } from '../../domain/types';
import { Badge, Card, Empty, Field, Money, MoneyInput, Modal } from '../components/ui';

const DEFAULT_FROM = 'Hospital';

/** Guarda a quién le pedís las devoluciones, para que "Me devuelven" sea de un solo toque. */
async function rememberFrom(settings: Settings, from: string) {
  if (from && settings.refundFrom !== from) await saveRecord<Settings>('settings', { ...settings, refundFrom: from }, `Quién te devuelve gastos: ${from}`);
}

/** Pasa un gasto a "me lo devuelven". Con un nombre ya elegido es un solo toque; la primera vez pregunta. */
export function RefundButton({ e, small = true }: { e: Expense; small?: boolean }) {
  const { data, toast } = useApp();
  const [ask, setAsk] = useState(false);
  const apply = async (from: string, amount?: Cents) => {
    await rememberFrom(data.settings, from);
    await saveRecord<Expense>('expenses', markRefund(e, from, amount), `Gasto que te devuelven (${from}): "${e.concept}"`);
    toast(`Pasó a Devoluciones: ${e.concept}.`);
  };
  return (
    <>
      <button className={`btn ${small ? 'small' : ''} ghost`} onClick={() => (data.settings.refundFrom ? apply(data.settings.refundFrom) : setAsk(true))} title="Lo pagaste vos y te lo devuelven: no cuenta como gasto tuyo hasta que se resuelva" aria-label={`Me devuelven: ${e.concept}`}>
        Me devuelven
      </button>
      {ask && <RefundAskModal title="¿Quién te lo devuelve?" initialFrom={data.settings.refundFrom ?? DEFAULT_FROM} initialAmount={e.totalAmount} onClose={() => setAsk(false)} onConfirm={async (f, a) => { await apply(f, a); setAsk(false); }} />}
    </>
  );
}

export function RefundAskModal({ title, initialFrom, initialAmount, confirmLabel = 'Guardar', onClose, onConfirm }: { title: string; initialFrom: string; initialAmount?: Cents; confirmLabel?: string; onClose: () => void; onConfirm: (from: string, amount: Cents) => void | Promise<void> }) {
  const [from, setFrom] = useState(initialFrom);
  const [amount, setAmount] = useState<Cents | undefined>(initialAmount);
  return (
    <Modal title={title} onClose={onClose} footer={<><button className="btn ghost" onClick={onClose}>Cancelar</button><button className="btn primary" disabled={!amount || amount <= 0 || !from.trim()} onClick={() => amount && onConfirm(from.trim(), amount)}>{confirmLabel}</button></>}>
      <div className="form-grid">
        <Field label="Quién te lo devuelve" hint="Se acuerda para la próxima: así 'Me devuelven' es un solo toque.">{(id) => <input id={id} value={from} onChange={(e) => setFrom(e.target.value)} />}</Field>
        <Field label="Cuánto te devuelven">{(id) => <MoneyInput id={id} value={amount} onChange={setAmount} />}</Field>
      </div>
    </Modal>
  );
}

/** Foto del ticket reducida para que ocupe poco (se guarda solo en este dispositivo). */
async function shrinkImage(file: File, max = 1400, quality = 0.72): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * k);
    c.height = Math.round(bmp.height * k);
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise<Blob | null>((res) => c.toBlob(res, 'image/jpeg', quality));
    return blob ?? file;
  } catch {
    return file;
  }
}

function TicketPhoto({ docId }: { docId: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    let u = '';
    getDb().blobs.get(docId).then((b) => {
      if (b) {
        u = URL.createObjectURL(b.blob);
        setUrl(u);
      }
    });
    return () => {
      if (u) URL.revokeObjectURL(u);
    };
  }, [open, docId]);
  return (
    <>
      <button className="btn small ghost" onClick={() => setOpen(true)} aria-label="Ver la foto del ticket"><Camera aria-hidden /></button>
      {open && (
        <Modal title="Ticket" onClose={() => setOpen(false)} footer={<button className="btn" onClick={() => setOpen(false)}>Cerrar</button>}>
          {url ? <img src={url} alt="Foto del ticket" style={{ maxWidth: '100%', borderRadius: 12 }} /> : <p className="muted">No se encontró la foto en este dispositivo.</p>}
        </Modal>
      )}
    </>
  );
}

/** Un gasto que te devuelven y no vino de ningún lado (ticket de taxi, algo en efectivo): se anota a mano, con foto si querés. */
function AddModal({ onClose }: { onClose: () => void }) {
  const { data, toast } = useApp();
  const [concept, setConcept] = useState('Taxi');
  const [amount, setAmount] = useState<Cents | undefined>();
  const [date, setDate] = useState(todayIso());
  const [from, setFrom] = useState(data.settings.refundFrom ?? DEFAULT_FROM);
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  useEffect(() => {
    if (!photo) return setPreview('');
    const u = URL.createObjectURL(photo);
    setPreview(u);
    return () => URL.revokeObjectURL(u);
  }, [photo]);
  const save = async () => {
    if (!amount || amount <= 0) return;
    const db = getDb();
    const deviceId = await getDeviceId(db);
    const now = nowIso();
    let documentId: string | undefined;
    if (photo) {
      const blob = await shrinkImage(photo);
      documentId = uid();
      const doc: DocumentMeta = { id: documentId, createdAt: now, updatedAt: now, deviceId, name: `Ticket ${concept} ${date}.jpg`.slice(0, 200), mime: blob.type || 'image/jpeg', size: blob.size, hash: `ticket:${documentId}`, kind: 'imagen', importedAt: now, entity: from, hasBlob: true, summary: 'Foto de un ticket (solo en este dispositivo)' };
      await db.documents.put(doc);
      await db.blobs.put({ id: documentId, blob });
    }
    await rememberFrom(data.settings, from.trim());
    const exp: Omit<Expense, 'id' | 'createdAt' | 'updatedAt'> = {
      kind: 'cotidiano', category: 'Transporte', concept: concept.trim() || 'Gasto', date, month: monthOf(date), totalAmount: amount, userPct: 100, paid: true, frequency: 'unica', paymentMethod: 'efectivo', source: 'manual', documentId,
      refund: { from: from.trim() || DEFAULT_FROM, amount, status: 'pendiente' },
    };
    await saveRecord<Expense>('expenses', exp, `Gasto que te devuelven (${from}): "${concept}"`);
    notify();
    toast('Anotado en Devoluciones.');
    onClose();
  };
  return (
    <Modal title="Gasto que me devuelven" onClose={onClose} footer={<><button className="btn ghost" onClick={onClose}>Cancelar</button><button className="btn primary" disabled={!amount || amount <= 0} onClick={save}>Guardar</button></>}>
      <div className="form-grid">
        <Field label="Qué fue">{(id) => <input id={id} value={concept} onChange={(e) => setConcept(e.target.value)} placeholder="Taxi, remís…" />}</Field>
        <Field label="Importe">{(id) => <MoneyInput id={id} value={amount} onChange={setAmount} />}</Field>
        <Field label="Fecha">{(id) => <input id={id} type="date" value={date} max={todayIso()} onChange={(e) => e.target.value && setDate(e.target.value)} />}</Field>
        <Field label="Quién te lo devuelve">{(id) => <input id={id} value={from} onChange={(e) => setFrom(e.target.value)} />}</Field>
      </div>
      <Field label="Foto del ticket (opcional)" hint="Queda guardada solo en este dispositivo, por si te la piden. La app no la lee: el importe lo ponés vos.">
        {(id) => <input id={id} type="file" accept="image/*" capture="environment" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />}
      </Field>
      {preview && <img src={preview} alt="Vista previa del ticket" style={{ maxWidth: 160, borderRadius: 10, marginTop: 8 }} />}
    </Modal>
  );
}

/** "Me devolvieron": cuánto, cuándo, y si la app ya lo había anotado solo como ingreso (transferencia recibida). */
function ReceiveModal({ items, onClose, onDone }: { items: Expense[]; onClose: () => void; onDone: () => void }) {
  const { data, toast } = useApp();
  const expected = sum(items.map((e) => e.refund!.amount));
  const [amount, setAmount] = useState<Cents | undefined>(expected);
  const [date, setDate] = useState(todayIso());
  const [picked, setPicked] = useState<Set<string>>(new Set());
  // Transferencias recibidas que la app anotó sola como ingreso en los últimos 45 días.
  const since = new Date(Date.now() - 45 * 86400000).toISOString();
  const candidates = useMemo(
    () =>
      data.incomes
        .filter((i) => !i.deleted)
        .flatMap((i) => i.extras.map((x, idx) => ({ key: `${i.id}|${idx}`, income: i, idx, concept: x.concept, amount: x.amount, at: x.at ?? i.updatedAt })))
        .filter((c) => c.amount > 0 && c.at >= since)
        .sort((a, b) => b.at.localeCompare(a.at))
        .slice(0, 8),
    [data.incomes, since],
  );
  const toggle = (c: (typeof candidates)[number]) => {
    const next = new Set(picked);
    if (next.has(c.key)) next.delete(c.key);
    else next.add(c.key);
    setPicked(next);
    const chosen = candidates.filter((x) => next.has(x.key));
    if (chosen.length) setAmount(sum(chosen.map((x) => x.amount)));
  };
  const confirm = async () => {
    if (amount === undefined || amount < 0) return;
    const now = nowIso();
    const updated = receiveRefunds(items, amount, date, now);
    for (const e of updated) await saveRecord<Expense>('expenses', e, `Te devolvieron: "${e.concept}" (${(e.refund!.receivedAmount! / 100).toLocaleString('es-AR')})`);
    // Esa transferencia no es un ingreso: era la devolución. Se saca de los ingresos para no contarla dos veces.
    const byIncome = new Map<string, Set<number>>();
    for (const c of candidates) if (picked.has(c.key)) byIncome.set(c.income.id, new Set([...(byIncome.get(c.income.id) ?? []), c.idx]));
    for (const [id, idxs] of byIncome) {
      const inc = data.incomes.find((i) => i.id === id)!;
      await saveRecord<Income>('incomes', { ...inc, extras: inc.extras.filter((_, i) => !idxs.has(i)) }, 'Transferencia pasada de ingreso a devolución');
    }
    notify();
    toast(`Registrado: te devolvieron ${(amount / 100).toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })}.`);
    onDone();
  };
  return (
    <Modal title="Me devolvieron" onClose={onClose} footer={<><button className="btn ghost" onClick={onClose}>Cancelar</button><button className="btn primary" disabled={amount === undefined} onClick={confirm}>Confirmar</button></>}>
      <p style={{ marginTop: 0 }}>{items.length} gasto(s) por <strong><Money value={expected} /></strong>.</p>
      <div className="form-grid">
        <Field label="Cuánto te devolvieron" hint={amount !== undefined && amount !== expected ? 'Es distinto de lo esperado: se reparte entre los gastos y lo que falte cuenta como gasto tuyo.' : undefined}>{(id) => <MoneyInput id={id} value={amount} onChange={setAmount} />}</Field>
        <Field label="Cuándo">{(id) => <input id={id} type="date" value={date} max={todayIso()} onChange={(e) => e.target.value && setDate(e.target.value)} />}</Field>
      </div>
      {candidates.length > 0 && (
        <details style={{ marginTop: 12 }}>
          <summary className="small">¿Te lo transfirieron? (si te lo dieron en efectivo, no hace falta)</summary>
          <p className="muted small" style={{ margin: '6px 0' }}>Si te llegó por transferencia, la app pudo anotarla sola como ingreso. Elegila y la paso de ingreso a devolución, así no se cuenta dos veces.</p>
          <ul className="list">
            {candidates.map((c) => (
              <li key={c.key}>
                <label className="check" style={{ flex: 1 }}>
                  <input type="checkbox" checked={picked.has(c.key)} onChange={() => toggle(c)} />
                  <span>{c.concept}<small className="muted d-block">{formatDate(c.at.slice(0, 10))}</small></span>
                </label>
                <Money value={c.amount} />
              </li>
            ))}
          </ul>
        </details>
      )}
    </Modal>
  );
}

export function DevolucionesPage() {
  const { data, toast } = useApp();
  const sm = useMemo(() => refundSummary(data.expenses), [data.expenses]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);
  const [receiving, setReceiving] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const thisMonth = todayIso().slice(0, 7);
  const receivedThisMonth = sum(sm.done.filter((e) => (e.refund!.receivedDate ?? '').startsWith(thisMonth)).map((e) => e.refund!.receivedAmount ?? e.refund!.amount));
  const chosen = sm.pending.filter((e) => picked.has(e.id));
  const toggle = (id: string) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toggleGroup = (ids: string[]) => setPicked((p) => { const n = new Set(p); const all = ids.every((i) => n.has(i)); ids.forEach((i) => (all ? n.delete(i) : n.add(i))); return n; });
  const back = async (e: Expense) => {
    await saveRecord<Expense>('expenses', undoRefund(e), `"${e.concept}" vuelve a ser un gasto tuyo`);
    setPicked((p) => { const n = new Set(p); n.delete(e.id); return n; });
    toast('Vuelve a Gastos como un gasto tuyo.');
  };

  return (
    <div className="page devoluciones">
      <div className="kpis">
        <div className="kpi"><span>Te tienen que devolver</span><Money value={sm.pendingTotal} /></div>
        <div className="kpi"><span>Te devolvieron en {monthLabel(thisMonth).split(' ')[0]}</span><Money value={receivedThisMonth} /></div>
      </div>
      <div className="page-actions"><button className="btn primary" onClick={() => setAdding(true)}>+ Gasto que me devuelven</button></div>

      {sm.pending.length === 0 ? (
        <Card><Empty title="No te deben nada por ahora" icon={Receipt}>En Gastos, tocá "Me devuelven" en lo que te reintegra el hospital (un viaje de Uber, una transferencia…). Un ticket de taxi lo anotás con el botón de arriba.</Empty></Card>
      ) : (
        sm.byFrom.map((g) => (
          <Card key={g.from} title={`Pendiente · ${g.from}`} actions={<Money value={g.total} />} help="Lo que pagaste vos y te tienen que devolver. No cuenta como gasto tuyo ni en tu presupuesto, pero sí te baja la plata que tenés hasta que te lo devuelvan.">
            <label className="check small" style={{ marginBottom: 6 }}>
              <input type="checkbox" checked={g.items.every((e) => picked.has(e.id))} onChange={() => toggleGroup(g.items.map((e) => e.id))} /> Elegir todos
            </label>
            <ul className="list" data-testid="devoluciones-pendientes">
              {g.items.map((e) => (
                <li key={e.id}>
                  <div className="refund-row">
                    <label className="check refund-txt">
                      <input type="checkbox" checked={picked.has(e.id)} onChange={() => toggle(e.id)} aria-label={`Elegir ${e.concept}`} />
                      <span>
                        {e.concept}
                        <small className="muted d-block">{formatDate(e.date)} · {e.category}{e.refund!.amount !== e.totalAmount ? ` · te devuelven una parte (de ${(e.totalAmount / 100).toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })})` : ''}</small>
                      </span>
                    </label>
                    <Money value={e.refund!.amount} />
                  </div>
                  <span className="exp-acts refund-acts">
                    {e.documentId && <TicketPhoto docId={e.documentId} />}
                    <button className="btn small ghost" onClick={() => setEditing(e)} aria-label={`Editar ${e.concept}`}>Editar</button>
                    <button className="btn small ghost" onClick={() => back(e)} aria-label={`No me lo devuelven: ${e.concept}`}>No me lo devuelven</button>
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        ))
      )}

      {chosen.length > 0 && (
        <div className="refund-bar" role="region" aria-label="Elegidos">
          <span>{chosen.length} elegido(s) · <Money value={sum(chosen.map((e) => e.refund!.amount))} /></span>
          <button className="btn primary" onClick={() => setReceiving(true)}>Me devolvieron</button>
        </div>
      )}

      {sm.done.length > 0 && (
        <Card title="Ya te los devolvieron">
          <details>
            <summary>{sm.done.length} gasto(s) · <Money value={sum(sm.done.map((e) => e.refund!.receivedAmount ?? e.refund!.amount))} /></summary>
            <ul className="list" style={{ marginTop: 8 }}>
              {sm.done.map((e) => (
                <li key={e.id}>
                  <div className="refund-row">
                    <span className="refund-txt">{e.concept}<small className="muted d-block">{formatDate(e.date)} · {e.refund!.from} · devuelto el {e.refund!.receivedDate ? formatDate(e.refund!.receivedDate) : '—'}</small></span>
                    <Money value={e.refund!.receivedAmount ?? e.refund!.amount} />
                  </div>
                  <span className="exp-acts refund-acts">
                    <Badge tone="ok">Devuelto</Badge>
                    <button className="btn small ghost" onClick={() => saveRecord<Expense>('expenses', reopenRefund(e), `"${e.concept}" vuelve a pendiente de devolución`)}>Deshacer</button>
                  </span>
                </li>
              ))}
            </ul>
          </details>
        </Card>
      )}


      {adding && <AddModal onClose={() => setAdding(false)} />}
      {receiving && <ReceiveModal items={chosen} onClose={() => setReceiving(false)} onDone={() => { setReceiving(false); setPicked(new Set()); }} />}
      {editing && (
        <RefundAskModal
          title="Editar devolución"
          initialFrom={editing.refund!.from}
          initialAmount={editing.refund!.amount}
          onClose={() => setEditing(null)}
          onConfirm={async (from, amount) => {
            await saveRecord<Expense>('expenses', { ...editing, refund: { ...editing.refund!, from, amount } }, `Devolución de "${editing.concept}" editada`);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}
