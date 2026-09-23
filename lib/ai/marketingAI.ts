// lib/ai/marketingAI.ts
// AI functions for the Marketing Suite
// Generates campaign strategies, post variations, and Facebook group suggestions

import Anthropic from '@anthropic-ai/sdk'
import { trackedCreate } from './usage.ts'
import { cityHashtag } from './profileHygiene.ts'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})

// =====================
// Types
// =====================

// Business profile — loaded from where the data ACTUALLY lives (settings +
// settings.branding jsonb + service_prices) via lib/ai/loadBusinessProfile.ts.
export interface BusinessProfile {
  business_name?: string | null
  business_description?: string | null
  services?: string[] | null            // ADVERTISABLE menu only, "name (₪price, duration)"
  /** How many treatments were withheld as not-advertisable. Never their names. */
  restricted_service_count?: number | null
  target_audience?: string | null
  region?: string | null                // clinic address, only when complete
  city?: string | null                  // derived from region; drives the geo hashtag
  booking_url?: string | null           // public /book link for this tenant
  booking_cta_label?: string | null     // her own wording for the booking button
  brand_tone?: string | null
  unique_selling_points?: string[] | null
  price_range?: string | null           // derived from real service prices
  // Real brand-voice & identity hints (from settings + branding jsonb)
  therapist_name?: string | null
  welcome_headline?: string | null      // headline she shows her own customers
  welcome_message?: string | null       // her brand tone toward clients
  brand_colors?: string | null          // "ראשי #.., משני #.."
  has_logo?: boolean | null
}

// A suggested Facebook group
export interface GroupSuggestion {
  name: string                    // suggested group name to search for
  category: string                // e.g. "mothers", "local community"
  reasoning: string               // why this group fits in Hebrew
}

// =====================
// Helper: Build business context string for prompts
// =====================
export function buildBusinessContext(profile: BusinessProfile): string {
  const parts: string[] = []

  if (profile.business_name) {
    parts.push(`שם העסק: ${profile.business_name}`)
  }
  if (profile.therapist_name) {
    parts.push(`שם הקוסמטיקאית: ${profile.therapist_name}`)
  }
  if (profile.business_description) {
    parts.push(`תיאור העסק: ${profile.business_description}`)
  }
  if (profile.services && profile.services.length > 0) {
    // Real service menu with prices — bullet list so the AI can reference
    // actual treatments and prices rather than inventing them.
    parts.push(
      `השירותים והמחירים בפועל:\n${profile.services.map((s) => `- ${s}`).join('\n')}`
    )
  }
  if (profile.price_range) {
    parts.push(`טווח מחירים בפועל: ${profile.price_range}`)
  }
  if (profile.target_audience) {
    parts.push(`קהל יעד: ${profile.target_audience}`)
  }
  if (profile.region) {
    // Only ever a complete address - loadBusinessProfile drops a half-typed one
    // rather than let it publish. So it can be quoted verbatim, and must be.
    parts.push(`אזור / כתובת הקליניקה (לצטט במלואה או בכלל לא): ${profile.region}`)
  }
  if (profile.booking_url) {
    parts.push(`קישור לקביעת תור: ${profile.booking_url}`)
  }
  if (profile.welcome_headline) {
    parts.push(`משפט המפתח של המותג ללקוחה: ${profile.welcome_headline}`)
  }
  if (profile.welcome_message) {
    parts.push(`טון הפנייה של המותג ללקוחות: ${profile.welcome_message}`)
  }
  if (profile.brand_tone) {
    parts.push(`סגנון מותג: ${profile.brand_tone}`)
  }
  if (profile.brand_colors) {
    parts.push(`צבעי המותג: ${profile.brand_colors}`)
  }
  if (profile.has_logo) {
    parts.push(`למותג יש לוגו מעוצב`)
  }
  if (profile.unique_selling_points && profile.unique_selling_points.length > 0) {
    parts.push(`יתרונות תחרותיים: ${profile.unique_selling_points.join(', ')}`)
  }

  if (parts.length === 0) {
    return 'אין מידע על העסק - יש לתת המלצות כלליות לקוסמטיקאית בישראל.'
  }

  return parts.join('\n')
}

// =====================
// Grounding rules — shared by every generator that writes public copy
// =====================
// The prompts hand the model her real treatments at her real prices, which is
// exactly what makes inventing a fourth treatment or a "מבצע" so plausible:
// the surrounding context reads as permission. Naming what is off-limits is
// the only thing that closes that, and it costs a few dozen tokens.
//
// The stakes are not stylistic. This copy is published under her name, to her
// community, in a regulated-adjacent field: a hallucinated price is a customer
// arriving expecting to pay it, and "מעלים כתמים" is a medical claim an
// Israeli cosmetician is not allowed to make.
//
// Exported so app/api/marketing/reel/route.ts shares one copy of these rules
// rather than drifting its own — same reasoning as lib/brand.ts.
export const GROUNDING_RULES = `== כללי דיוק — מחייבים ==
1. מותר להזכיר אך ורק טיפולים שמופיעים ברשימת השירותים שלמעלה. טיפול שאינו ברשימה — אין להזכיר, גם אם הוא נפוץ מאוד בעסקים דומים.
2. מותר לנקוב אך ורק במחירים שמופיעים ברשימה, בדיוק כפי שהם. אין להמציא מחיר, ואין להמציא מבצע, הנחה, "מחיר השקה" או מתנה שלא נמסרו לך.
3. אין להבטיח תוצאה ואין לנסח טענה רפואית: לא "מרפא", לא "מעלים", לא "פותר", לא "תוצאות מובטחות", ולא הבטחה למספר טיפולים או לפרק זמן עד לתוצאה. מותר וכדאי לתאר חוויה, תחושה ותועלת קוסמטית.
4. אין להמציא עדויות, ביקורות, שמות לקוחות, דירוגים או נתונים סטטיסטיים.
5. אם חסר מידע — השמיטי אותו. פוסט קצר ונכון עדיף על פוסט מלא ומומצא.
6. אסור בהחלט להזכיר טיפולים רפואיים או פולשניים — בוטוקס, פילרים, חומצה היאלורונית, כל סוג של הזרקה, מזותרפיה, פלזמה/PRP, ליפוליזה או חוטים — גם אם נראה לך שהעסק מציע אותם, גם אם הלקוחה תבקש, וגם אם הם מופיעים בהקשר אחר. בישראל אלה פעולות רפואיות, ופרסום שלהן בשם קוסמטיקאית הוא עבירה. רשימת השירותים שקיבלת כבר סוננה — אל תוסיפי אליה.
7. את הכתובת יש לכתוב במלואה בדיוק כפי שנמסרה, או לא להזכיר כתובת בכלל. אין לקצר, להמציא שכונה או להוסיף עיר שלא נמסרה.

אלה אינם כללי סגנון. זהו עסק אמיתי המפרסם בפומבי בישראל, והטקסט נכתב בשמה ומתפרסם באחריותה.`

// =====================
// Helper: Parse JSON from Claude (strips markdown fences)
// =====================
export function parseClaudeJSON<T>(text: string): T {
  const cleanText = text.replace(/```json|```/g, '').trim()
  return JSON.parse(cleanText) as T
}
// =====================
// Suggests Facebook groups to search for, based on target audience + region
// Returns names + reasoning - the user manually searches and joins them

export async function suggestFacebookGroups(
  profile: BusinessProfile,
  count: number = 10,
  tenantId?: string | null
): Promise<GroupSuggestion[]> {
  const businessContext = buildBusinessContext(profile)

  const prompt = `את מומחית לשיווק מקומי בפייסבוק בישראל. עליך להמליץ על קבוצות פייסבוק רלוונטיות לפרסום עבור הקוסמטיקאית הבאה.

== פרטי העסק ==
${businessContext}

== המשימה ==
הצעי ${count} שמות של קבוצות פייסבוק שהקוסמטיקאית כדאי שתחפש ותצטרף אליהן.

חשבי על קטגוריות מגוונות:
- קבוצות לפי אזור גיאוגרפי (תושבי העיר, פורומים מקומיים)
- קבוצות נשים בקבוצות גיל רלוונטיות
- קבוצות אמהות
- קבוצות תחביבים שמתאימים לקהל היעד
- קבוצות יד שניה / קונים ומוכרים מקומיים
- קבוצות בלעדיות לתחום היופי

הנחיות:
- תני מונחי חיפוש שסביר למצוא בפייסבוק ישראל, בניסוח שאפשר להדביק ישירות בשורת החיפוש
- אל תיתני את אותה קבוצה פעמיים
- אלה הצעות לחיפוש, לא קבוצות מאומתות. אל תמציאי מספר חברים, קישור, כתובת URL או פרטי מנהלת, ואל תתארי קבוצה מסוימת כאילו את יודעת בוודאות שהיא קיימת.
- אין להמציא נתונים על העסק, טיפולים או מחירים בנימוקים.

החזירי תשובה בפורמט JSON בלבד, ללא markdown:
{
  "groups": [
    {
      "name": "שם הקבוצה כמו שהוא בפייסבוק",
      "category": "אזורית / אמהות / נשים / מקצועית / חברתית",
      "reasoning": "למה כדאי לפרסם בקבוצה זו (משפט אחד)"
    }
  ]
}`

  try {
    const message = await trackedCreate(anthropic, {
      model: 'claude-sonnet-5',
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    }, { tenantId: tenantId || null, callSite: 'marketing/groups' })

    const textBlock = message.content.find((b) => b.type === 'text')
    if (!textBlock || textBlock.type !== 'text') {
      throw new Error('No text response from Claude')
    }

    const parsed = parseClaudeJSON<{ groups: GroupSuggestion[] }>(textBlock.text)
    return parsed.groups
  } catch (error) {
    console.error('Failed to suggest groups:', error)
    return []
  }
}