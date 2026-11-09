// app/api/referrals/lookup/route.ts
//
// GET ?code=XXXXXXXXXX -> { valid: true | false }. PUBLIC: the signup page asks whether the code in an invite link is real, to show
// "הגעת בהזמנה" before she signs up. It says yes or no and nothing else: never which business, never a name or an id. A signup
// with a code that is not real simply has no referral (the database trigger ignores it), so this answer decides nothing about money.
// Rate limited per address (lib/rateLimit.ts 'referral-lookup'): 10 random characters from 32 cannot be walked, and this keeps
// anyone from trying. Behind NEXT_PUBLIC_REFERRALS; before the migration every code is "not valid".
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { checkIpLimit } from '@/lib/rateLimit';
import { referralsEnabled, normalizeReferralCode } from '@/lib/referral';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const limited = checkIpLimit(request, 'referral-lookup');
  if (limited) return limited;
  if (!referralsEnabled()) return NextResponse.json({ valid: false });
  const code = normalizeReferralCode(new URL(request.url).searchParams.get('code'));
  if (!code) return NextResponse.json({ valid: false });
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await db.from('referral_codes').select('code').eq('code', code).maybeSingle();
  if (error || !data) return NextResponse.json({ valid: false });
  return NextResponse.json({ valid: true });
}
