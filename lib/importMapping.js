// lib/importMapping.js
//
// Pasted-list import: guessing which column is which, and turning the pasted grid into rows for clients, services and appointments.
// Moved out of app/beautyos.jsx with the code unchanged (2026-10-18): pure functions and tables, no React and no state, so they can be tested directly.

const formatDate = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

export const IMPORT_FIELDS = [
  { id:"ignore",    label:"התעלם" },
  { id:"name",      label:"שם" },
  { id:"phone",     label:"טלפון" },
  { id:"birthday",  label:"תאריך לידה" },
  { id:"skinType",  label:"סוג עור" },
  { id:"allergies", label:"אלרגיות" },
  { id:"medical",   label:"מצב רפואי" },
  { id:"notes",     label:"הערות" },
];

// The service_prices fields a pasted column can map onto. Colour is absent on
// purpose: it is assigned round-robin below rather than asked for.
export const SERVICE_IMPORT_FIELDS = [
  { id:"ignore",   label:"התעלם" },
  { id:"name",     label:"שם הטיפול" },
  { id:"price",    label:"מחיר" },
  { id:"duration", label:"משך (דקות)" },
];

// The appointment fields a pasted column can map onto. The "time" column carries
// the whole start time, minutes included: start_minute stores the real minute, so
// an imported 14:30 stays 14:30. It used to be rounded to 15:00 and reported in
// the preview, because appointments.hour could not represent anything else.
export const APPT_IMPORT_FIELDS = [
  { id:"ignore",   label:"התעלם" },
  { id:"date",     label:"תאריך" },
  { id:"time",     label:"שעה" },
  { id:"name",     label:"שם הלקוחה" },
  { id:"phone",    label:"טלפון" },
  { id:"service",  label:"טיפול" },
  { id:"duration", label:"משך (דקות)" },
  { id:"price",    label:"מחיר" },
  { id:"notes",    label:"הערות" },
];

export const looksLikePhone = (s) => /^[\d\-+() ]{6,}$/.test(String(s||"").trim());
export const looksLikeDate = (s) => /^\d{1,4}[./-]\d{1,2}[./-]\d{2,4}$/.test(String(s||"").trim());
export const looksLikeTime = (s) => /^\d{1,2}[:.]\d{2}$/.test(String(s||"").trim())
                          || /^\d{1,2}\s*(am|pm)$/i.test(String(s||"").trim());

// "₪ 1,200" -> 1200. Anything unparseable returns null so the caller can fall
// back to the column default rather than writing a wrong number.
export const parseMoney = (s) => {
  const n = parseFloat(String(s||"").replace(/[^\d.]/g,""));
  return Number.isFinite(n) ? n : null;
};
// "45 דק׳" -> 45.
export const parseMinutes = (s) => {
  const n = parseInt(String(s||"").replace(/[^\d]/g,""), 10);
  return Number.isFinite(n) ? n : null;
};
export const isNumericCell = (s) => /^[₪$\s]*[\d,.]+[\s֐-׿׳'"a-z.]*$/i.test(String(s||"").trim()) && /\d/.test(String(s||""));

// Split one pasted line into cells. Tabs win when present (an Excel paste);
// otherwise commas, but NOT commas inside quotes — "כהן, דנה" is one cell.
export const splitImportLine = (line) => {
  if (line.includes("\t")) return line.split("\t").map(c=>c.trim());
  const out=[]; let cur=""; let q=false;
  for (const ch of line) {
    if (ch === '"') { q = !q; continue; }
    if (ch === "," && !q) { out.push(cur.trim()); cur=""; continue; }
    cur += ch;
  }
  out.push(cur.trim());
  return out;
};

// Pasted text -> a rectangular grid. Short rows are padded so every row has
// the same width as the widest, which keeps the mapping dropdowns aligned.
export const parseImportGrid = (text) => {
  // Filter blank lines WITHOUT trimming the kept ones: trimming a line would
  // eat a leading tab, and with it the empty first cell. A row like
  // "<tab>0541234567" - a client with a phone but no name - would otherwise
  // collapse to one cell and import the phone AS the name.
  const rows = String(text||"").split("\n").filter(l=>l.trim()).map(splitImportLine);
  const width = rows.reduce((w,r)=>Math.max(w,r.length),0);
  return { rows: rows.map(r=>{ const c=r.slice(); while(c.length<width) c.push(""); return c; }), width };
};

// Row 1 is a header when it contains a recognised heading AND no phone-shaped
// cell. Requiring both avoids treating a real client named "שם" as a header.
// Shared by both wizards, so it carries client AND price-list vocabulary. A
// services paste headed "טיפול / מחיר / משך" is a header row too; without
// these words it was imported as a service literally named "טיפול".
export const HEADER_WORDS = ["שם","טלפון","נייד","מייל","אימייל","הערות","כתובת","תאריך","לידה","עור","אלרגי","רפואי",
                      "name","phone","mobile","email","notes","address","birthday","date","client","customer",
                      "טיפול","שירות","מחיר","עלות","משך","דקות","זמן",
                      "service","treatment","price","cost","duration","min",
                      "שעה","לקוחה","hour","time"];
export const detectHeaderRow = (rows) => {
  const first = rows[0]; if (!first) return false;
  const hasHeaderWord = first.some(c => HEADER_WORDS.some(w => String(c).toLowerCase().includes(w)));
  const hasPhone = first.some(looksLikePhone);
  // A header row never carries a bare number. This is what stops a real
  // service called "טיפול פנים" being eaten as a header just because it
  // contains the word טיפול - its row also holds a price, so it is data.
  const hasNumber = first.some(isNumericCell);
  return hasHeaderWord && !hasPhone && !hasNumber;
};

// Pre-guess each column: by header text when there is one, otherwise by what
// the cells look like. The first text-ish column becomes the name.
export const guessColumns = (rows, hasHeader) => {
  const { length: width } = rows[0] || [];
  const body = hasHeader ? rows.slice(1) : rows;
  const guess = new Array(width).fill("ignore");
  let nameTaken = false, phoneTaken = false;

  for (let c = 0; c < width; c++) {
    const head = hasHeader ? String(rows[0][c]||"").toLowerCase() : "";
    const cells = body.map(r=>r[c]).filter(Boolean);
    const phoneish = cells.length && cells.filter(looksLikePhone).length >= cells.length*0.6;

    if (!phoneTaken && (/טלפון|נייד|phone|mobile/.test(head) || (!head && phoneish))) { guess[c]="phone"; phoneTaken=true; continue; }
    if (!nameTaken && (/שם|name|client|customer/.test(head) || (!head && !phoneish && cells.length))) { guess[c]="name"; nameTaken=true; continue; }
    if (/לידה|birthday|תאריך|date/.test(head)) { guess[c]="birthday"; continue; }
    if (/עור|skin/.test(head)) { guess[c]="skinType"; continue; }
    if (/אלרגי|allerg/.test(head)) { guess[c]="allergies"; continue; }
    if (/רפואי|medical/.test(head)) { guess[c]="medical"; continue; }
    if (/הערות|notes|comment/.test(head)) { guess[c]="notes"; continue; }
  }
  return guess;
};

// Column guessing for a services paste. Headers win when present. Without
// them, numbers are split by magnitude: a treatment is far more likely to cost
// 250 than to last 250 minutes, and to last 45 than to cost 45.
export const guessServiceColumns = (rows, hasHeader) => {
  const width = (rows[0] || []).length;
  const body = hasHeader ? rows.slice(1) : rows;
  const guess = new Array(width).fill("ignore");
  let nameTaken = false, priceTaken = false, durTaken = false;

  for (let c = 0; c < width; c++) {
    const head = hasHeader ? String(rows[0][c]||"").toLowerCase() : "";
    const cells = body.map(r=>r[c]).filter(Boolean);
    const numeric = cells.length && cells.filter(isNumericCell).length >= cells.length*0.6;
    const nums = cells.map(parseMoney).filter(n=>n!==null);
    const median = nums.length ? nums.slice().sort((a,b)=>a-b)[Math.floor(nums.length/2)] : 0;

    if (!priceTaken && (/מחיר|price|₪|עלות|תשלום/.test(head))) { guess[c]="price"; priceTaken=true; continue; }
    if (!durTaken && (/משך|דקות|duration|min|זמן/.test(head)))  { guess[c]="duration"; durTaken=true; continue; }
    if (!nameTaken && (/שם|טיפול|שירות|name|service|treatment/.test(head))) { guess[c]="name"; nameTaken=true; continue; }
    if (head) continue; // a labelled column we did not recognise stays ignored

    if (numeric) {
      // Durations cluster low and in round steps; prices sit higher.
      if (!durTaken && median <= 200) { guess[c]="duration"; durTaken=true; continue; }
      if (!priceTaken) { guess[c]="price"; priceTaken=true; continue; }
      continue;
    }
    if (!nameTaken && cells.length) { guess[c]="name"; nameTaken=true; }
  }
  return guess;
};

// Apply a services mapping. Price and duration fall back to the column
// defaults (0 and 60) rather than guessing, so a blank cell never invents a
// number she would have to hunt down later.
export const buildServiceRows = (grid, cols, hasHeader) => {
  const body = hasHeader ? grid.rows.slice(1) : grid.rows;
  const out = [];
  let noName = 0;
  for (const r of body) {
    const rec = { name:"", price:0, duration:60, active:true };
    let hasName = false;
    cols.forEach((field, i) => {
      const v = String(r[i]||"").trim();
      if (field === "ignore" || !field || !v) return;
      if (field === "name")     { rec.name = v; hasName = true; }
      if (field === "price")    { const n = parseMoney(v);   if (n !== null) rec.price = n; }
      if (field === "duration") { const n = parseMinutes(v); if (n !== null) rec.duration = n; }
    });
    if (!hasName) { noName++; continue; }
    out.push(rec);
  }
  return { rows: out, noName };
};

// Apply the mapping. Rows with no name are dropped — a client record without
// a name is not usable, and silently creating blanks is worse than skipping.
export const buildImportRows = (grid, cols, hasHeader) => {
  const body = hasHeader ? grid.rows.slice(1) : grid.rows;
  const out = [];
  let noName = 0;
  for (const r of body) {
    const rec = {};
    cols.forEach((field, i) => {
      if (field === "ignore" || !field) return;
      const v = String(r[i]||"").trim();
      if (!v) return;
      rec[field] = field === "phone" ? v.replace(/[^\d+]/g,"") : v;
    });
    if (!rec.name) { noName++; continue; }
    out.push(rec);
  }
  return { rows: out, noName };
};
// "12/08/2026", "12.8.26", "2026-08-12" -> "2026-08-12". Day-first, because
// that is what Israeli exports produce. The wizard says so on screen rather
// than sniffing per row, which would be right most of the time and silently
// wrong for the rest - 03/04 is a real date either way round.
export const parseImportDate = (s) => {
  const m = String(s||"").trim().match(/^(\d{1,4})[./-](\d{1,2})[./-](\d{2,4})$/);
  if (!m) return null;
  let y, mo, d;
  if (m[1].length === 4) { y = +m[1]; mo = +m[2]; d = +m[3]; }  // ISO, year first
  else { d = +m[1]; mo = +m[2]; y = +m[3]; }
  if (y < 100) y += 2000;
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const dt = new Date(y, mo - 1, d);
  // Rejects 31/02 and friends: the Date constructor rolls them into March
  // instead of failing, so compare the parts back.
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
  return formatDate(dt);
};

// "14:30" -> 870 minutes from midnight. Also reads "14.30", "14", "2pm", "2 am".
// Returns null on anything it cannot parse, so the caller counts the row instead
// of inventing a time for it.
//
// Nothing is rounded: start_minute holds the real minute. This used to return the
// nearest whole hour plus a `rounded` flag, and the caller tallied how many rows
// it had moved, because appointments.hour could not represent anything else.
export const parseImportTime = (s) => {
  const t = String(s||"").trim().toLowerCase();
  let h, min = 0;
  let m = t.match(/^(\d{1,2})[:.](\d{2})$/);
  if (m) { h = +m[1]; min = +m[2]; }
  else {
    m = t.match(/^(\d{1,2})\s*(am|pm)?$/);
    if (!m) return null;
    h = +m[1];
    if (m[2] === "pm" && h < 12) h += 12;
    if (m[2] === "am" && h === 12) h = 0;
  }
  if (h > 23 || min > 59) return null;
  return { startMinute: h * 60 + min };
};

// Column guessing for an appointments paste. Headers win; without them the
// shape of the cells decides, date and time before phone so a "12/08/2026"
// column is never mistaken for something else.
export const guessApptColumns = (rows, hasHeader) => {
  const width = (rows[0] || []).length;
  const body = hasHeader ? rows.slice(1) : rows;
  const guess = new Array(width).fill("ignore");
  const taken = {};
  const mostly = (cells, fn) => cells.length && cells.filter(fn).length >= cells.length * 0.6;

  for (let c = 0; c < width; c++) {
    const head = hasHeader ? String(rows[0][c]||"").toLowerCase() : "";
    const cells = body.map(r=>r[c]).filter(Boolean);

    if (!taken.date     && /תאריך|date/.test(head))                    { guess[c]="date";     taken.date=1;     continue; }
    if (!taken.time     && /שעה|time|hour/.test(head))                 { guess[c]="time";     taken.time=1;     continue; }
    if (!taken.phone    && /טלפון|נייד|phone|mobile/.test(head))       { guess[c]="phone";    taken.phone=1;    continue; }
    if (!taken.name     && /שם|לקוח|name|client|customer/.test(head))  { guess[c]="name";     taken.name=1;     continue; }
    if (!taken.service  && /טיפול|שירות|service|treatment/.test(head)) { guess[c]="service";  taken.service=1;  continue; }
    if (!taken.duration && /משך|דקות|duration|min/.test(head))         { guess[c]="duration"; taken.duration=1; continue; }
    if (!taken.price    && /מחיר|price|עלות|₪/.test(head))             { guess[c]="price";    taken.price=1;    continue; }
    if (!taken.notes    && /הערות|notes|comment/.test(head))           { guess[c]="notes";    taken.notes=1;    continue; }
    if (head) continue; // a labelled column we did not recognise stays ignored

    if (!taken.date  && mostly(cells, looksLikeDate))  { guess[c]="date";  taken.date=1;  continue; }
    if (!taken.time  && mostly(cells, looksLikeTime))  { guess[c]="time";  taken.time=1;  continue; }
    if (!taken.phone && mostly(cells, looksLikePhone)) { guess[c]="phone"; taken.phone=1; continue; }
    if (mostly(cells, isNumericCell)) {
      // Same split as the price list: a treatment lasts 45 far more often than
      // it costs 45, and costs 250 far more often than it lasts 250.
      const nums = cells.map(parseMoney).filter(n=>n!==null);
      const median = nums.length ? nums.slice().sort((a,b)=>a-b)[Math.floor(nums.length/2)] : 0;
      if (!taken.duration && median <= 200) { guess[c]="duration"; taken.duration=1; continue; }
      if (!taken.price) { guess[c]="price"; taken.price=1; continue; }
      continue;
    }
    if (!cells.length) continue;
    if (!taken.name)    { guess[c]="name";    taken.name=1;    continue; }
    if (!taken.service) { guess[c]="service"; taken.service=1; continue; }
  }
  return guess;
};

// Apply an appointments mapping. Future only: anything already past is counted
// and dropped, so a full export can be pasted as-is without back-filling a year
// of history nobody asked for.
//
// Counters are committed only for rows that actually survive: tallying during
// parsing would report on hundreds of skipped historical rows she never sees.
//
// nowMinute is minutes from midnight. Comparing on the hour would have dropped
// a 14:30 booking as "past" at 14:05, and kept one at 14:00 that had already
// started.
export const buildApptRows = (grid, cols, hasHeader, todayStr, nowMinute, knownServices) => {
  const body = hasHeader ? grid.rows.slice(1) : grid.rows;
  const out = [];
  let noName = 0, noDate = 0, past = 0, noTime = 0, nameIsService = 0;
  const nameIsServiceSamples = [];

  for (const r of body) {
    const rec = { date:"", startMinute:null, name:"", phone:"", service:"", duration:60, price:0, note:"" };
    let badDate = false, timeSeen = false, timeBad = false;

    cols.forEach((field, i) => {
      const v = String(r[i]||"").trim();
      if (field === "ignore" || !field || !v) return;
      if (field === "date")     { const d = parseImportDate(v); if (d) rec.date = d; else badDate = true; }
      if (field === "time")     { timeSeen = true; const t = parseImportTime(v);
                                  if (t) rec.startMinute = t.startMinute;
                                  else timeBad = true; }
      if (field === "name")     rec.name = v;
      if (field === "phone")    rec.phone = v.replace(/[^\d+]/g,"");
      if (field === "service")  rec.service = v;
      if (field === "duration") { const n = parseMinutes(v); if (n !== null) rec.duration = n; }
      if (field === "price")    { const n = parseMoney(v);   if (n !== null) rec.price = n; }
      if (field === "notes")    rec.note = v;
    });

    if (!rec.name) { noName++; continue; }

    // A row whose "client name" is one of her own treatments is a mis-mapped
    // column, not a booking. This really happened: a paste that led with the
    // treatment put "עיצוב גבות" in the name column, which then created a
    // CLIENT called עיצוב גבות and an appointment greeting her by treatment
    // name. Rejecting the row also stops the bogus client being created,
    // because clients are minted from these rows downstream.
    if (knownServices && knownServices.has(rec.name.trim())) {
      nameIsService++;
      if (nameIsServiceSamples.length < 3) nameIsServiceSamples.push(rec.name.trim());
      continue;
    }

    if (!rec.date || badDate) { noDate++; continue; }
    // No time column, or one this cannot read: park it at the start of the day
    // rather than dropping a real booking. Counted so the preview can say so.
    // `hour` is not carried on the record: startFields() derives it from
    // startMinute at insert time, so there is one source of truth for the start.
    if (rec.startMinute === null) {
      if (timeSeen && timeBad) noTime++;
      rec.startMinute = 9 * 60;
    }
    if (rec.date < todayStr || (rec.date === todayStr && rec.startMinute < nowMinute)) { past++; continue; }

    out.push(rec);
  }
  return { rows: out, noName, noDate, past, noTime, nameIsService, nameIsServiceSamples };
};

// Everything that differs between the three imports, in one place. The wizard
// itself - paste box, mapping table, preview, result - is identical for all of
// them, and was starting to grow a ternary per target.
export const IMPORT_SPEC = {
  clients: {
    fields: IMPORT_FIELDS, guess: guessColumns, requires: ["name"], unit: "לקוחות",
    title: "ייבוא לקוחות",
    blurb: "יש לך רשימת לקוחות בתוכנה אחרת? ייצאי אותה לאקסל, סמני את העמודות, העתיקי והדביקי כאן. בשלב הבא תבחרי מה כל עמודה מייצגת.",
    rowLabel: "הדביקי כאן (שורה לכל לקוחה):",
    placeholder: "דנה כהן\t0541234567\nמיכל לוי\t0529876543",
  },
  services: {
    fields: SERVICE_IMPORT_FIELDS, guess: guessServiceColumns, requires: ["name"], unit: "טיפולים",
    title: "ייבוא טיפולים ומחירים",
    blurb: "יש לך מחירון בתוכנה אחרת או באקסל? העתיקי את העמודות והדביקי כאן. בשלב הבא תבחרי מה כל עמודה מייצגת.",
    rowLabel: "הדביקי כאן (שורה לכל טיפול):",
    placeholder: "טיפול פנים\t250\t60\nעיצוב גבות\t80\t30",
  },
  appts: {
    fields: APPT_IMPORT_FIELDS, guess: guessApptColumns, requires: ["name","date"], unit: "תורים",
    title: "ייבוא תורים עתידיים",
    blurb: "מעבירים רק תורים שעוד לא היו — היסטוריה לא מיובאת. ייצאי את היומן לאקסל, העתיקי והדביקי כאן, ובשלב הבא תבחרי מה כל עמודה מייצגת.",
    rowLabel: "הדביקי כאן (שורה לכל תור):",
    placeholder: "12/08/2026\t14:30\tדנה כהן\t0541234567\tטיפול פנים",
  },
};
