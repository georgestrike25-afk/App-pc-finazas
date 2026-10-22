import type { Cents } from './money';
import type { MonthKey } from './dates';

/** Campos comunes a todo registro sincronizable. */
export interface BaseRecord {
  id: string;
  createdAt: string;
  updatedAt: string;
  /** Lápida para sincronización: el registro se considera eliminado. */
  deleted?: boolean;
  /** Dispositivo que hizo la última modificación (desempate en fusiones). */
  deviceId?: string;
}

export type DataStatus = 'confirmado' | 'estimado';

export interface IncomeLine {
  concept: string;
  amount: Cents;
}

export interface IncomeRevision {
  at: string;
  snapshot: Omit<Income, 'revisions'>;
}

export interface Income extends BaseRecord {
  month: MonthKey;
  status: DataStatus;
  /** Ingreso principal efectivamente cobrado (o estimado, según status). */
  amountReceived: Cents;
  receivedDate?: string;
  extras: IncomeLine[];
  deductions: IncomeLine[];
  notes?: string;
  revisions: IncomeRevision[];
}

export type ExpenseKind = 'personal' | 'cotidiano' | 'hogar';
export type PaymentMethod = 'efectivo' | 'debito' | 'transferencia' | 'tarjeta' | 'otro';
export type Frequency = 'unica' | 'mensual' | 'bimestral' | 'trimestral' | 'anual';
export type PaidBy = 'usuario' | 'pareja' | 'cada_uno';

export interface MonthOverride {
  amount?: Cents;
  paid?: boolean;
  skip?: boolean;
}

export interface Expense extends BaseRecord {
  kind: ExpenseKind;
  category: string;
  concept: string;
  /** Fecha del gasto (o de la primera ocurrencia si es recurrente). */
  date: string;
  /** Mes de imputación de la primera ocurrencia. */
  month: MonthKey;
  totalAmount: Cents;
  /** Porcentaje que corresponde al usuario (100 para gastos no compartidos). */
  userPct: number;
  paidBy?: PaidBy;
  paid: boolean;
  frequency: Frequency;
  /** Último mes (inclusive) de una recurrencia; vacío = sin fin. */
  endMonth?: MonthKey;
  /** Ajustes por mes para gastos recurrentes. */
  overrides?: Record<MonthKey, MonthOverride>;
  paymentMethod: PaymentMethod;
  documentId?: string;
  /** Huella de la línea de resumen vinculada (evita duplicar manual/importado). */
  linkedLineFingerprints?: string[];
  source: 'manual' | 'importado';
  /** Consumo del período abierto (visto en la app de la tarjeta): se confirma al subir el resumen. */
  provisional?: boolean;
  /** Tarjeta del consumo (Naranja X, Visa Banco Patagonia…), para sumarlo a la deuda de esa entidad. */
  cardEntity?: string;
  /** Ajuste para que lo cargado coincida con la plata real ("gastos sin anotar"): no se descuenta de esa plata. */
  cashAdjust?: boolean;
  /** Gasto traído del historial de otra app (Mis Finanzas). */
  importedFrom?: 'mis-finanzas' | 'notificacion';
  notes?: string;
}

export type ObligationType =
  | 'compra_cuotas'
  | 'plan_v'
  | 'prestamo'
  | 'financiacion'
  | 'refinanciacion'
  | 'otro';

export type ObligationStatus = 'pendiente' | 'pagada' | 'vencida' | 'cancelada' | 'por_confirmar';

export interface ObligationRevision {
  at: string;
  reason: string;
  effectiveFrom?: MonthKey;
  snapshot: Omit<Obligation, 'revisions'>;
}

export interface Obligation extends BaseRecord {
  entity: string;
  type: ObligationType;
  concept: string;
  originalAmount?: Cents;
  knownBalance?: Cents;
  originDate?: string;
  /** Cantidad de cuotas ya pagadas. */
  paidInstallments: number;
  totalInstallments?: number;
  installmentAmount?: Cents;
  /** Mes de vencimiento de la cuota paidInstallments + 1. */
  nextDueMonth?: MonthKey;
  /** Día del mes del vencimiento, informativo. */
  dueDay?: number;
  frequency: Exclude<Frequency, 'unica'>;
  status: ObligationStatus;
  /** Importe variable: las cuotas futuras se marcan como estimadas. */
  variableAmount: boolean;
  /** Importes específicos por número de cuota (intereses, ajustes, meses cerrados). */
  installmentOverrides?: Record<number, Cents>;
  /** Mes a partir del cual la obligación queda cancelada (sin cuotas desde allí). */
  cancelledFrom?: MonthKey;
  documentId?: string;
  /** Huella estable para reconocer la misma compra en resúmenes sucesivos. */
  fingerprint?: string;
  /** Número de préstamo informado por la entidad. */
  loanNumber?: string;
  /** Capital incluido en cada cuota (cronogramas de préstamos). */
  capitalByInstallment?: Record<number, Cents>;
  /** Fecha exacta de vencimiento de cada cuota (cronogramas de préstamos). */
  dueDates?: Record<number, string>;
  notes?: string;
  revisions: ObligationRevision[];
}

export interface Statement extends BaseRecord {
  entity: string;
  closingDate?: string;
  dueDate?: string;
  /** Mes al que se imputa el resumen (mes de vencimiento). */
  month: MonthKey;
  /** Total que exige la tarjeta. Informativo: NO es una deuda nueva. */
  total?: Cents;
  minimumPayment?: Cents;
  currency: 'ARS' | 'USD' | 'mixta';
  documentId?: string;
  notes?: string;
}

/** Pago de un resumen de tarjeta. No es un gasto: cancela consumos ya imputados. */
export interface CardPayment extends BaseRecord {
  entity: string;
  statementId?: string;
  date: string;
  month: MonthKey;
  amount: Cents;
  source: 'manual' | 'importado';
  lineFingerprint?: string;
  notes?: string;
}

export interface Reimbursement {
  date: string;
  amount: Cents;
  notes?: string;
}

export interface SancorCharge extends BaseRecord {
  month: MonthKey;
  /** Importe total cobrado en la tarjeta (suma de los cupones del resumen). */
  chargeAmount: Cents;
  /** Cupones que suman el cargo (p. ej. uno tuyo y uno de tu pareja en el mismo resumen). */
  coupons?: Array<{ amount: Cents; ref?: string }>;
  /** Porcentaje que corresponde a la pareja (acuerdo configurado). */
  partnerPct: number;
  statementId?: string;
  documentId?: string;
  lineFingerprint?: string;
  received: Reimbursement[];
  notes?: string;
}

export interface Contribution {
  id: string;
  date: string;
  month: MonthKey;
  amount: Cents;
  notes?: string;
}

export interface Scenario {
  key: 'conservador' | 'intermedio' | 'optimista';
  label: string;
  /** Multiplicador sobre el ingreso proyectado (1 = sin cambio). */
  incomeFactor: number;
  /** Multiplicador sobre gastos y presupuesto cotidiano. */
  expenseFactor: number;
}

export interface SavingsGoal extends BaseRecord {
  name: string;
  targetMonth: MonthKey;
  estimatedCost: Cents;
  initialSaving: Cents;
  plannedMonthlyContribution: Cents;
  reserved: Cents;
  /** Porcentaje del dinero liberado por cuotas finalizadas que se destina al objetivo. */
  reinvestPct: number;
  contributions: Contribution[];
  scenarios: Scenario[];
}

export interface DocumentMeta extends BaseRecord {
  name: string;
  mime: string;
  size: number;
  /** SHA-256 del contenido: identificación estable del documento. */
  hash: string;
  kind: 'pdf' | 'imagen' | 'csv' | 'excel' | 'video';
  importedAt?: string;
  entity?: string;
  hasBlob: boolean;
  summary?: string;
}

/** Huella de cada línea importada, para prevenir duplicados. */
export interface LineFingerprint extends BaseRecord {
  fingerprint: string;
  documentId?: string;
  targetType: 'gasto' | 'cuota' | 'pago' | 'sancor' | 'ingreso' | 'ignorado';
  targetId?: string;
  /** Línea vista en la app de la tarjeta (período abierto): el resumen la confirma en vez de omitirla. */
  provisional?: boolean;
}

export interface AuditEntry extends BaseRecord {
  at: string;
  action: 'crear' | 'modificar' | 'eliminar' | 'importar' | 'restaurar' | 'sincronizar';
  entity: string;
  entityId?: string;
  summary: string;
}

export interface MonthBudget {
  amount: Cents;
  /** 'real': solo gastos registrados. 'estimado': completa con el presupuesto no consumido. */
  mode?: 'real' | 'estimado';
}

export interface Settings extends BaseRecord {
  /** Presupuesto cotidiano orientativo. Valor inicial editable: $700.000. */
  dailyBudgetDefault: Cents;
  dailyBudgetIsInitialValue: boolean;
  monthBudgets: Record<MonthKey, MonthBudget>;
  defaultUserPct: number;
  sancorPartnerPct: number;
  /** Ingreso mensual estimado para proyecciones (0 = sin estimación cargada). */
  projectedMonthlyIncome: Cents;
  partnerName: string;
  storeDocumentBlobs: boolean;
  categories: string[];
  /** "Plata hasta cobrar": lo que el usuario dijo que tenía, cuándo, y hasta qué día le tiene que alcanzar. */
  cash?: { amount: Cents; setAt: string; until?: string };
  /** Presupuesto del día a día que el usuario quiere tener: entre un mínimo y un máximo por mes. */
  dailyBudgetRange?: { min: Cents; max: Cents };
}

export const SYNC_TABLES = [
  'incomes',
  'expenses',
  'obligations',
  'statements',
  'cardPayments',
  'sancor',
  'goals',
  'documents',
  'fingerprints',
  'audit',
  'settings',
] as const;
export type SyncTable = (typeof SYNC_TABLES)[number];
