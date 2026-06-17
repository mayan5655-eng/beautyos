// app/api/marketing/reel/route.ts
// Generates a COMPLETE reel campaign package for a cosmetician:
// spoken script (scene by scene), filming instructions, cover title,
// post caption, hashtags, and a recommended music vibe.
//
// POST /api/marketing/reel  { topic, duration?, vibe? }
// Multi-tenant: business context is loaded from the logged-in user's tenant.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

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

    const body = await request.json()
    const topic: string = (body.topic || '').trim()
    const duration: string = body.duration || '30'
    const vibe: string = body.vibe || ''

    if (!topic) {
      return NextResponse.json({ error: 'חסר נושא לרילס' }, { status: 400 })
    }

    // Load business context (name + services) for personalization
    let businessName = 'העסק'
    let servicesText = ''
    if (tenantId) {
      const [settingsRes, servicesRes] = await Promise.all([
        supabase.from('settings').select('business_name').eq('tenant_id', tenantId).limit(1),
        supabase.from('service_prices').select('name, price').eq('tenant_id', tenantId).eq('active', true),
      ])
      if (settingsRes.data && settingsRes.data.length > 0) {
        businessName = settingsRes.data[0].business_name || 'העסק'
      }
      const services = servicesRes.data || []
      if (services.length > 0) {
        servicesText = services.map((s: any) => `- ${s.name}${s.price ? ` (${s.price} ש"ח)` : ''}`).join('\n')
      }
    }

    const prompt = `את במאית תוכן ומומחית רילסים לעסקי יופי בישראל. קוסמטיקאית רוצה ליצור רילס מקצועי לאינסטגרם/טיקטוק.

== פרטי העסק ==
שם: ${businessName}
${servicesText ? `שירותים:\n${servicesText}` : ''}

== הנושא של הרילס ==
${topic}

== אורך מבוקש ==
${duration} שניות
${vibe ? `== ווייב מבוקש ==\n${vibe}` : ''}

== המשימה ==
בני חבילת רילס שלמה שהקוסמטיקאית תוכל להפיק לבד עם הטלפון ו-CapCut.
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

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    })

    const textBlock = message.content.find((b) => b.type === 'text')
    if (!textBlock || textBlock.type !== 'text') {
      return NextResponse.json({ error: 'לא התקבלה תשובה מה-AI' }, { status: 500 })
    }

    const clean = textBlock.text.replace(/```json|```/g, '').trim()
    let reel
    try {
      reel = JSON.parse(clean)
    } catch (e) {
      return NextResponse.json({ error: 'יצירת הרילס נכשלה, נסי שוב' }, { status: 422 })
    }

    return NextResponse.json({ success: true, reel })
  } catch (error: any) {
    console.error('Error in /api/marketing/reel:', error)
    return NextResponse.json({ error: error.message || 'יצירת הרילס נכשלה' }, { status: 500 })
  }
}