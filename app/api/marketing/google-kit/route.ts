// app/api/marketing/google-kit/route.ts
//
// POST { kind: 'profile' | 'ads', years?, city? } -> texts for her Google Business Profile, or a first search ad.
// All the logic, and why, is in lib/ai/googleKitAI.ts; this file only wires the real session client, the plan guard,
// the profile loader, the Anthropic client and the metered call. Nothing is published: she copies.

import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@/lib/supabase/server';
import { requireActiveTenant } from '@/lib/planGuard';
import { trackedCreate } from '@/lib/ai/usage';
import { loadBusinessProfile } from '@/lib/ai/loadBusinessProfile';
import { handleGoogleKit } from '@/lib/ai/googleKitAI';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// A thinking model can take 20+ seconds; the platform default (10-15 s) would kill the request mid-thought.
export const maxDuration = 120;

export async function POST(request: Request) {
  return handleGoogleKit(request, {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    session: createClient as any,
    anthropic,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    track: trackedCreate as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    loadProfile: loadBusinessProfile as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    planGuard: requireActiveTenant as any,
  });
}
