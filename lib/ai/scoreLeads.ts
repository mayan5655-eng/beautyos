// AI Scoring for incoming leads
// Uses Claude to analyze lead quality and suggest priority

import Anthropic from '@anthropic-ai/sdk'

// Initialize Anthropic client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})

export interface LeadInput {
  fullName?: string | null
  phone?: string | null
  email?: string | null
  customFields?: Record<string, string>
  source?: string | null
  campaignName?: string
}

// Output: structured scoring result
export interface LeadScore {
  score: number                  // 1-100
  category: 'hot' | 'warm' | 'cold' | 'spam'
  reasoning: string              // explanation in Hebrew
  tags: string[]                 // e.g. ["high_budget", "urgent"]
  suggestedAction: string        // recommended next step in Hebrew
  skippedAI: boolean             // true if filtered as spam without calling AI
}

// Quick spam filter - runs BEFORE calling AI to save money
// Returns true if lead is obviously junk
function isObviousSpam(lead: LeadInput): boolean {
  const name = (lead.fullName || '').trim()
  const phone = (lead.phone || '').replace(/\D/g, '')  // digits only

  // Name too short or only repeated characters
  if (name.length < 2) return true
  if (/^(.)\1+$/.test(name)) return true  // "aaa", "ttt", etc.

  // Phone too short (Israeli phones are 9-10 digits)
  if (phone.length > 0 && phone.length < 7) return true

  // No phone AND no email - useless lead
  if (!phone && !lead.email) return true

  return false
}
// Main scoring function - call this for every incoming lead
export async function scoreLead(lead: LeadInput): Promise<LeadScore> {
  // Step 1: Quick spam filter (saves AI cost)
  if (isObviousSpam(lead)) {
    return {
      score: 0,
      category: 'spam',
      reasoning: 'ליד סונן אוטומטית - פרטים לא תקינים או חסרים',
      tags: ['spam', 'auto_filtered'],
      suggestedAction: 'מומלץ להתעלם - ליד לא תקין',
      skippedAI: true,
    }
  }

  // Step 2: Build prompt for Claude
  const customFieldsText = lead.customFields
    ? Object.entries(lead.customFields)
        .map(([k, v]) => `- ${k}: ${v}`)
        .join('\n')
    : 'אין שדות נוספים'

  const prompt = `את עוזרת אישית של קוסמטיקאית בישראל. נתחי את הליד הבא וסווגי אותו.

פרטי הליד:
- שם מלא: ${lead.fullName || 'לא צוין'}
- טלפון: ${lead.phone || 'לא צוין'}
- אימייל: ${lead.email || 'לא צוין'}
- מקור: ${lead.source || 'לא ידוע'}
- קמפיין: ${lead.campaignName || 'לא ידוע'}

תשובות הלקוחה בטופס:
${customFieldsText}

נתחי את הליד לפי הקריטריונים:
1. שלמות הפרטים (האם מילאה הכול)
2. רצינות (תשובות מפורטות = רצינות גבוהה)
3. סימני דחיפות (ביקשה לחזור בהקדם, ציינה תאריך)
4. סימני תקציב (ציינה סכומים, חבילות)
5. ספציפיות (התעניינה בטיפול מסוים = חם יותר)

החזירי תשובה בפורמט JSON בלבד, בלי טקסט נוסף:
{
  "score": מספר בין 1-100,
  "category": "hot" אם 80+, "warm" אם 50-79, "cold" אם 1-49,
  "reasoning": "הסבר קצר בעברית למה נתת את הציון הזה (2-3 משפטים)",
  "tags": ["תגית1", "תגית2"] - תגיות בעברית כמו "תקציב גבוה", "דחיפות", "מתעניינת בטיפול פנים",
  "suggestedAction": "המלצת פעולה בעברית - מה לעשות עם הליד הזה ומתי"
}`

  // Step 3: Call Claude
  try {
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    })

    // Extract text from response
    const textBlock = message.content.find((block) => block.type === 'text')
    if (!textBlock || textBlock.type !== 'text') {
      throw new Error('No text response from Claude')
    }

    // Parse JSON (strip markdown fences if present)
    const cleanText = textBlock.text.replace(/```json|```/g, '').trim()
    const parsed = JSON.parse(cleanText)

    return {
      score: parsed.score,
      category: parsed.category,
      reasoning: parsed.reasoning,
      tags: parsed.tags || [],
      suggestedAction: parsed.suggestedAction,
      skippedAI: false,
    }
  } catch (error) {
    // If AI fails, return a fallback score
    console.error('AI scoring failed:', error)
    return {
      score: 50,
      category: 'warm',
      reasoning: 'לא הצלחנו לנתח את הליד אוטומטית - נדרשת בדיקה ידנית',
      tags: ['needs_manual_review'],
      suggestedAction: 'מומלץ לבדוק את הליד ידנית',
      skippedAI: false,
    }
  }
}