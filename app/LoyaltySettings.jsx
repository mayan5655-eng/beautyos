'use client';

// app/LoyaltySettings.jsx
//
// Settings > לקוחות ופניות > כרטיסיית נאמנות. Off until she turns it on. Everything lives in settings.automations.loyalty (an existing
// jsonb bag the settings save route already writes), so this screen works with no migration. The counting rules are lib/loyalty.js.

import { loyaltyConfig, loyaltyStored, freeVisitExample, LOYALTY_MIN, LOYALTY_MAX } from '@/lib/loyalty';

// The first example follows her "every N" (lib/loyalty.js freeVisitExample): it used to say "העשירי" whatever N was.
const OTHER_EXAMPLES = ['50% הנחה על הטיפול הבא', 'מסכה מתנה בטיפול הבא'];
const KINDS = [
  { k: 'free', l: 'טיפול חינם', d: 'בקופה, הטיפול היקר ביותר בביקור יורד מהחשבון.' },
  { k: 'pct', l: 'אחוז הנחה', d: 'בקופה, ההנחה באחוזים נכנסת לביקור.' },
  { k: 'gift', l: 'מתנה אחרת', d: 'משהו שאת נותנת ביד. בקופה רק נרשם שהמתנה ניתנה.' },
];

export default function LoyaltySettings({ settings, onChange, serviceNames = [], pc, pcTint }) {
  const cfg = loyaltyConfig(settings);
  // What she typed, untrimmed, so a space or an emptied field is not snapped back while she writes (the default applies when read).
  const typed = settings?.automations?.loyalty?.reward;
  const examples = [freeVisitExample(cfg.every), ...OTHER_EXAMPLES];
  // A reward text that is the numbered example for the old N (or the old fixed "העשירי") follows a change of N, so the card
  // never says "השישי" on a ten-visit card. Anything she wrote herself is left alone.
  const followsEvery = (text) => text === freeVisitExample(cfg.every) || text === 'הטיפול העשירי במתנה';
  const set = (patch) => onChange(loyaltyStored({ ...cfg, ...patch, ...(patch.every && patch.every !== cfg.every && followsEvery(cfg.reward) ? { reward: freeVisitExample(patch.every) } : {}) }));
  const box = { border: '1px solid var(--line-2)', borderRadius: 'var(--r-md)', padding: 14, background: 'var(--surface-2)', display: 'flex', flexDirection: 'column', gap: 10 };
  const label = { fontSize: 'var(--t-sm)', color: 'var(--ink-2)', fontWeight: 600, margin: 0 };
  const hint = { fontSize: 'var(--t-xs)', color: 'var(--ink-3)', lineHeight: 1.6, margin: 0 };
  const chip = (on) => ({ minHeight: 40, minWidth: 40, padding: '6px 12px', borderRadius: 'var(--r-lg)', border: on ? `2px solid ${pc}` : '1px solid var(--line)', background: on ? pcTint : 'var(--surface)', color: on ? 'var(--ink)' : 'var(--ink-2)', fontSize: 'var(--t-sm)', fontWeight: on ? 700 : 500, cursor: 'pointer', fontFamily: 'inherit' });
  const input = { width: '100%', border: '1px solid var(--line)', borderRadius: 'var(--r-sm)', padding: '9px 12px', fontSize: 'var(--t-sm)', fontFamily: 'inherit', outline: 'none', direction: 'rtl', background: pcTint };

  return (
    <div data-testid="loyalty-settings" style={box}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <p style={{ fontSize: 'var(--t-md)', fontWeight: 700, color: 'var(--ink)', margin: 0 }}>🎁 כרטיסיית נאמנות</p>
          <p style={hint}>כל כמה ביקורים מגיעה ללקוחה מתנה. הביקורים נספרים לבד מאישורי התשלום.</p>
        </div>
        <button type="button" role="switch" aria-checked={cfg.enabled} aria-label="כרטיסיית נאמנות" data-testid="loyalty-toggle" onClick={() => set({ enabled: !cfg.enabled })}
          style={{ width: 46, height: 26, borderRadius: 'var(--r-sm)', border: 'none', cursor: 'pointer', background: cfg.enabled ? pc : '#D8CEd3', position: 'relative', flexShrink: 0 }}>
          <span style={{ position: 'absolute', top: 3, left: cfg.enabled ? 23 : 3, width: 20, height: 20, borderRadius: '50%', background: 'var(--surface)', transition: 'left .2s' }} />
        </button>
      </div>

      {cfg.enabled && (<>
        <div>
          <p style={label}>כל כמה ביקורים מגיעה מתנה?</p>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
            {Array.from({ length: LOYALTY_MAX - LOYALTY_MIN + 1 }, (_, i) => LOYALTY_MIN + i).map((n) => (
              <button key={n} type="button" aria-pressed={cfg.every === n} onClick={() => set({ every: n })} style={chip(cfg.every === n)}>{n}</button>
            ))}
          </div>
        </div>

        <div>
          <p style={label}>מה המתנה?</p>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '6px 0' }}>
            {KINDS.map((k) => <button key={k.k} type="button" aria-pressed={cfg.rewardKind === k.k} onClick={() => set({ rewardKind: k.k })} style={chip(cfg.rewardKind === k.k)}>{k.l}</button>)}
          </div>
          <p style={hint}>{KINDS.find((k) => k.k === cfg.rewardKind)?.d}</p>
          {cfg.rewardKind === 'pct' && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, fontSize: 'var(--t-sm)', color: 'var(--ink-2)' }}>
              אחוז ההנחה
              <input type="number" inputMode="numeric" min={1} max={100} value={cfg.rewardPct} onChange={(e) => set({ rewardPct: Number(e.target.value) })} aria-label="אחוז ההנחה" style={{ ...input, width: 80, textAlign: 'center' }} />
              %
            </label>
          )}
          <p style={{ ...label, marginTop: 10 }}>מה כתוב ללקוחה</p>
          <input value={typeof typed === 'string' ? typed : cfg.reward} maxLength={80} onChange={(e) => onChange({ ...loyaltyStored(cfg), reward: e.target.value })} placeholder={`למשל: ${examples[0]}`} aria-label="נוסח המתנה" style={{ ...input, marginTop: 6 }} />
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
            {examples.map((t) => <button key={t} type="button" onClick={() => set({ reward: t })} style={{ ...chip(false), minHeight: 32, fontSize: 'var(--t-xs)' }}>{t}</button>)}
          </div>
        </div>

        {serviceNames.length > 0 && (
          <div>
            <p style={label}>לאילו טיפולים?</p>
            <p style={hint}>{cfg.services.length ? 'נספרים רק ביקורים עם הטיפולים שסימנת.' : 'כל ביקור עם טיפול נספר. אפשר לסמן כדי להגביל.'}</p>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
              {serviceNames.map((n) => {
                const on = cfg.services.includes(n);
                return <button key={n} type="button" aria-pressed={on} onClick={() => set({ services: on ? cfg.services.filter((x) => x !== n) : [...cfg.services, n] })} style={chip(on)}>{on ? '✓ ' : ''}{n}</button>;
              })}
            </div>
          </div>
        )}

        <div>
          <p style={label}>תוקף לביקור</p>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
            {[0, 6, 12, 24].map((m) => <button key={m} type="button" aria-pressed={cfg.expiryMonths === m} onClick={() => set({ expiryMonths: m })} style={chip(cfg.expiryMonths === m)}>{m === 0 ? 'בלי תוקף' : `${m} חודשים`}</button>)}
          </div>
          {cfg.expiryMonths > 0 && <p style={{ ...hint, marginTop: 6 }}>ביקור שעברו ממנו יותר מ{cfg.expiryMonths} חודשים יוצא מהכרטיסייה.</p>}
        </div>

        <p style={hint}>מה נספר: תשלום על ביקור עם טיפול, אחד ליום. לא נספרים: תשלום שבוטל, מכירת חבילה, מקדמה, ומוצר בלבד. הודעות ללקוחה לא נשלחות לבד: כשחסר לה ביקור אחד או שהמתנה מוכנה, תופיע לך הודעה מוכנה לשליחה מהוואטסאפ שלך.</p>
      </>)}
    </div>
  );
}
