// lib/formTemplates.ts
//
// The client forms a business sends from the client card ("טפסים"): what /form shows the client, and what the owner's
// "צפייה בתשובות" sheet (app/FormAnswersSheet.jsx) reads her answers against. One list for both, so the page she
// signed and the page the owner reads can never disagree about which question number 7 was.
//
// ── Backwards compatibility, the part that must not move ──────────────────
// Every template that lived in app/form/page.jsx until 2026-11-04 is below WORD FOR WORD, under the same key and in
// the same order (test-form-templates.ts compares them with a frozen copy). Two reasons:
//   * a link already sent is just /form?id=...; the row's form_type picks the template, so a renamed key or a
//     reordered list would open a different form, or none;
//   * a signed form_data is keyed by the question's INDEX ("0", "0_note"), with no question text stored. Insert a
//     question in the middle of a template and every answer after it is read against the wrong question.
//     Append to the END of a template, or make a new one.
//
// ── Question shapes ───────────────────────────────────────────────────────
//   "שאלה?"                                    yes/no, the original shape. "כן" opens a note ("<index>_note").
//   { q, type: 'yesno' }                        the same, as an object (so it can be optional).
//   { q, type: 'choice', options }              exactly one option.
//   { q, type: 'multi', options, other, none }  any number of options, stored joined with ", ". Picking `other`
//                                               ("אחר") opens the note; `none` ("אין") clears the rest and stands alone.
//   { q, type: 'text' } / { q, type: 'longtext' }  free text.
//   { section: 'כותרת' }                        a heading, not a question. It still takes an index (so keys stay plain
//                                               positions in the list), and it never has an answer.
// Any question can be optional: true. Only required questions block signing and count in the progress bar.
// flag: true marks a health question whose answer the owner should notice (anything but `none`; for free text,
// anything but "אין"). A yes/no "כן" is always flagged.

export const YES = 'כן';
export const NO = 'לא';
/** Joins a multi answer. No option contains it (test-form-templates.ts). */
export const MULTI_SEP = ', ';

export type QuestionType = 'yesno' | 'choice' | 'multi' | 'text' | 'longtext';
export interface QuestionObject {
  q: string;
  type: QuestionType;
  options?: string[];
  optional?: boolean;
  /** multi: the option that opens the note. */
  other?: string;
  /** multi: the option that means "none of these". Exclusive. */
  none?: string;
  placeholder?: string;
  flag?: boolean;
}
export interface SectionItem { section: string }
export type FormItem = string | QuestionObject | SectionItem;
export interface FormTemplate { title: string; intro?: string; questions: FormItem[] }
export type Answers = Record<string, unknown>;

/** The client card's skin types (SKIN_TYPES in app/beautyos.jsx): the same words in the same order. Test-held. */
export const FORM_SKIN_TYPES = ['רגיל', 'יבש', 'שמן', 'מעורב', 'רגיש', 'נוטה לאקנה'];

export const FORMS: Record<string, FormTemplate> = {
  "general": {
    title: "הצהרת בריאות כללית",
    questions: [
      "האם את בהריון או מניקה?",
      "האם יש לך מחלות עור (פסוריאזיס, אקזמה, רוזציאה)?",
      "האם יש לך אלרגיות ידועות לקוסמטיקה?",
      "האם את סובלת מסוכרת?",
      "האם את נוטלת תרופות מדללות דם?",
      "האם עברת ניתוחים באזור הפנים בשנה האחרונה?",
      "האם יש לך בעיות לב או לחץ דם גבוה?",
      "האם את סובלת מאפילפסיה?",
      "האם יש לך שתלים מתכתיים בגוף?",
    ]
  },
  "nails_general": {
    title: "הצהרת בריאות ואישור טיפול (ציפורניים)",
    questions: [
      "האם את בהריון או מניקה?",
      "האם יש לך אלרגיה לג'ל, לאקריליק, ללק או לחומרי חיטוי?",
      "האם יש לך פטרת, דלקת או פצע פתוח בציפורניים או בעור סביבן?",
      "האם את סובלת מסוכרת או מבעיות במחזור הדם בכפות הידיים או הרגליים?",
      "האם את נוטלת תרופות מדללות דם?",
      "האם היו לך תגובות לא נעימות אחרי טיפול ציפורניים בעבר?",
      "האם יש משהו נוסף שחשוב שאדע לפני הטיפול?",
    ]
  },
  "nails_media": {
    title: "אישור צילום עבודות",
    questions: [
      "האם את מסכימה שאצלם את העבודה שנעשתה בציפורניים שלך?",
      "האם את מסכימה שהתמונות יפורסמו בעמודי העסק (ללא פרטים מזהים)?",
      "האם ידוע לך שאפשר לבקש להסיר תמונה בכל עת?",
    ]
  },
  "plasma": {
    title: "הצהרת בריאות — טיפול פלזמה",
    questions: [
      "האם את בהריון או מניקה?",
      "האם יש לך קוצב לב או שתל מתכתי?",
      "האם את סובלת מאפילפסיה?",
      "האם יש לך בעיות קרישת דם?",
      "האם את נוטלת תרופות מדללות דם?",
      "האם יש לך פצעים פתוחים או דלקות עור פעילות באזור הטיפול?",
      "האם יש לך הרפס חוזר באזור הטיפול?",
      "האם את סובלת מסוכרת?",
      "האם עברת טיפול פלזמה בחודש האחרון?",
      "האם יש לך רגישות יתר לחום?",
    ]
  },
  "device": {
    title: "הצהרת בריאות — טיפול במכשור מתקדם",
    questions: [
      "האם את בהריון או מניקה?",
      "האם יש לך קוצב לב או דפיברילטור?",
      "האם יש לך שתלים מתכתיים באזור הטיפול?",
      "האם את סובלת מאפילפסיה?",
      "האם יש לך בעיות לב או לחץ דם?",
      "האם את סובלת מסרטן פעיל?",
      "האם יש לך בעיות קרישת דם?",
      "האם את נוטלת תרופות מדללות דם?",
      "האם יש לך פצעים פתוחים באזור הטיפול?",
      "האם עברת ניתוח בשנה האחרונה באזור הטיפול?",
    ]
  },
  "laser": {
    title: "הצהרת בריאות — הסרת שיער בלייזר",
    questions: [
      "האם את בהריון או מניקה?",
      "האם את נוטלת תרופות פוטוסנסיטיביות (מינוציקלין, טטרציקלין)?",
      "האם את נוטלת רואקוטן? (אם כן, האם עצרת לפני 6 חודשים?)",
      "האם יש לך קעקועים באזור הטיפול?",
      "האם היית חשופה לשמש עזה בשבועיים האחרונים?",
      "האם יש לך הרפס חוזר באזור הטיפול?",
      "האם עברת טיפול לייזר בחודש האחרון?",
      "האם יש לך מחלות עור פעילות באזור הטיפול?",
      "האם את סובלת מסוכרת?",
      "האם יש לך נטייה להיצטלקות (קלואידים)?",
    ]
  },
  "peel": {
    title: "הצהרת בריאות — טיפול פילינג",
    questions: [
      "האם את בהריון או מניקה?",
      "האם את נוטלת רואקוטן?",
      "האם יש לך פצעים פתוחים או דלקות עור פעילות?",
      "האם היית חשופה לשמש עזה בשבוע האחרון?",
      "האם יש לך אלרגיה לחומצות (AHA/BHA/TCA)?",
      "האם עברת פילינג בחודש האחרון?",
      "האם יש לך הרפס חוזר בפנים?",
      "האם את נוטלת תרופות מדללות דם?",
      "האם יש לך נטייה להיצטלקות?",
    ]
  },
  // 2026-11-04: the first-visit intake for a facial cosmetician. Cosmetics only (FORM_TYPES in app/beautyos.jsx).
  // It asks and records; it diagnoses nothing and promises nothing.
  "skin_anamnesis": {
    title: "אבחון עור ואנמנזה",
    intro: "כמה שאלות לפני הטיפול הראשון, כדי שאכיר את העור שלך ואתאים לך את הטיפול. זה לוקח בערך חמש דקות.",
    questions: [
      { section: "פרטים כלליים" },
      { q: "מה טווח הגיל שלך?", type: "choice", options: ["עד 19", "20 עד 29", "30 עד 39", "40 עד 49", "50 עד 59", "60 ומעלה"] },
      { q: "במה את עובדת?", type: "text", optional: true },

      { section: "בריאות" },
      { q: "האם את בהריון או מניקה?", type: "yesno" },
      { q: "האם יש לך מחלה כרונית?", type: "multi", options: ["סוכרת", "בלוטת התריס", "לחץ דם", "אוטואימונית", "אחר", "אין"], other: "אחר", none: "אין", flag: true },
      { q: "אילו תרופות את נוטלת באופן קבוע?", type: "text", placeholder: "אם אין, כתבי אין", flag: true },
      { q: "האם נטלת רואקוטן בחצי השנה האחרונה?", type: "yesno" },
      { q: "האם את נוטלת תרופות מדללות דם?", type: "yesno" },
      { q: "האם את מקבלת טיפול הורמונלי או נוטלת גלולות?", type: "yesno" },
      { q: "יש לך אלרגיות ידועות? לאילו חומרים?", type: "text", placeholder: "תרופות, מזון, חומרים קוסמטיים. אם אין, כתבי אין", flag: true },
      { q: "האם יש לך הרפס חוזר?", type: "yesno" },
      { q: "האם יש לך נטייה להיצטלקות (קלואידים)?", type: "yesno" },
      { q: "האם יש לך קוצב לב או שתלים מתכתיים בגוף?", type: "yesno" },
      { q: "האם עברת טיפול בפנים בחודש האחרון?", type: "multi", options: ["בוטוקס", "חומרי מילוי", "לייזר", "פילינג", "אחר", "לא עברתי"], other: "אחר", none: "לא עברתי", flag: true },
      { q: "יש עוד משהו בריאותי שחשוב שאדע?", type: "longtext", optional: true },

      { section: "אורח חיים" },
      { q: "כמה את נחשפת לשמש?", type: "choice", options: ["כמעט לא", "מדי פעם", "הרבה, רוב היום בחוץ"] },
      { q: "כמה את מקפידה על קרם הגנה?", type: "choice", options: ["כל יום", "רק כשאני בשמש", "כמעט אף פעם"] },
      { q: "האם את מעשנת?", type: "choice", options: ["לא", "מדי פעם", "כן"] },
      { q: "כמה מים את שותה ביום?", type: "choice", options: ["עד 4 כוסות", "5 עד 8 כוסות", "9 כוסות ומעלה"] },
      { q: "כמה שעות את ישנה בלילה?", type: "choice", options: ["עד 5 שעות", "6 עד 7 שעות", "8 שעות ומעלה"] },
      { q: "איך רמת הלחץ שלך בתקופה האחרונה?", type: "choice", options: ["נמוכה", "בינונית", "גבוהה"] },

      { section: "העור שלך" },
      { q: "מה סוג העור שלך, לפי התחושה שלך?", type: "choice", options: FORM_SKIN_TYPES },
      { q: "מה מפריע לך בעור?", type: "multi", options: ["אקנה", "פיגמנטציה", "קמטים וקווי הבעה", "אדמומיות", "נקבוביות מורחבות", "יובש", "שומניות", "רגישות", "עיגולים כהים", "אחר"], other: "אחר" },
      { q: "איך העור שלך מגיב למוצרים חדשים?", type: "choice", options: ["בדרך כלל בסדר", "לפעמים אדמומיות או גירוד", "מגיב בקלות, הוא רגיש מאוד"] },
      { q: "אילו טיפולי פנים עשית בעבר, ואיך הרגשת אחריהם?", type: "longtext", optional: true },

      { section: "שגרת טיפוח" },
      { q: "במה את מנקה את הפנים?", type: "choice", options: ["ג'ל או סבון ניקוי", "מים מיסלריים", "מים בלבד", "לא מנקה באופן קבוע"] },
      { q: "האם את משתמשת בחומרים פעילים?", type: "multi", options: ["רטינול", "חומצות", "ויטמין C", "אחר", "לא משתמשת"], other: "אחר", none: "לא משתמשת", flag: true },
      { q: "האם את משתמשת בקרם לחות?", type: "choice", options: ["כל יום", "לפעמים", "לא"] },
      { q: "איזה קרם הגנה את מורחת?", type: "text", optional: true, placeholder: "שם המוצר ומקדם ההגנה, אם יש" },
      { q: "איך את מסירה איפור?", type: "choice", options: ["מסיר איפור ואחריו ניקוי", "מגבונים", "רק מים או סבון", "לא מתאפרת"] },

      { section: "המטרות שלך" },
      { q: "מה היית רוצה שישתנה בעור שלך?", type: "longtext", placeholder: "במילים שלך, מה חשוב לך שנשיג יחד" },

      { section: "הצהרה" },
      { q: "אני מצהירה שכל המידע שמסרתי בטופס נכון ומלא, ושאעדכן אם משהו ישתנה לפני הטיפול הבא.", type: "choice", options: ["מאשרת"] },
    ]
  }
};

// ── Reading a template ────────────────────────────────────────────────────

/** The template for a form_type, or null for one this build does not know (never a guess). */
export const templateFor = (formType: unknown): FormTemplate | null =>
  typeof formType === 'string' && Object.prototype.hasOwnProperty.call(FORMS, formType) ? FORMS[formType] : null;

export const isSection = (item: unknown): item is SectionItem =>
  !!item && typeof item === 'object' && typeof (item as SectionItem).section === 'string';

/** Any question item as an object. A plain string is a required yes/no. A heading returns null. */
export const normalizeQuestion = (item: FormItem): QuestionObject | null => {
  if (typeof item === 'string') return { q: item, type: 'yesno' };
  if (isSection(item)) return null;
  const o = item as QuestionObject;
  const type: QuestionType = (['yesno', 'choice', 'multi', 'text', 'longtext'] as const).includes(o.type) ? o.type : 'yesno';
  return { ...o, type };
};

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/** A multi answer back into its options. */
export const splitMulti = (value: unknown): string[] => str(value).split(MULTI_SEP).map((s) => s.trim()).filter(Boolean);

/**
 * Tap one option of a multi question. The result keeps the template's option order, so the same picks always store
 * the same string. `none` stands alone: picking it clears the rest, picking anything else clears it.
 */
export const toggleMulti = (q: QuestionObject, value: unknown, option: string): string => {
  const options = q.options || [];
  const picked = new Set(splitMulti(value));
  if (picked.has(option)) picked.delete(option);
  else if (q.none && option === q.none) { picked.clear(); picked.add(option); }
  else { picked.add(option); if (q.none) picked.delete(q.none); }
  return options.filter((o) => picked.has(o)).join(MULTI_SEP);
};

export const isAnswered = (item: FormItem, answers: Answers, index: number): boolean => {
  const q = normalizeQuestion(item);
  if (!q) return false;
  const v = str(answers?.[index]);
  if (q.type === 'multi') return splitMulti(v).length > 0;
  return v.trim().length > 0;
};

/** Whether the question's note box is open: "כן" on a yes/no, or `other` picked on a multi. */
export const showsNote = (item: FormItem, answers: Answers, index: number): boolean => {
  const q = normalizeQuestion(item);
  if (!q) return false;
  const v = str(answers?.[index]);
  if (q.type === 'yesno') return v === YES;
  if (q.type === 'multi') return !!q.other && splitMulti(v).includes(q.other);
  return false;
};

/** Indexes of the required questions still without an answer. Headings and optional questions never count. */
export const missingRequired = (tpl: FormTemplate, answers: Answers): number[] =>
  tpl.questions.flatMap((item, i) => {
    const q = normalizeQuestion(item);
    return q && !q.optional && !isAnswered(item, answers, i) ? [i] : [];
  });

/** The progress bar: required questions answered, of required questions. */
export const progressOf = (tpl: FormTemplate, answers: Answers): { done: number; total: number; pct: number } => {
  let total = 0;
  let done = 0;
  tpl.questions.forEach((item, i) => {
    const q = normalizeQuestion(item);
    if (!q || q.optional) return;
    total += 1;
    if (isAnswered(item, answers, i)) done += 1;
  });
  return { done, total, pct: total ? Math.round((done / total) * 100) : 100 };
};

/**
 * What the page sends: strings only, keyed "<index>" and "<index>_note", text trimmed, nothing for an unanswered
 * question, and no note left over from a "כן" she later changed to "לא".
 */
export const answersToStore = (tpl: FormTemplate, answers: Answers): Record<string, string> => {
  const out: Record<string, string> = {};
  tpl.questions.forEach((item, i) => {
    const q = normalizeQuestion(item);
    if (!q) return;
    const v = str(answers?.[i]).trim();
    if (!v) return;
    out[String(i)] = v;
    const note = str(answers?.[`${i}_note`]).trim();
    if (note && showsNote(item, answers, i)) out[`${i}_note`] = note;
  });
  return out;
};

/** "0", "12", "3_note": what /api/forms accepts as an answer key. */
export const ANSWER_KEY_RE = /^\d{1,3}(_note)?$/;
/**
 * The POST check: a plain object of string values under index keys. That is every shape any version of the page has
 * ever sent (the old page sent the same keys), and nothing else gets parked in a client's health record.
 */
export const isStorableAnswers = (answers: unknown): answers is Record<string, string> =>
  !!answers && typeof answers === 'object' && !Array.isArray(answers) &&
  Object.entries(answers as Record<string, unknown>).every(([k, v]) => ANSWER_KEY_RE.test(k) && typeof v === 'string');

// ── The owner's view ──────────────────────────────────────────────────────

export type AnswerRow =
  | { kind: 'section'; title: string }
  | { kind: 'question'; index: number; n: number; q: string; type: QuestionType; answer: string; note: string; flag: boolean; optional: boolean }
  | { kind: 'raw'; key: string; value: string };

// The Arabic and English "none" a client writes when she fills the form in another language (lib/i18n/formTemplatesI18n.ts).
const NONE_WORDS = new Set(['אין', 'לא', 'אין לי', 'לא נוטלת', '-', 'لا يوجد', 'لا', 'لا شيء', 'none', 'no', 'nothing', 'n/a']);
const shown = (v: unknown): string => (v == null ? '' : typeof v === 'string' ? v : typeof v === 'object' ? JSON.stringify(v) : String(v));

/** Whether an answer deserves her attention. See the header. */
export const isFlagged = (q: QuestionObject, answer: string): boolean => {
  const a = answer.trim();
  if (!a) return false;
  if (q.type === 'yesno') return a === YES;
  if (!q.flag) return false;
  if (q.type === 'multi') return splitMulti(a).some((o) => o !== q.none);
  if (q.type === 'text' || q.type === 'longtext') return !NONE_WORDS.has(a.toLowerCase().replace(/^["'“”]+|["'“”.]+$/g, ''));
  return a !== q.none;
};

const keyOrder = (a: string, b: string) => {
  const na = parseInt(a, 10), nb = parseInt(b, 10);
  if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
  return a.localeCompare(b);
};

/**
 * A signed form_data as rows to show: the template's headings and questions in order, each with its answer and note.
 * Old index-keyed answers read against the same template. A form_type this build does not know shows the raw keys
 * and values, as do any keys the template does not explain. Never throws on odd data.
 */
export const answerRows = (formType: unknown, formData: unknown): AnswerRow[] => {
  const data: Record<string, unknown> = formData && typeof formData === 'object' && !Array.isArray(formData) ? (formData as Record<string, unknown>) : {};
  const tpl = templateFor(formType);
  const rows: AnswerRow[] = [];
  const used = new Set<string>();
  if (tpl) {
    let n = 0;
    tpl.questions.forEach((item, i) => {
      if (isSection(item)) { rows.push({ kind: 'section', title: item.section }); return; }
      const q = normalizeQuestion(item);
      if (!q) return;
      n += 1;
      used.add(String(i)); used.add(`${i}_note`);
      const answer = shown(data[String(i)]);
      rows.push({ kind: 'question', index: i, n, q: q.q, type: q.type, answer, note: shown(data[`${i}_note`]), flag: isFlagged(q, answer), optional: !!q.optional });
    });
  }
  Object.keys(data).filter((k) => !used.has(k)).sort(keyOrder).forEach((k) => {
    const value = shown(data[k]);
    if (value) rows.push({ kind: 'raw', key: k, value });
  });
  return rows;
};
