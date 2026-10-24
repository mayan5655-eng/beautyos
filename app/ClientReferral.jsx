'use client';
// app/ClientReferral.jsx
//
// On a client's card: where she came from, how many friends she brought, and her personal "bring a friend" link
// (lib/bookingSource.ts). A friend who books through it is recorded as referred by her (app/api/book-appointment). The reward,
// if any, is the cosmetician's own decision: this only tells her who to thank.
import { useMemo } from 'react';
import { withSource, sourceLabel, referralMessageHe, referralCounts } from '@/lib/bookingSource';
import { toWhatsAppNumber } from '@/lib/phone';

export default function ClientReferral({ client, clients, publicUrl, businessName, pc, pcTint, toast }) {
  const counts = useMemo(() => referralCounts(clients || []), [clients]);
  if (!client) return null;
  const brought = counts.get(String(client.id)) || 0;
  const referrer = client.referred_by ? (clients || []).find((x) => String(x.id) === String(client.referred_by)) : null;
  const came = referrer ? `הגיעה בהמלצת ${referrer.name}` : client.source ? `הגיעה דרך ${sourceLabel(client.source)}` : '';
  const link = publicUrl ? withSource(publicUrl, 'referral', String(client.id)) : '';
  const message = link ? referralMessageHe({ clientName: client.name, businessName, link }) : '';
  const wa = client.phone && message ? (() => { const n = toWhatsAppNumber(client.phone); return n ? `https://wa.me/${n}?text=${encodeURIComponent(message)}` : null; })() : null;

  const copy = async () => {
    try { await navigator.clipboard.writeText(message); toast?.('ההודעה עם הקישור האישי הועתקה'); } catch { toast?.('ההעתקה נחסמה, סמני והעתיקי ידנית', 'error'); }
  };
  const btn = { padding: '8px 12px', minHeight: 44, borderRadius: 'var(--r-sm)', border: '1px solid var(--line-2)', background: 'var(--surface)', color: 'var(--ink)', fontWeight: 700, fontSize: 'var(--t-xs)', cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'none', display: 'inline-flex', alignItems: 'center' };

  return (
    <div data-testid="client-referral" style={{ background: pcTint, borderRadius: 'var(--r-md)', padding: '10px 12px', margin: '10px 0' }}>
      {(came || brought > 0) && (
        <p style={{ fontSize: 'var(--t-sm)', color: 'var(--ink)', marginBottom: link ? 8 : 0, lineHeight: 1.6 }}>
          {came}{came && brought > 0 ? ' · ' : ''}{brought > 0 ? <b>{brought === 1 ? 'הביאה חברה אחת 💛' : `הביאה ${brought} חברות 💛`}</b> : null}
        </p>
      )}
      {link && (
        <>
          <p style={{ fontSize: 'var(--t-xs)', color: 'var(--ink-2)', marginBottom: 6 }}>חברה מביאה חברה: קישור אישי שלה לשלוח לחברות. מי שקובעת דרכו תסומן כאן כחברה שלה.</p>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {wa && <a href={wa} target="_blank" rel="noreferrer" style={{ ...btn, background: '#0B7A3E', color: '#fff', border: 'none' }}>שליחה אליה בוואטסאפ</a>}
            <button type="button" style={btn} onClick={copy}>העתקת ההודעה</button>
          </div>
        </>
      )}
    </div>
  );
}
