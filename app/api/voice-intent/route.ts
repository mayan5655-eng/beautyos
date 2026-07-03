// app/api/voice-intent/route.ts
// "Beauty Voice" — turns a spoken Hebrew command into a structured intent.
// This route does LANGUAGE UNDERSTANDING ONLY: it extracts fields and resolves
// relative dates. Matching names/services against the tenant's data, the
// confirmation step, and the actual booking all happen on the client.
//
// SECURITY: requires an authenticated session (like /api/advisor). No tenant
// data is sent to the model — only the transcript + today's date.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(request: NextRequest) {
  try {
    // Auth gate — never an open endpoint.
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'לא מחובר' }, { status: 401 })

    const body = await request.json()
    const transcript: string = (body?.transcript || '').toString().trim()
    // today = "YYYY-MM-DD" from the client, so the model can resolve "מחר" etc.
    const today: string = (body?.today || '').toString().trim()
    if (!transcript) return NextResponse.json({ error: 'לא נקלט טקסט' }, { status: 400 })

    const systemPrompt = `את מנוע הבנת-כוונות לפקודות קוליות בעברית של קוסמטיקאית במערכת ניהול עסק.
היום הוא ${today || 'לא ידוע'} (פורמט YYYY-MM-DD).

המשימה: להחזיר אך ורק אובייקט JSON תקין (בלי טקסט נוסף, בלי סימוני קוד) לפי הסכמה:
{
  "action": "book_appointment" | "unknown",
  "client_name": string | null,   // שם הלקוחה כפי שנאמר, או null
  "date": string | null,          // תאריך מוחלט YYYY-MM-DD אחרי פתרון ביטויים יחסיים
  "time": string | null,          // שעה בפורמט 24 שעות HH:MM, כולל דקות אם נאמרו
  "service": string | null,       // שם השירות אם נאמר, אחרת null
  "confidence": number,           // 0..1
  "clarification": string | null  // שאלה קצרה אם חסר מידע קריטי, אחרת null
}

כללים:
- "action" = "book_appointment" רק אם ברור שמדובר בקביעת/הזמנת תור. אחרת "unknown".
- פתרי ביטויי זמן יחסיים לפי היום: "מחר", "מחרתיים", "יום ראשון הקרוב", "בעוד שבוע" → תאריך מוחלט.
- שעה: "בעשר"→"10:00", "עשר וחצי"→"10:30", "רבע לתשע"→"08:45". שמרי דקות אם נאמרו. אם לא נאמרה שעה → null.
- אל תמציאי שם לקוחה או שירות שלא נאמרו — במקרה כזה null.
- אם חסר מידע קריטי (למשל אין שם לקוחה) — מלאי "clarification" בשאלה קצרה בעברית.
- החזירי JSON בלבד.`

    const aiResponse = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 400,
      system: systemPrompt,
      messages: [{ role: 'user', content: transcript }],
    })

    const rawText = aiResponse.content
      .map((b: any) => (b.type === 'text' ? b.text : ''))
      .join('')
      .trim()

    // Be forgiving: strip code fences and pull the first {...} block.
    let intent: any = { action: 'unknown', confidence: 0, raw: transcript }
    try {
      const cleaned = rawText.replace(/```json|```/g, '').trim()
      const match = cleaned.match(/\{[\s\S]*\}/)
      if (match) intent = { ...JSON.parse(match[0]), raw: transcript }
    } catch {
      // keep the safe default (unknown)
    }

    return NextResponse.json({ intent })
  } catch (err: any) {
    console.error('Error in /api/voice-intent:', err)
    return NextResponse.json({ error: err.message || 'שגיאה' }, { status: 500 })
  }
}
