// lib/grow/methods.ts
//
// How the client pays on Grow's page. Grow picks the payment method by the PAGE CODE, not by a field
// (developers.grow.business, "Authentication": "Each payment type may have a different PageCode"; "Payment page" lists a
// credit-card page, a generic card-or-Bit page, Bit, Apple Pay and Google Pay pages). So each method is one optional
// environment variable, issued by Grow per platform:
//
//   GROW_PAGE_CODE              the card page (or Grow's generic "card or Bit" page)   required for live charging
//   GROW_PAGE_CODE_BIT          Bit                                                    optional
//   GROW_PAGE_CODE_APPLE_PAY    Apple Pay                                              optional
//   GROW_PAGE_CODE_GOOGLE_PAY   Google Pay (Chrome on Android only)                    optional
//
// A method appears in the cashier only when its page code is set. In mock mode every method is offered (the mock page
// does not care). Grow's limits that we enforce before asking: Bit up to 5,000 NIS and one payment only. Bit, Apple Pay
// and Google Pay have NO sandbox at Grow: they are real money even on a test account.
//
// approveTransaction must be sent with the page code the payment was made on; the callback tells us which method it was
// (transactionTypeId: card 1, Bit 6, Apple Pay 13, Google Pay 14 - "Parameter mapping"), so pageCodeForTypeId finds it.

export type PayMethod = 'card' | 'bit' | 'apple_pay' | 'google_pay';

export const METHOD_ENV: Record<PayMethod, string> = {
  card: 'GROW_PAGE_CODE',
  bit: 'GROW_PAGE_CODE_BIT',
  apple_pay: 'GROW_PAGE_CODE_APPLE_PAY',
  google_pay: 'GROW_PAGE_CODE_GOOGLE_PAY',
};

export const METHOD_LABEL_HE: Record<PayMethod | 'wallet', string> = {
  wallet: 'כרטיס אשראי · ביט · Apple Pay · Google Pay',
  card: 'כרטיס אשראי',
  bit: 'ביט',
  apple_pay: 'Apple Pay',
  google_pay: 'Google Pay',
};

export const TYPE_ID_METHOD: Record<string, PayMethod> = { '1': 'card', '6': 'bit', '13': 'apple_pay', '14': 'google_pay' };

export const BIT_MAX_SUM = 5000;

export type PageCodes = Partial<Record<PayMethod, string>>;

const ORDER: PayMethod[] = ['card', 'bit', 'apple_pay', 'google_pay'];

export function isPayMethod(v: unknown): v is PayMethod {
  return typeof v === 'string' && (ORDER as string[]).includes(v);
}

/** The page codes this deployment has, from the environment. */
export function pageCodesFromEnv(env: Record<string, string | undefined>): PageCodes {
  const out: PageCodes = {};
  for (const m of ORDER) {
    const v = String(env[METHOD_ENV[m]] || '').trim();
    if (v) out[m] = v;
  }
  return out;
}

/** The methods she can offer, card first. */
export function availableMethods(codes: PageCodes): PayMethod[] {
  return ORDER.filter((m) => !!codes[m]);
}

/** The page code for a method; an unknown or unset method falls back to the card page. */
export function pageCodeFor(method: unknown, codes: PageCodes, fallback: string): string {
  return (isPayMethod(method) && codes[method]) || codes.card || fallback;
}

/** The page code a callback's transactionTypeId belongs to (for approveTransaction). */
export function pageCodeForTypeId(typeId: unknown, codes: PageCodes, fallback: string): string {
  const m = TYPE_ID_METHOD[String(typeId ?? '').trim()];
  return (m && codes[m]) || fallback;
}

/** Grow's own refusals, said in Hebrew before we even ask: '' when fine. */
export function methodProblem(method: PayMethod, sum: number): string {
  if (method === 'bit' && sum > BIT_MAX_SUM) return `בביט אפשר לשלם עד ₪${BIT_MAX_SUM.toLocaleString('he-IL')}. לסכום גבוה יותר בחרי כרטיס אשראי.`;
  return '';
}
