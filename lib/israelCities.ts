// lib/israelCities.ts
//
// A built-in list of Israeli cities and towns (the largest ~130 plus common spellings and abbreviations), used ONLY by the
// outreach paste import (lib/prospects.ts parsePastedProspects) to tell a city cell from part of her name. A plain cell that is
// not on this list is treated as part of the name, so "נועה, כהן, 050..." stays "נועה כהן".
//
// Words that are also common first names (אריאל, אפרת, עומר, אלעד, עמנואל, אלקנה, שוהם, סביון, שלומי, מיתר) or surnames (נשר, מגדל) are deliberately left out: a cell like
// that is read as her name. She can still give such a city with the prefix "עיר:".
// Pure data and one pure function; no network, nothing sent.

/** canonical name -> extra spellings (abbreviations, hyphens, short forms). The canonical name itself always matches. */
const CITIES: Record<string, string[]> = {
  'ירושלים': ['jerusalem'],
  'תל אביב': ['תל אביב יפו', 'ת"א', 'תא"י', 'תל-אביב', 'תל אביב-יפו', 'tel aviv'],
  'יפו': [],
  'חיפה': ['haifa'],
  'ראשון לציון': ['ראשל"צ', 'ראשון'],
  'פתח תקווה': ['פ"ת', 'פתח תקוה', 'פתח-תקווה'],
  'אשדוד': [],
  'נתניה': [],
  'באר שבע': ['ב"ש', 'באר-שבע'],
  'בני ברק': ['ב"ב'],
  'חולון': [],
  'רמת גן': ['ר"ג', 'רמת-גן'],
  'אשקלון': [],
  'רחובות': [],
  'בת ים': ['בת-ים'],
  'בית שמש': [],
  'כפר סבא': ['כ"ס', 'כפר-סבא'],
  'הרצליה': [],
  'חדרה': [],
  'מודיעין': ['מודיעין מכבים רעות', 'מודיעין-מכבים-רעות'],
  'מודיעין עילית': [],
  'נצרת': [],
  'נוף הגליל': ['נצרת עילית'],
  'לוד': [],
  'רמלה': [],
  'רעננה': [],
  'רהט': [],
  'ראש העין': [],
  'הוד השרון': [],
  'רמת השרון': ['רמה"ש'],
  'נהריה': [],
  'קריית גת': [],
  'קריית אתא': [],
  'קריית ביאליק': [],
  'קריית מוצקין': [],
  'קריית ים': [],
  'קריית אונו': [],
  'קריית שמונה': [],
  'קריית מלאכי': [],
  'קריית ארבע': [],
  'קריית טבעון': [],
  'קריית עקרון': [],
  'קריית יערים': [],
  'אום אל פחם': ['אום אל-פחם'],
  'אילת': [],
  'עפולה': [],
  'גבעתיים': [],
  'יבנה': [],
  'אור יהודה': [],
  'נס ציונה': [],
  'עכו': [],
  'כרמיאל': [],
  'טבריה': [],
  'צפת': [],
  'דימונה': [],
  'נתיבות': [],
  'שדרות': [],
  'אופקים': [],
  'ערד': [],
  'מעלה אדומים': [],
  'ביתר עילית': ['ביתר'],
  'טירת כרמל': [],
  'יקנעם': ['יקנעם עילית'],
  'מגדל העמק': [],
  'בית שאן': [],
  'מעלות תרשיחא': ['מעלות'],
  'שפרעם': [],
  'טמרה': [],
  "סח'נין": ['סחנין'],
  'טייבה': [],
  'טירה': [],
  'כפר קאסם': [],
  'קלנסווה': [],
  'באקה אל גרבייה': ['באקה אל-גרביה', 'באקה'],
  'אור עקיבא': [],
  'זכרון יעקב': [],
  'פרדס חנה כרכור': ['פרדס חנה', 'כרכור'],
  'בנימינה': ['בנימינה גבעת עדה'],
  'גבעת עדה': [],
  'קיסריה': [],
  'אבן יהודה': [],
  'כפר יונה': [],
  'כוכב יאיר': ['כוכב יאיר צור יגאל'],
  'צור יגאל': [],
  'גני תקווה': ['גני תקוה'],
  'יהוד': ['יהוד מונוסון', 'יהוד-מונוסון'],
  'גבעת שמואל': [],
  'אזור': [],
  'גדרה': [],
  'מזכרת בתיה': [],
  'גן יבנה': [],
  'באר יעקב': [],
  'כפר ורדים': [],
  'ראש פינה': [],
  'קצרין': [],
  'מצפה רמון': [],
  'ירוחם': [],
  'להבים': [],
  'כסיפה': [],
  'חורה': [],
  'תל שבע': [],
  'לקיה': [],
  'גבעת זאב': [],
  'קרני שומרון': [],
  'אלפי מנשה': [],
  'קדומים': [],
  'אורנית': [],
  'פרדסיה': [],
  'תל מונד': [],
  'קדימה צורן': ['קדימה'],
  'רמת ישי': [],
  'עתלית': [],
  'דאלית אל כרמל': ['דלית אל כרמל'],
  'עספיא': [],
  "מע'אר": ['מגאר'],
  'ירכא': [],
  'כפר כנא': [],
  'עראבה': [],
  'אבו גוש': [],
  'מבשרת ציון': ['מבשרת'],
  'צור הדסה': [],
  'כפר שמריהו': [],
  'בת חפר': [],
  'כפר תבור': [],
  'גבעת ברנר': [],
  'יפיע': [],
  'ג\'דיידה מכר': ['גדיידה מכר'],
  'כאבול': [],
  'עין מאהל': [],
  'משהד': [],
  'אכסאל': [],
}

/** Gershayim / geresh to plain quotes, hyphens and the קרית / תקוה spellings folded, spaces collapsed. */
function norm(s: string): string {
  return s.trim().toLowerCase()
    .replace(/[״“”]/g, '"').replace(/[׳‘’`]/g, "'")
    .replace(/["']/g, '')
    .replace(/[-־]/g, ' ')
    .replace(/(^|\s)קרית(?=\s|$)/g, '$1קריית')
    .replace(/תקוה/g, 'תקווה')
    .replace(/\s+/g, ' ')
}

const INDEX: Map<string, string> = (() => {
  const m = new Map<string, string>()
  for (const [canon, aliases] of Object.entries(CITIES)) {
    const c = canon.trim()
    for (const a of [c, ...aliases]) m.set(norm(a), c)
  }
  return m
})()

/** How many canonical cities are listed (for the test). */
export const ISRAEL_CITY_COUNT = new Set(Object.keys(CITIES).map((c) => c.trim())).size

/**
 * The canonical city for a cell, or null. "עיר: <anything>" is always a city (as typed). Otherwise only a listed city or
 * spelling matches: "ת\"א" -> "תל אביב", "פ״ת" -> "פתח תקווה", "קרית גת" -> "קריית גת".
 */
export function matchIsraeliCity(raw: string): string | null {
  const s = String(raw ?? '').trim()
  const prefixed = /^עיר\s*:\s*(.+)$/u.exec(s)
  if (prefixed) return INDEX.get(norm(prefixed[1])) ?? prefixed[1].replace(/\s+/g, ' ').trim()
  return INDEX.get(norm(s)) ?? null
}
