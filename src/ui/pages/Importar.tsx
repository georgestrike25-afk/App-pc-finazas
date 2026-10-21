import { useRef, useState } from 'react';
import { useApp } from '../store';
import { extractFile } from '../../importers/extract';
import { buildReview, commitReview, validateReview, verifyReview, type ImportReview, type ReviewAction, type ReviewItem } from '../../importers/review';
import { formatDate, monthLabel } from '../../domain/dates';
import { OBLIGATION_TYPE_LABEL } from '../../domain/obligations';
import type { ExpenseKind, ObligationType } from '../../domain/types';
import { Badge, Card, confirmDialog, Field, Money, MoneyInput, MonthSelect, Warnings } from '../components/ui';
import { KIND_LABEL } from './ExpenseForm';
import { detectLoanSchedule } from '../../importers/loanSchedule';
import { buildLoanReview, commitLoanReview, type LoanReview } from '../../importers/loanReview';
import { LoanReviewView } from './LoanImport';
import { detectPaymentPlan } from '../../importers/paymentPlan';
import { buildPlanReview, commitPlanReview, type PlanReview } from '../../importers/planReview';
import { PlanReviewView } from './PlanImport';

const ACTION_LABEL: Record<ReviewAction, string> = {
  gasto: 'Gasto (consumo)',
  bonificacion: 'Bonificación (resta)',
  ingreso: 'Ingreso cobrado',
  cuota: 'Cuota / obligación',
  pago: 'Pago del resumen',
  sancor: 'Sancor Salud',
  vincular: 'Vincular con existente',
  ignorar: 'No importar',
};

const KIND_ACTION: Record<ReviewItem['parsedKind'], ReviewAction> = { consumo: 'gasto', cargo: 'gasto', cuota: 'cuota', pago: 'pago', sancor: 'sancor', bonificacion: 'bonificacion', credito: 'bonificacion', desconocido: 'gasto', ingreso: 'ingreso', adelanto: 'gasto', transferencia: 'gasto', pago_prestamo: 'gasto' };

const DUP_BADGE: Record<NonNullable<ReviewItem['duplicate']>['type'], [string, 'warn' | 'info' | 'ok']> = {
  linea: ['Duplicado', 'warn'],
  ingreso: ['Ya registrado', 'warn'],
  gasto_manual: ['Posible duplicado', 'warn'],
  obligacion: ['Cuota existente', 'info'],
  sancor: ['Posible duplicado', 'warn'],
  resumen: ['Vinculado al resumen', 'info'],
  prestamo: ['Cuota de préstamo', 'info'],
};

const CONF_TONE = { alta: 'ok', media: 'warn', baja: 'bad' } as const;

function ItemRow({ it, onChange, categories }: { it: ReviewItem; onChange: (p: Partial<ReviewItem>) => void; categories: string[] }) {
  const pending = it.needsReview && !it.reviewed;
  return (
    <div className={`rv-item ${!it.include ? 'off' : ''} ${pending && it.include ? 'pending' : ''}`} data-testid="review-item">
      <div className="rv-top">
        <label className="check">
          <input type="checkbox" checked={it.include} onChange={(e) => onChange({ include: e.target.checked, action: e.target.checked && it.action === 'ignorar' ? KIND_ACTION[it.parsedKind] : it.action })} aria-label="Incluir" />
          <strong>{it.concept}</strong>
        </label>
        <span className="rv-badges">
          <Badge tone={CONF_TONE[it.confidence]}>Confianza {it.confidence}</Badge>
          {pending && <Badge tone="bad">Pendiente de corrección</Badge>}
          {it.reviewed && <Badge tone="ok">Revisado</Badge>}
          {it.duplicate && <Badge tone={DUP_BADGE[it.duplicate.type][1]}>{DUP_BADGE[it.duplicate.type][0]}</Badge>}
        </span>
      </div>
      {it.duplicate && <p className="small warn">{it.duplicate.label}</p>}
      <div className="rv-grid">
        <Field label="Acción" help="Qué hacer con esta línea: cargarla como gasto, como cuota, como pago del resumen, como ingreso, vincularla con algo que ya estaba, o no cargarla.">
          {(id) => (
            <select id={id} value={it.action} onChange={(e) => onChange({ action: e.target.value as ReviewAction, include: e.target.value !== 'ignorar' })}>
              {(Object.keys(ACTION_LABEL) as ReviewAction[]).filter((a) => a !== 'vincular' || it.duplicate?.targetId).map((a) => <option key={a} value={a}>{ACTION_LABEL[a]}</option>)}
            </select>
          )}
        </Field>
        <Field label="Fecha">{(id) => <input id={id} type="date" value={it.date ?? ''} onChange={(e) => onChange({ date: e.target.value || undefined })} />}</Field>
        <Field label="Concepto">{(id) => <input id={id} value={it.concept} onChange={(e) => onChange({ concept: e.target.value })} />}</Field>
        <Field label={it.currency === 'USD' ? 'Importe (convertir a ARS)' : 'Importe'}>
          {(id) => <MoneyInput id={id} name="amount" value={it.amount} onChange={(v) => onChange({ amount: v, currency: it.currency === 'USD' ? 'ARS' : it.currency, reviewed: true })} />}
        </Field>
        <Field label="Mes de imputación" help="En qué mes se cuenta este movimiento. Normalmente es el mes en que lo pagás (el del vencimiento del resumen).">{(id) => <MonthSelect id={id} value={it.month} onChange={(month) => onChange({ month })} />}</Field>
        {it.action === 'cuota' && (
          <>
            <Field label="Cuota actual">{(id) => <input id={id} type="number" min={1} value={it.installmentN ?? ''} onChange={(e) => onChange({ installmentN: e.target.value ? Number(e.target.value) : undefined })} />}</Field>
            <Field label="Total de cuotas">{(id) => <input id={id} type="number" min={1} value={it.installmentTotal ?? ''} onChange={(e) => onChange({ installmentTotal: e.target.value ? Number(e.target.value) : undefined })} />}</Field>
            <Field label="Tipo">
              {(id) => (
                <select id={id} value={it.obligationType} onChange={(e) => onChange({ obligationType: e.target.value as ObligationType })}>
                  {Object.entries(OBLIGATION_TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              )}
            </Field>
          </>
        )}
        {(it.action === 'gasto' || it.action === 'bonificacion') && (
          <>
            <Field label="Tipo de gasto">
              {(id) => (
                <select id={id} value={it.expenseKind} onChange={(e) => onChange({ expenseKind: e.target.value as ExpenseKind })}>
                  {Object.entries(KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              )}
            </Field>
            <Field label="Categoría">{(id) => <input id={id} list="cats-imp" value={it.category} onChange={(e) => onChange({ category: e.target.value })} />}</Field>
            <datalist id="cats-imp">{categories.map((c) => <option key={c} value={c} />)}</datalist>
            {it.expenseKind === 'hogar' && <Field label="% del usuario">{(id) => <input id={id} type="number" min={0} max={100} value={it.userPct} onChange={(e) => onChange({ userPct: Number(e.target.value) })} />}</Field>}
          </>
        )}
      </div>
      {it.warnings.length > 0 && <ul className="small warn rv-warn">{it.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>}
      <details className="small">
        <summary>Texto de origen</summary>
        <code className="src">{it.sourceLine}</code>
      </details>
      {it.needsReview && (
        <label className="check small"><input type="checkbox" checked={it.reviewed} onChange={(e) => onChange({ reviewed: e.target.checked })} /> Revisado: los datos son correctos</label>
      )}
    </div>
  );
}

const SUMMARY_LABEL: Record<ReviewAction, [string, string]> = {
  gasto: ['gasto', 'gastos'],
  bonificacion: ['descuento o devolución', 'descuentos o devoluciones'],
  cuota: ['cuota o préstamo nuevo', 'cuotas o préstamos nuevos'],
  pago: ['pago de tarjeta', 'pagos de tarjeta'],
  sancor: ['cupón de Sancor Salud', 'cupones de Sancor Salud'],
  ingreso: ['ingreso', 'ingresos'],
  vincular: ['ya estaba cargado (se vincula)', 'ya estaban cargados (se vinculan)'],
  ignorar: ['', ''],
};

/** Qué se va a cargar, en una lista corta. */
function ImportSummary({ review }: { review: ImportReview }) {
  const inc = review.items.filter((i) => i.include && i.action !== 'ignorar');
  const by = new Map<ReviewAction, { n: number; total: number }>();
  for (const it of inc) {
    const e = by.get(it.action) ?? { n: 0, total: 0 };
    e.n++;
    e.total += it.amount ?? 0;
    by.set(it.action, e);
  }
  const excluded = review.items.length - inc.length;
  return (
    <Card title="Qué se va a cargar" help="El resumen de lo que se va a guardar al confirmar. Las líneas que no son gasto ni ingreso (transferencias entre tus cuentas, pagos que ya estaban, compras anuladas) no se cargan para no contar dos veces.">
      {inc.length === 0 ? (
        <p className="muted">No hay nada nuevo para cargar{review.items.length ? ' (todo ya estaba cargado o no corresponde)' : ''}.</p>
      ) : (
        <ul className="list" data-testid="import-summary">
          {[...by.entries()].map(([a, v]) => (
            <li key={a}>
              <span><strong>{v.n}</strong> {SUMMARY_LABEL[a][v.n === 1 ? 0 : 1]}</span>
              {a !== 'vincular' && <Money value={v.total} />}
            </li>
          ))}
        </ul>
      )}
      {excluded > 0 && <p className="small muted">{excluded} línea(s) no se cargan: transferencias propias, intereses, pagos ya registrados, compras anuladas u otros meses. Podés verlas abajo.</p>}
    </Card>
  );
}

function VerificationCard({ review }: { review: ImportReview }) {
  const v = verifyReview(review);
  const ac = review.summary.accountCheck;
  if (!v.balance && !v.upcoming.length && !ac) return null;
  const okD = ac?.debits === undefined || Math.abs(ac.debits - ac.parsedDebits) <= 1;
  const okC = ac?.credits === undefined || Math.abs(ac.credits - ac.parsedCredits) <= 1;
  return (
    <Card title="Verificación de la lectura" help="La app hace la cuenta con lo que leyó y la compara con el total que dice el documento. Si aparece ✓ coincide, está todo bien leído. Si dice ⚠ no coincide, revisá las líneas marcadas antes de confirmar.">
      {ac && (ac.debits !== undefined || ac.credits !== undefined) && (
        <p className={okD && okC ? 'ok-text' : 'warn'} data-testid="verif-cuenta">
          {okD && okC ? '✓ ' : '⚠ '}
          Egresos leídos <Money value={ac.parsedDebits} />{ac.debits !== undefined && <> (extracto: <Money value={ac.debits} />)</>} · ingresos leídos <Money value={ac.parsedCredits} />
          {ac.credits !== undefined && <> (extracto: <Money value={ac.credits} />)</>}
          {okD && okC ? ' — coincide: no falta ninguna línea.' : ' — no coincide: puede faltar una línea.'}
        </p>
      )}
      {v.balance && (
        <p className={v.balance.ok ? 'ok-text' : 'warn'} data-testid="verif-saldo">
          {v.balance.ok ? '✓ ' : '⚠ '}
          Saldo anterior ± movimientos leídos = <Money value={v.balance.computed} /> · total del resumen <Money value={v.balance.expected} />
          {v.balance.ok ? ' — coincide: no falta ni sobra ninguna línea.' : <> — diferencia <Money value={v.balance.difference} />: puede faltar o sobrar una línea, o haber un importe mal leído.</>}
        </p>
      )}
      {v.upcoming.length > 0 && (
        <>
          <p className="small muted">Cuadro "Cuotas a vencer" del resumen comparado con las cuotas leídas:</p>
          <ul className="list small" data-testid="verif-cuotas">
            {v.upcoming.map((u) => (
              <li key={u.label}>
                <span>{u.ok ? '✓' : '⚠'} {u.label}</span>
                <span>resumen <Money value={u.amount} /> · leído <Money value={u.computed} /></span>
              </li>
            ))}
          </ul>
        </>
      )}
      {(review.summary.nextClosingDate || review.summary.nextDueDate) && (
        <p className="small muted">Próximo cierre: {formatDate(review.summary.nextClosingDate)} · próximo vencimiento: {formatDate(review.summary.nextDueDate)}</p>
      )}
    </Card>
  );
}

export function ImportarPage() {
  const { data, toast } = useApp();
  const [allowOcr, setAllowOcr] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [pct, setPct] = useState<number | undefined>();
  const [error, setError] = useState('');
  const [review, setReview] = useState<ImportReview | null>(null);
  const [loan, setLoan] = useState<LoanReview | null>(null);
  const [plan, setPlan] = useState<PlanReview | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [markPrev, setMarkPrev] = useState(false);
  const [filter, setFilter] = useState<'todas' | 'pendientes' | 'incluidas' | 'excluidas'>('todas');
  const input = useRef<HTMLInputElement>(null);

  const onFile = async (f: File) => {
    setError('');
    setReview(null);
    setLoan(null);
    setPlan(null);
    setFile(f);
    setBusy('Procesando el documento localmente…');
    try {
      const ex = await extractFile(f, { allowOcr, onProgress: (m, p) => { setBusy(m); setPct(p); } });
      const pp = detectPaymentPlan(ex.lines);
      if (pp) {
        // Plan de pagos mensual del emisor (p. ej. Mercado Pago): deudas con su importe por mes.
        setPlan(await buildPlanReview(pp, { name: f.name, size: f.size, mime: ex.validated.mime, kind: ex.validated.kind, hash: ex.hash }));
        return;
      }
      const schedule = detectLoanSchedule(ex.lines);
      if (schedule) {
        // Cronograma de préstamo: se registra como una obligación con todas sus cuotas.
        setLoan(await buildLoanReview(schedule, { name: f.name, size: f.size, mime: ex.validated.mime, kind: ex.validated.kind, hash: ex.hash }, ex.lines.map((l) => l.text).join('\n')));
        return;
      }
      const rv = await buildReview(ex.parsed, { name: f.name, size: f.size, mime: ex.validated.mime, kind: ex.validated.kind, hash: ex.hash }, ex.ocrUsed);
      if (rv.documentDuplicateOf) {
        const go = await confirmDialog(`Este documento ya fue importado el ${new Date(rv.documentDuplicateOf.importedAt ?? rv.documentDuplicateOf.createdAt).toLocaleDateString('es-AR')}.\n¿Desea revisarlo igualmente? Las líneas ya registradas quedarán desmarcadas.`, { ok: 'Revisar' });
        if (!go) {
          setBusy(null);
          setFile(null);
          return;
        }
      }
      setReview(rv);
      // Listas largas (extractos de cuenta): primero solo lo que se va a cargar.
      setFilter(rv.items.length > 25 ? 'incluidas' : 'todas');
    } catch (e) {
      setError((e as Error).message || 'No se pudo procesar el archivo.');
    } finally {
      setBusy(null);
      setPct(undefined);
      if (input.current) input.current.value = '';
    }
  };

  const update = (key: string, p: Partial<ReviewItem>) => setReview((r) => (r ? { ...r, items: r.items.map((i) => (i.key === key ? { ...i, ...p } : i)) } : r));
  const issues = review ? validateReview(review) : [];
  const commit = async () => {
    if (!review) return;
    try {
      const res = await commitReview(review, file, undefined, { markPreviousPaid: markPrev });
      const c = res.created;
      toast(`Importación completa: ${c.gastos} gasto(s), ${c.cuotas} obligación(es), ${c.pagos} pago(s), ${c.sancor} Sancor, ${c.ingresos} ingreso(s), ${c.vinculados} vinculado(s).`);
      setReview(null);
      setFile(null);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const commitPlan = async () => {
    if (!plan) return;
    try {
      const r = await commitPlanReview(plan, file);
      toast(`Plan incorporado: ${r.created} deuda(s) nueva(s), ${r.updated} actualizada(s).`);
      setPlan(null);
      setFile(null);
      window.location.hash = '#/entidades';
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const commitLoan = async () => {
    if (!loan) return;
    try {
      const r = await commitLoanReview(loan, file);
      toast(r.updated ? 'Préstamo actualizado con el cronograma.' : 'Préstamo incorporado. Véalo en Tarjetas y deudas.');
      setLoan(null);
      setFile(null);
      window.location.hash = '#/deudas';
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const shown = review?.items.filter((i) => (filter === 'pendientes' ? i.needsReview && !i.reviewed : filter === 'incluidas' ? i.include : filter === 'excluidas' ? !i.include : true)) ?? [];

  return (
    <div className="page">
      {loan && <LoanReviewView review={loan} setReview={setLoan} error={error} onCancel={() => { setLoan(null); setFile(null); }} onConfirm={commitLoan} />}
      {plan && <PlanReviewView review={plan} setReview={setPlan} error={error} onCancel={() => { setPlan(null); setFile(null); }} onConfirm={commitPlan} />}
      {!review && !loan && !plan && (
        <Card title="Importar documento" tour="subir-archivo" help={<><p>Qué podés subir:</p><ul><li><strong>Resumen de tarjeta</strong> (PDF): Visa Patagonia, Naranja X, Ualá…</li><li><strong>Cronograma de un préstamo</strong> (PDF del banco).</li><li><strong>Captura de los movimientos del banco</strong>: carga el sueldo y marca pagadas las cuotas.</li><li><strong>Plan de pagos de Mercado Pago</strong>.</li></ul><p>Nada se guarda hasta que tocás Confirmar.</p></>}>
          <p>Formatos: PDF (con texto o escaneado), JPG, PNG, capturas de pantalla, CSV, XLS y XLSX. Resúmenes de Visa Banco Patagonia, Mercado Pago, Mercado Crédito, Naranja X, Plan V, cronogramas de préstamos, planes de pago (Mercado Pago), capturas de movimientos de cuenta y otros.</p>
          <p className="muted small">🔒 El documento se procesa en este dispositivo. Nunca se envía a servicios externos. Su contenido se trata solo como datos.</p>
          <label className="check"><input type="checkbox" checked={allowOcr} onChange={(e) => setAllowOcr(e.target.checked)} /> Usar OCR local para imágenes y PDF escaneados (requiere ~10 MB de recursos, se descargan de esta misma app la primera vez)</label>
          <div className="drop" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) onFile(f); }}>
            <input ref={input} id="file" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.csv,.txt,.xls,.xlsx" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} disabled={!!busy} />
            <label htmlFor="file" className="btn primary">Elegir archivo</label>
            <span className="muted">o arrástrelo aquí</span>
          </div>
          {busy && (
            <div className="busy" role="status">
              <span className="spinner" /> {busy} {pct !== undefined && `${Math.round(pct * 100)} %`}
            </div>
          )}
          {error && <p className="err" role="alert" style={{ whiteSpace: 'pre-line' }}>{error}</p>}
        </Card>
      )}

      {review && (
        <>
          <Card title="Revisión de datos extraídos" actions={<button className="btn small ghost" onClick={() => { setReview(null); setFile(null); }}>Cancelar</button>}>
            <dl className="dl three">
              <dt>Documento de origen</dt><dd>{review.file.name} {review.ocrUsed && <Badge tone="info">OCR</Badge>}</dd>
              <dt>Identificación (SHA-256)</dt><dd><code className="small">{review.file.hash.slice(0, 16)}…</code></dd>
              <dt>Moneda</dt><dd>{review.summary.currency === 'ARS' ? 'Pesos' : review.summary.currency === 'USD' ? 'Dólares' : 'Pesos y dólares'}</dd>
            </dl>
            <Warnings items={review.warnings} />
            {review.undetermined.length > 0 && <p className="small muted">No se pudo determinar: {review.undetermined.join(', ')}.</p>}
            <div className="form-grid">
              <Field label="Entidad">{(id) => <input id={id} value={review.summary.entity} onChange={(e) => setReview({ ...review, summary: { ...review.summary, entity: e.target.value } })} placeholder="No detectada" />}</Field>
              <Field label="Fecha de cierre">{(id) => <input id={id} type="date" value={review.summary.closingDate ?? ''} onChange={(e) => setReview({ ...review, summary: { ...review.summary, closingDate: e.target.value || undefined } })} />}</Field>
              <Field label="Fecha de vencimiento">{(id) => <input id={id} type="date" value={review.summary.dueDate ?? ''} onChange={(e) => setReview({ ...review, summary: { ...review.summary, dueDate: e.target.value || undefined } })} />}</Field>
              <Field label="Mes del resumen" help="El mes en que vence y se paga este resumen. Ahí se cuentan sus compras y cuotas.">{(id) => <MonthSelect id={id} value={review.summary.month ?? ''} onChange={(m) => setReview({ ...review, summary: { ...review.summary, month: m }, items: review.items.map((i) => ({ ...i, month: m })) })} />}</Field>
              <Field label="Total a pagar (informativo)" help="El total que dice el resumen. Sirve para comprobar la lectura y para saber cuánto pagar; no se suma como una deuda nueva porque ya está formado por las compras y cuotas de abajo." hint="No se registra como deuda nueva.">{(id) => <MoneyInput id={id} value={review.summary.total} onChange={(v) => setReview({ ...review, summary: { ...review.summary, total: v } })} />}</Field>
              <Field label="Pago mínimo">{(id) => <MoneyInput id={id} value={review.summary.minimumPayment} onChange={(v) => setReview({ ...review, summary: { ...review.summary, minimumPayment: v } })} />}</Field>
            </div>
            <label className="check"><input type="checkbox" checked={review.summary.registerStatement} onChange={(e) => setReview({ ...review, summary: { ...review.summary, registerStatement: e.target.checked } })} /> Registrar los datos del resumen (total, mínimo, vencimiento)</label>
            {review.items.some((i) => i.duplicate?.type === 'obligacion') && (
              <label className="check"><input type="checkbox" checked={markPrev} onChange={(e) => setMarkPrev(e.target.checked)} /> Considerar pagadas las cuotas anteriores a las que figuran en este resumen</label>
            )}
            {review.summary.previousBalance !== undefined && <p className="small muted">Saldo anterior informado: <Money value={review.summary.previousBalance} /> (solo informativo).</p>}
          </Card>
          <VerificationCard review={review} />
          <ImportSummary review={review} />
          <details className="card lines-detail" open={issues.length > 0 || review.items.length === 0}>
            <summary>Ver y corregir línea por línea ({review.items.length})</summary>
            <div className="row-actions" style={{ justifyContent: 'flex-start', margin: '0.5rem 0' }}>
              <select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} aria-label="Filtrar">
                <option value="todas">Todas</option><option value="pendientes">Pendientes de corrección</option><option value="incluidas">Se van a cargar</option><option value="excluidas">No se cargan</option>
              </select>
            </div>
            {review.items.length === 0 && <p className="muted">No se detectaron movimientos. Puede cargarlos a mano desde Gastos o Deudas.</p>}
            {shown.map((it) => <ItemRow key={it.key} it={it} categories={data.settings.categories} onChange={(p) => update(it.key, p)} />)}
          </details>
          <Card className="sticky-foot">
            {issues.length > 0 && (
              <ul className="err small">{issues.slice(0, 6).map((i) => <li key={i.key + i.message}>{i.message}</li>)}{issues.length > 6 && <li>… y {issues.length - 6} más</li>}</ul>
            )}
            {error && <p className="err" style={{ whiteSpace: 'pre-line' }}>{error}</p>}
            <div className="row-actions">
              <span className="muted">{review.items.filter((i) => i.include && i.action !== 'ignorar').length} de {review.items.length} línea(s) se incorporarán · {review.summary.dueDate ? `Vence ${formatDate(review.summary.dueDate)}` : ''} {review.summary.month ? `· ${monthLabel(review.summary.month)}` : ''}</span>
              <button className="btn ghost" onClick={() => { setReview(null); setFile(null); }}>Cancelar</button>
              <button className="btn primary" disabled={issues.length > 0} onClick={commit}>Confirmar e incorporar</button>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
