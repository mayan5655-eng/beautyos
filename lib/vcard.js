// lib/vcard.js
//
// Contacts from a .vcf (vCard) file, for the clients import (2026-11 activation follow-up).
//
// Why: an iPhone has no contact picker in the browser (navigator.contacts exists only on Chrome for Android), so on an iPhone the
// only way in was pasting a list. The iPhone Contacts app can share contacts as a vCard file, so the import now takes that file.
//
// Pure functions, no React. The file is turned into the same tab-separated text the paste box takes ("שם<TAB>טלפון"), so it goes
// through the existing mapping and preview step and the existing import: the dedupe against her clients (by phone, importPhoneKey)
// is the same one, not a second copy of it.
//
// What is read, from vCard 2.1, 3.0 and 4.0:
//   FN, else N (given + family), else ORG    the name
//   every TEL                                 the phones; one is chosen (an Israeli mobile first), the rest go to the notes
// Handled: folded lines, quoted-printable values (vCard 2.1, Android exports) with soft line breaks and a CHARSET (UTF-8 or
// windows-1255 for old Hebrew exports), BASE64 values, backslash escapes, iPhone "item1." groups, bare 2.1 types (TEL;CELL:),
// quoted 4.0 type lists (TYPE="cell,voice") and 4.0 tel: URIs.

import { normalizeIsraeliMobile } from "./phone.ts";
import { importPhoneKey } from "./importMapping.js";

/** Split "a;b;c" on the separator, but not inside double quotes. */
function splitOutsideQuotes(s, sep) {
  const out = []; let cur = ""; let q = false;
  for (const ch of s) {
    if (ch === '"') { q = !q; cur += ch; continue; }
    if (ch === sep && !q) { out.push(cur); cur = ""; continue; }
    cur += ch;
  }
  out.push(cur);
  return out;
}

/** The index of the first ":" that is not inside a quoted parameter value. */
function valueColon(line) {
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') q = !q;
    else if (ch === ":" && !q) return i;
  }
  return -1;
}

const isQP = (head) => /(^|;)\s*(ENCODING\s*=\s*)?QUOTED-PRINTABLE\s*(;|$)/i.test(head);

function decodeBytes(bytes, charset) {
  const tryDecode = (cs) => { try { return new TextDecoder(cs, { fatal: true }).decode(bytes); } catch { return null; } };
  const cs = String(charset || "utf-8").trim().toLowerCase();
  return tryDecode(cs) ?? tryDecode("utf-8") ?? tryDecode("windows-1255") ?? new TextDecoder("utf-8").decode(bytes);
}

function decodeQuotedPrintable(v, charset) {
  const bytes = [];
  for (let i = 0; i < v.length; i++) {
    const ch = v[i];
    if (ch === "=" && /^[0-9A-Fa-f]{2}$/.test(v.slice(i + 1, i + 3))) { bytes.push(parseInt(v.slice(i + 1, i + 3), 16)); i += 2; continue; }
    if (ch === "=" && i === v.length - 1) continue; // a soft break left at the very end
    const code = ch.charCodeAt(0);
    if (code < 128) bytes.push(code);
    else for (const b of new TextEncoder().encode(ch)) bytes.push(b);
  }
  return decodeBytes(new Uint8Array(bytes), charset);
}

function decodeBase64(v, charset) {
  try {
    const bin = atob(v.replace(/\s+/g, ""));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return decodeBytes(bytes, charset);
  } catch { return ""; }
}

/** vCard text escapes: \n, \, \; and \\. */
const unescapeText = (s) => String(s || "").replace(/\\([nN,;\\:])/g, (_, c) => (c === "n" || c === "N" ? " " : c));

/** Split a structured value (N) on ";" that is not escaped. */
function splitStructured(v) {
  const out = []; let cur = "";
  for (let i = 0; i < v.length; i++) {
    if (v[i] === "\\" && i + 1 < v.length) { cur += v[i] + v[i + 1]; i++; continue; }
    if (v[i] === ";") { out.push(cur); cur = ""; continue; }
    cur += v[i];
  }
  out.push(cur);
  return out.map(unescapeText);
}

/** The logical lines of the file: folded lines joined, quoted-printable soft breaks joined.
 *  Linear in the file size (Vercel review, 2026-11-05): each logical line is built from chunks joined once, its head (name and
 *  params) is read once when it starts, and the binary properties a contact import never uses (PHOTO, LOGO, SOUND, KEY) are
 *  dropped as they stream past, so a large folded photo costs one pass instead of re-copying a growing string per line. */
const SKIPPED_PROPS = /^(?:[^.:;]*\.)?(PHOTO|LOGO|SOUND|KEY)(?=[;:])/i;
function logicalLines(text) {
  const raw = String(text || "").replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").split("\n");
  const out = [];
  let chunks = null;   // the current logical line, as pieces
  let qp = false;      // the current line is quoted-printable
  let skip = false;    // the current line is a binary property we drop
  const flush = () => { if (chunks && !skip) out.push(chunks.join("")); chunks = null; };
  for (const line of raw) {
    if (chunks) {
      const last = chunks[chunks.length - 1];
      // quoted-printable soft line break: "=" at the end, the value goes on on the next line (with or without a leading space)
      if (qp && last.endsWith("=")) { if (!skip) { chunks[chunks.length - 1] = last.slice(0, -1); chunks.push(line.replace(/^[ \t]/, "")); } continue; }
      // RFC 2425 / 6350 folding: a line that starts with a space or tab continues the one before it
      if (/^[ \t]/.test(line)) { if (!skip) chunks.push(line.slice(1)); continue; }
    }
    flush();
    chunks = [line];
    skip = SKIPPED_PROPS.test(line);
    const at = valueColon(line);
    qp = at > 0 && isQP(line.slice(0, at));
  }
  flush();
  return out.filter((l) => l.trim());
}

/** One property line -> { name, params: {TYPE:[...], ...}, types: [...], value } with the value decoded. */
function parseProperty(line) {
  const at = valueColon(line);
  if (at < 0) return null;
  const head = line.slice(0, at);
  let value = line.slice(at + 1);
  const parts = splitOutsideQuotes(head, ";");
  const name = parts[0].replace(/^[^.]*\./, "").trim().toUpperCase(); // "item1.TEL" -> "TEL"
  const params = {}; const types = [];
  for (const p of parts.slice(1)) {
    const eq = p.indexOf("=");
    const key = (eq < 0 ? "TYPE" : p.slice(0, eq)).trim().toUpperCase();
    const val = (eq < 0 ? p : p.slice(eq + 1)).trim().replace(/^"|"$/g, "");
    if (eq < 0 && /^(QUOTED-PRINTABLE|BASE64|B|8BIT|7BIT)$/i.test(val)) { params.ENCODING = val.toUpperCase(); continue; }
    if (key === "TYPE") for (const t of val.split(",")) { if (t.trim()) types.push(t.trim().toLowerCase()); }
    else params[key] = val;
    if (key === "PREF") types.push("pref");
  }
  const enc = String(params.ENCODING || "").toUpperCase();
  if (enc === "QUOTED-PRINTABLE") value = decodeQuotedPrintable(value, params.CHARSET);
  else if (enc === "B" || enc === "BASE64") value = decodeBase64(value, params.CHARSET);
  return { name, params, types, value };
}

/** The longest phone value read (an international number with an extension and a tel: prefix fits in well under this). */
export const MAX_TEL_LENGTH = 64;

/**
 * A phone value as written in the file: a 4.0 "tel:" URI unwrapped, extensions dropped.
 * Too long a value is not a phone and is dropped BEFORE any pattern runs (2026-11-08, a Vercel security finding): a crafted file
 * with a long run of spaces in a TEL value made the extension pattern backtrack quadratically and froze her tab. The value is also
 * trimmed first, so the pattern never scans trailing whitespace.
 */
export const cleanTel = (v) => {
  const raw = String(v || "");
  if (raw.length > MAX_TEL_LENGTH) return "";
  return raw.trim().replace(/^tel:/i, "").replace(/[;,]?\s*(ext|x)=?\s*\d+$/i, "").trim();
};

/**
 * Every contact in the file.
 * @returns {{ name: string, phones: { value: string, types: string[] }[] }[]}
 */
export function parseVCards(text) {
  const cards = [];
  let cur = null;
  for (const line of logicalLines(text)) {
    const t = line.trim();
    if (/^BEGIN\s*:\s*VCARD$/i.test(t)) { cur = { fn: "", n: "", org: "", phones: [] }; continue; }
    if (/^END\s*:\s*VCARD$/i.test(t)) {
      if (cur) {
        const name = (cur.fn || cur.n || cur.org).replace(/[\t\n\r]+/g, " ").replace(/\s{2,}/g, " ").trim();
        cards.push({ name, phones: cur.phones });
      }
      cur = null; continue;
    }
    if (!cur) continue;
    const p = parseProperty(line);
    if (!p) continue;
    if (p.name === "FN") cur.fn = unescapeText(p.value).trim();
    else if (p.name === "N") {
      const [family = "", given = "", additional = "", prefix = "", suffix = ""] = splitStructured(p.value).map((x) => x.trim());
      cur.n = [prefix, given, additional, family, suffix].filter(Boolean).join(" ");
    } else if (p.name === "ORG") cur.org = splitStructured(p.value).filter(Boolean)[0]?.trim() || "";
    else if (p.name === "TEL") {
      const value = cleanTel(unescapeText(p.value));
      if (/\d/.test(value)) cur.phones.push({ value, types: p.types });
    }
  }
  return cards;
}

/** An Israeli mobile written the way she would type it ("0541234567"); anything else as digits (with its +). */
function displayPhone(raw) {
  const m = normalizeIsraeliMobile(raw);
  if (m.ok) return "0" + m.e164.slice(3);
  const digits = String(raw).replace(/\D/g, "");
  const il = digits.replace(/^00972/, "972");
  if (/^972[1-9]\d{6,8}$/.test(il)) return "0" + il.slice(3); // an Israeli landline, written as she would ("035551234")
  const plus = String(raw).trim().startsWith("+") ? "+" : "";
  return plus + digits;
}

/**
 * The phone to keep for one contact, and the others. An Israeli mobile wins (that is the number WhatsApp reminders go to): the
 * preferred one, then one marked as a mobile, then the first. Without any mobile, the preferred number, then the first.
 */
export function pickPhone(phones) {
  const list = (phones || []).filter((p) => p && /\d/.test(p.value));
  if (!list.length) return { phone: "", others: [] };
  const score = (p) => {
    const t = p.types || [];
    const mobile = normalizeIsraeliMobile(p.value).ok;
    return (mobile ? 100 : 0) + (t.includes("pref") ? 10 : 0) + (t.some((x) => /^(cell|mobile|iphone)$/.test(x)) ? 5 : 0);
  };
  let best = list[0];
  for (const p of list) if (score(p) > score(best)) best = p;
  const phone = displayPhone(best.value);
  const seen = new Set([importPhoneKey(phone)]);
  const others = [];
  for (const p of list) {
    const d = displayPhone(p.value); const k = importPhoneKey(d);
    if (!k || seen.has(k)) continue;
    seen.add(k); others.push(d);
  }
  return { phone, others };
}

/**
 * The file as the text the paste box takes, with a header row so the mapping step guesses the columns by their names.
 * Contacts with no name and no phone are dropped; the same contact twice in the file (same phone) is kept once.
 * @returns {{ text: string, count: number, withPhone: number, empty: number, repeated: number }}
 */
export function vcardImportText(text) {
  const cards = parseVCards(text);
  const rows = []; const seen = new Set();
  let empty = 0, repeated = 0, withPhone = 0;
  for (const c of cards) {
    const { phone, others } = pickPhone(c.phones);
    const name = c.name || "";
    if (!name && !phone) { empty++; continue; }
    const key = importPhoneKey(phone) || `n:${name}`;
    if (seen.has(key)) { repeated++; continue; }
    seen.add(key);
    if (phone) withPhone++;
    rows.push([name, phone, others.length ? `טלפון נוסף: ${others.join(", ")}` : ""]);
  }
  const withNotes = rows.some((r) => r[2]);
  const header = withNotes ? ["שם", "טלפון", "הערות"] : ["שם", "טלפון"];
  const lines = rows.length ? [header, ...rows.map((r) => (withNotes ? r : r.slice(0, 2)))].map((r) => r.join("\t")) : [];
  return { text: lines.join("\n"), count: rows.length, withPhone, empty, repeated };
}

/** A file the import should treat as a vCard: by its name or its type (iOS and Android both use text/vcard or text/x-vcard). */
export const isVcardFile = (file) => !!file && (/\.(vcf|vcard)$/i.test(String(file.name || "")) || /^text\/(x-)?vcard$|^text\/directory$/i.test(String(file.type || "")));

export const VCARD_ACCEPT = ".vcf,.vcard,text/vcard,text/x-vcard,text/directory";
