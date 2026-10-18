// lib/cancellationPolicy.ts
//
// A cosmetician's cancellation policy, on top of the Grow card payments. Pure and dependency-free, so the public page, the routes and the
// tests share one definition. What is in here:
//   * the policy shape, its defaults and the clamping of whatever arrives from a form;
//   * the Hebrew policy text (a sensible default template she can edit);
//   * the money rules: a fee is a fixed amount or a percent of the service price; a cancellation is "timely" or "late" by the window;
//   * the consent snapshot stored with each appointment, so a later change of policy never rewrites what the client agreed to.
//
// Modes:
//   off         nothing changes: the booking page and the confirm/cancel link behave exactly as before.
//   saved_card  the client saves a card at booking (a token, no charge). A late cancel or a no-show becomes a pending fee she confirms with one tap.
//   deposit     the client pays a deposit at booking. Attended: it is deducted at the cashier. Late cancel or no-show: she keeps it.
//               Timely cancel: it is refunded through Grow or kept as client credit, per her setting.

export type FeeSpec = { type: 'fixed' | 'percent'; value: number };
export type PolicyMode = 'off' | 'saved_card' | 'deposit';
export type TimelyCancel = 'refund' | 'credit';

export type CancelPolicy = {
  mode: PolicyMode;
  /** Free-cancellation window: a cancel inside this many hours before the appointment is "late". */
  windowHours: number;
  lateFee: FeeSpec;
  noShowFee: FeeSpec;
  deposit: FeeSpec;
  /** What happens to a deposit when the client cancels in time. */
  timelyCancel: TimelyCancel;
  /** The policy text the client sees and agrees to. */
  text: string;
};

export const DEFAULT_WINDOW_HOURS = 24;
/** In deposit mode a booking is held as pending for this long; unpaid by then it is released and the slot frees up. */
export const DEPOSIT_HOLD_MINUTES = 30;
export const MAX_WINDOW_HOURS = 168;
export const MAX_FEE_AMOUNT = 5000;
export const MAX_TEXT = 1200;

export const DEFAULT_POLICY: CancelPolicy = {
  mode: 'off',
  windowHours: DEFAULT_WINDOW_HOURS,
  lateFee: { type: 'percent', value: 50 },
  noShowFee: { type: 'percent', value: 100 },
  deposit: { type: 'fixed', value: 100 },
  timelyCancel: 'refund',
  text: '',
};

const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : NaN; };
const round2 = (n: number) => Math.round(n * 100) / 100;

function fee(v: unknown, fallback: FeeSpec): FeeSpec {
  const o = v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
  const type = o.type === 'percent' ? 'percent' : o.type === 'fixed' ? 'fixed' : fallback.type;
  const value = num(o.value);
  if (!(value >= 0)) return { ...fallback, type };
  return type === 'percent' ? { type, value: Math.min(100, round2(value)) } : { type, value: Math.min(MAX_FEE_AMOUNT, round2(value)) };
}

/** Whatever arrives (a stored row or a form body) as a safe policy. A missing or malformed value is the default, which is "off". */
export function sanitizePolicy(raw: unknown): CancelPolicy {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const mode: PolicyMode = o.mode === 'saved_card' || o.mode === 'deposit' ? o.mode : 'off';
  const w = num(o.windowHours ?? o.window_hours);
  const policy: CancelPolicy = {
    mode,
    windowHours: w >= 0 && w <= MAX_WINDOW_HOURS ? Math.round(w) : DEFAULT_WINDOW_HOURS,
    lateFee: fee(o.lateFee ?? o.late_fee, DEFAULT_POLICY.lateFee),
    noShowFee: fee(o.noShowFee ?? o.noshow_fee, DEFAULT_POLICY.noShowFee),
    deposit: fee(o.deposit, DEFAULT_POLICY.deposit),
    timelyCancel: o.timelyCancel === 'credit' || o.timely_cancel === 'credit' ? 'credit' : 'refund',
    text: typeof o.text === 'string' ? o.text.replace(/\r/g, '').trim().slice(0, MAX_TEXT) : '',
  };
  if (!policy.text) policy.text = defaultPolicyText(policy);
  return policy;
}

/** "₪100" or "50%". */
export function describeFee(spec: FeeSpec): string {
  return spec.type === 'percent' ? `${spec.value}%` : `₪${spec.value}`;
}

/** The amount in shekels for a service price. A percent of an unknown or zero price is 0 (nothing to ask for). Never above the cap. */
export function feeAmount(spec: FeeSpec, servicePrice: number): number {
  const price = Number(servicePrice);
  const raw = spec.type === 'percent' ? (Number.isFinite(price) && price > 0 ? (price * spec.value) / 100 : 0) : spec.value;
  return Math.min(MAX_FEE_AMOUNT, Math.max(0, round2(raw)));
}

/** The default Hebrew policy text for a mode, in the numbers she chose. Warm, no em dashes. */
export function defaultPolicyText(p: Pick<CancelPolicy, 'mode' | 'windowHours' | 'lateFee' | 'noShowFee' | 'deposit' | 'timelyCancel'>): string {
  const hours = p.windowHours > 0 ? `${p.windowHours} שעות` : 'מועד התור';
  const early = p.windowHours > 0 ? `אפשר לבטל או לשנות תור בלי עלות עד ${hours} לפני מועד התור.` : 'אפשר לבטל או לשנות תור בלי עלות בכל עת לפני התור.';
  if (p.mode === 'deposit') {
    return [
      `בקביעת התור משלמים מקדמה של ${describeFee(p.deposit)}, והיא מנוכה מהתשלום ביום הטיפול. התור שמור ל-${DEPOSIT_HOLD_MINUTES} דקות, ואם המקדמה לא שולמה בזמן הוא משתחרר.`,
      early,
      p.timelyCancel === 'credit' ? 'ביטול בזמן: המקדמה נשמרת לך כקרדיט לתור הבא.' : 'ביטול בזמן: המקדמה מוחזרת לכרטיס שלך.',
      'ביטול מאוחר יותר או אי הגעה בלי ביטול: המקדמה נשארת אצלי.',
    ].join(' ');
  }
  return [
    'בקביעת התור שומרים כרטיס אשראי באופן מאובטח, ולא מחויב כסף בשלב הזה.',
    early,
    `ביטול מאוחר יותר יחויב ב-${describeFee(p.lateFee)} ממחיר הטיפול, ואי הגעה בלי ביטול ב-${describeFee(p.noShowFee)}.`,
    'החיוב נעשה רק באישור שלי, ואפשר לפנות אליי אם קרה משהו.',
  ].join(' ');
}

// ── what happened to the appointment ─────────────────────────────────────────

export type Event = 'cancel' | 'no_show';
export type Verdict = 'timely' | 'late' | 'no_show';

/**
 * Was a cancellation inside the free window? `minutesUntil` is minutes from the moment she cancelled to the start of the appointment (negative:
 * it had already started). An unknown time is treated as timely: a fee is only ever asked for when we are sure.
 */
export function classify(event: Event, minutesUntil: number | null, windowHours: number): Verdict {
  if (event === 'no_show') return 'no_show';
  if (minutesUntil === null || !Number.isFinite(minutesUntil)) return 'timely';
  return minutesUntil < windowHours * 60 ? 'late' : 'timely';
}

// ── consent snapshot ─────────────────────────────────────────────────────────

/** What the client agreed to at booking, frozen. Stored per appointment (appointment_policy_consents). */
export type ConsentSnapshot = {
  mode: Exclude<PolicyMode, 'off'>;
  policy_text: string;
  window_hours: number;
  late_fee: FeeSpec;
  noshow_fee: FeeSpec;
  deposit: FeeSpec;
  timely_cancel: TimelyCancel;
  service_price: number;
  /** The amounts in shekels at the moment of consent. */
  late_fee_amount: number;
  noshow_fee_amount: number;
  deposit_amount: number;
};

export function snapshotOf(p: CancelPolicy, servicePrice: number): ConsentSnapshot | null {
  if (p.mode === 'off') return null;
  return {
    mode: p.mode,
    policy_text: p.text,
    window_hours: p.windowHours,
    late_fee: p.lateFee,
    noshow_fee: p.noShowFee,
    deposit: p.deposit,
    timely_cancel: p.timelyCancel,
    service_price: Number(servicePrice) || 0,
    late_fee_amount: feeAmount(p.lateFee, servicePrice),
    noshow_fee_amount: feeAmount(p.noShowFee, servicePrice),
    deposit_amount: feeAmount(p.deposit, servicePrice),
  };
}

/** The one-tap question, in Hebrew, for a pending fee. */
export function feeQuestionHe(kind: 'late_cancel' | 'no_show', amount: number, clientName: string): string {
  const name = (clientName || 'הלקוחה').trim();
  return kind === 'no_show' ? `לגבות ₪${amount} מ${name} על אי הגעה?` : `לגבות ₪${amount} מ${name} על ביטול מאוחר?`;
}
