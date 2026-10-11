// lib/design/templates/pack/presenters.ts
//
// The six presenter sets of the Kalmea pack: an AI character, a short headline sequence, an invitation to
// book. Each set is one post (feed 4:5, here) and one reel (lib/design/reels/pack.ts); they share the copy
// below, so the post and the reel of one set say the same thing.
//
// The picture is the template's bundled AI character until she picks a photo of her own, per design. While
// the character shows, a fixed label says so (kit.ts aiLabel). The copy is an invitation, never a client's
// testimonial; nothing claims a result.
//
// The voice-over scripts of the original pack have no engine here (no speech, no lip-sync): they are kept as
// `caption`, an optional suggestion she can start her post text from.

import type { FieldKey } from '../../../businessFields.ts';
import type { Category, SlotDef } from '../../contract.ts';

export const CTA_DEFAULT = 'לקביעת תור, שלחי הודעה';

export type PresenterSet = {
  /** kebab-case, unique: keys are pk-<slug>-feed and pk-<slug>-reel. */
  slug: string;
  name: string;
  field: FieldKey;
  /** public/defaults/presenters/<image>.jpg */
  image: string;
  badge: string;
  /** One headline per scene; the post uses the first. Line breaks are chosen. */
  headlines: [string, string, string];
  detail: string;
  caption: string;
  category: Category;
  /** What the picture should be when she asks the AI for one instead (a person, never a real client). */
  aiHint: string;
};

export const PRESENTERS: PresenterSet[] = [
  {
    slug: 'nail-presenter-next', name: 'הסט הבא שלך', field: 'nails', image: 'nail-presenter-1', badge: 'מניקור', category: 'announce',
    headlines: ['הסט הבא שלך\nמתחיל כאן.', 'מהגוון\nועד הפרט הקטן.', 'נפגשות\nבסטודיו?'],
    detail: 'מניקור בסגנון שלך',
    caption: 'בא לך סט שמתאים בדיוק לסגנון שלך? בחרי את הגוון שאת אוהבת, ותני מקום גם לפרטים הקטנים. לקביעת תור, שלחי הודעה.',
    aiHint: 'a warm, friendly nail artist smiling at the camera in a bright nail studio, resting her hand near a manicure table, soft natural light, portrait crop with space at the bottom',
  },
  {
    slug: 'nail-presenter-moment', name: 'רגע בסטודיו', field: 'nails', image: 'nail-presenter-2', badge: 'זמן לעצמך', category: 'announce',
    headlines: ['רגע קטן\nרק בשבילך.', 'גוון שאת אוהבת.\nזמן לעצמך.', 'התור הבא\nמחכה לך.'],
    detail: 'מקדישות זמן גם לעצמך',
    caption: 'לפעמים רגע קטן בסטודיו הוא בדיוק מה שצריך. גוון שאת אוהבת, מניקור מוקפד וזמן לעצמך. רוצה לקבוע? שלחי הודעה.',
    aiHint: 'a calm nail artist in a soft, bright studio, relaxed smile, neutral warm tones, portrait crop with space at the bottom',
  },
  {
    slug: 'nail-presenter-art', name: 'נייל ארט', field: 'nails', image: 'nail-presenter-3', badge: 'נייל ארט', category: 'announce',
    headlines: ['סט קטן.\nאופי גדול.', 'העיצוב\nשהוא הכי את.', 'מה נבחר\nבפעם הבאה?'],
    detail: 'מהרעיונות שלך לסט חדש',
    caption: 'אוהבת ציפורניים עם אופי? אפשר לבחור צבע עדין, להוסיף פרט קטן וליצור סט בסגנון שלך. לקביעת תור, שלחי הודעה.',
    aiHint: 'a creative nail artist holding a fine brush, friendly look at the camera, bright studio, portrait crop with space at the bottom',
  },
  {
    slug: 'skin-presenter-facial', name: 'טיפול פנים', field: 'cosmetics', image: 'skin-presenter-1', badge: 'טיפול פנים', category: 'announce',
    headlines: ['העור שלך.\nהקצב שלך.', 'מתחילות\nבהיכרות איתך.', 'זמן לטיפול\nשהוא בשבילך.'],
    detail: 'טיפול פנים בהתאמה אישית',
    caption: 'מגיע לך רגע שמוקדש רק לך. טיפול פנים מתחיל בהיכרות איתך ועם מה שאת מחפשת. רוצה לשמוע עוד? שלחי הודעה ונקבע פגישה.',
    aiHint: 'a warm, professional cosmetician in a white tunic smiling at the camera in a bright treatment room, soft natural light, portrait crop with space at the bottom',
  },
  {
    slug: 'skin-presenter-meet', name: 'היכרות עם העור', field: 'cosmetics', image: 'skin-presenter-2', badge: 'היכרות אישית', category: 'announce',
    headlines: ['לפני הטיפול,\nמכירות את העור.', 'שואלות.\nמקשיבות.', 'בוחרות יחד\nאיך מתחילות.'],
    detail: 'כל מפגש מתחיל בהיכרות',
    caption: 'כל עור הוא אישי, וגם מה שאת מצפה מהטיפול. מתחילות בשיחה ובהיכרות, ואז בוחרות יחד איך ממשיכות. לקביעת פגישה, שלחי הודעה.',
    aiHint: 'a friendly cosmetician listening attentively, welcoming expression, bright clinic, portrait crop with space at the bottom',
  },
  {
    slug: 'skin-presenter-self', name: 'זמן לעצמך', field: 'cosmetics', image: 'skin-presenter-3', badge: 'טיפוח אישי', category: 'announce',
    headlines: ['מפנות מקום\nגם לעצמך.', 'רגע לעצור.\nרגע לטפח.', 'מתי נפגשות\nבקליניקה?'],
    detail: 'טיפוח מתחיל בזמן לעצמך',
    caption: 'תזכורת קטנה: מותר לך לפנות זמן גם לעצמך. לעצור, לטפח ולהגיע למפגש שמוקדש לך. רוצה לקבוע זמן בקליניקה? שלחי הודעה.',
    aiHint: 'a calm cosmetician with a gentle smile in a softly lit clinic, neutral warm tones, portrait crop with space at the bottom',
  },
];

/** The slot every presenter frame binds: the bundled character, or her own picture. */
export function presenterSlot(key: string, set: PresenterSet): SlotDef {
  return {
    key,
    label: 'התמונה (דמות AI, או התמונה שלך)',
    sources: ['upload', 'gallery', 'clinic', 'portrait', 'ai'],
    aiHint: set.aiHint,
    defaultImage: { src: `/defaults/presenters/${set.image}.jpg`, kind: 'ai_character' },
  };
}
