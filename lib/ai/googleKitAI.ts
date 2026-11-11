// lib/ai/googleKitAI.ts
//
// POST /api/marketing/google-kit { kind: 'profile' | 'ads', years?, city? }
//   profile -> { description, posts[4], keywords[15] }   for her Google Business Profile
//   ads     -> { headlines[3], descriptions[2] }          a first search ad she sets up herself in Google Ads
//
// One Claude call per press, metered like every other AI feature: trackedCreate checks the monthly count cap
// ('marketing/google-kit' in callCaps.ts) and the per-tenant dollar ceiling before it calls, refuses in the demo, and
// records the row in ai_usage. Rate limited per IP and per business ('google-kit' in lib/rateLimit.ts).
//
// Nothing is published anywhere: the answer goes back to her screen as text with copy buttons. No Google API is called
// and none is configured. The flag (NEXT_PUBLIC_GOOGLE_KIT) off = 404 before anything else runs.
//
// The route only wires the real session client, the Anthropic client and the metered call (deps), so a test drives this
// whole flow with stubs and no network.

import { MODELS, EFFORT } from './models.ts';
import { mapAiError, userMessageForAiError } from './aiErrorResponse.ts';
import { capNoticeOf } from './capMessages.ts';
import { personaLabel, type BusinessProfile } from './marketingAI.ts';
import { checkIpLimit, checkTenantLimit } from '../rateLimit.ts';
import {
  googleKitEnabled, GOOGLE_KIT_CALL_SITE, buildProfilePrompt, buildAdsPrompt, parseProfileKit, parseAdsKit,
  cleanForPrompt, cleanYears, type KitInput,
} from '../googleKit.ts';

/* eslint-disable @typescript-eslint/no-explicit-any */
export type GoogleKitDeps = {
  session: () => Promise<any>;
  anthropic: any;
  track: (client: any, params: any, opts: { tenantId: string | null; callSite: string }) => Promise<any>;
  loadProfile: (session: any, tenantId: string) => Promise<BusinessProfile>;
  /** requireActiveTenant (lib/planGuard.ts): a lapsed or paused business cannot spend. */
  planGuard?: (session: any) => Promise<{ ok: boolean; response?: Response }>;
  env?: Record<string, string | undefined>;
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/** Treatment names only, from loadBusinessProfile's "name (₪price, duration)" lines. Prices are not needed on Google. */
export function serviceNamesOf(profile: BusinessProfile): string[] {
  return (profile.services || []).map((s) => String(s).replace(/\s*\([^)]*\)\s*$/, '').trim()).filter(Boolean);
}

export function kitInputFrom(profile: BusinessProfile, body: { years?: unknown; city?: unknown }): KitInput {
  return {
    businessName: profile.business_name || null,
    // Her saved address wins; the city she typed in the card is only for when the address has none.
    city: profile.city || cleanForPrompt(body.city, 40) || null,
    services: serviceNamesOf(profile),
    years: cleanYears(body.years),
    fields: profile.fields || null,
    description: profile.business_description || null,
    usp: profile.unique_selling_points || null,
  };
}

export async function handleGoogleKit(request: Request, deps: GoogleKitDeps): Promise<Response> {
  if (!googleKitEnabled(deps.env || { NEXT_PUBLIC_GOOGLE_KIT: process.env.NEXT_PUBLIC_GOOGLE_KIT })) return json({ error: 'not found' }, 404);
  try {
    const ipLimited = checkIpLimit(request, 'google-kit');
    if (ipLimited) return ipLimited;

    const session = await deps.session();
    const { data: { user } } = await session.auth.getUser();
    if (!user) return json({ error: 'לא מחוברת' }, 401);
    if (deps.planGuard) {
      const guard = await deps.planGuard(session);
      if (!guard.ok) return guard.response || json({ error: 'החשבון לא פעיל' }, 403);
    }
    const { data: tenantRaw } = await session.rpc('get_user_tenant_id');
    if (!tenantRaw) return json({ error: 'לא זוהה עסק' }, 400);
    const tenantId = String(tenantRaw); // from her session, never from the body

    const tenantLimited = checkTenantLimit(tenantId, 'google-kit');
    if (tenantLimited) return tenantLimited;

    const body = await request.json().catch(() => ({}));
    const kind = body?.kind === 'ads' ? 'ads' : body?.kind === 'profile' ? 'profile' : null;
    if (!kind) return json({ error: 'בקשה לא מוכרת' }, 400);

    const profile = await deps.loadProfile(session, tenantId);
    const input = kitInputFrom(profile, body || {});
    if (!input.services?.length) {
      return json({ error: 'קודם מוסיפים לפחות טיפול אחד, ואז הכותבת יודעת על מה לכתוב.' }, 400);
    }
    const persona = personaLabel(profile.fields);
    const prompt = kind === 'ads' ? buildAdsPrompt(input, persona) : buildProfilePrompt(input, persona);

    const msg = await deps.track(deps.anthropic, {
      model: MODELS.ideas,
      // Room for the model's thinking as well as the JSON: thinking counts against max_tokens.
      max_tokens: 8000,
      output_config: { effort: EFFORT.ideas },
      messages: [{ role: 'user', content: prompt }],
    }, { tenantId, callSite: GOOGLE_KIT_CALL_SITE });

    const text = (msg?.content || []).map((b: any) => (b?.type === 'text' ? b.text : '')).join('');
    const out = kind === 'ads' ? parseAdsKit(text) : parseProfileKit(text);
    if (!out) {
      console.error('[google-kit] unusable answer, stop_reason:', msg?.stop_reason);
      return json({ error: 'לא הצלחתי לכתוב הפעם. אפשר לנסות שוב בעוד רגע.' }, 502);
    }
    return json({ kind, ...out, ...capNoticeOf(msg) });
  } catch (e) {
    const mapped = mapAiError(e);
    if (!mapped) console.error('[google-kit] failed:', e instanceof Error ? e.message : String(e));
    return json({ error: userMessageForAiError(e) }, mapped?.status ?? 500);
  }
}
