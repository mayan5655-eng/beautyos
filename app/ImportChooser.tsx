'use client';

/**
 * ImportChooser — the "what would you like to bring across?" list.
 *
 * Presentational only: it renders the choices and calls onPick. That is what
 * lets the SAME chooser appear in two very different places without either one
 * depending on the other:
 *
 *   Settings (app/beautyos.jsx)  picks a kind and opens the wizard in place.
 *   Onboarding (app/onboarding)  shows it immediately on tap, then saves and
 *                                routes to the app once she has picked.
 *
 * Onboarding has no access to the import wizard - it is a separate route with
 * none of the app's client/service state - which is why the chooser is split
 * out rather than the whole wizard.
 */

export type ImportKind = 'clients' | 'services' | 'appts';

export const IMPORT_KINDS: {
  id: ImportKind;
  icon: string;
  title: string;
  blurb: string;
  ready: boolean;
}[] = [
  { id:'clients',  icon:'👥', title:'לקוחות',          blurb:'שמות, טלפונים, הערות, אלרגיות', ready:true },
  { id:'services', icon:'✦',  title:'שירותים ומחירים', blurb:'שם הטיפול, מחיר ומשך',          ready:true },
  { id:'appts',    icon:'◴',  title:'תורים עתידיים',    blurb:'תאריך, שעה ולקוחה — היסטוריה לא מיובאת', ready:true },
];

export default function ImportChooser({
  onPick,
  accent = 'var(--pc)',
  accentTint = 'var(--pc-tint)',
}: {
  onPick: (kind: ImportKind) => void;
  accent?: string;
  accentTint?: string;
}) {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:9 }}>
      {IMPORT_KINDS.map((k) => (
        <button
          key={k.id}
          onClick={() => k.ready && onPick(k.id)}
          disabled={!k.ready}
          style={{
            display:'flex', alignItems:'center', gap:13, padding:'14px 15px', borderRadius:16,
            textAlign:'right', width:'100%', fontFamily:'inherit',
            border:`1px solid ${k.ready ? 'var(--line)' : 'var(--line-2)'}`,
            background: k.ready ? 'var(--surface)' : 'var(--surface-2)',
            cursor: k.ready ? 'pointer' : 'default',
            opacity: k.ready ? 1 : 0.6,
          }}
        >
          <span style={{
            width:40, height:40, borderRadius:13, flexShrink:0, display:'flex',
            alignItems:'center', justifyContent:'center', fontSize:18,
            background: k.ready ? accentTint : 'var(--surface)', color: accent,
          }}>{k.icon}</span>
          <span style={{ flex:1, minWidth:0 }}>
            <span style={{ display:'block', fontSize:13.5, fontWeight:700, color:'var(--ink)' }}>{k.title}</span>
            <span style={{ display:'block', fontSize:12, color:'var(--ink-3)', marginTop:2 }}>{k.blurb}</span>
          </span>
          {k.ready && <span aria-hidden style={{ fontSize:16, color:accent, flexShrink:0 }}>←</span>}
        </button>
      ))}
      <p style={{ fontSize:12, color:'var(--ink-3)', lineHeight:1.6, marginTop:2 }}>
        איך זה עובד: מייצאים מהתוכנה הקודמת לאקסל, מסמנים את העמודות, מעתיקים ומדביקים כאן. אנחנו נשאל מה כל עמודה מייצגת — ונראה לך תצוגה מקדימה לפני שמוסיפים משהו.
      </p>
    </div>
  );
}
