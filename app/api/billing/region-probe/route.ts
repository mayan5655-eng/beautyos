// TEMP (revert before merge): does Grow answer this function's region? An EMPTY form (no key, no page code) to each Grow host; only the
// HTTP status, content type and Grow's error id come back. CRON_SECRET only.
import { NextResponse } from 'next/server';
import { isAuthorizedCron, cronUnauthorized } from '../../../../lib/cronAuth';

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) return cronUnauthorized();
  const hosts = ['https://sandbox.meshulam.co.il/api/light/server/1.0', 'https://secure.meshulam.co.il/api/light/server/1.0'];
  const out: Record<string, unknown> = { region: process.env.VERCEL_REGION || null };
  for (const h of hosts) {
    try {
      const res = await fetch(`${h}/createPaymentProcess`, { method: 'POST', body: new FormData(), signal: AbortSignal.timeout(15000) });
      const text = await res.text();
      let errId: unknown = null; try { errId = JSON.parse(text)?.err?.id ?? 'json'; } catch { errId = 'not-json'; }
      out[new URL(h).host] = { http: res.status, type: res.headers.get('content-type'), errId };
    } catch (e) { out[new URL(h).host] = { error: (e as Error).message }; }
  }
  return NextResponse.json(out);
}
