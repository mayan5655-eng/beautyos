// app/api/marketing/shooting-list/route.ts
// The planning agent: "what should I film this week?"
//
// Same engine as /api/marketing/reel - loadBusinessProfile, GROUNDING_RULES,
// trackedCreate, plan gate - different output: 3-5 concrete filming ideas,
// each with a one-line brief she can execute in ~10 minutes at the clinic.
// Every idea's title doubles as a reel topic, so a tap carries it straight
// into the existing reel generator.
//
// Context beyond the profile, all tenant-scoped reads:
//   - recent campaign_posts titles, so the list does not repeat what she
//     already posted
//   - her appointment counts for the next 7 days, so "film on Tuesday"
//     lands on a day that is actually quiet
//   - today's date, so the season is real rather than guessed

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireActiveTenant } from '@/lib/planGuard'
import Anthropic from '@anthropic-ai/sdk'
import { trackedCreate } from '@/lib/ai/usage'
import { loadBusinessProfile } from '@/lib/ai/loadBusinessProfile'
import { GROUNDING_RULES } from '@/lib/ai/marketingAI'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

const DAYS_HE = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']

export async function POST(_request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: tenantId } = await supabase.rpc('get_user_tenant_id')

    const guard = await requireActiveTenant(supabase)
    if (!guard.ok) return guard.response

    const profile = await loadBusinessProfile(supabase, tenantId)

    // What she already posted - titles only, newest first. Best-effort: an
    // empty history simply means no "avoid repeating" clause in the prompt.
    let recentTitles: string[] = []
    try {
      const { data: posts } = await supabase
        .from('campaign_posts')
        .select('title, created_at')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(15)
      recentTitles = (posts || []).map((p) => String(p.title || '').trim()).filter(Boolean)
    } catch { /* no history, no clause */ }

    // Appointment load for the coming week -> which days are quiet enough to
    // film on. Dates only; nothing about clients leaves this route.
    const today = new Date()
    const fmt = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const weekAhead = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000)
    let quietLine = ''
    try {
      const { data: appts } = await supabase
        .from('appointments')
        .select('date')
        .eq('tenant_id', tenantId)
        .gte('date', fmt(today))
        .lte('date', fmt(weekAhead))
      const counts = new Map<string, number>()
      for (const a of appts || []) counts.set(a.date, (counts.get(a.date) || 0) + 1)
      const days: string[] = []
      for (let i = 0; i < 7; i++) {
        const d = new Date(today.getTime() + i * 24 * 60 * 60 * 1000)
        days.push(`${DAYS_HE[d.getDay()]} (${fmt(d).slice(5)}): ${counts.get(fmt(d)) || 0} תורים`)
      }
      quietLine = days.join(' · ')
    } catch { /* calendar unknown - the prompt just omits it */ }

    const businessName = profile.business_name || 'העסק'
    const servicesText = (profile.services || []).map((s) => `- ${s}`).join('\n')

    const contextLines = [
      `שם: ${businessName}`,
      profile.therapist_name ? `שם הקוסמטיקאית: ${profile.therapist_name}` : null,
      profile.business_description ? `על העסק: ${profile.business_description}` : null,
      profile.city ? `עיר: ${profile.city}` : null,
      profile.target_audience ? `קהל יעד: ${profile.target_audience}` : null,
      profile.brand_tone ? `סגנון הפנייה: ${profile.brand_tone}` : null,
      profile.unique_selling_points?.length
        ? `יתרונות תחרותיים: ${profile.unique_selling_points.join(', ')}`
        : null,
      servicesText ? `שירותים בפועל:\n${servicesText}` : null,
    ]
      .filter(Boolean)
      .join('\n')

    const todayLine = `${DAYS_HE[today.getDay()]}, ${fmt(today)}`

    const prompt = `את במאית תוכן לעסקי יופי בישראל. קוסמטיקאית שלא אוהבת להצטלם ולא יודעת מה לצלם צריכה רשימת צילומים לשבוע - רעיונות שהיא יכולה לבצע לבד, בקליניקה, ב-10 דקות כל אחד, עם טלפון.

== פרטי העסק ==
${contextLines}

== התאריך היום ==
${todayLine} (קחי בחשבון את העונה ואירועים קרובים בישראל)
${quietLine ? `\n== העומס ביומן בשבוע הקרוב ==\n${quietLine}\n(המליצי לצלם בימים השקטים)` : ''}
${recentTitles.length ? `\n== נושאים שכבר פורסמו לאחרונה (אל תחזרי עליהם) ==\n${recentTitles.map((t) => `- ${t}`).join('\n')}` : ''}

${GROUNDING_RULES}

== המשימה ==
הציעי 3-5 רעיונות צילום ספציפיים לשבוע הזה. לכל רעיון:
- כותרת קצרה שמשמשת גם כנושא לרילס
- בריף של שורה אחת: מה בדיוק לצלם, איך, ומה רואים בקדר
- אילו מהרעיונות לא דורשים ממנה לדבר למצלמה או להופיע בכלל (ידיים, המקום, המוצרים) - סמני אותם, כי היא לא אוהבת להצטלם
- יום מומלץ לצילום מהשבוע הקרוב (עדיפות לימים שקטים)
- הערכת זמן במינוטים (5-15)

גווני: לפחות רעיון אחד בלי פנים בכלל, לפחות אחד שקשור לעונה, ולפחות אחד שמקדם שירות ספציפי מהרשימה.

החזירי JSON בלבד, בלי markdown:
{
  "week_note": "משפט אחד על הפוקוס המומלץ לשבוע (עונה/הזדמנות)",
  "ideas": [
    {
      "title": "כותרת הרעיון (משמשת כנושא רילס)",
      "brief": "שורה אחת: מה לצלם ואיך",
      "no_face": true,
      "service": "שם השירות מהרשימה שהרעיון מקדם, או null",
      "film_day": "יום מומלץ בעברית",
      "minutes": 10
    }
  ]
}`

    const message = await trackedCreate(anthropic, {
      model: 'claude-sonnet-5',
      max_tokens: 4000,
      messages: [{ role: 'user', content: prompt }],
    }, { tenantId, callSite: 'marketing/shooting-list' })

    const textBlock = message.content.find((b) => b.type === 'text')
    if (!textBlock || textBlock.type !== 'text') {
      return NextResponse.json({ error: 'לא התקבלה תשובה מה-AI' }, { status: 500 })
    }

    const clean = textBlock.text.replace(/```json|```/g, '').trim()
    let list
    try {
      list = JSON.parse(clean)
    } catch {
      return NextResponse.json({ error: 'יצירת הרשימה נכשלה, נסי שוב' }, { status: 422 })
    }

    if (!Array.isArray(list?.ideas) || list.ideas.length === 0) {
      return NextResponse.json({ error: 'יצירת הרשימה נכשלה, נסי שוב' }, { status: 422 })
    }

    return NextResponse.json({ success: true, list })
  } catch (error: unknown) {
    console.error('Error in /api/marketing/shooting-list:', error)
    const msg = error instanceof Error ? error.message : 'יצירת הרשימה נכשלה'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
