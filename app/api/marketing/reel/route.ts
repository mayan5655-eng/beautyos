// app/api/marketing/reel/route.ts
// Generates a COMPLETE reel campaign package for a cosmetician, a nails
// technician, or both (personaLabel, from her business_fields):
// spoken script (scene by scene), filming instructions, cover title,
// post caption, hashtags, and a recommended music vibe.
//
// POST /api/marketing/reel  { topic, duration?, vibe? }
// Multi-tenant: business context is loaded from the logged-in user's tenant.

import { capNoticeOf } from '@/lib/ai/capMessages'
import { MODELS, EFFORT } from '@/lib/ai/models'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireActiveTenant } from '@/lib/planGuard'
import Anthropic from '@anthropic-ai/sdk'
import { trackedCreate } from '@/lib/ai/usage'
import { loadBusinessProfile } from '@/lib/ai/loadBusinessProfile'
import { GROUNDING_RULES, personaLabel } from '@/lib/ai/marketingAI'
import { withClaimsGuard, fixHebrewSlips } from '@/lib/ai/claimsGuard'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

// A thinking model can take 20+ seconds; the platform default (10-15 s) would kill the request mid-thought.
export const maxDuration = 120

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: tenantId } = await supabase.rpc('get_user_tenant_id')

    // Plan gate: a tenant whose trial has lapsed or whose account is paused
    // cannot spend or mutate. Placed before any AI call so a blocked tenant
    // never costs money. Fails open, so it cannot lock out a paying user.
    const guard = await requireActiveTenant(supabase)
    if (!guard.ok) return guard.response

    const body = await request.json()
    const topic: string = (body.topic || '').trim()

    // Both of these are now sent by the UI. They were accepted here from the
    // start and never supplied, so every reel was silently 30 seconds with no
    // vibe — the parameters existed only in this file.
    //
    // Whitelisted rather than passed through: these land inside the prompt, so
    // an arbitrary client string is prompt-injection surface. Anything
    // unrecognised falls back to the old default instead of erroring.
    const ALLOWED_DURATIONS = ['15', '30', '60'] as const
    const duration: string = ALLOWED_DURATIONS.includes(body.duration)
      ? body.duration
      : '30'

    const ALLOWED_VIBES = [
      'רגוע ומפנק',
      'אנרגטי וקצבי',
      'חם ואישי',
      'מקצועי ומסביר',
      'כיפי וצעיר',
    ]
    const vibe: string = ALLOWED_VIBES.includes(body.vibe) ? body.vibe : ''

    if (!topic) {
      return NextResponse.json({ error: 'חסר נושא לרילס' }, { status: 400 })
    }

    // Load business context via the shared loader — the same one strategy,
    // variations and groups use. This route used to run its own inline query
    // for business_name plus service names, and nothing else: no description,
    // no city, no brand voice. The most ambitious creative output in the app
    // had the thinnest context behind it.
    //
    // (loadBusinessProfile's header says it "mirrors the pattern the reel route
    // already uses successfully" — it was modelled on the query below, then
    // grew past it, and this route was never moved over. It is now.)
    //
    // Tenant scoping lives inside loadBusinessProfile: every query there is
    // .eq('tenant_id', tenantId), and it returns {} for a null tenantId.
    const profile = await loadBusinessProfile(supabase, tenantId)

    const businessName = profile.business_name || 'העסק'
    const servicesText = (profile.services || []).map((s) => `- ${s}`).join('\n')

    // The city, when we have a usable one. This used to split profile.region
    // inline and take the last segment, which happily produced "רג" out of a
    // half-typed address; parseClinicAddress now rejects that upstream and
    // loadBusinessProfile exposes the result, so there is one rule for it.
    const city = profile.city || undefined

    // Her own words to her own customers. Passed as a VOICE SAMPLE rather than
    // as another labelled fact: it is the only real writing by her that the
    // system has, and matching a voice works from an example, not from an
    // adjective. Both fields are optional and often empty.
    const voiceSample = [profile.welcome_headline, profile.welcome_message]
      .filter(Boolean)
      .join(' / ')

    const contextLines = [
      `שם: ${businessName}`,
      profile.therapist_name ? `שם ה${personaLabel(profile.fields)}: ${profile.therapist_name}` : null,
      profile.business_description ? `על העסק: ${profile.business_description}` : null,
      city ? `עיר: ${city}` : null,
      profile.target_audience ? `קהל יעד: ${profile.target_audience}` : null,
      profile.brand_tone ? `סגנון הפנייה: ${profile.brand_tone}` : null,
      profile.unique_selling_points?.length
        ? `יתרונות תחרותיים: ${profile.unique_selling_points.join(', ')}`
        : null,
      servicesText ? `שירותים ומחירים בפועל:\n${servicesText}` : null,
      // What SHE wrote about each treatment: the only place a claim about how it
      // feels, how strong it is, downtime, who it suits or what it contains may come from.
      profile.service_details?.length
        ? `תיאורי השירותים (כאן, ורק כאן, כתוב מה העסק אומר על התחושה, העוצמה, זמן ההתאוששות, ההתאמה וההרכב של כל טיפול - רק מכאן מותר להסיק טענות כאלה):\n${profile.service_details.map((d) => `- ${d}`).join('\n')}`
        : null,
    ]
      .filter(Boolean)
      .join('\n')

    const prompt = `את במאית תוכן ומומחית רילסים לעסקי יופי בישראל. ${personaLabel(profile.fields)} רוצה ליצור רילס מקצועי לאינסטגרם/טיקטוק.

== פרטי העסק ==
${contextLines}
${voiceSample ? `\n== איך היא כותבת ללקוחות שלה (דוגמה אמיתית — כתבי בקול הזה) ==\n"${voiceSample}"\n` : ''}
== הנושא של הרילס ==
${topic}

== אורך מבוקש ==
${duration} שניות${vibe ? `\n\n== ווייב מבוקש ==\n${vibe}` : ''}

${GROUNDING_RULES}

== המשימה ==
בני חבילת רילס שלמה ש${personaLabel(profile.fields)} תוכל להפיק לבד עם הטלפון ו-CapCut.
דברי בעברית טבעית וחמה. היי מעשית וספציפית.

חשבי על:
1. תסריט מדובר מחולק לסצנות — פתיח שעוצר את הגלילה ב-3 השניות הראשונות, גוף, וסיום עם קריאה לפעולה.
2. לכל סצנה — מה לצלם בפועל (זווית, מה בקדר, תאורה).
3. כותרת גדולה לכריכה (hook על המסך).
4. תיאור לפוסט מתחת לרילס.
5. האשטגים רלוונטיים בעברית.
6. סגנון מוזיקה מתאים.

החזירי JSON בלבד, בלי markdown, בלי טקסט נוסף:
{
  "cover_title": "כותרת קצרה וחזקה לכריכה (3-6 מילים)",
  "hook": "המשפט הראשון שנאמר/מופיע ב-3 השניות הראשונות",
  "scenes": [
    {
      "scene_number": 1,
      "spoken": "מה אומרים בסצנה הזו (טקסט מדובר בעברית)",
      "on_screen_text": "טקסט שמופיע על המסך בסצנה",
      "filming": "הוראות צילום: מה לצלם, זווית, תאורה",
      "seconds": "כמה שניות בערך"
    }
  ],
  "call_to_action": "קריאה לפעולה בסוף הרילס",
  "caption": "תיאור מלא לפוסט מתחת לרילס בעברית",
  "hashtags": ["#האשטג1", "#האשטג2", "#האשטג3"],
  "music_vibe": "תיאור סגנון המוזיקה המומלץ (למשל: אפביט קליל, רגוע ומפנק)"
}`

    // Held to the claims rule (lib/ai/claimsGuard.ts): the script and caption are
    // posted as written, so a claim about feel, intensity, downtime, suitability or
    // contents that is not in her profile, service descriptions or topic is caught
    // here - one retry naming the words, then a refusal.
    const strings = (v: unknown): string[] => (typeof v === 'string' ? [v] : Array.isArray(v) ? v.flatMap(strings) : v && typeof v === 'object' ? Object.values(v).flatMap(strings) : [])
    const run = await withClaimsGuard(async (correction) => {
      const message = await trackedCreate(anthropic, {
        model: MODELS.writer,
        max_tokens: 16000,
        output_config: { effort: EFFORT.writer },
        messages: [{ role: 'user', content: prompt + (correction ? `\n\n${correction}` : '') }],
      }, { tenantId, callSite: 'marketing/reel' })
      const textBlock = message.content.find((b) => b.type === 'text')
      let reel: unknown = null
      if (textBlock && textBlock.type === 'text') {
        try { reel = JSON.parse(textBlock.text.replace(/```json|```/g, '').trim()) } catch { reel = null }
      }
      return { message, reel, gotText: !!(textBlock && textBlock.type === 'text') }
    }, (r) => strings(r.reel), `${contextLines}\n${topic}`)

    if (!run.gotText) return NextResponse.json({ error: 'לא התקבלה תשובה מה-AI' }, { status: 500 })
    if (!run.reel) return NextResponse.json({ error: 'יצירת הרילס נכשלה, נסי שוב' }, { status: 422 })
    // Spelling slips ("אלייך") fixed deterministically, across every string in the script.
    const fix = (v: unknown): unknown => (typeof v === 'string' ? fixHebrewSlips(v) : Array.isArray(v) ? v.map(fix) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fix(x)])) : v)

    return NextResponse.json({ success: true, reel: fix(run.reel), ...capNoticeOf(run.message) })
  } catch (error: any) {
    console.error('Error in /api/marketing/reel:', error)
    return NextResponse.json({ error: error.message || 'יצירת הרילס נכשלה' }, { status: 500 })
  }
}