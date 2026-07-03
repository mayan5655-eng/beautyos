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
  "action": "book_appointment" | "show_day" | "revenue_summary" | "cancel_appointment" | "create_receipt" | "call_client" | "unknown",
  "client_name": string | null,   // שם הלקוחה כפי שנאמר, או null
  "date": string | null,          // תאריך מוחלט YYYY-MM-DD אחרי פתרון ביטויים יחסיים
  "time": string | null,          // שעה בפורמט 24 שעות HH:MM, כולל דקות אם נאמרו
  "service": string | null,       // שם השירות אם נאמר, אחרת null
  "period": "today" | "month" | null, // לסיכום הכנסות בלבד
  "amount": number | null,        // סכום בשקלים (מספר) — להוצאת קבלה
  "payment_method": "cash" | "card" | "bit" | null, // אמצעי תשלום אם נאמר
  "confidence": number,           // 0..1
  "clarification": string | null  // שאלה קצרה אם חסר מידע קריטי, אחרת null
}

זיהוי הכוונה (action):
- "book_appointment" — קביעת/הזמנת תור חדש. דוגמה: "קבעי תור לרונית מחר בעשר".
- "show_day" — הצגת התורים של יום מסוים. דוגמאות: "מה יש לי מחר", "מי התורים שלי היום", "מה יש לי ביום שלישי". מלאי "date".
- "revenue_summary" — סיכום הכנסות. דוגמאות: "כמה הכנסתי היום" → period "today"; "כמה הכנסתי החודש" → period "month".
- "cancel_appointment" — ביטול תור קיים. דוגמאות: "בטלי את התור של רונית מחר", "תבטלי לדנה את התור". מלאי "client_name", ו-"date" אם נאמר.
- "create_receipt" — הוצאת קבלה ללקוחה. דוגמאות: "תוציאי קבלה לרונית על 200 שקל", "קבלה לדנה 350 באשראי". מלאי "client_name" ו-"amount" (מספר), ו-"payment_method" אם נאמר.
- "call_client" — חיוג ללקוחה. דוגמאות: "תתקשרי לרונית", "חייגי לדנה". מלאי "client_name".
- אחרת → "unknown".

כללים:
- פתרי ביטויי זמן יחסיים לפי היום: "מחר", "מחרתיים", "יום ראשון הקרוב", "בעוד שבוע", "היום" → תאריך מוחלט YYYY-MM-DD.
- שעה: "בעשר"→"10:00", "עשר וחצי"→"10:30", "רבע לתשע"→"08:45". שמרי דקות אם נאמרו. אם לא נאמרה שעה → null.
- amount: חלצי את הסכום כמספר בלבד (למשל "200 שקל"→200, "350"→350). אם לא נאמר סכום → null.
- payment_method: "מזומן"→"cash"; "אשראי"/"כרטיס"/"בכרטיס"→"card"; "ביט"→"bit". אם לא נאמר → null.
- אל תמציאי שם לקוחה, שירות, תאריך או שעה שלא נאמרו — במקרה כזה null.
- שדות שלא רלוונטיים לכוונה → null (למשל time ב-show_day, service ב-cancel_appointment).
- אם חסר מידע קריטי (למשל ביטול בלי שם לקוחה) — מלאי "clarification" בשאלה קצרה בעברית.
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
