// app/BookingClosed.tsx
//
// Her public page while her Kalmea system is closed (trial ended without payment, or paused): no booking
// form, a warm line in her voice and a direct way to reach her. Never a word about billing: her client
// must not learn anything about her subscription. Colours are HER primary_color (brand.primary), not Kalmea's.
// Rendered by app/[slug]/page.tsx and app/book/page.jsx when lib/publicBookingGate says the page is closed.

import { waLink } from '@/lib/phone'
import { BOOKING_CLOSED_TITLE_HE, BOOKING_CLOSED_BODY_HE } from '@/lib/planCopy'

type ClosedBrand = { businessName?: string; primary?: string; onPrimary?: string; whatsapp?: string; logoUrl?: string } | null | undefined

export default function BookingClosed({ brand, fallbackName = '' }: { brand: ClosedBrand; fallbackName?: string }) {
  const name = brand?.businessName || fallbackName
  const accent = brand?.primary || '#1F3A30'
  const onAccent = brand?.onPrimary || '#FFFFFF'
  const wa = waLink(brand?.whatsapp, name ? `היי ${name}, אשמח לקבוע תור` : 'היי, אשמח לקבוע תור')
  const telDigits = String(brand?.whatsapp || '').replace(/[^\d+]/g, '')
  const tel = telDigits.length >= 7 ? `tel:${telDigits}` : null

  return (
    <div
      dir="rtl"
      data-testid="booking-closed"
      style={{ minHeight: '100dvh', background: '#FBF8F1', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '28px 16px', fontFamily: "'Assistant', system-ui, sans-serif", color: '#1F3A30' }}
    >
      <section style={{ width: '100%', maxWidth: 440, background: '#FFFFFF', border: '1px solid #ECE6DA', borderRadius: 20, padding: '30px 24px', textAlign: 'center', boxShadow: '0 10px 30px rgba(31,58,48,0.08)' }}>
        {brand?.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={brand.logoUrl} alt="" width={72} height={72} style={{ width: 72, height: 72, objectFit: 'contain', borderRadius: 16, margin: '0 auto 12px', display: 'block' }} />
        ) : null}
        {name && <h1 style={{ margin: '0 0 6px', fontSize: 24, fontWeight: 700 }}>{name}</h1>}
        <p style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 600 }}>{BOOKING_CLOSED_TITLE_HE}</p>
        <p style={{ margin: '0 0 20px', fontSize: 16, lineHeight: 1.7, color: '#3F4F47' }}>{BOOKING_CLOSED_BODY_HE}</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {wa && (
            <a href={wa} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 48, background: accent, color: onAccent, borderRadius: 12, fontSize: 16, fontWeight: 700, textDecoration: 'none' }}>
              לקביעת תור בוואטסאפ
            </a>
          )}
          {tel && (
            <a href={tel} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 48, border: `1px solid ${accent}`, color: '#1F3A30', borderRadius: 12, fontSize: 16, fontWeight: 600, textDecoration: 'none' }}>
              התקשרות
            </a>
          )}
        </div>
      </section>
    </div>
  )
}
