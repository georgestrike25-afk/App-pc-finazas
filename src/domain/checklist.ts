import { addMonths, formatDate, monthLabel, type MonthKey } from './dates';
import { formatARS, sum } from './money';
import { buildSchedule, entityGroup, installmentDueDate } from './obligations';
import { sancorSummary } from './sancor';
import type { DataSet } from './monthly';

export interface CheckItem {
  key: string;
  done: boolean;
  title: string;
  detail?: string;
  /** Acción sugerida: ir a una pantalla o marcar un resumen como pagado. */
  href?: string;
  hrefLabel?: string;
  payStatementId?: string;
  payInstallment?: { obligationId: string; n: number };
}

/**
 * Pendientes del mes en lenguaje simple. Se tildan solos a medida que se cargan
 * documentos. Los resúmenes de tarjeta suelen llegar con un mes de atraso: se pide
 * subir uno solo si el último cargado tiene más de un mes.
 */
export function monthChecklist(data: DataSet, today: MonthKey, todayIso: string, lastBackup?: string): CheckItem[] {
  const items: CheckItem[] = [];
  const empty = !data.incomes.length && !data.expenses.length && !data.obligations.length && !data.statements.length;

  const inc = data.incomes.find((i) => i.month === today && i.status === 'confirmado');
  items.push({
    key: 'sueldo',
    done: !!inc,
    title: inc ? `Sueldo de ${monthLabel(today)} cargado` : `Cargar el sueldo de ${monthLabel(today)}`,
    detail: inc ? undefined : 'Subí la captura de los movimientos de tu cuenta (se detecta solo) o cargalo a mano.',
    href: inc ? undefined : '#/importar',
    hrefLabel: 'Subir captura',
  });

  // Tarjetas: un renglón por entidad con resúmenes cargados.
  const groups = new Map<string, typeof data.statements>();
  for (const st of data.statements) {
    const g = entityGroup(st.entity);
    groups.set(g, [...(groups.get(g) ?? []), st]);
  }
  for (const [g, sts] of groups) {
    const last = [...sts].sort((a, b) => a.month.localeCompare(b.month)).at(-1)!;
    // Solo cuentan los pagos posteriores al cierre (el "pago del resumen anterior" impreso en el resumen no lo paga).
    const paid = sum(data.cardPayments.filter((p) => p.statementId === last.id && (!last.closingDate || p.date >= last.closingDate)).map((p) => p.amount));
    const owes = (last.total ?? 0) > 0 && paid < (last.total ?? 0);
    const stale = last.month < addMonths(today, -1);
    if (stale) {
      items.push({ key: `resumen-${g}`, done: false, title: `Subir el resumen nuevo de ${g}`, detail: `El último cargado es de ${monthLabel(last.month)}.`, href: '#/importar', hrefLabel: 'Subir resumen' });
    }
    items.push({
      key: `pago-${g}`,
      done: !owes,
      title: owes ? `Pagar el resumen de ${g} (${formatARS(last.total)})` : `Resumen de ${g} de ${monthLabel(last.month)}: ${(last.total ?? 0) <= 0 ? 'sin nada para pagar' : 'pagado'}`,
      detail: owes ? `Vence ${last.dueDate ? `el ${formatDate(last.dueDate)}` : `en ${monthLabel(last.month)}`}. Si ya lo pagaste, tocá "Ya lo pagué".` : undefined,
      payStatementId: owes ? last.id : undefined,
    });
  }

  // Préstamos: cuotas de este mes vencidas sin pago registrado.
  for (const ob of data.obligations) {
    if (ob.deleted || ob.type !== 'prestamo' || ob.status === 'cancelada') continue;
    for (const i of buildSchedule(ob, today)) {
      if (i.month !== today) continue;
      const due = installmentDueDate(ob, i.n, i.month);
      if (i.status === 'pagada') {
        items.push({ key: `cuota-${ob.id}`, done: true, title: `Cuota ${i.n} de ${ob.concept} pagada` });
      } else if (due <= todayIso) {
        items.push({
          key: `cuota-${ob.id}`,
          done: false,
          title: `Confirmar la cuota ${i.n} de ${ob.concept} (${formatARS(i.amount)})`,
          detail: `Venció el ${formatDate(due)}. Subí la captura del banco o tocá "Ya la pagué".`,
          payInstallment: { obligationId: ob.id, n: i.n },
        });
      } else {
        items.push({ key: `cuota-${ob.id}`, done: true, title: `Cuota ${i.n} de ${ob.concept}: vence el ${formatDate(due)} (${formatARS(i.amount)})` });
      }
    }
  }

  const pendingSancor = sum(data.sancor.map((c) => sancorSummary(c).pending));
  if (pendingSancor > 0)
    items.push({ key: 'sancor', done: false, title: `Registrar el reintegro de Sancor (${formatARS(pendingSancor)})`, detail: `Cuando ${data.settings.partnerName && data.settings.partnerName !== 'Pareja' ? data.settings.partnerName : 'tu pareja'} te devuelva su parte.`, href: '#/compartidos', hrefLabel: 'Registrar' });

  if (!empty) {
    const days = lastBackup ? (Date.parse(todayIso) - Date.parse(lastBackup.slice(0, 10))) / 86400000 : Infinity;
    items.push({ key: 'copia', done: days <= 31, title: days <= 31 ? 'Copia de seguridad al día' : 'Hacer una copia de seguridad', href: days <= 31 ? undefined : '#/copias', hrefLabel: 'Hacer copia' });
  }
  return items;
}
