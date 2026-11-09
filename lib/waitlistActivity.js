// lib/waitlistActivity.js
//
// "What happened with the slots that freed": the waiting-list card's short history, from slot_offers rows written by the smart
// waitlist (tokens that start with "wl", lib/waitlistOffers.js). Pure, import-free, so the browser and the plain-node test both
// run it. A row whose message never reached anyone (status cancelled: the send failed or was blocked) is not an offer and is
// left out, so the card never says "we offered" about a message nobody got.

const pad = (n) => String(n).padStart(2, '0');
const niceDate = (date) => { const [, m, d] = String(date || '').split('-'); return d && m ? `${d}/${m}` : String(date || ''); };
const fmt = (min) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
const first = (n) => String(n || '').trim().split(/\s+/)[0] || 'לקוחה';

function joinNames(names) {
  if (names.length <= 1) return names[0] || '';
  return `${names.slice(0, -1).join(', ')} ול${names[names.length - 1]}`;
}

/**
 * @param {Array} rows slot_offers rows: token, slot_date, slot_start_minute, slot_hour, service, client_name, status, claimed_at, expires_at, created_at
 * @param {Date} [now]
 * @returns {Array<{ key, line, outcome: 'won'|'open'|'expired', when }>} newest first, at most 8
 */
export function waitlistActivity(rows, now = new Date()) {
  const groups = new Map();
  for (const r of rows || []) {
    if (!r || !String(r.token || '').startsWith('wl') || r.status === 'cancelled') continue;
    const minute = r.slot_start_minute != null ? Number(r.slot_start_minute) : r.slot_hour != null ? Number(r.slot_hour) * 60 : null;
    if (minute == null || !Number.isFinite(minute)) continue;
    const key = `${r.slot_date}|${minute}`;
    if (!groups.has(key)) groups.set(key, { key, date: r.slot_date, minute, rows: [], latest: '' });
    const g = groups.get(key);
    g.rows.push(r);
    const at = String(r.created_at || '');
    if (at > g.latest) g.latest = at;
  }
  const out = [];
  for (const g of groups.values()) {
    const names = [...new Set(g.rows.map((r) => first(r.client_name)))];
    const winner = g.rows.find((r) => r.status === 'claimed' || r.claimed_at);
    const services = [...new Set(g.rows.map((r) => String(r.service || '').trim()).filter(Boolean))];
    const open = !winner && g.rows.some((r) => r.status === 'sent' && new Date(r.expires_at).getTime() > now.getTime());
    const outcome = winner ? 'won' : open ? 'open' : 'expired';
    const tail = winner ? `${first(winner.client_name)} תפסה אותו והוא ביומן.` : open ? 'עוד לא נתפס, הקישור פתוח.' : 'אף אחת לא תפסה אותו בזמן.';
    out.push({
      key: g.key,
      when: g.latest,
      outcome,
      line: `הצענו את התור ב-${niceDate(g.date)} בשעה ${fmt(g.minute)}${services.length ? ` (${services.join(' / ')})` : ''} ל${joinNames(names)}. ${tail}`,
    });
  }
  out.sort((a, b) => String(b.when).localeCompare(String(a.when)));
  return out.slice(0, 8);
}
