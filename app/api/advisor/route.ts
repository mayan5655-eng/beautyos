// app/api/advisor/route.ts
// Personal AI business advisor for each cosmetician.
//   GET  -> returns this tenant's saved conversation history
//   POST -> answers a business question, grounded in THIS tenant's real data,
//           and persists both the question and the answer.
//
// SECURITY / MULTI-TENANT: the tenant is always resolved from the AUTHENTICATED
// session (get_user_tenant_id over the user's cookies) - never from the client.
// All business data is read scoped to that tenant only.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// Resolve the logged-in user's tenant, or return an error response.
async function resolveTenant(supabase: Awaited<ReturnType<typeof createClient>>) {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'לא מחובר' }, { status: 401 }) }
  const { data: tenantId } = await supabase.rpc('get_user_tenant_id')
  if (!tenantId) return { error: NextResponse.json({ error: 'לא זוהה עסק' }, { status: 400 }) }
  return { tenantId: tenantId as string }
}

// GET: load the saved conversation (chronological).
export async function GET() {
  try {
    const supabase = await createClient()
    const r = await resolveTenant(supabase)
    if ('error' in r) return r.error

    const { data, error } = await supabase
      .from('advisor_messages')
      .select('id, role, content, created_at')
      .eq('tenant_id', r.tenantId)
      .order('created_at', { ascending: true })
      .limit(100)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ messages: data || [] })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// Build a compact, tenant-scoped snapshot of the business for the AI.
async function buildBusinessSnapshot(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tenantId: string
) {
  const [settingsRes, servicesRes, clientsRes, apptsRes, receiptsRes, leadsRes] =
    await Promise.all([
      supabase.from('settings').select('business_name, therapist_name, working_hours_start, working_hours_end').eq('tenant_id', tenantId).limit(1),
      supabase.from('service_prices').select('name, price, duration, active').eq('tenant_id', tenantId),
      supabase.from('clients').select('id').eq('tenant_id', tenantId),
      supabase.from('appointments').select('client_id, service, date').eq('tenant_id', tenantId),
      supabase.from('receipts').select('amount, service, created_at, client_id').eq('tenant_id', tenantId),
      supabase.from('leads').select('status').eq('tenant_id', tenantId),
    ])

  const settings = settingsRes.data?.[0] || {}
  const services = (servicesRes.data || []).filter((s: any) => s.active !== false)
  const clients = clientsRes.data || []
  const appts = apptsRes.data || []
  const receipts = receiptsRes.data || []
  const leads = leadsRes.data || []

  const now = new Date()
  const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const daysAgoStr = (n: number) => { const d = new Date(now); d.setDate(d.getDate() - n); return ymd(d) }

  // Last visit per client -> dormant (60+ days, or never)
  const lastVisit: Record<string, string> = {}
  appts.forEach((a: any) => {
    if (!a.client_id || !a.date) return
    if (!lastVisit[a.client_id] || a.date > lastVisit[a.client_id]) lastVisit[a.client_id] = a.date
  })
  const cutoff60 = daysAgoStr(60)
  let dormant = 0
  clients.forEach((c: any) => { const lv = lastVisit[c.id]; if (!lv || lv < cutoff60) dormant++ })

  // Revenue this month vs last month
  const thisM = now.getMonth(), thisY = now.getFullYear()
  const lastM = thisM === 0 ? 11 : thisM - 1, lastY = thisM === 0 ? thisY - 1 : thisY
  let revThis = 0, revLast = 0, revTotal = 0
  receipts.forEach((rr: any) => {
    const amt = Number(rr.amount) || 0
    revTotal += amt
    if (!rr.created_at) return
    const d = new Date(rr.created_at)
    if (d.getMonth() === thisM && d.getFullYear() === thisY) revThis += amt
    else if (d.getMonth() === lastM && d.getFullYear() === lastY) revLast += amt
  })
  const avgTransaction = receipts.length > 0 ? Math.round(revTotal / receipts.length) : 0

  // Top services by appointment count + revenue
  const byService: Record<string, { count: number; revenue: number }> = {}
  appts.forEach((a: any) => { if (!a.service) return; (byService[a.service] ||= { count: 0, revenue: 0 }).count++ })
  receipts.forEach((rr: any) => { if (!rr.service) return; (byService[rr.service] ||= { count: 0, revenue: 0 }).revenue += Number(rr.amount) || 0 })
  const topServices = Object.entries(byService)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 5)
    .map(([name, v]) => `${name}: ${v.count} תורים, ₪${v.revenue.toLocaleString()} הכנסות`)

  // Leads
  const openLeads = leads.filter((l: any) => l.status !== 'closed' && l.status !== 'lost').length
  const closedLeads = leads.filter((l: any) => l.status === 'closed').length
  const conversionRate = leads.length > 0 ? Math.round((closedLeads / leads.length) * 100) : 0

  // Appointments this week (next 7 days)
  const weekEnd = daysAgoStr(-7)
  const todayStr = ymd(now)
  const weekAppts = appts.filter((a: any) => a.date && a.date >= todayStr && a.date <= weekEnd).length

  const servicesText = services.length > 0
    ? services.map((s: any) => `- ${s.name}${s.price ? ` (₪${s.price})` : ''}${s.duration ? `, ${s.duration} ד'` : ''}`).join('\n')
    : 'לא הוגדרו שירותים'

  const trendPct = revLast > 0 ? Math.round(((revThis - revLast) / revLast) * 100) : null

  return `שם העסק: ${settings.business_name || 'לא הוגדר'}${settings.therapist_name ? ` (מטפלת: ${settings.therapist_name})` : ''}
שעות פעילות: ${settings.working_hours_start ?? 9}:00–${settings.working_hours_end ?? 19}:00
סך לקוחות: ${clients.length}
לקוחות רדומות (60+ ימים ללא ביקור): ${dormant}
הכנסות החודש: ₪${revThis.toLocaleString()}${trendPct !== null ? ` (${trendPct >= 0 ? '+' : ''}${trendPct}% מהחודש שעבר: ₪${revLast.toLocaleString()})` : ''}
ממוצע עסקה: ₪${avgTransaction.toLocaleString()}
תורים בשבוע הקרוב: ${weekAppts}
לידים פתוחים: ${openLeads} | שיעור המרה כולל: ${conversionRate}%
שירותים מובילים:
${topServices.length ? topServices.join('\n') : 'אין נתונים עדיין'}

תפריט השירותים והמחירים:
${servicesText}`
}

// POST: answer one question, grounded in the tenant's data; persist both turns.
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const r = await resolveTenant(supabase)
    if ('error' in r) return r.error
    const tenantId = r.tenantId

    const body = await request.json()
    const message: string = (body?.message || '').toString().trim()
    if (!message) return NextResponse.json({ error: 'חסרה שאלה' }, { status: 400 })

    // Business snapshot + recent conversation history (last 16 turns).
    const snapshot = await buildBusinessSnapshot(supabase, tenantId)
    const { data: history } = await supabase
      .from('advisor_messages')
      .select('role, content')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(16)
    const priorTurns = (history || [])
      .reverse()
      .map((m: any) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content }))

    const systemPrompt = `את יועצת עסקית בכירה ומנוסה, מומחית לעסקי קוסמטיקה ויופי בישראל (תמחור, שימור והחזרת לקוחות, שיווק מקומי, ניהול יומן והכנסות).

הנתונים האמיתיים של העסק של המשתמשת (מעודכנים, מסוננים לעסק שלה בלבד):
${snapshot}

איך לענות:
- עברית בלבד, חמה אך מקצועית וישירה — כמו יועצת שמכירה את המספרים שלה.
- תמיד התבססי על הנתונים האמיתיים למעלה. אם שואלים "איך אעלה הכנסות" — התייחסי למספרים הספציפיים (לקוחות רדומות, ממוצע עסקה, שירות מוביל וכו').
- תני פתרונות קונקרטיים וברי-ביצוע, ולא כלליות. כשמתאים — בני תוכנית עבודה בצעדים ממוספרים.
- הציעי טקסטים מוכנים (למשל הודעת וואטסאפ להחזרת לקוחה רדומה) כשזה עוזר.
- אל תמציאי נתונים שאינם למעלה. אם חסר מידע — אמרי זאת והצעי מה לבדוק.
- שמרי על תשובות ממוקדות; פסקאות קצרות או רשימות, לא קיר טקסט.`

    // Persist the user's question.
    await supabase.from('advisor_messages').insert({ tenant_id: tenantId, role: 'user', content: message })

    const aiResponse = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 1024,
      system: systemPrompt,
      messages: [...priorTurns, { role: 'user', content: message }] as any,
    })

    const reply = aiResponse.content
      .map((b: any) => (b.type === 'text' ? b.text : ''))
      .filter(Boolean)
      .join('\n')
      .trim()

    if (!reply) return NextResponse.json({ error: 'לא התקבלה תשובה' }, { status: 502 })

    // Persist the assistant's reply.
    await supabase.from('advisor_messages').insert({ tenant_id: tenantId, role: 'assistant', content: reply })

    return NextResponse.json({ reply })
  } catch (err: any) {
    console.error('Error in /api/advisor:', err)
    return NextResponse.json({ error: err.message || 'שגיאה' }, { status: 500 })
  }
}
