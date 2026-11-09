'use client';

// app/UpgradesStore.jsx
//
// "שדרוגים ✨": what she can buy from Kalmea in one tap, and the small upgrade chip on each screen that has a metered feature.
// Not treatment add-ons for her clients: this is Kalmea's own store, so it wears Kalmea's chrome (the --k-* palette), not her accent.
//
//   UpgradesStore (default)  the sheet, mounted once in app/beautyos.jsx. Opened by openUpgrades() (lib/upgradesStore.ts), optionally
//                            straight at one pack's confirm sheet.
//   UpgradeChip              "רוצה עוד רילסים? לחצי כאן ✨" under each metered screen (posts, reels, advisor, skin scan). Quiet below 80%
//                            of the month's amount, the stronger nudge from 80% and at the cap. Opens that screen's pack.
//   UsageMeter               "השתמשת ב-7 מתוך 10 החודש" with a small bar.
//   UpgradesEntry            the entry points: Settings (always, when the store has a card) and home (only when something runs out).
//
// Safety: a tap never charges. Every purchase goes through a confirm sheet that names the price and the card's last four ("39 ₪ יחויבו
// בכרטיס שמסתיים ב-4242"), and only "אישור וחיוב" charges, through the existing /api/billing/addon. The button is disabled while the
// request runs, and each sheet carries one requestId so a double tap is answered once (the route and buyAddon guard the rest).
//
// Flags: nothing renders and nothing is fetched unless one of NEXT_PUBLIC_ADDON_PACKS / NEXT_PUBLIC_ANNUAL_PLAN / NEXT_PUBLIC_REFERRALS
// is on, and the server decides what is really offered (packs and yearly also need BILLING_UI_ENABLED). An empty store hides its entries.

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Sheet from './Sheet';
import { ADDON_PACKS, addonButtonHe, addonPacksEnabled, priceHe } from '@/lib/pricing';
import { annualOfferHe, trialEndDateHe } from '@/lib/planCopy';
import { billingAnnualConsentTextHe, BILLING_TERMS_SENTENCE_HE } from '@/lib/billing/consent';
import { KALMEA_TERMS_HREF } from '@/lib/paymentTerms';
import {
  UPGRADES_EVENT, UPGRADES_CHANGED_EVENT, upgradesFlagsOn, storeCards, packFor, homeNudgePack, usageLevel, usagePct, usageLineHe,
  pageChipHe, packTitleHe, packWhatHe, priceNoteHe, confirmChargeHe, successHe, annualSavingHe, newRequestId, openUpgrades,
  isFinalRefusal, purchaseOutcome, outcomeHe, LOST_ANSWER_HE,
} from '@/lib/upgradesStore';

/** Above every drawer and sheet that can hold a chip (the client drawer 1200, the scan report 1300, the "more" sheet 1401), below the
 *  confirm dialog (4000) and the toasts (5000). Rendered into document.body, so no parent's stacking context can trap it. */
export const STORE_Z = 1450;

// ── one shared read of /api/billing/upgrades for every chip, entry and the sheet ────────────────────────────────────────────────────
let shared = { data: null, loading: false, at: 0 };
// Vercel review 2026-11-09: a forced read (after a purchase) must never be satisfied by an older read still in flight, and an older
// answer arriving late must never overwrite a newer one. Every read takes a number; only the newest one may write.
let seq = 0;
let inflight = null;
const listeners = new Set();
const emit = () => { for (const l of listeners) l(shared.data); };

/** The last answer the store holds (tests, and the toast's availability check). */
export function currentUpgrades() { return shared.data; }

/** Tests (and only tests) seed the data a server render would otherwise wait for. */
export function primeUpgrades(data) { shared = { data, loading: false, at: data ? Date.now() : 0 }; emit(); }

export async function loadUpgrades(force = false) {
  if (!upgradesFlagsOn()) return null;
  if (!force && inflight) return inflight;
  if (!force && shared.data && Date.now() - shared.at < 60_000) return shared.data;
  const mine = ++seq;
  shared = { ...shared, loading: true };
  const run = (async () => {
    let fresh = null;
    try {
      const r = await fetch('/api/billing/upgrades', { cache: 'no-store' });
      const j = await r.json().catch(() => null);
      if (r.ok && j?.success) fresh = j;
    } catch { /* keep what we had */ }
    // A newer read started after this one: its answer wins, this one is dropped (it may predate a purchase).
    if (mine !== seq) return fresh;
    shared = fresh ? { data: fresh, loading: false, at: Date.now() } : { ...shared, loading: false };
    inflight = null;
    emit();
    return fresh;
  })();
  inflight = run;
  return run;
}

/** Can this pack be bought right now (the last answer from the server)? For buttons rendered outside a hook (the cap-hit toast). */
export function packAvailable(key) { return addonPacksEnabled() && !!packFor(shared.data, key); }

export function useUpgrades() {
  const [d, setD] = useState(() => shared.data);
  useEffect(() => {
    listeners.add(setD);
    loadUpgrades();
    return () => { listeners.delete(setD); };
  }, []);
  return d;
}

const day = (iso) => (iso ? trialEndDateHe(new Date(iso)) : '');

// ── pieces ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
export function UsageMeter({ used, cap, compact = false }) {
  const level = usageLevel(used, cap);
  const pct = usagePct(used, cap);
  const fill = level === 'full' ? 'var(--danger)' : level === 'near' ? 'var(--k-pink)' : 'var(--k-green)';
  return (
    <div data-testid="usage-meter" data-level={level} style={{ marginTop: compact ? 4 : 8 }}>
      <p style={{ fontSize: 'var(--t-sm)', color: 'var(--ink-2)', marginBottom: 4, unicodeBidi: 'isolate' }}>{usageLineHe(used, cap)}</p>
      <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={usageLineHe(used, cap)}
        style={{ height: 6, borderRadius: 'var(--r-full)', background: 'var(--k-sage)', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', borderRadius: 'var(--r-full)', background: fill, transition: 'width .4s ease' }} />
      </div>
    </div>
  );
}

/**
 * The small, always-visible upgrade button on a metered screen. `used`/`cap` override the server's numbers when the screen already holds
 * a fresher count (the post generator). Hidden with packs off, with billing off, or when the server does not offer this pack.
 */
export function UpgradeChip({ pack, used, cap, meter = false, style }) {
  const d = useUpgrades();
  if (!addonPacksEnabled()) return null;
  const p = packFor(d, pack);
  if (!p || !ADDON_PACKS[pack]) return null;
  const u = used ?? p.used;
  const c = cap ?? p.cap;
  const level = usageLevel(u, c);
  const loud = level === 'near' || level === 'full';
  return (
    <div data-testid={`upgrade-chip-wrap-${pack}`} style={{ marginTop: 10, ...style }}>
      {meter && <UsageMeter used={u} cap={c} compact />}
      <button type="button" data-testid={`upgrade-chip-${pack}`} data-pack={pack} data-level={level} onClick={() => openUpgrades(pack)}
        style={loud
          ? { marginTop: meter ? 8 : 0, background: 'var(--k-green)', color: 'var(--k-cream)', border: 'none', borderRadius: 'var(--r-full)', padding: '9px 16px', minHeight: 40, fontSize: 'var(--t-sm)', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'right' }
          : { marginTop: meter ? 8 : 0, background: 'transparent', color: 'var(--ink-2)', border: '1px dashed var(--k-pink)', borderRadius: 'var(--r-full)', padding: '6px 14px', minHeight: 36, fontSize: 'var(--t-sm)', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'right' }}>
        <bdi>{pageChipHe(pack, level)}</bdi>
      </button>
    </div>
  );
}

/** Entry points. `settings`: a row at the top of Settings. `home`: a soft card on home, only when a feature is about to run out. */
export function UpgradesEntry({ variant = 'settings', style }) {
  const d = useUpgrades();
  if (!upgradesFlagsOn()) return null;
  const cards = storeCards(d);
  if (!cards.length) return null;
  if (variant === 'home') {
    const p = homeNudgePack(d);
    if (!p) return null;
    const level = usageLevel(p.used, p.cap);
    return (
      <div data-testid="upgrades-home" className="glass-card card-boxed" style={{ display: 'flex', flexDirection: 'column', gap: 4, width: '100%', maxWidth: 1180, marginInline: 'auto', marginBottom: 12, padding: '14px 17px', background: 'var(--k-petal)', border: '1px solid var(--line)', ...style }}>
        <p style={{ fontSize: 'var(--t-md)', fontWeight: 700, color: 'var(--ink)' }}>{packTitleHe(p.key)}</p>
        <UsageMeter used={p.used} cap={p.cap} compact />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
          <button type="button" data-testid="upgrades-home-buy" data-pack={p.key} onClick={() => openUpgrades(p.key)} style={{ background: 'var(--k-green)', color: 'var(--k-cream)', border: 'none', borderRadius: 'var(--r-sm)', padding: '9px 14px', minHeight: 44, fontWeight: 700, fontSize: 'var(--t-sm)', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'right' }}>
            <bdi>{level === 'full' ? addonButtonHe(ADDON_PACKS[p.key]) : pageChipHe(p.key, level)}</bdi>
          </button>
          <button type="button" onClick={() => openUpgrades()} style={{ background: 'transparent', color: 'var(--ink-2)', border: '1px solid var(--line-2)', borderRadius: 'var(--r-sm)', padding: '9px 14px', minHeight: 44, fontWeight: 600, fontSize: 'var(--t-sm)', cursor: 'pointer', fontFamily: 'inherit' }}>כל השדרוגים ✨</button>
        </div>
      </div>
    );
  }
  return (
    <button type="button" data-testid="upgrades-entry" onClick={() => openUpgrades()} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', background: 'var(--k-petal)', border: '1px solid var(--line)', borderRadius: 'var(--r-sm)', padding: '10px 12px', marginBottom: 14, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'right', ...style }}>
      <span aria-hidden style={{ fontSize: 'var(--t-lg)', flexShrink: 0 }}>✨</span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 'var(--t-sm)', fontWeight: 700, color: 'var(--ink)' }}>שדרוגים ✨</span>
        <span style={{ display: 'block', fontSize: 'var(--t-sm)', color: 'var(--ink-2)' }}>עוד יצירות AI, תשלום שנתי ועוד, בלחיצה אחת</span>
      </span>
      <span aria-hidden style={{ color: 'var(--ink-2)', flexShrink: 0 }}>‹</span>
    </button>
  );
}

// ── the store ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const cardBox = { background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--r-md)', padding: '14px 16px', boxShadow: 'var(--shadow-xs)' };
const primaryBtn = { background: 'var(--k-green)', color: 'var(--k-cream)', border: 'none', borderRadius: 'var(--r-sm)', padding: '11px 16px', minHeight: 44, fontWeight: 700, fontSize: 'var(--t-sm)', cursor: 'pointer', fontFamily: 'inherit' };
const ghostBtn = { background: 'var(--surface)', color: 'var(--ink)', border: '1px solid var(--line-2)', borderRadius: 'var(--r-sm)', padding: '11px 16px', minHeight: 44, fontWeight: 700, fontSize: 'var(--t-sm)', cursor: 'pointer', fontFamily: 'inherit' };
const text = { fontSize: 'var(--t-sm)', color: 'var(--ink-2)', lineHeight: 1.7 };
const title = { fontSize: 'var(--t-md)', fontWeight: 700, color: 'var(--ink)' };

/** The store's body, separate from the sheet so a test can render each state. */
export function StoreBody({ d, view, busy, err, consentOk, isDemo, onView, onBuy, onAnnual, onConsent, onOpenCard, onOpenReferral, onClose }) {
  const cards = storeCards(d);
  const demo = isDemo || d?.demo;
  const card = d?.card || null;

  // One pack's confirm sheet: what she gets, the price, the card, one "confirm". A pack that cannot be bought falls back to the list.
  const viewPack = view?.kind === 'pack' || view?.kind === 'success' ? packFor(d, view.key) : null;
  if (view?.kind === 'pack' && viewPack) {
    const p = viewPack;
    return (
      <div data-testid={`upgrade-confirm-${view.key}`} data-pack={view.key}>
        <p style={{ ...title, fontSize: 'var(--t-lg)' }}><bdi>{addonButtonHe(ADDON_PACKS[view.key])}</bdi></p>
        <p style={{ ...text, marginTop: 4 }}>{packWhatHe(view.key)}</p>
        <UsageMeter used={p.used} cap={p.cap} />
        {demo ? (
          <p style={{ ...text, marginTop: 14 }}>זו תצוגה, בחשבון הדגמה לא מחייבים.</p>
        ) : !card ? (
          <div data-testid="upgrade-no-card" style={{ marginTop: 14, background: 'var(--k-petal)', borderRadius: 'var(--r-sm)', padding: '12px 14px' }}>
            <p style={{ ...text, color: 'var(--ink)' }}>כדי להוסיף בלחיצה אחת צריך כרטיס שמור במנוי שלך. שומרים אותו פעם אחת, וזהו.</p>
            <button type="button" data-testid="upgrade-add-card" style={{ ...primaryBtn, marginTop: 10 }} onClick={onOpenCard}>לשמירת כרטיס</button>
          </div>
        ) : (
          <div style={{ marginTop: 14, background: 'var(--k-petal)', borderRadius: 'var(--r-sm)', padding: '12px 14px' }}>
            <p data-testid="upgrade-charge-line" style={{ ...title, fontSize: 'var(--t-md)' }}>
              {priceHe(p.price)} יחויבו בכרטיס שמסתיים ב-<b dir="ltr" style={{ unicodeBidi: 'isolate' }}>{card.last4}</b>
            </p>
            <p style={{ ...text, marginTop: 2 }}>חיוב אחד, לחודש הזה בלבד · {priceNoteHe()}</p>
            {d?.mode === 'mock' && <p style={{ ...text, fontWeight: 700, color: 'var(--ink)' }}>מצב בדיקה: לא נגבה כסף אמיתי</p>}
            {err && <p role="alert" style={{ ...text, color: 'var(--danger)', fontWeight: 700, marginTop: 6 }}>{err}</p>}
            <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
              <button type="button" data-testid={`upgrade-pay-${view.key}`} aria-label={confirmChargeHe(p.price, card.last4)} style={{ ...primaryBtn, flex: '1 1 160px', opacity: busy ? 0.7 : 1 }} disabled={busy} onClick={() => onBuy(view.key)}>{busy ? 'מחייבת…' : 'אישור וחיוב'}</button>
              <button type="button" style={ghostBtn} disabled={busy} onClick={() => onView(null)}>ביטול</button>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (view?.kind === 'success') {
    const p = packFor(d, view.key);
    return (
      <div data-testid="upgrade-success" style={{ textAlign: 'center', padding: '10px 0' }}>
        <p aria-hidden style={{ fontSize: 'var(--t-3xl)', lineHeight: 1 }}>🌸</p>
        <p style={{ ...title, fontSize: 'var(--t-lg)', marginTop: 8 }}>{successHe(view.key, p?.cap)}</p>
        {p && <div style={{ maxWidth: 320, margin: '6px auto 0' }}><UsageMeter used={p.used} cap={p.cap} /></div>}
        <p style={{ ...text, marginTop: 8 }}>המסמך על החיוב יופיע ברשימת החיובים במנוי שלך.</p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 14, flexWrap: 'wrap' }}>
          <button type="button" style={primaryBtn} onClick={onClose}>להמשיך ליצור</button>
          <button type="button" style={ghostBtn} onClick={() => onView(null)}>לכל השדרוגים</button>
        </div>
      </div>
    );
  }

  if (view?.kind === 'annual') {
    const a = d?.annual;
    if (!a) return null;
    return (
      <div data-testid="upgrade-confirm-annual">
        <p style={{ ...title, fontSize: 'var(--t-lg)' }}>מעבר לתשלום שנתי</p>
        <p style={{ ...text, marginTop: 4 }}>{annualOfferHe(a.monthly)} · {annualSavingHe(a.monthly)}</p>
        {demo ? (
          <p style={{ ...text, marginTop: 14 }}>זו תצוגה, בחשבון הדגמה אי אפשר לשנות מנוי.</p>
        ) : !card ? (
          <div data-testid="upgrade-no-card" style={{ marginTop: 14, background: 'var(--k-petal)', borderRadius: 'var(--r-sm)', padding: '12px 14px' }}>
            <p style={{ ...text, color: 'var(--ink)' }}>כדי לעבור לשנתי צריך קודם כרטיס שמור במנוי שלך.</p>
            <button type="button" style={{ ...primaryBtn, marginTop: 10 }} onClick={onOpenCard}>לשמירת כרטיס</button>
          </div>
        ) : (
          <div style={{ marginTop: 14, background: 'var(--k-petal)', borderRadius: 'var(--r-sm)', padding: '12px 14px' }}>
            <p style={{ ...text, color: 'var(--ink)' }}>עכשיו לא מחויב כלום. המעבר נכנס לתוקף בחידוש הבא{d.nextChargeAt ? `, ב-${day(d.nextChargeAt)}` : ''}.</p>
            <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer', marginTop: 10, ...text }}>
              <input type="checkbox" data-testid="upgrade-annual-consent" checked={!!consentOk} onChange={(e) => onConsent(e.target.checked)} style={{ accentColor: 'var(--k-green)', width: 20, height: 20, marginTop: 2, flexShrink: 0 }} />
              <span>{billingAnnualConsentTextHe(a.yearly, day(d.nextChargeAt)).replace(BILLING_TERMS_SENTENCE_HE, '')}קראתי ואני מסכימה ל<a href={KALMEA_TERMS_HREF} target="_blank" rel="noreferrer" style={{ color: 'inherit', fontWeight: 700, textDecoration: 'underline' }}>תנאי השימוש</a> של קלמיה.</span>
            </label>
            {err && <p role="alert" style={{ ...text, color: 'var(--danger)', fontWeight: 700, marginTop: 6 }}>{err}</p>}
            <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
              <button type="button" data-testid="upgrade-annual-confirm" style={{ ...primaryBtn, flex: '1 1 160px', opacity: busy || !consentOk ? 0.6 : 1 }} disabled={busy || !consentOk} onClick={onAnnual}>{busy ? 'שומרת…' : 'כן, לעבור לשנתי'}</button>
              <button type="button" style={ghostBtn} disabled={busy} onClick={() => onView(null)}>ביטול</button>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (view?.kind === 'annual-done') {
    return (
      <div data-testid="upgrade-annual-done" style={{ textAlign: 'center', padding: '10px 0' }}>
        <p aria-hidden style={{ fontSize: 'var(--t-3xl)', lineHeight: 1 }}>🌸</p>
        <p style={{ ...title, fontSize: 'var(--t-lg)', marginTop: 8 }}>נשמר! המעבר לשנתי ייכנס לתוקף בחידוש הבא</p>
        <p style={{ ...text, marginTop: 6 }}>עד אז לא משתנה דבר ולא יהיה חיוב נוסף.</p>
        <button type="button" style={{ ...primaryBtn, marginTop: 14 }} onClick={() => onView(null)}>לכל השדרוגים</button>
      </div>
    );
  }

  // The list of cards.
  if (!cards.length) return d ? null : <p style={text}>טוענת…</p>;
  return (
    <div data-testid="upgrades-list" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {cards.map((c) => {
        if (c.kind === 'pack') {
          const pk = ADDON_PACKS[c.key];
          const level = usageLevel(c.usage.used, c.usage.cap);
          return (
            <div key={c.key} data-testid={`upgrade-card-${c.key}`} style={{ ...cardBox, borderColor: level === 'near' || level === 'full' ? 'var(--k-pink)' : 'var(--line)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                <p style={title}><bdi>{packTitleHe(c.key)}</bdi></p>
                <p style={{ ...title, fontFamily: "'Frank Ruhl Libre', serif" }}>{priceHe(pk.price)}</p>
              </div>
              <p style={{ ...text, marginTop: 2 }}>{packWhatHe(c.key)} · {priceNoteHe()}</p>
              <UsageMeter used={c.usage.used} cap={c.usage.cap} />
              <button type="button" data-testid={`upgrade-buy-${c.key}`} data-pack={c.key} style={{ ...primaryBtn, width: '100%', marginTop: 10 }} onClick={() => onView({ kind: 'pack', key: c.key })}><bdi>{addonButtonHe(pk)}</bdi></button>
            </div>
          );
        }
        if (c.kind === 'annual') {
          return (
            <div key="annual" data-testid="upgrade-card-annual" style={cardBox}>
              <p style={title}>תשלום שנתי, חודשיים מתנה</p>
              <p style={{ ...text, marginTop: 2 }}>{annualOfferHe(c.monthly)} · {annualSavingHe(c.monthly)}. {priceNoteHe()}.</p>
              {c.pending ? (
                <p style={{ ...text, color: 'var(--ink)', fontWeight: 700, marginTop: 8 }}>✓ המעבר לשנתי ייכנס לתוקף בחידוש הבא</p>
              ) : (
                <button type="button" data-testid="upgrade-buy-annual" style={{ ...primaryBtn, width: '100%', marginTop: 10 }} onClick={() => onView({ kind: 'annual' })}>לעבור לשנתי ולחסוך</button>
              )}
            </div>
          );
        }
        return (
          <div key="referral" data-testid="upgrade-card-referral" style={{ ...cardBox, background: 'var(--k-petal)' }}>
            <p style={title}>חברה מביאה חברה 🌸</p>
            <p style={{ ...text, marginTop: 2 }}>מזמינה קוסמטיקאית חברה, ואחרי התשלום הראשון שלה שתיכן מקבלות חודש במתנה.</p>
            <button type="button" data-testid="upgrade-referral" style={{ ...ghostBtn, width: '100%', marginTop: 10 }} onClick={onOpenReferral}>להזמנת חברה</button>
          </div>
        );
      })}
    </div>
  );
}

export default function UpgradesStore({ toast, isDemo, onOpenCard, onOpenReferral }) {
  const d = useUpgrades();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [consentOk, setConsentOk] = useState(false);
  const rid = useRef('');

  const goTo = useCallback((v) => { setView(v); setErr(''); setConsentOk(false); rid.current = v?.kind === 'pack' ? newRequestId() : ''; }, []);

  useEffect(() => {
    if (!upgradesFlagsOn()) return undefined;
    window.__kalmeaUpgradesMounted = true;
    const on = (e) => {
      const pack = e?.detail?.pack;
      setOpen(true);
      goTo(pack && ADDON_PACKS[pack] ? { kind: 'pack', key: pack } : null);
      loadUpgrades(true);
    };
    window.addEventListener(UPGRADES_EVENT, on);
    return () => { window.removeEventListener(UPGRADES_EVENT, on); window.__kalmeaUpgradesMounted = false; };
  }, [goTo]);

  if (!upgradesFlagsOn()) return null;

  const close = () => { if (!busy) { setOpen(false); goTo(null); } };

  const landed = async (key) => {
    try { window.dispatchEvent(new CustomEvent(UPGRADES_CHANGED_EVENT, { detail: { pack: key } })); } catch { /* old browser */ }
    setView({ kind: 'success', key });
    toast?.('החבילה נוספה, אפשר להמשיך ליצור 🌸');
  };

  // The answer was lost or is not a clear refusal: read her real ledger instead of guessing. Twice, a few seconds apart, because a lost
  // answer can mean the server is still charging. Never says "not charged" unless the ledger shows no charge, or the provider's "no".
  const verify = async (key, sinceIso) => {
    setErr(LOST_ANSWER_HE);
    let o = 'unknown';
    for (let i = 0; i < 2; i++) {
      if (i) await new Promise((res) => setTimeout(res, 3000));
      const fresh = await loadUpgrades(true);
      o = fresh ? purchaseOutcome(fresh.recentAddons, key, sinceIso) : 'unknown';
      if (o === 'succeeded' || o === 'failed') break;
    }
    if (o === 'succeeded') { setErr(''); await landed(key); return; }
    setErr(outcomeHe(o));
    // A recorded "no", or no charge at all: a second tap is a new, deliberate request. Pending / unknown keep the same id.
    if (o === 'failed' || o === 'none') rid.current = newRequestId();
  };

  const buy = async (key) => {
    if (busy) return;
    setBusy(true); setErr('');
    // A little before now, so a server clock slightly behind hers still counts this charge as this request's.
    const sinceIso = new Date(Date.now() - 60_000).toISOString();
    try {
      let r = null;
      let j = null;
      try {
        r = await fetch('/api/billing/addon', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pack: key, requestId: rid.current }) });
        j = await r.json().catch(() => null);
      } catch { r = null; }
      if (r && r.ok && j?.success) { await loadUpgrades(true); await landed(key); return; }
      if (r && isFinalRefusal(r.status, j)) {
        setErr(j?.error || 'החיוב לא הצליח, נסי שוב');
        rid.current = newRequestId();
        return;
      }
      // No answer, a body that is not JSON, a server error, "pending", "in progress": the card may have been charged. Check.
      await verify(key, sinceIso);
    } finally { setBusy(false); }
  };

  const switchAnnual = async () => {
    if (busy || !consentOk) return;
    setBusy(true); setErr('');
    try {
      const r = await fetch('/api/billing/period', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ period: 'annual', consent: true }) });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.success) { setErr(j?.error || 'לא הצלחנו לשמור, נסי שוב'); return; }
      await loadUpgrades(true);
      try { window.dispatchEvent(new CustomEvent(UPGRADES_CHANGED_EVENT, { detail: { annual: true } })); } catch { /* old browser */ }
      setView({ kind: 'annual-done' });
    } catch {
      setErr('אין חיבור. לא נשמר, נסי שוב');
    } finally { setBusy(false); }
  };

  if (!open || typeof document === 'undefined') return null;
  return createPortal(
    <Sheet open={open} onClose={close} busy={busy} width={460} zIndex={STORE_Z} ariaLabel="שדרוגים"
      title={view ? undefined : 'שדרוגים ✨'} subtitle={view ? undefined : 'חבילה שמוסיפים נכנסת לתוקף מיד, בלי התחייבות.'}>
      <div data-testid="upgrades-store" style={{ paddingTop: view ? 4 : 0 }}>
        <StoreBody d={d} view={view} busy={busy} err={err} consentOk={consentOk} isDemo={isDemo}
          onView={goTo} onBuy={buy} onAnnual={switchAnnual} onConsent={setConsentOk}
          onOpenCard={() => { setOpen(false); goTo(null); onOpenCard?.(); }}
          onOpenReferral={() => { setOpen(false); goTo(null); onOpenReferral?.(); }}
          onClose={close} />
      </div>
    </Sheet>,
    document.body,
  );
}
