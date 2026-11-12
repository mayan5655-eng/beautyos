// lib/planPay.ts
//
// A way to pay for the subscription that does not need Grow billing (2026-11-12). Until Grow's recurring billing is live,
// the only path out of the closed screen was a WhatsApp chat. Now the owner can set ONE payment page for the plan (a Bit /
// PayBox / Morning / Meshulam payment-page link she creates herself) in NEXT_PUBLIC_PLAN_PAY_URL, and the closed screen and
// the last-week banner show a "pay" button that opens it. After the money arrives she marks the business paid by hand in
// /dashboard/admin, exactly as before; the screen reopens by itself (PlanBlockedScreen re-checks every 30 seconds).
//
// Not set (or not an https address) = no button at all: nothing is shown that is not live.

export function planPayUrl(raw: string | undefined | null = process.env.NEXT_PUBLIC_PLAN_PAY_URL): string | null {
  const v = String(raw || '').trim()
  if (!v) return null
  try {
    const u = new URL(v)
    if (u.protocol !== 'https:' || !u.hostname.includes('.')) return null
    return u.toString()
  } catch {
    return null
  }
}
