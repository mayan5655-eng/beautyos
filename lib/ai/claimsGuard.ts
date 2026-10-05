// lib/ai/claimsGuard.ts
//
// What the AI may say about how a treatment feels - and the check that makes the
// rule hold when the model does not follow it.
//
// The rule (decided 2026-10-05): how a treatment FEELS, its INTENSITY, its
// DOWNTIME, who it SUITS and what it CONTAINS may appear in text written in her
// name only if her business profile, the service description or her own request
// says so. Otherwise the text stays general. She publishes what it writes without
// reading it, so a caption promising "only a slight tingle" about a treatment that
// stings is a promise she cannot see coming and must answer for.
//
// Two layers, because a prompt is followed most of the time and "most" is not
// enough for a promise made in someone else's name:
//   1. CLAIMS_RULE_HE goes into every prompt that writes text she posts;
//   2. findUngroundedClaims() rereads what came back. withClaimsGuard() gives the
//      model ONE retry with the offending words named, and if they come back it
//      REFUSES (UngroundedClaimsError, in plain Hebrew) rather than publish them.
//
// The detector is a lexicon, not understanding, and is built to err toward
// catching: a harmless sentence flagged costs one retry; a missed promise costs
// her a client's trust. A claim is "grounded" when the same stem appears in the
// source she wrote (profile, service descriptions, her request) - so writing
// "מרגישים עקצוץ קל" in the service description is how she turns a claim on.

/** The prompt rule. Appears in GROUNDING_RULES (director, reel, shooting list) and the caption prompt. */
export const CLAIMS_RULE_HE = `== טענות על התחושה והטיפול - מחמירות ==
את לא יודעת איך הטיפול של העסק הזה מרגיש, כמה חזק הוא, כמה זמן מתאוששים ממנו, למי הוא מתאים ומה יש בו. הלקוחה מפרסמת את מה שאת כותבת בלי לבדוק, ותחושה שהומצאה היא הבטחה שהיא תצטרך לעמוד מאחוריה. לכן אסור לכתוב אף אחד מאלה אלא אם המידע כתוב במפורש בפרטי העסק, בתיאור השירות או בבקשה שלה (לא להסיק משם הטיפול, ולא להשלים מהידע הכללי שלך על טיפולים כאלה):
- תחושה: איך מרגישים בזמן הטיפול או אחריו (עקצוץ, צריבה, כאב או היעדרו, "נעים", "מרגיע").
- עוצמה: עדין, חזק, עוצמה או מינון נמוכים או גבוהים.
- זמן התאוששות: השבתה, אדמומיות, קילוף, חזרה לשגרה, "בלי זמן החלמה".
- התאמה: למי הטיפול מתאים או לא מתאים (סוג עור, עור רגיש, הריון, "לכולן"), וגם תהליך שלא נמסר ("בדיקה קצרה", "התאמה אישית").
- הרכב ושיטה: חומצות, מרכיבים פעילים, חומרים, מכשירים, "בלי שפשוף".
אם המידע לא נמסר - כתבי באופן כללי: מה מטרת הטיפול, למי הפוסט פונה ומתי כדאי לקבוע. פוסט כללי ונכון עדיף על פוסט ספציפי ומומצא.`;

type Category = { label: string; stems: string[] };

// Stems, not words: Hebrew attaches prefixes (ו ה ב כ ל מ ש) and inflects, so a
// stem is matched anywhere after an optional prefix.
const LEXICON: Category[] = [
  { label: 'תחושה', stems: ['עקצוץ', 'עקצוצ', 'צריבה', 'צורב', 'כאב', 'כואב', 'נעים', 'נעימ', 'מרגיע', 'אי נוחות', 'אי-נוחות', 'גירוי'] },
  { label: 'עוצמה', stems: ['עדין', 'עוצמה', 'מינון', 'חזק'] },
  { label: 'זמן התאוששות', stems: ['השבתה', 'החלמה', 'התאוששות', 'אדמומיות', 'קילוף', 'מתקלפ', 'לשגרה'] },
  { label: 'התאמה', stems: ['מתאימ', 'נתאים', 'אתאים', 'התאמה', 'לכל סוג', 'לכולן', 'עור רגיש', 'בטוח', 'מומלץ', 'הריון', 'בדיקה', 'אבחון'] },
  { label: 'הרכב ושיטה', stems: ['חומצ', 'aha', 'bha', 'רטינול', 'ויטמין', 'היאלורון', 'פפטיד', 'קולגן', 'מרכיב', 'חומר פעיל', 'חומרים', 'שפשוף', 'מכשיר'] },
];

const NIQQUD = /[֑-ׇ]/g;
const norm = (s: string) => s.replace(NIQQUD, '').toLowerCase();
const HEB = '\\u05D0-\\u05EA';

/**
 * Claims in `texts` that the `source` does not back. Returns the surface words
 * as written (deduplicated), so they can be named to the model and logged.
 * Empty array = nothing ungrounded.
 */
export function findUngroundedClaims(texts: string[], source: string): string[] {
  const src = norm(source);
  const found = new Set<string>();
  for (const raw of texts) {
    const t = norm(String(raw || ''));
    if (!t) continue;
    for (const cat of LEXICON) {
      for (const stem of cat.stems) {
        if (src.includes(stem)) continue; // she wrote it: it is hers
        // the whole word the stem sits in, so the retry can name it
        const re = new RegExp(`(?<![${HEB}a-z])[והבכלמש]{0,3}(?:${stem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})[${HEB}a-z]*`, 'g');
        for (const m of t.matchAll(re)) found.add(m[0]);
      }
    }
  }
  return [...found];
}

/** Raised when the model states ungrounded claims twice. The message is for HER. */
export class UngroundedClaimsError extends Error {
  readonly claims: string[];
  constructor(claims: string[]) {
    super('לא הצלחנו לנסח פוסט בלי להמציא פרטים על איך הטיפול מרגיש, מה העוצמה שלו או מה יש בו - ופרטים כאלה לא נפרסם בשמך בלי שכתבת אותם 🌸 אפשר להוסיף תיאור קצר לטיפול בהגדרות (בשירותים), והפוסט יוכל להשתמש בו. אפשר גם לנסח את הבקשה קצת אחרת.');
    this.name = 'UngroundedClaimsError';
    this.claims = claims;
  }
}

const correctionFor = (claims: string[]) =>
  `תיקון נדרש: בטיוטה הקודמת הופיעו ניסוחים על התחושה, העוצמה, ההתאוששות, ההתאמה או ההרכב שאינם כתובים בפרטי העסק, בתיאור השירות או בבקשה: ${claims.map((c) => `"${c}"`).join(', ')}. כתבי הכול מחדש בלי אף אחד מהם ובלי נוסחאות דומות להם. אם אין מידע - כתבי באופן כללי.`;

/**
 * Run `attempt` and hold its output to the rule: if it states ungrounded claims,
 * run it ONCE more with the offending words named; if they come back, refuse.
 * `attempt(null)` is the first try; `attempt(correction)` the retry (append the
 * correction to the prompt). Never loops.
 */
export async function withClaimsGuard<T>(
  attempt: (correction: string | null) => Promise<T>,
  textsOf: (result: T) => string[],
  source: string
): Promise<T> {
  const first = await attempt(null);
  const bad = findUngroundedClaims(textsOf(first), source);
  if (bad.length === 0) return first;
  console.error(`[claims-guard] ungrounded claims in the first draft, retrying once: ${bad.join(', ')}`);
  const second = await attempt(correctionFor(bad));
  const still = findUngroundedClaims(textsOf(second), source);
  if (still.length === 0) return second;
  console.error(`[claims-guard] REFUSED - the retry still stated: ${still.join(', ')}`);
  throw new UngroundedClaimsError(still);
}

/**
 * Hebrew slips the model makes in preposition + pronoun forms: "אלייך" for "אליך",
 * "עלייך" for "עליך" (and the plural/masculine forms). A fixed list on purpose:
 * a general "ייך -> יך" rule would break correct plurals like "ידייך".
 */
export function fixHebrewSlips(text: string): string {
  // An optional one-letter prefix (ו, ש, כ, ל, ב, מ, ה) is allowed: "ועלייכן" is the same slip.
  return String(text ?? '').replace(new RegExp(`(?<![${HEB}])([והבכלמש]{0,2})(אל|על)יי(ך|כם|כן)(?![${HEB}])`, 'g'), '$1$2י$3');
}
