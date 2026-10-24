// lib/latinSlug.ts
//
// A Latin booking address from a Hebrew business name, for the address onboarding
// picks on its own.
//
// A Hebrew address works, but every link she copies leaves the app percent-encoded:
// kalmea.app/%D7%A1%D7%98%D7%95... in her Instagram bio, her posts and the
// WhatsApp she sends (found live 2026-10-23, on the very link onboarding tells her
// to send first). So the address onboarding picks is Latin: the beauty words she is
// likely to use are translated (סטודיו → studio, ציפורניים → nails), everything
// else is spelled out letter by letter. She can still choose any address,
// Hebrew included, in Settings > הדף שלי; this only replaces the automatic one.

const WORDS: Record<string, string> = {
  'סטודיו': 'studio', 'קליניקה': 'clinic', 'קליניקת': 'clinic', 'מכון': 'clinic',
  'יופי': 'beauty', 'ביוטי': 'beauty', 'קוסמטיקה': 'cosmetics', 'קוסמטיקס': 'cosmetics', 'קוסמטיקאית': 'cosmetics',
  'ציפורניים': 'nails', 'ציפורנים': 'nails', 'נייל': 'nail', 'ניילס': 'nails', 'לק': 'nails', 'מניקור': 'manicure', 'פדיקור': 'pedicure',
  'טיפוח': 'care', 'טיפולי': 'care', 'פנים': 'face', 'עור': 'skin', 'גבות': 'brows', 'ריסים': 'lashes',
  'הסרת': 'removal', 'שיער': 'hair', 'לייזר': 'laser', 'איפור': 'makeup', 'ספא': 'spa', 'בית': 'house',
  'גל': 'gel', // ג׳ל, looked up without the geresh 'אקריל': 'acrylic', 'בניה': 'build', 'שעווה': 'wax',
  'של': 'by', 'ו': 'and',
};

// One letter at a time. Vowels are guessed from the matres lectionis the way most
// Israelis would spell their own name in Latin letters.
function letters(word: string): string {
  const w = [...word];
  let out = '';
  // Short words carry no written vowels (דנה, הדר, מיכל): put an 'a' between two consonants so they read.
  const short = w.filter((x) => /[א-ת]/.test(x)).length <= 4;
  let prevCons = false;
  for (let i = 0; i < w.length; i++) {
    const c = w[i];
    const cons = /[א-ת]/.test(c) && (!'אהויע'.includes(c) || (c === 'ה' && i === 0));
    if (short && cons && prevCons) out += 'a';
    prevCons = cons;
    const first = i === 0;
    const last = i === w.length - 1;
    const next = w[i + 1];
    switch (c) {
      case 'א': out += first ? 'a' : last ? 'a' : ''; break;
      case 'ב': out += first ? 'b' : 'v'; break;
      case 'ג': out += next === "'" ? 'j' : 'g'; break;
      case 'ד': out += 'd'; break;
      case 'ה': out += first ? 'h' : 'a'; break;
      case 'ו': out += first ? 'v' : next === 'ו' ? 'v' : 'o'; if (next === 'ו') i++; break;
      case 'ז': out += 'z'; break;
      case 'ח': out += 'ch'; break;
      case 'ט': out += 't'; break;
      case 'י': out += first ? 'y' : next === 'י' ? 'y' : 'i'; if (next === 'י') i++; break;
      case 'כ': out += first ? 'k' : 'ch'; break;
      case 'ך': out += 'ch'; break;
      case 'ל': out += 'l'; break;
      case 'מ': case 'ם': out += 'm'; break;
      case 'נ': case 'ן': out += 'n'; break;
      case 'ס': out += 's'; break;
      case 'ע': out += first ? 'a' : 'a'; break;
      case 'פ': out += first ? 'p' : 'f'; break;
      case 'ף': out += 'f'; break;
      case 'צ': case 'ץ': out += next === "'" ? 'ch' : 'tz'; break;
      case 'ק': out += 'k'; break;
      case 'ר': out += 'r'; break;
      case 'ש': out += 'sh'; break;
      case 'ת': out += 't'; break;
      default: out += /[a-z0-9]/i.test(c) ? c.toLowerCase() : '';
    }
  }
  // "noaa" -> "noa", "maaya" -> "maya": a doubled guessed vowel reads worse than a single one.
  return out.replace(/([aeiou])\1+/g, '$1');
}

/** The Latin address for a business name: lowercase, a-z 0-9 and single hyphens, at most 40. '' if nothing usable. */
export function latinSlugFromName(name: string | null | undefined): string {
  const words = String(name || '')
    .replace(/[׳']/g, "'")
    .split(/[\s_.\-–—,/&+]+/)
    .map((w) => w.replace(/[^a-zA-Z0-9א-ת']/g, ''))
    .filter(Boolean);
  const parts = words.map((w) => {
    const bare = w.replace(/'/g, '');
    if (WORDS[bare]) return WORDS[bare];
    // a leading ה/ו/ל/ב glued to a known word: "הסטודיו", "ליופי"
    if (bare.length > 2 && 'הולב'.includes(bare[0]) && WORDS[bare.slice(1)]) return WORDS[bare.slice(1)];
    return /[א-ת]/.test(w) ? letters(w) : bare.toLowerCase();
  }).filter(Boolean);
  return parts.join('-').replace(/[^a-z0-9-]/g, '').replace(/-{2,}/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '');
}

/** A short fallback when the name gives nothing: "beauty-x7k2q". */
export function shortCodeSlug(rand: () => number = Math.random): string {
  const abc = 'abcdefghjkmnpqrstuvwxyz23456789';
  let s = '';
  for (let i = 0; i < 5; i++) s += abc[Math.floor(rand() * abc.length)];
  return `beauty-${s}`;
}
