// lib/protocolBook/aftercare.ts — the aftercare message for a client, written from the protocol's own aftercare. PURE.
//
// Sent by HER, from her own WhatsApp (a wa.me link she taps): nothing here or in the card that uses it sends anything, and
// the card never says "נשלח". The words are the protocol's (reviewed content, no claims beyond the book), in the voice of a
// cosmetician writing to her own client.
//
// Ranges become words in Hebrew and Arabic ("3 עד 5 ימים"): a WhatsApp line is right-to-left, and "3–5" would read "5–3"
// there, the same bidi flip the book isolates with <bdi>. A plain-text message has no <bdi>, so the dash goes instead.
import type { BookLang, Protocol } from './types.ts';
import { CHAPTERS } from './labels.ts';

const RANGE = /(\d[\d.,]*%?)\s?[–-]\s?(\d[\d.,]*%?)/g;

export function rangesAsWords(text: string, lang: BookLang): string {
  if (lang === 'en') return text;
  const to = lang === 'ar' ? 'إلى' : 'עד';
  return text.replace(RANGE, `$1 ${to} $2`);
}

const firstName = (name: unknown): string => String(name || '').trim().split(/\s+/)[0] || '';

export function aftercareMessage(p: Protocol, lang: BookLang, opts: { clientName?: string | null; signedBy?: string | null } = {}): string {
  const x = p.text[lang];
  const name = firstName(opts.clientName);
  const sign = String(opts.signedBy || '').trim();
  const w = (s: string) => rangesAsWords(s, lang);
  const topic = (CHAPTERS[p.chapter] || {})[lang] || x.title;
  if (lang === 'ar') {
    return [
      `مرحباً${name ? ` ${name}` : ''} 🌸`,
      `شكراً لقدومكِ اليوم. بعد علاج «${topic}»، هذا ما يهمّ في الأيام القادمة:`,
      '',
      w(x.after),
      '',
      `في البيت: ${w(x.home)}`,
      '',
      `ما هو طبيعي: ${w(x.expected)}`,
      'إذا شعرتِ بشيء غير عادي، اكتبي لي هنا.',
      sign,
    ].filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n').trim();
  }
  if (lang === 'en') {
    return [
      `Hi${name ? ` ${name}` : ''} 🌸`,
      `Thank you for coming in today. After your ${topic.toLowerCase()} treatment, here is what matters over the next few days:`,
      '',
      x.after,
      '',
      `At home: ${x.home}`,
      '',
      `What is normal: ${x.expected}`,
      'If anything feels unusual, message me here.',
      sign,
    ].join('\n').trim();
  }
  return [
    `היי${name ? ` ${name}` : ''} 🌸`,
    `תודה שבאת היום. אחרי טיפול ${topic}, זה מה שחשוב בימים הקרובים:`,
    '',
    w(x.after),
    '',
    `בבית: ${w(x.home)}`,
    '',
    `מה תקין: ${w(x.expected)}`,
    'אם משהו מרגיש לא רגיל, כתבי לי כאן.',
    sign,
  ].join('\n').trim();
}
