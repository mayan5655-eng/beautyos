// lib/ai/marketingAI.ts
// AI functions for the Marketing Suite
// Generates campaign strategies, post variations, and Facebook group suggestions

import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})

// =====================
// Types
// =====================

// Business profile loaded from the tenants table
export interface BusinessProfile {
  business_name?: string | null
  business_description?: string | null
  services?: string[] | null
  target_audience?: string | null
  region?: string | null
  brand_tone?: string | null
  unique_selling_points?: string[] | null
  price_range?: string | null
}

// Input for generating a campaign strategy
export interface CampaignInput {
  goal: string                    // e.g. "fill appointments for facial treatments"
  serviceType?: string            // e.g. "facial treatment"
  targetAudience?: string         // optional override of business profile audience
  additionalContext?: string      // any extra info the user wants to share
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
  if (profile.business_description) {
    parts.push(`תיאור: ${profile.business_description}`)
  }
  if (profile.services && profile.services.length > 0) {
    parts.push(`שירותים: ${profile.services.join(', ')}`)
  }
  if (profile.target_audience) {
    parts.push(`קהל יעד: ${profile.target_audience}`)
  }
  if (profile.region) {
    parts.push(`אזור: ${profile.region}`)
  }
  if (profile.brand_tone) {
    parts.push(`סגנון מותג: ${profile.brand_tone}`)
  }
  if (profile.unique_selling_points && profile.unique_selling_points.length > 0) {
    parts.push(`יתרונות תחרותיים: ${profile.unique_selling_points.join(', ')}`)
  }
  if (profile.price_range) {
    parts.push(`טווח מחירים: ${profile.price_range}`)
  }

  if (parts.length === 0) {
    return 'אין מידע על העסק - יש לתת המלצות כלליות לקוסמטיקאית בישראל.'
  }

  return parts.join('\n')
}

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
  profile: BusinessProfile
): Promise<CampaignStrategy> {
  const businessContext = buildBusinessContext(profile)

  const prompt = `את אסטרטגית שיווק מומחית לעסקי יופי בישראל. נשאלת לעזור לקוסמטיקאית לבנות אסטרטגיית קמפיין שיווקי.

== פרטי העסק ==
${businessContext}

== מטרת הקמפיין ==
${input.goal}

${input.serviceType ? `סוג שירות: ${input.serviceType}` : ''}
${input.targetAudience ? `קהל יעד ספציפי לקמפיין: ${input.targetAudience}` : ''}
${input.additionalContext ? `מידע נוסף: ${input.additionalContext}` : ''}

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
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }],
    })

    const textBlock = message.content.find((b) => b.type === 'text')
    if (!textBlock || textBlock.type !== 'text') {
      throw new Error('No text response from Claude')
    }

    return parseClaudeJSON<CampaignStrategy>(textBlock.text)
  } catch (error) {
    console.error('Failed to generate campaign strategy:', error)
    // Fallback strategy
    return {
      strategy: 'לא הצלחנו לייצר אסטרטגיה אוטומטית. נסי שוב או צרי קמפיין ידני.',
      tone: 'friendly',
      keyPoints: ['בדוק את חיבור האינטרנט', 'נסה שוב בעוד דקה'],
      audienceInsights: 'נדרשת בדיקה ידנית.',
    }
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
  count: number = 5
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

הנחיות חשובות:
- כל פוסט בעברית רהוטה וטבעית (לא תרגום!)
- אורך 80-150 מילים לפוסט
- שלבי emoji בחוכמה (לא מוגזם)
- CTA ברור וספציפי בסוף
- האשטגים רלוונטיים בעברית

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
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    })

    const textBlock = message.content.find((b) => b.type === 'text')
    if (!textBlock || textBlock.type !== 'text') {
      throw new Error('No text response from Claude')
    }

    const parsed = parseClaudeJSON<{ variations: PostVariation[] }>(textBlock.text)
    return parsed.variations
  } catch (error) {
    console.error('Failed to generate post variations:', error)
    return []
  }
}

// =====================
// Function 3: Suggest Facebook Groups
// =====================
// Suggests Facebook groups to search for, based on target audience + region
// Returns names + reasoning - the user manually searches and joins them

export async function suggestFacebookGroups(
  profile: BusinessProfile,
  count: number = 10
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
- שמות אמיתיים וסבירים שקיימים בפייסבוק ישראל
- תני שמות שאפשר לחפש בפייסבוק כמו שהם
- אל תיתני את אותה קבוצה פעמיים

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
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 3072,
      messages: [{ role: 'user', content: prompt }],
    })

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