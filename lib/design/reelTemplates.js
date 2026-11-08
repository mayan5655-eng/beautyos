// lib/design/reelTemplates.js
//
// "תבניות רילס": CapCut-style reel templates for her own footage. A template is DATA: a shot list (what to film, how
// close, the light, how long, slow motion or not), the effect on each shot, the transition into it, the words on it
// and how they come in, a colour look, a music mood with a known BPM, and the closing card. The drawing is
// app/design/reelTemplateDraw.js, the music lib/design/reelMusic.js, the screen app/design/ReelTemplates.jsx.
//
// Rules this file keeps (and test-reel-templates.ts pins):
//   * every cut lands on the music's beat grid: slot lengths are counted in beats at the template's own BPM, and
//     when she picks a mood with another BPM they are re-counted in that mood's beats (planTemplateReel), so the
//     reel keeps its pace and the cuts stay on the beat;
//   * the reel stays within "רילס מהצילומים שלי"'s budgets (lib/design/ownReel.js): at most MAX_ITEMS shots, media
//     scenes under MEDIA_BUDGET_MS, a closing card of about END_MS, so the whole reel is at most 30 seconds;
//   * every on-screen line is ours, one line at a time, Hebrew-first, never auto-wrapped, never starting with a digit
//     (.claude/skills/kalmea §4), inside Instagram's safe zone (lib/design/safeZone.ts);
//   * no em or en dashes anywhere, feminine second person in every instruction.
//
// To add a field (facial, brows, hair...): add its group to GROUPS and FIELD_OF_GROUP, then its templates below. The
// engine does not know what lashes are; only the words and the shot list do.

import { MAX_ITEMS, MEDIA_BUDGET_MS, END_MS } from './ownReel.js';
import { MOODS, moodById } from './reelMusic.js';

export { MOODS };

export const GROUPS = ['lashes', 'nails', 'facial'];
export const GROUP_LABELS = { lashes: 'ריסים', nails: 'ציפורניים', facial: 'טיפוח פנים' };
/** Which business field (lib/businessFields.ts) a group belongs to. */
export const FIELD_OF_GROUP = { lashes: 'cosmetics', facial: 'cosmetics', nails: 'nails' };

export const EFFECTS = ['pushin', 'kenburns', 'punch', 'slowmo', 'ramp', 'fast', 'still'];
export const EFFECT_LABELS = {
  pushin: 'זום איטי פנימה', kenburns: 'תנועה עדינה על התמונה', punch: 'זום קופץ על הביט', slowmo: 'הילוך איטי',
  ramp: 'מהיר ואז הילוך איטי', fast: 'מואץ', still: 'יציב',
};
export const TRANSITIONS = ['cut', 'flash', 'dissolve', 'whip', 'slide', 'split'];
export const TRANSITION_LABELS = { cut: 'חיתוך על הביט', flash: 'הבזק', dissolve: 'מעבר רך', whip: 'מעבר מהיר', slide: 'החלקה', split: 'מסך מפוצל לפני ואחרי' };
export const LOOKS = ['warm', 'clean', 'glam', 'moody'];
export const LOOK_LABELS = { warm: 'חם', clean: 'נקי ובהיר', glam: 'זוהר רך', moody: 'דרמטי' };
export const TEXT_STYLES = ['editorial', 'pill', 'highlight', 'minimal', 'bold'];
export const TEXT_STYLE_LABELS = { editorial: 'אותיות נכנסות', pill: 'בועה בצבע שלך', highlight: 'פס הדגשה', minimal: 'עדין', bold: 'גדול ונוקב' };
export const ACCENTS = ['glint', 'sparkle'];
export const POSITIONS = { top: 420, upper: 660, center: 900, lower: 1170, bottom: 1360 };
export const SIZES = { xl: 100, l: 82, m: 64, s: 48 };
export const LINE_MAX = 24;
export const LINE_HEIGHT = 1.28;
/** Top and bottom padding a pill or bar adds around a text block. */
export const TEXT_PAD = 26;
const DISTANCE = { macro: 'מאקרו או זום 2x', close: 'קרוב', medium: 'בינוני, רואים את הידיים' };
export const distanceLabel = (d) => DISTANCE[d] || DISTANCE.close;

// ── The templates ───────────────────────────────────────────────────────────
// slot: { id, media: 'clip'|'photo'|'any', beats, effect, transition (into this slot), accent?,
//         shot: { what, distance, light, slowmo? }, texts?: [{ lines, at (beats into the slot), pos, size?, role? }] }
// variant: { id, label, look, textStyle, mood }. The first variant is the default; its mood's BPM is the template's.

const T = [];
const add = (t) => { T.push(t); return t; };

const RING_FRONT = 'טבעת אור מלפנים, בגובה העיניים';
const RING_TOP = 'טבעת אור מלמעלה, בלי צללים על היד';
const WINDOW = 'אור יום רך מחלון, בלי שמש ישירה';

// ── Lashes ──

add({
  id: 'lash_reveal', group: 'lashes', name: 'חשיפת ריסים', bpm: 80,
  blurb: 'עיניים עצומות, ואז פתיחה איטית שחושפת את הריסים. איטי ואלגנטי.',
  slots: [
    { id: 'closed', media: 'clip', beats: 5, effect: 'pushin', transition: 'cut',
      shot: { what: 'העיניים עצומות, הריסים החדשים במרכז הפריים. הלקוחה שוכבת בנוחות ולא זזה.', distance: 'macro', light: RING_FRONT },
      texts: [{ lines: ['הרגע שלפני'], at: 1, pos: 'top', size: 'l' }] },
    { id: 'open', media: 'clip', beats: 6, effect: 'slowmo', transition: 'flash',
      shot: { what: 'הלקוחה פותחת את העיניים לאט ומרימה מבט אלייך. לצלם בהילוך איטי.', distance: 'macro', light: RING_FRONT, slowmo: true } },
    { id: 'side', media: 'photo', beats: 4, effect: 'kenburns', transition: 'dissolve',
      shot: { what: 'צילום מהצד, בגובה העין, כדי לראות את הקימור ואת האורך.', distance: 'close', light: WINDOW },
      texts: [{ lines: ['קימור טבעי', 'ומבט פתוח'], at: 1, pos: 'bottom', size: 'l' }] },
    { id: 'detail', media: 'any', beats: 4, effect: 'pushin', transition: 'dissolve', accent: 'sparkle',
      shot: { what: 'תקריב של עין אחת, מבט קצת למטה, כדי לראות את הצפיפות.', distance: 'macro', light: RING_FRONT } },
  ],
  variants: [
    { id: 'glam', label: 'זוהר', look: 'glam', textStyle: 'editorial', mood: 'luxe' },
    { id: 'clean', label: 'נקי וספא', look: 'clean', textStyle: 'minimal', mood: 'spa' },
    { id: 'night', label: 'ערב', look: 'moody', textStyle: 'editorial', mood: 'lofi' },
  ],
});

add({
  id: 'lash_before_after', group: 'lashes', name: 'לפני ואחרי', bpm: 120,
  blurb: 'תמונת לפני, מסך מפוצל שנחשף על הביט, ואז התוצאה מכל זווית.',
  slots: [
    { id: 'before', media: 'photo', beats: 5, effect: 'still', transition: 'cut',
      shot: { what: 'העיניים לפני הטיפול, מבט ישר למצלמה. לזכור את הזווית: את אחרי מצלמים בדיוק אותו דבר.', distance: 'close', light: RING_FRONT },
      texts: [{ lines: ['לפני'], at: 0, pos: 'top', size: 'l', role: 'label' }] },
    { id: 'after', media: 'photo', beats: 7, effect: 'kenburns', transition: 'split',
      shot: { what: 'אותה זווית ואותו אור כמו בתמונת לפני, אחרי הטיפול.', distance: 'close', light: RING_FRONT },
      texts: [{ lines: ['אחרי'], at: 3, pos: 'top', size: 'l', role: 'label' }] },
    { id: 'blink', media: 'clip', beats: 6, effect: 'slowmo', transition: 'whip',
      shot: { what: 'הלקוחה ממצמצת לאט או מסובבת את הראש לצד. בהילוך איטי.', distance: 'close', light: RING_FRONT, slowmo: true },
      texts: [{ lines: ['כל ההבדל', 'במבט אחד'], at: 1, pos: 'bottom', size: 'l' }] },
    { id: 'final', media: 'photo', beats: 4, effect: 'punch', transition: 'cut',
      shot: { what: 'תמונה סופית מלפנים, העיניים פקוחות ומבט קצת למעלה.', distance: 'close', light: WINDOW } },
  ],
  variants: [
    { id: 'clean', label: 'נקי', look: 'clean', textStyle: 'highlight', mood: 'pop' },
    { id: 'warm', label: 'חם', look: 'warm', textStyle: 'pill', mood: 'groove' },
    { id: 'glam', label: 'זוהר', look: 'glam', textStyle: 'editorial', mood: 'luxe' },
  ],
});

add({
  id: 'lash_bts', group: 'lashes', name: 'מאחורי הקלעים', bpm: 128,
  blurb: 'הטיפול במהירות כפולה, קאטים חדים, ואז התוצאה בהילוך איטי.',
  slots: [
    { id: 'prep', media: 'clip', beats: 6, effect: 'fast', transition: 'cut',
      shot: { what: 'ההכנה: מדבקות מתחת לעין וניקוי הריסים. מהצד, בגובה המיטה. אפשר טלפון על חצובה.', distance: 'medium', light: RING_TOP },
      texts: [{ lines: ['מאחורי הקלעים'], at: 0, pos: 'top', size: 'l' }] },
    { id: 'work', media: 'clip', beats: 8, effect: 'fast', transition: 'whip',
      shot: { what: 'העבודה עצמה: הידיים שלך והפינצטה בפריים. לצלם רצוף, אנחנו נאיץ.', distance: 'medium', light: RING_TOP },
      texts: [{ lines: ['כל ריס בנפרד'], at: 2, pos: 'bottom', size: 'm' }] },
    { id: 'reveal', media: 'clip', beats: 8, effect: 'ramp', transition: 'flash',
      shot: { what: 'בסוף הטיפול הלקוחה פותחת את העיניים. בהילוך איטי.', distance: 'close', light: RING_FRONT, slowmo: true },
      texts: [{ lines: ['והתוצאה'], at: 3, pos: 'center', size: 'xl' }] },
    { id: 'final', media: 'photo', beats: 6, effect: 'punch', transition: 'cut',
      shot: { what: 'תמונת סיום מלפנים, מבט למעלה.', distance: 'close', light: WINDOW } },
  ],
  variants: [
    { id: 'warm', label: 'חם ומהיר', look: 'warm', textStyle: 'pill', mood: 'energy' },
    { id: 'clean', label: 'נקי', look: 'clean', textStyle: 'bold', mood: 'pop' },
    { id: 'chill', label: 'רגוע', look: 'moody', textStyle: 'minimal', mood: 'lofi' },
  ],
});

add({
  id: 'lash_lift3', group: 'lashes', name: 'הרמת ריסים בשלושה שלבים', bpm: 96,
  blurb: 'כותרת, שלושה שלבים עם החלקה ביניהם, ותוצאה. מסביר ומרשים.',
  slots: [
    { id: 'natural', media: 'photo', beats: 5, effect: 'pushin', transition: 'cut',
      shot: { what: 'הריסים הטבעיים לפני, מבט ישר.', distance: 'close', light: RING_FRONT },
      texts: [{ lines: ['הרמת ריסים', 'בשלושה שלבים'], at: 0, pos: 'top', size: 'l' }] },
    { id: 'lift', media: 'clip', beats: 5, effect: 'fast', transition: 'slide',
      shot: { what: 'שלב ההרמה: הנחת הסיליקון וסירוק הריסים עליו.', distance: 'close', light: RING_TOP },
      texts: [{ lines: ['שלב ראשון', 'הרמה'], at: 0, pos: 'bottom', size: 'm', role: 'step' }] },
    { id: 'tint', media: 'clip', beats: 5, effect: 'fast', transition: 'slide',
      shot: { what: 'שלב הצבע: מריחה עדינה על הריסים.', distance: 'close', light: RING_TOP },
      texts: [{ lines: ['שלב שני', 'צבע'], at: 0, pos: 'bottom', size: 'm', role: 'step' }] },
    { id: 'nourish', media: 'clip', beats: 5, effect: 'slowmo', transition: 'slide',
      shot: { what: 'שלב ההזנה: הסרה עדינה ומריחת סרום. בהילוך איטי אם אפשר.', distance: 'close', light: RING_TOP, slowmo: true },
      texts: [{ lines: ['שלב שלישי', 'הזנה'], at: 0, pos: 'bottom', size: 'm', role: 'step' }] },
    { id: 'result', media: 'photo', beats: 6, effect: 'kenburns', transition: 'flash', accent: 'sparkle',
      shot: { what: 'התוצאה מהצד ומלפנים, מבט קצת למעלה.', distance: 'close', light: WINDOW },
      texts: [{ lines: ['מבט פתוח', 'בלי מסקרה'], at: 1, pos: 'bottom', size: 'l' }] },
  ],
  variants: [
    { id: 'warm', label: 'חם', look: 'warm', textStyle: 'highlight', mood: 'groove' },
    { id: 'clean', label: 'נקי', look: 'clean', textStyle: 'minimal', mood: 'lofi' },
    { id: 'pop', label: 'שמח', look: 'glam', textStyle: 'pill', mood: 'pop' },
  ],
});

add({
  id: 'lash_client', group: 'lashes', name: 'לקוחה מרוצה', bpm: 72,
  blurb: 'התוצאה בהילוך איטי, ואז המשפט שהלקוחה אמרה לך. רך וחם.',
  slots: [
    { id: 'result', media: 'clip', beats: 5, effect: 'slowmo', transition: 'cut',
      shot: { what: 'הלקוחה מסתכלת במראה או מחייכת למצלמה, תנועה איטית של הראש.', distance: 'close', light: WINDOW, slowmo: true } },
    { id: 'detail', media: 'photo', beats: 4, effect: 'kenburns', transition: 'dissolve',
      shot: { what: 'תקריב של הריסים מהצד.', distance: 'macro', light: RING_FRONT } },
    { id: 'quote', media: 'any', beats: 7, effect: 'pushin', transition: 'dissolve',
      shot: { what: 'תמונה רגועה של התוצאה או של העמדה שלך. עליה יופיע המשפט של הלקוחה.', distance: 'close', light: WINDOW },
      texts: [{ lines: ['הריסים הכי יפים', 'שהיו לי אי פעם'], at: 0, pos: 'center', size: 'l', role: 'quote' }, { lines: ['לקוחה מרוצה'], at: 3, pos: 'lower', size: 's' }] },
  ],
  variants: [
    { id: 'soft', label: 'רך', look: 'clean', textStyle: 'editorial', mood: 'spa' },
    { id: 'warm', label: 'חם', look: 'warm', textStyle: 'minimal', mood: 'luxe' },
    { id: 'glam', label: 'זוהר', look: 'glam', textStyle: 'highlight', mood: 'groove' },
  ],
});

add({
  id: 'lash_tips', group: 'lashes', name: 'שלושה טיפים לריסים', bpm: 86,
  blurb: 'סרטון מלמד: כותרת ושלושה טיפים, כל אחד על צילום משלו. נשמר ונשלח הלאה.',
  slots: [
    { id: 'title', media: 'photo', beats: 4, effect: 'pushin', transition: 'cut',
      shot: { what: 'תמונה יפה של ריסים אחרי טיפול. עליה תופיע הכותרת.', distance: 'close', light: RING_FRONT },
      texts: [{ lines: ['שלושה טיפים', 'לריסים שמחזיקים'], at: 0, pos: 'center', size: 'l', role: 'title' }] },
    { id: 'tip1', media: 'any', beats: 5, effect: 'kenburns', transition: 'slide',
      shot: { what: 'משהו שקשור לטיפ הראשון, למשל יד ליד העין.', distance: 'close', light: WINDOW },
      texts: [{ lines: ['טיפ ראשון', 'לא לשפשף את העיניים'], at: 0, pos: 'bottom', size: 'm', role: 'step' }] },
    { id: 'tip2', media: 'any', beats: 5, effect: 'kenburns', transition: 'slide',
      shot: { what: 'מברשת ריסים או סירוק עדין.', distance: 'macro', light: WINDOW },
      texts: [{ lines: ['טיפ שני', 'לסרק בעדינות כל בוקר'], at: 0, pos: 'bottom', size: 'm', role: 'step' }] },
    { id: 'tip3', media: 'any', beats: 5, effect: 'kenburns', transition: 'slide',
      shot: { what: 'מוצרי ניקוי עדינים על משטח נקי.', distance: 'close', light: WINDOW },
      texts: [{ lines: ['טיפ שלישי', 'בלי שמן ליד העיניים'], at: 0, pos: 'bottom', size: 'm', role: 'step' }] },
    { id: 'save', media: 'photo', beats: 4, effect: 'pushin', transition: 'dissolve',
      shot: { what: 'התוצאה מלפנים.', distance: 'close', light: RING_FRONT },
      texts: [{ lines: ['שמרי את הסרטון', 'לפעם הבאה'], at: 0, pos: 'center', size: 'l' }] },
  ],
  variants: [
    { id: 'clean', label: 'נקי', look: 'clean', textStyle: 'minimal', mood: 'lofi' },
    { id: 'warm', label: 'חם', look: 'warm', textStyle: 'highlight', mood: 'groove' },
    { id: 'calm', label: 'רגוע', look: 'moody', textStyle: 'pill', mood: 'spa' },
  ],
});

add({
  id: 'lash_qa', group: 'lashes', name: 'שאלות ותשובות', bpm: 96,
  blurb: 'שלוש שאלות שלקוחות שואלות, תשובה קצרה לכל אחת. הרבה טקסט, קצב רגוע.',
  slots: [
    { id: 'q1', media: 'any', beats: 7, effect: 'pushin', transition: 'cut',
      shot: { what: 'צילום רגוע שלך בעבודה או של העמדה. עליו השאלה הראשונה.', distance: 'medium', light: WINDOW },
      texts: [{ lines: ['כמה זמן זה מחזיק?'], at: 0, pos: 'upper', size: 'm', role: 'question' }, { lines: ['תלוי בקצב הצמיחה', 'של הריסים שלך'], at: 3, pos: 'lower', size: 'm', role: 'answer' }] },
    { id: 'q2', media: 'any', beats: 7, effect: 'pushin', transition: 'dissolve',
      shot: { what: 'הלקוחה שוכבת בנוחות על המיטה, עיניים עצומות.', distance: 'medium', light: WINDOW },
      texts: [{ lines: ['זה כואב?'], at: 0, pos: 'upper', size: 'm', role: 'question' }, { lines: ['בכלל לא', 'הרבה לקוחות נרדמות'], at: 3, pos: 'lower', size: 'm', role: 'answer' }] },
    { id: 'q3', media: 'any', beats: 7, effect: 'pushin', transition: 'dissolve',
      shot: { what: 'תקריב של התוצאה.', distance: 'close', light: RING_FRONT },
      texts: [{ lines: ['מתי אפשר להתאפר?'], at: 0, pos: 'upper', size: 'm', role: 'question' }, { lines: ['כדאי לחכות יממה', 'ואז בלי מסקרה שומנית'], at: 3, pos: 'lower', size: 'm', role: 'answer' }] },
    { id: 'more', media: 'photo', beats: 4, effect: 'kenburns', transition: 'dissolve',
      shot: { what: 'התוצאה הכי יפה שלך.', distance: 'close', light: RING_FRONT },
      texts: [{ lines: ['עוד שאלות?', 'כתבי לי בהודעה'], at: 0, pos: 'center', size: 'l' }] },
  ],
  variants: [
    { id: 'moody', label: 'ערב', look: 'moody', textStyle: 'pill', mood: 'groove' },
    { id: 'clean', label: 'נקי', look: 'clean', textStyle: 'editorial', mood: 'spa' },
    { id: 'warm', label: 'חם', look: 'warm', textStyle: 'minimal', mood: 'lofi' },
  ],
});

add({
  id: 'lash_promo', group: 'lashes', name: 'מבצע בקאט מהיר', bpm: 128,
  blurb: 'קאטים קצרים על כל ביט, הבזקים, ומילים גדולות. רילס של מבצע או הטבה.',
  slots: [
    { id: 'hook', media: 'any', beats: 4, effect: 'punch', transition: 'cut',
      shot: { what: 'התוצאה הכי מרשימה שלך, קרוב.', distance: 'close', light: RING_FRONT },
      texts: [{ lines: ['מבצע'], at: 0, pos: 'center', size: 'xl', role: 'title' }] },
    { id: 'c2', media: 'any', beats: 2, effect: 'punch', transition: 'flash',
      shot: { what: 'ריסים מזווית אחרת.', distance: 'macro', light: RING_FRONT } },
    { id: 'c3', media: 'any', beats: 2, effect: 'punch', transition: 'whip',
      shot: { what: 'עוד לקוחה או עוד זווית.', distance: 'close', light: RING_FRONT } },
    { id: 'c4', media: 'any', beats: 2, effect: 'punch', transition: 'flash',
      shot: { what: 'הידיים שלך בעבודה, שנייה אחת מספיקה.', distance: 'medium', light: RING_TOP } },
    { id: 'c5', media: 'any', beats: 2, effect: 'punch', transition: 'whip',
      shot: { what: 'תקריב מאקרו של ריסים.', distance: 'macro', light: RING_FRONT } },
    { id: 'offer', media: 'clip', beats: 10, effect: 'slowmo', transition: 'flash',
      shot: { what: 'הלקוחה פותחת עיניים או מחייכת. בהילוך איטי.', distance: 'close', light: RING_FRONT, slowmo: true },
      texts: [{ lines: ['הטבה לתור הראשון'], at: 0, pos: 'top', size: 'l', role: 'title' }, { lines: ['השבוע בלבד'], at: 4, pos: 'bottom', size: 'm' }] },
  ],
  variants: [
    { id: 'glam', label: 'זוהר', look: 'glam', textStyle: 'bold', mood: 'energy' },
    { id: 'warm', label: 'חם', look: 'warm', textStyle: 'pill', mood: 'pop' },
    { id: 'night', label: 'לילה', look: 'moody', textStyle: 'bold', mood: 'groove' },
  ],
});

// ── Nails ──

const NAIL_SURFACE = 'היד על משטח ניטרלי עם טקסטורה (שיש, פשתן, עץ בהיר)';

add({
  id: 'nail_reveal', group: 'nails', name: 'חשיפת הציפורניים', bpm: 80,
  blurb: 'יד שמסתובבת לאט במאקרו, ונגמר בברק שעובר על הציפורניים.',
  slots: [
    { id: 'turn', media: 'clip', beats: 6, effect: 'slowmo', transition: 'cut',
      shot: { what: `${NAIL_SURFACE}. מסובבת את היד לאט מצד לצד. בהילוך איטי.`, distance: 'macro', light: RING_TOP, slowmo: true },
      texts: [{ lines: ['עבודת יד'], at: 1, pos: 'top', size: 'l' }] },
    { id: 'detail', media: 'photo', beats: 4, effect: 'pushin', transition: 'dissolve',
      shot: { what: 'תקריב של שתיים או שלוש ציפורניים, האצבעות קצת מכופפות.', distance: 'macro', light: RING_TOP } },
    { id: 'shine', media: 'clip', beats: 6, effect: 'slowmo', transition: 'flash', accent: 'glint',
      shot: { what: 'תנועה קטנה של האצבעות מול האור, כדי לתפוס את הברק. בהילוך איטי.', distance: 'macro', light: RING_TOP, slowmo: true },
      texts: [{ lines: ['הברק שנשאר'], at: 2, pos: 'bottom', size: 'l' }] },
    { id: 'hands', media: 'photo', beats: 4, effect: 'kenburns', transition: 'dissolve', accent: 'sparkle',
      shot: { what: 'שתי הידיים יחד על המשטח, מלמעלה.', distance: 'close', light: RING_TOP } },
  ],
  variants: [
    { id: 'glam', label: 'זוהר', look: 'glam', textStyle: 'editorial', mood: 'luxe' },
    { id: 'clean', label: 'נקי', look: 'clean', textStyle: 'minimal', mood: 'spa' },
    { id: 'night', label: 'ערב', look: 'moody', textStyle: 'editorial', mood: 'lofi' },
  ],
});

add({
  id: 'nail_before_after', group: 'nails', name: 'לפני ואחרי', bpm: 96,
  blurb: 'הציפורניים לפני, מסך מפוצל שנחשף, ואז היד מסתובבת עם התוצאה.',
  slots: [
    { id: 'before', media: 'photo', beats: 5, effect: 'still', transition: 'cut',
      shot: { what: `${NAIL_SURFACE}, לפני הטיפול. לזכור את הזווית: את אחרי מצלמים בדיוק אותו דבר.`, distance: 'close', light: RING_TOP },
      texts: [{ lines: ['לפני'], at: 0, pos: 'top', size: 'l', role: 'label' }] },
    { id: 'after', media: 'photo', beats: 7, effect: 'kenburns', transition: 'split',
      shot: { what: 'אותה יד, אותה זווית ואותו אור, אחרי.', distance: 'close', light: RING_TOP },
      texts: [{ lines: ['אחרי'], at: 3, pos: 'top', size: 'l', role: 'label' }] },
    { id: 'turn', media: 'clip', beats: 6, effect: 'slowmo', transition: 'whip', accent: 'glint',
      shot: { what: 'היד מסתובבת לאט מול האור. בהילוך איטי.', distance: 'macro', light: RING_TOP, slowmo: true },
      texts: [{ lines: ['מהבסיס', 'ועד הברק'], at: 1, pos: 'bottom', size: 'l' }] },
    { id: 'final', media: 'photo', beats: 4, effect: 'punch', transition: 'cut',
      shot: { what: 'תמונה סופית מלמעלה, היד פרושה.', distance: 'close', light: RING_TOP } },
  ],
  variants: [
    { id: 'clean', label: 'נקי', look: 'clean', textStyle: 'highlight', mood: 'groove' },
    { id: 'pop', label: 'שמח', look: 'warm', textStyle: 'pill', mood: 'pop' },
    { id: 'glam', label: 'זוהר', look: 'glam', textStyle: 'editorial', mood: 'luxe' },
  ],
});

add({
  id: 'nail_process', group: 'nails', name: 'תהליך בזמן מהיר', bpm: 120,
  blurb: 'הכנה, צבע וגימור במהירות כפולה, ואז האטה דרמטית על התוצאה.',
  slots: [
    { id: 'prep', media: 'clip', beats: 6, effect: 'fast', transition: 'cut',
      shot: { what: 'ההכנה: פצירה וטיפול בעור. טלפון על חצובה מלמעלה, לצלם רצוף.', distance: 'medium', light: RING_TOP },
      texts: [{ lines: ['הכנה'], at: 0, pos: 'top', size: 'l', role: 'step' }] },
    { id: 'color', media: 'clip', beats: 6, effect: 'fast', transition: 'whip',
      shot: { what: 'מריחת הצבע, ציפורן אחרי ציפורן. מאותה זווית.', distance: 'medium', light: RING_TOP },
      texts: [{ lines: ['צבע'], at: 0, pos: 'top', size: 'l', role: 'step' }] },
    { id: 'finish', media: 'clip', beats: 8, effect: 'ramp', transition: 'whip', accent: 'glint',
      shot: { what: 'שכבת הגימור ואז היד מסתובבת מול האור. את הסוף בהילוך איטי.', distance: 'macro', light: RING_TOP, slowmo: true },
      texts: [{ lines: ['גימור'], at: 0, pos: 'top', size: 'l', role: 'step' }] },
    { id: 'result', media: 'photo', beats: 4, effect: 'punch', transition: 'flash',
      shot: { what: 'התוצאה מלמעלה על המשטח.', distance: 'close', light: RING_TOP } },
  ],
  variants: [
    { id: 'warm', label: 'חם', look: 'warm', textStyle: 'pill', mood: 'pop' },
    { id: 'club', label: 'מועדון', look: 'moody', textStyle: 'bold', mood: 'energy' },
    { id: 'clean', label: 'נקי', look: 'clean', textStyle: 'minimal', mood: 'groove' },
  ],
});

add({
  id: 'nail_color', group: 'nails', name: 'עיצוב הצבע', bpm: 86,
  blurb: 'הבקבוק או דוגמית הצבע, משיכת המכחול הראשונה, ואז התוצאה.',
  slots: [
    { id: 'swatch', media: 'photo', beats: 5, effect: 'pushin', transition: 'cut',
      shot: { what: 'הבקבוק או דוגמית הצבע על המשטח, קרוב מאוד.', distance: 'macro', light: RING_TOP },
      texts: [{ lines: ['הגוון של החודש'], at: 1, pos: 'center', size: 'l' }] },
    { id: 'stroke', media: 'clip', beats: 6, effect: 'slowmo', transition: 'slide',
      shot: { what: 'משיכת המכחול הראשונה על ציפורן אחת. בהילוך איטי.', distance: 'macro', light: RING_TOP, slowmo: true } },
    { id: 'result', media: 'photo', beats: 5, effect: 'kenburns', transition: 'dissolve', accent: 'glint',
      shot: { what: `${NAIL_SURFACE}, כל הציפורניים צבועות.`, distance: 'close', light: RING_TOP },
      texts: [{ lines: ['מהבקבוק', 'אל הציפורניים'], at: 1, pos: 'bottom', size: 'l' }] },
    { id: 'pair', media: 'any', beats: 4, effect: 'pushin', transition: 'dissolve',
      shot: { what: 'היד ליד הבקבוק, כדי לראות שהגוון זהה.', distance: 'close', light: RING_TOP } },
  ],
  variants: [
    { id: 'clean', label: 'נקי', look: 'clean', textStyle: 'minimal', mood: 'lofi' },
    { id: 'glam', label: 'זוהר', look: 'glam', textStyle: 'highlight', mood: 'luxe' },
    { id: 'warm', label: 'חם', look: 'warm', textStyle: 'editorial', mood: 'groove' },
  ],
});

add({
  id: 'nail_season', group: 'nails', name: 'ציפורניים לעונה', bpm: 72,
  blurb: 'העבודה שלך עם כותרת של העונה, רך ונוצץ. מתאים לפתיחת עונה או לחג.',
  slots: [
    { id: 'hero', media: 'photo', beats: 5, effect: 'kenburns', transition: 'cut', accent: 'sparkle',
      shot: { what: `${NAIL_SURFACE}, עם פריט של העונה ליד (עלה, פרח, צעיף).`, distance: 'close', light: WINDOW },
      texts: [{ lines: ['הצבעים של', '{season}'], at: 0, pos: 'top', size: 'l', role: 'title' }] },
    { id: 'turn', media: 'clip', beats: 5, effect: 'slowmo', transition: 'dissolve',
      shot: { what: 'היד מסתובבת לאט. בהילוך איטי.', distance: 'macro', light: WINDOW, slowmo: true } },
    { id: 'detail', media: 'photo', beats: 4, effect: 'pushin', transition: 'dissolve', accent: 'sparkle',
      shot: { what: 'תקריב של העיצוב.', distance: 'macro', light: RING_TOP } },
    { id: 'ready', media: 'any', beats: 4, effect: 'kenburns', transition: 'dissolve',
      shot: { what: 'שתי הידיים יחד, אפשר עם כוס קפה או ספר.', distance: 'close', light: WINDOW },
      texts: [{ lines: ['מוכנה לעונה?'], at: 1, pos: 'bottom', size: 'l' }] },
  ],
  variants: [
    { id: 'warm', label: 'חם', look: 'warm', textStyle: 'editorial', mood: 'spa' },
    { id: 'glam', label: 'נוצץ', look: 'glam', textStyle: 'pill', mood: 'pop' },
    { id: 'clean', label: 'נקי', look: 'clean', textStyle: 'minimal', mood: 'luxe' },
  ],
});

add({
  id: 'nail_tips', group: 'nails', name: 'שלושה טיפים לציפורניים', bpm: 86,
  blurb: 'סרטון מלמד: כותרת ושלושה טיפים לשמור על הלק. נשמר ונשלח הלאה.',
  slots: [
    { id: 'title', media: 'photo', beats: 4, effect: 'pushin', transition: 'cut',
      shot: { what: 'העבודה הכי יפה שלך מלמעלה. עליה תופיע הכותרת.', distance: 'close', light: RING_TOP },
      texts: [{ lines: ['שלושה טיפים', 'ללק שמחזיק'], at: 0, pos: 'center', size: 'l', role: 'title' }] },
    { id: 'tip1', media: 'any', beats: 5, effect: 'kenburns', transition: 'whip',
      shot: { what: 'בקבוק שמן ציפורניים או מריחה שלו.', distance: 'macro', light: RING_TOP },
      texts: [{ lines: ['טיפ ראשון', 'שמן ציפורניים כל ערב'], at: 0, pos: 'bottom', size: 'm', role: 'step' }] },
    { id: 'tip2', media: 'any', beats: 5, effect: 'kenburns', transition: 'whip',
      shot: { what: 'כפפות לעבודות הבית ליד היד.', distance: 'close', light: WINDOW },
      texts: [{ lines: ['טיפ שני', 'כפפות לעבודות הבית'], at: 0, pos: 'bottom', size: 'm', role: 'step' }] },
    { id: 'tip3', media: 'any', beats: 5, effect: 'kenburns', transition: 'whip',
      shot: { what: 'יד שפותחת פחית או מדבקה, כדי להמחיש.', distance: 'close', light: WINDOW },
      texts: [{ lines: ['טיפ שלישי', 'הציפורן היא לא כלי'], at: 0, pos: 'bottom', size: 'm', role: 'step' }] },
    { id: 'save', media: 'photo', beats: 4, effect: 'pushin', transition: 'flash',
      shot: { what: 'התוצאה קרוב.', distance: 'macro', light: RING_TOP },
      texts: [{ lines: ['שמרי את הסרטון', 'ותגידי לחברה'], at: 0, pos: 'center', size: 'l' }] },
  ],
  variants: [
    { id: 'warm', label: 'חם', look: 'warm', textStyle: 'highlight', mood: 'lofi' },
    { id: 'clean', label: 'נקי', look: 'clean', textStyle: 'minimal', mood: 'groove' },
    { id: 'pop', label: 'שמח', look: 'glam', textStyle: 'pill', mood: 'pop' },
  ],
});

add({
  id: 'nail_trend', group: 'nails', name: 'קאט מהיר', bpm: 128,
  blurb: 'רילס טרנדי: חיתוך על כל ביט, מילה אחת בכל קאט, הבזקים. הכי מהיר שיש.',
  slots: [
    { id: 'c1', media: 'any', beats: 3, effect: 'punch', transition: 'cut',
      shot: { what: 'העיצוב הכי בולט שלך, קרוב.', distance: 'macro', light: RING_TOP },
      texts: [{ lines: ['צבע'], at: 0, pos: 'center', size: 'xl', role: 'title' }] },
    { id: 'c2', media: 'any', beats: 3, effect: 'punch', transition: 'flash',
      shot: { what: 'עיצוב אחר, זווית אחרת.', distance: 'macro', light: RING_TOP },
      texts: [{ lines: ['צורה'], at: 0, pos: 'center', size: 'xl', role: 'title' }] },
    { id: 'c3', media: 'any', beats: 3, effect: 'punch', transition: 'whip',
      shot: { what: 'יד מסתובבת, שנייה אחת.', distance: 'macro', light: RING_TOP },
      texts: [{ lines: ['ברק'], at: 0, pos: 'center', size: 'xl', role: 'title' }] },
    { id: 'c4', media: 'any', beats: 2, effect: 'punch', transition: 'flash',
      shot: { what: 'עוד עיצוב.', distance: 'macro', light: RING_TOP } },
    { id: 'c5', media: 'any', beats: 2, effect: 'punch', transition: 'whip',
      shot: { what: 'עוד עיצוב, או הבקבוק.', distance: 'macro', light: RING_TOP } },
    { id: 'end', media: 'clip', beats: 8, effect: 'ramp', transition: 'flash', accent: 'glint',
      shot: { what: 'היד מסתובבת לאט מול האור. בהילוך איטי.', distance: 'macro', light: RING_TOP, slowmo: true },
      texts: [{ lines: ['איזה מהם הכי שלך?'], at: 2, pos: 'bottom', size: 'm' }] },
  ],
  variants: [
    { id: 'club', label: 'מועדון', look: 'moody', textStyle: 'bold', mood: 'energy' },
    { id: 'pop', label: 'פופ', look: 'glam', textStyle: 'bold', mood: 'pop' },
    { id: 'warm', label: 'חם', look: 'warm', textStyle: 'highlight', mood: 'groove' },
  ],
});

// ── Facial ──

add({
  id: 'facial_glow', group: 'facial', name: 'זוהר אחרי טיפול', bpm: 72,
  blurb: 'עור זוהר באור צד, נצנוץ עדין ותקריב. רגוע וספא.',
  slots: [
    { id: 'side', media: 'clip', beats: 6, effect: 'slowmo', transition: 'cut',
      shot: { what: 'הלקוחה מסובבת את הפנים לאט אל האור, אחרי הטיפול. בהילוך איטי.', distance: 'close', light: 'אור צד רך מחלון, כדי לראות את הזוהר', slowmo: true },
      texts: [{ lines: ['העור אחרי'], at: 1, pos: 'top', size: 'l' }] },
    { id: 'glow', media: 'photo', beats: 5, effect: 'kenburns', transition: 'dissolve', accent: 'sparkle',
      shot: { what: 'תקריב של הלחי והעצם, איפה שהאור נשבר.', distance: 'macro', light: 'אור צד רך מחלון' },
      texts: [{ lines: ['זוהר טבעי'], at: 1, pos: 'bottom', size: 'l' }] },
    { id: 'calm', media: 'any', beats: 5, effect: 'pushin', transition: 'dissolve',
      shot: { what: 'הלקוחה מחייכת או נוגעת בעדינות בפנים.', distance: 'close', light: WINDOW } },
  ],
  variants: [
    { id: 'spa', label: 'ספא', look: 'clean', textStyle: 'editorial', mood: 'spa' },
    { id: 'warm', label: 'חם', look: 'warm', textStyle: 'minimal', mood: 'luxe' },
  ],
});

add({
  id: 'facial_ritual', group: 'facial', name: 'טקס טיפוח', bpm: 80,
  blurb: 'ארבעה רגעים מהטיפול, מעברים רכים ומילה אחת על כל רגע. יוקרתי ושקט.',
  slots: [
    { id: 'cleanse', media: 'clip', beats: 5, effect: 'slowmo', transition: 'cut',
      shot: { what: 'הניקוי: הידיים שלך על הפנים, תנועה איטית.', distance: 'medium', light: 'אור חם ועמום, נר או מנורה ברקע', slowmo: true },
      texts: [{ lines: ['ניקוי'], at: 1, pos: 'bottom', size: 'm', role: 'step' }] },
    { id: 'mask', media: 'clip', beats: 5, effect: 'pushin', transition: 'dissolve',
      shot: { what: 'מריחת המסכה במכחול.', distance: 'close', light: 'אור חם ועמום' },
      texts: [{ lines: ['מסכה'], at: 1, pos: 'bottom', size: 'm', role: 'step' }] },
    { id: 'massage', media: 'clip', beats: 5, effect: 'slowmo', transition: 'dissolve',
      shot: { what: 'עיסוי פנים, הידיים שלך בתנועה רכה.', distance: 'medium', light: 'אור חם ועמום', slowmo: true },
      texts: [{ lines: ['עיסוי'], at: 1, pos: 'bottom', size: 'm', role: 'step' }] },
    { id: 'glow', media: 'photo', beats: 5, effect: 'kenburns', transition: 'dissolve', accent: 'sparkle',
      shot: { what: 'הפנים בסוף הטיפול, רגועות.', distance: 'close', light: WINDOW },
      texts: [{ lines: ['זמן לעצמך'], at: 1, pos: 'center', size: 'l' }] },
  ],
  variants: [
    { id: 'luxe', label: 'יוקרתי', look: 'moody', textStyle: 'editorial', mood: 'luxe' },
    { id: 'spa', label: 'ספא', look: 'clean', textStyle: 'minimal', mood: 'spa' },
  ],
});

add({
  id: 'facial_before_after', group: 'facial', name: 'עור לפני ואחרי', bpm: 96,
  blurb: 'לפני, מסך מפוצל, ואחרי. לטיפולי פנים, אקנה ופיגמנטציה.',
  slots: [
    { id: 'before', media: 'photo', beats: 5, effect: 'still', transition: 'cut',
      shot: { what: 'האזור המטופל לפני, בלי איפור. לזכור את הזווית ואת המרחק.', distance: 'close', light: WINDOW },
      texts: [{ lines: ['לפני'], at: 0, pos: 'top', size: 'l', role: 'label' }] },
    { id: 'after', media: 'photo', beats: 7, effect: 'kenburns', transition: 'split',
      shot: { what: 'אותו אזור, אותה זווית ואותו אור, אחרי.', distance: 'close', light: WINDOW },
      texts: [{ lines: ['אחרי'], at: 3, pos: 'top', size: 'l', role: 'label' }] },
    { id: 'smile', media: 'any', beats: 5, effect: 'pushin', transition: 'dissolve',
      shot: { what: 'הלקוחה מחייכת, הפנים כולן בפריים.', distance: 'close', light: WINDOW },
      texts: [{ lines: ['עור שמרגיש טוב'], at: 1, pos: 'bottom', size: 'l' }] },
  ],
  variants: [
    { id: 'clean', label: 'נקי', look: 'clean', textStyle: 'highlight', mood: 'groove' },
    { id: 'warm', label: 'חם', look: 'warm', textStyle: 'editorial', mood: 'spa' },
  ],
});

export const REEL_TEMPLATES = T;
export const getReelTemplate = (id) => T.find((t) => t.id === id) || null;

// ── Fields ──────────────────────────────────────────────────────────────────

/** The groups in the order she sees them: her own field first. Everyone can browse all of them. */
export function groupsFor(fields) {
  const f = Array.isArray(fields) ? fields : [];
  const nails = f.includes('nails'), cosmetics = f.includes('cosmetics') || !nails;
  if (nails && !cosmetics) return ['nails', 'lashes', 'facial'];
  if (nails && cosmetics) return ['lashes', 'nails', 'facial'];
  return ['lashes', 'facial', 'nails'];
}

export const templatesIn = (group) => T.filter((t) => t.group === group);

/** Every template, her field's first (by groupsFor), each group in its own order. */
export function templatesFor(fields) {
  return groupsFor(fields).flatMap(templatesIn);
}

// ── Words ───────────────────────────────────────────────────────────────────

/** The season word for a date (Israel): a nail template's "הצבעים של {season}". */
export function seasonWord(date = new Date()) {
  const m = date.getMonth(); // 0 = January
  if (m === 11 || m <= 1) return 'החורף';
  if (m <= 4) return 'האביב';
  if (m <= 8) return 'הקיץ';
  return 'הסתיו';
}

/** One line as it will be drawn: spaces collapsed, cut to LINE_MAX. */
export const tidyLine = (s) => Array.from(String(s ?? '').replace(/\s+/g, ' ').trim()).slice(0, LINE_MAX).join('').trim();

/** Key of a text overlay, for her edits: `${slotId}.${index}`. */
export const textKey = (slot, j) => `${slot.id}.${j}`;

/**
 * The words of every overlay, hers where she edited them. `edits[key]` is an array of lines (an empty array or all
 * empty lines = that overlay is off). `{season}` becomes the season of `date`.
 */
export function resolveTexts(tpl, { edits = {}, date = new Date() } = {}) {
  const season = seasonWord(date);
  return tpl.slots.map((slot) => (slot.texts || []).map((tx, j) => {
    const key = textKey(slot, j);
    const mine = Array.isArray(edits[key]) ? edits[key] : null;
    const lines = (mine ?? tx.lines.map((l) => l.replace('{season}', season))).map(tidyLine).filter(Boolean);
    return { ...tx, key, lines };
  }));
}

/** Does a line start with Hebrew (or carry no letters at all)? A line that opens with a digit or Latin flips to LTR. */
export const hebrewFirst = (s) => {
  const m = String(s).match(/[A-Za-z0-9֐-׿]/);
  return !m || /[֐-׿]/.test(m[0]);
};

// ── Timing: beats, effects, clip speed ─────────────────────────────────────

export const beatMsOf = (bpm) => 60000 / bpm;
const smooth = (x) => { const t = Math.max(0, Math.min(1, x)); return t * t * (3 - 2 * t); };

/** How fast her clip plays at `p` (0..1) through the slot, for an effect. Photos ignore it. */
export function rateAt(effect, p) {
  if (effect === 'slowmo') return 0.5;
  if (effect === 'fast') return p < 0.72 ? 3 : 3 - 2 * smooth((p - 0.72) / 0.28);
  if (effect === 'ramp') return p < 0.38 ? 1.8 : p < 0.55 ? 1.8 - 1.45 * smooth((p - 0.38) / 0.17) : 0.35;
  return 1;
}

const STEPS = 96;
/** Source milliseconds consumed by `inMs` of a slot `ms` long, before any slow-down to fit a short clip. */
function consumed(effect, inMs, ms) {
  if (!(ms > 0) || inMs <= 0) return 0;
  const end = Math.min(inMs, ms);
  const n = Math.max(2, Math.ceil((STEPS * end) / ms));
  const dt = end / n;
  let acc = 0;
  for (let i = 0; i < n; i++) acc += rateAt(effect, ((i + 0.5) * dt) / ms) * dt;
  return acc;
}

/**
 * How much of her clip a slot needs, and the factor that slows it down when the clip is shorter (never below 1/4:
 * past that the last frame holds). clipMs 0 = unknown, taken as long enough.
 */
export function clipPlan(effect, ms, clipMs = 0) {
  const needMs = consumed(effect, ms, ms);
  const k = clipMs > 0 && needMs > clipMs - 40 ? Math.max(0.25, (clipMs - 40) / needMs) : 1;
  return { needMs, k };
}

/** Where in her clip (ms) the frame `inMs` into the slot comes from. */
export const sourceMsAt = (effect, inMs, ms, k = 1) => k * consumed(effect, inMs, ms);

/** How many seconds to film for a slot, rounded up with a little spare: what the shot list tells her. */
export const filmSeconds = (slot, bpm) => Math.ceil((clipPlan(slot.effect, slot.beats * beatMsOf(bpm)).needMs) / 1000 + 0.5);

/** Zoom of the picture at `p` through the slot; `beatPhase` 0..1 inside the current beat (for the punch). */
export function zoomAt(effect, p, inMs = 0, beatPhase = 0) {
  const e = smooth(p);
  switch (effect) {
    case 'pushin': return 1 + 0.12 * e;
    case 'kenburns': return 1.06 + 0.08 * p;
    case 'punch': return 1 + 0.16 * Math.exp(-inMs / 170) + 0.025 * Math.exp(-beatPhase * 6);
    case 'slowmo': return 1.02 + 0.06 * e;
    case 'ramp': return 1 + 0.1 * e;
    case 'fast': return 1.04;
    default: return 1 + 0.02 * p;
  }
}
/** Sideways drift (-1..1 of the spare width) for the Ken Burns move; alternates by slot. */
export const driftAt = (effect, p, slotIndex) => (effect === 'kenburns' ? (slotIndex % 2 ? 0.35 : -0.35) * (p - 0.5) * 2 : 0);

/** Length of the transition into a slot, in ms, at this beat length. Cuts are 0: they ARE the beat. */
export function transitionMs(kind, beatMs) {
  switch (kind) {
    case 'flash': return Math.min(260, beatMs * 0.5);
    case 'dissolve': return Math.min(700, beatMs);
    case 'whip': return Math.min(300, beatMs * 0.6);
    case 'slide': return Math.min(480, beatMs * 0.8);
    case 'split': return beatMs * 2;
    default: return 0;
  }
}

// ── The timeline ────────────────────────────────────────────────────────────

/**
 * The reel's timeline for a template at a tempo. Slot lengths are counted in beats at the template's own BPM and
 * re-counted in `bpm`'s beats (so a template keeps its pace in seconds and every cut lands on the beat). When the
 * media would run past MEDIA_BUDGET_MS, the longest slots give up a beat at a time. The closing card is the whole
 * number of beats closest to END_MS without going over (at least two).
 * @param {object} tpl a template
 * @param {{ bpm?: number, items?: ({ kind: 'photo'|'video', durationMs?: number } | null)[], texts?: ReturnType<typeof resolveTexts> }} [opts]
 */
export function planTemplateReel(tpl, { bpm, items = [], texts } = {}) {
  const tempo = Number(bpm) > 0 ? Number(bpm) : tpl.bpm;
  const beat = beatMsOf(tempo);
  const native = beatMsOf(tpl.bpm);
  const slots = tpl.slots.slice(0, MAX_ITEMS);
  const beats = slots.map((s) => Math.max(1, Math.round((s.beats * native) / beat)));
  while (beats.reduce((a, b) => a + b, 0) * beat > MEDIA_BUDGET_MS) {
    const i = beats.indexOf(Math.max(...beats));
    if (beats[i] <= 1) break;
    beats[i] -= 1;
  }
  const words = texts || resolveTexts(tpl);
  const scenes = [];
  let at = 0;
  slots.forEach((slot, i) => {
    const startMs = Math.round(at * beat), endMs = Math.round((at + beats[i]) * beat);
    const ms = endMs - startMs;
    const item = items[i] || null;
    const kind = item ? (item.kind === 'video' ? 'video' : 'photo') : slot.media === 'photo' ? 'photo' : 'video';
    const transition = i === 0 ? 'cut' : slot.transition;
    const clip = kind === 'video' ? clipPlan(slot.effect, ms, Number(item?.durationMs) || 0) : { needMs: 0, k: 1 };
    scenes.push({
      kind, slot: i, item: i, startMs, ms, beats: beats[i], effect: slot.effect, accent: slot.accent || null,
      transition, transMs: transitionMs(transition, beat), clip,
      texts: (words[i] || []).filter((t) => t.lines.length).map((t) => ({
        key: t.key, lines: t.lines, pos: t.pos, size: t.size || 'm', role: t.role || 'body',
        startMs: Math.min(ms - 200, Math.round(Math.min(beats[i] - 1, Math.round((t.at * native) / beat)) * beat)),
      })),
    });
    at += beats[i];
  });
  const endBeats = Math.max(2, Math.floor(END_MS / beat));
  const startMs = Math.round(at * beat), endMs = Math.round((at + endBeats) * beat);
  scenes.push({ kind: 'end', slot: -1, item: -1, startMs, ms: endMs - startMs, beats: endBeats, effect: 'still', accent: null, transition: 'dissolve', transMs: transitionMs('dissolve', beat), clip: { needMs: 0, k: 1 }, texts: [] });
  return { bpm: tempo, beatMs: beat, scenes, totalMs: endMs, endStartMs: startMs, mediaMs: startMs };
}

/** The sounds the music places on transitions: a soft whoosh into a whip or slide, a low hit on a flash or the split. */
export function transitionHits(plan) {
  const out = [];
  for (const s of plan.scenes) {
    if (s.slot <= 0) continue;
    if (s.transition === 'whip' || s.transition === 'slide') out.push({ ms: s.startMs, kind: 'whoosh' });
    else if (s.transition === 'flash' || s.transition === 'split') out.push({ ms: s.startMs, kind: 'impact' });
  }
  return out;
}

/** The vertical extent of a text block (for the safe-zone check and the drawing). */
export function textBlock(t) {
  const px = SIZES[t.size] || SIZES.m;
  const h = t.lines.length * px * LINE_HEIGHT + 2 * TEXT_PAD;
  const cy = POSITIONS[t.pos] ?? POSITIONS.center;
  return { top: cy - h / 2, bottom: cy + h / 2, px, cy, h };
}

// ── Validation (the test suite runs this on every template) ────────────────

const DASHES = /[–—‒―]/;
const allStrings = (o, out = []) => {
  if (typeof o === 'string') out.push(o);
  else if (Array.isArray(o)) o.forEach((x) => allStrings(x, out));
  else if (o && typeof o === 'object') Object.values(o).forEach((x) => allStrings(x, out));
  return out;
};

/** Every problem with a template, as readable strings; empty = valid. */
export function templateProblems(tpl) {
  const p = [];
  const id = tpl?.id || '?';
  if (!GROUPS.includes(tpl.group)) p.push(`${id}: unknown group ${tpl.group}`);
  if (!tpl.name || !tpl.blurb) p.push(`${id}: name and blurb are required`);
  if (!(tpl.slots?.length >= 2 && tpl.slots.length <= MAX_ITEMS)) p.push(`${id}: 2..${MAX_ITEMS} slots`);
  if (!(tpl.variants?.length >= 2 && tpl.variants.length <= 3)) p.push(`${id}: 2 or 3 variants`);
  const first = moodById(tpl.variants?.[0]?.mood);
  if (!first || first.bpm !== tpl.bpm) p.push(`${id}: bpm ${tpl.bpm} is not the default mood's`);
  for (const v of tpl.variants || []) {
    if (!LOOKS.includes(v.look)) p.push(`${id}/${v.id}: look ${v.look}`);
    if (!TEXT_STYLES.includes(v.textStyle)) p.push(`${id}/${v.id}: text style ${v.textStyle}`);
    if (!moodById(v.mood)) p.push(`${id}/${v.id}: mood ${v.mood}`);
    if (!v.label) p.push(`${id}/${v.id}: label`);
  }
  const ids = new Set();
  (tpl.slots || []).forEach((s, i) => {
    const where = `${id}/${s.id}`;
    if (ids.has(s.id)) p.push(`${where}: duplicate slot id`);
    ids.add(s.id);
    if (!Number.isInteger(s.beats) || s.beats < 1) p.push(`${where}: beats must be a whole number >= 1`);
    if (!EFFECTS.includes(s.effect)) p.push(`${where}: effect ${s.effect}`);
    if (!TRANSITIONS.includes(s.transition)) p.push(`${where}: transition ${s.transition}`);
    if (i === 0 && s.transition !== 'cut') p.push(`${where}: the first slot opens on a cut`);
    if (s.accent && !ACCENTS.includes(s.accent)) p.push(`${where}: accent ${s.accent}`);
    if (!['clip', 'photo', 'any'].includes(s.media)) p.push(`${where}: media ${s.media}`);
    if (!s.shot?.what || !/[֐-׿]/.test(s.shot.what)) p.push(`${where}: a Hebrew shot instruction is required`);
    if (!s.shot?.light) p.push(`${where}: the light is required`);
    if (!DISTANCE[s.shot?.distance]) p.push(`${where}: distance ${s.shot?.distance}`);
    if (s.effect === 'slowmo' && !s.shot?.slowmo) p.push(`${where}: a slow-motion effect asks her to film in slow motion`);
    for (const t of s.texts || []) {
      if (!(t.lines?.length >= 1 && t.lines.length <= 2)) p.push(`${where}: 1 or 2 lines per overlay`);
      if (!(t.at >= 0 && t.at < s.beats)) p.push(`${where}: a text must start inside its slot`);
      if (!(t.pos in POSITIONS)) p.push(`${where}: position ${t.pos}`);
      if (t.size && !(t.size in SIZES)) p.push(`${where}: size ${t.size}`);
      for (const l of t.lines || []) {
        const line = l.replace('{season}', 'הסתיו');
        if (Array.from(line).length > LINE_MAX) p.push(`${where}: line over ${LINE_MAX}: ${line}`);
        if (!hebrewFirst(line)) p.push(`${where}: line must start in Hebrew: ${line}`);
        if (/\n/.test(line)) p.push(`${where}: no line breaks inside a line`);
      }
      const b = textBlock({ ...t, size: t.size || 'm' });
      if (b.top < 250 || b.bottom > 1580) p.push(`${where}: text outside the safe zone (${Math.round(b.top)}..${Math.round(b.bottom)})`);
    }
  });
  for (const s of allStrings(tpl)) if (DASHES.test(s)) p.push(`${id}: a dash in "${s}"`);
  return p;
}
