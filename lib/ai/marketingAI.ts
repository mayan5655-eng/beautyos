// lib/ai/marketingAI.ts
// AI functions for the Marketing Suite
// Generates campaign strategies, post variations, and Facebook group suggestions

import Anthropic from '@anthropic-ai/sdk'
import { trackedCreate } from './usage.ts'

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
  services?: string[] | null            // real menu, formatted "name (₪price, duration)"
  target_audience?: string | null
  region?: string | null                // clinic address ("street, city")
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

// Input for generating a campaign strategy
export interface CampaignInput {
  goal: string                    // e.g. "fill appointments for facial treatments"

  // All three are optional, and all three are now genuinely supplied.
  //
  // serviceType / targetAudience come from the step-1 form in
  // app/dashboard/marketing/new/NewCampaignClient.tsx (the "לדוגמה: נשים 25-45"
  // and "לדוגמה: הסרת שיער בלייזר" inputs). The quick generator in
  // beautyos.jsx does not collect them and simply omits them.
  //
  // additionalContext had no sender at all until now; beautyos.jsx collects it
  // as "משהו נוסף שכדאי שה-AI יידע".
  //
  // What was actually broken here was not the fields but the interpolation:
  // absent values were rendered by inline ternaries that left their own blank
  // lines behind, so the prompt shipped with a hole in it. See the assembly in
  // generateCampaignStrategy.
  serviceType?: string
  targetAudience?: string
  additionalContext?: string
}

// Output of strategy generation
export interface CampaignStrategy {
  strategy: string                // main strategic approach in Hebrew
  tone: string                    // recommended tone (luxury, friendly, etc.)
  keyPoints: string[]             // 3-5 key messages to emphasize
  audienceInsights: string        // who we're talking to and why
}

// A single post variation
export interface PostVariation {
  variationNumber: number
  variationType: string           // e.g. "emotional", "educational", "urgency"
  title: string                   // short hook/title
  body: string                    // main post text (Hebrew)
  callToAction: string            // CTA in Hebrew
  hashtags: string[]              // 3-7 hashtags in Hebrew
  imageSuggestion: string         // description of suggested image
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
function buildBusinessContext(profile: BusinessProfile): string {
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
    parts.push(`אזור / כתובת הקליניקה: ${profile.region}`)
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

אלה אינם כללי סגנון. זהו עסק אמיתי המפרסם בפומבי בישראל, והטקסט נכתב בשמה ומתפרסם באחריותה.`

// =====================
// Helper: Parse JSON from Claude (strips markdown fences)
// =====================
function parseClaudeJSON<T>(text: string): T {
  const cleanText = text.replace(/```json|```/g, '').trim()
  return JSON.parse(cleanText) as T
}
// =====================
// Function 1: Generate Campaign Strategy
// =====================
// Takes a goal + business profile, returns a strategic approach
// This is "step 1" before generating actual posts

export async function generateCampaignStrategy(
  input: CampaignInput,
  profile: BusinessProfile,
  // Metering only - the generation is unchanged. Optional so an un-updated
  // caller records as unattributed rather than failing to compile.
  tenantId?: string | null
): Promise<CampaignStrategy> {
  const businessContext = buildBusinessContext(profile)

  // Built as a filtered array, not inline ternaries. The ternaries left their
  // own blank lines behind whenever a field was absent, so the prompt shipped
  // with a hole in the middle of it.
  const extra = [
    input.serviceType ? `סוג שירות: ${input.serviceType}` : null,
    input.targetAudience ? `קהל יעד ספציפי לקמפיין: ${input.targetAudience}` : null,
    input.additionalContext
      ? `מידע נוסף שהיא ביקשה לקחת בחשבון: ${input.additionalContext}`
      : null,
  ]
    .filter(Boolean)
    .join('\n')

  const prompt = `את אסטרטגית שיווק מומחית לעסקי יופי בישראל. נשאלת לעזור לקוסמטיקאית לבנות אסטרטגיית קמפיין שיווקי.

== פרטי העסק ==
${businessContext}

== מטרת הקמפיין ==
${input.goal}
${extra ? `\n${extra}\n` : ''}
${GROUNDING_RULES}

== המשימה שלך ==
בני אסטרטגיית קמפיין שיווקי שתמלא את המטרה. תני המלצות מעשיות, ספציפיות וישראליות.

חשבי על:
1. מהי הזווית השיווקית הכי חזקה?
2. איזה tone מתאים לקהל היעד?
3. מה 3-5 המסרים המרכזיים להעביר?
4. מי קהל היעד באמת ומה מניע אותו?

החזירי תשובה בפורמט JSON בלבד, בלי טקסט נוסף, בלי markdown:
{
  "strategy": "הסבר את הגישה האסטרטגית ב-3-5 משפטים בעברית",
  "tone": "המלץ על tone אחד מהבאים: luxury / accessible / young / professional / friendly / expert / urgent",
  "keyPoints": ["מסר 1", "מסר 2", "מסר 3", "מסר 4"],
  "audienceInsights": "תובנות על קהל היעד - מה מניע אותו, מה כואב לו, מה הוא מחפש (2-3 משפטים)"
}`

  try {
    const message = await trackedCreate(anthropic, {
      model: 'claude-sonnet-5',
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }],
    }, { tenantId: tenantId || null, callSite: 'marketing/strategy' })

    const textBlock = message.content.find((b) => b.type === 'text')
    if (!textBlock || textBlock.type !== 'text') {
      throw new Error('No text response from Claude')
    }

    return parseClaudeJSON<CampaignStrategy>(textBlock.text)
  } catch (error) {
    // THROW. Do not return a shaped object here.
    //
    // This used to return a "fallback strategy" whose .strategy field was the
    // sentence "לא הצלחנו לייצר אסטרטגיה אוטומטית" and whose keyPoints were
    // "בדוק את חיבור האינטרנט". That object is structurally valid, so nothing
    // downstream could tell it apart from a real strategy: the route returned
    // 200, the UI's `if (!sData.strategy)` guard passed, and the string went
    // into generatePostVariations as `גישה:` and `מסרים מרכזיים:`. She got
    // five confident, well-formed Facebook posts written around an error
    // message - the most expensive possible way to fail, because it looks
    // exactly like success.
    //
    // A thrown error reaches her as "לא הצלחנו לייצר אסטרטגיה" and stops the
    // chain before a single post is written.
    console.error('Failed to generate campaign strategy:', error)
    throw error instanceof Error ? error : new Error(String(error))
  }
}
// =====================
// Function 2: Generate Post Variations
// =====================
// Takes a strategy + business profile, generates 3-5 ready-to-post variations
// Each variation uses a different angle (emotional, educational, urgency, etc.)

export async function generatePostVariations(
  strategy: CampaignStrategy,
  profile: BusinessProfile,
  count: number = 5,
  tenantId?: string | null
): Promise<PostVariation[]> {
  const businessContext = buildBusinessContext(profile)

  const prompt = `את קופירייטרית מומחית לתחום היופי בישראל. עליך לכתוב ${count} וריאציות שונות של פוסט שיווקי לפייסבוק.

== פרטי העסק ==
${businessContext}

== האסטרטגיה ==
גישה: ${strategy.strategy}
Tone: ${strategy.tone}
מסרים מרכזיים: ${strategy.keyPoints.join(', ')}
תובנות על הקהל: ${strategy.audienceInsights}

== המשימה ==
כתבי ${count} וריאציות פוסט שונות - כל אחת בזווית שיווקית אחרת:
1. רגשי (emotional) - מתחבר לרגש, חוויה, סיפור אישי
2. חינוכי (educational) - טיפ או מידע מקצועי
3. דחיפות (urgency) - הזדמנות מוגבלת, מבצע, סוף עונה
4. חברתי (social_proof) - המלצות, ביקורות, תוצאות לקוחות
5. שאלה מעוררת (engaging_question) - מתחיל בשאלה שגורמת לאינטראקציה

${GROUNDING_RULES}

הנחיות חשובות:
- כל פוסט בעברית רהוטה וטבעית (לא תרגום!)
- אורך 80-150 מילים לפוסט
- שלבי emoji בחוכמה (לא מוגזם)
- CTA ברור וספציפי בסוף
- האשטגים רלוונטיים בעברית
- בזווית ה-social_proof: כתבי הזמנה ללקוחות לשתף את החוויה שלהן, או תיאור כללי של מה שלקוחות מרגישות — לעולם לא ציטוט, שם או דירוג מומצא.

החזירי תשובה בפורמט JSON בלבד, ללא markdown:
{
  "variations": [
    {
      "variationNumber": 1,
      "variationType": "emotional / educational / urgency / social_proof / engaging_question",
      "title": "כותרת קצרה (3-7 מילים) שתופסת תשומת לב",
      "body": "גוף הפוסט המלא בעברית",
      "callToAction": "קריאה לפעולה ספציפית",
      "hashtags": ["#האשטג1", "#האשטג2", "#האשטג3"],
      "imageSuggestion": "תיאור התמונה המומלצת בעברית"
    }
  ]
}`

  try {
    const message = await trackedCreate(anthropic, {
      model: 'claude-sonnet-5',
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    }, { tenantId: tenantId || null, callSite: 'marketing/variations' })

    const textBlock = message.content.find((b) => b.type === 'text')
    if (!textBlock || textBlock.type !== 'text') {
      throw new Error('No text response from Claude')
    }

    const parsed = parseClaudeJSON<{ variations: PostVariation[] }>(textBlock.text)
    if (!Array.isArray(parsed.variations) || parsed.variations.length === 0) {
      throw new Error('Claude returned no post variations')
    }
    return parsed.variations
  } catch (error) {
    // Same reasoning as the strategy above: `return []` was a silent failure.
    // An empty array is truthy, so the UI's `if (vData.variations)` guard let
    // it through and she got an empty screen with no error at all.
    console.error('Failed to generate post variations:', error)
    throw error instanceof Error ? error : new Error(String(error))
  }
}

// =====================
// Function 3: Suggest Facebook Groups
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
      max_tokens: 3072,
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