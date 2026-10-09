// app/PublicFooterLinks.tsx
//
// The small footer row every public page carries: the accessibility statement (required for public sites by Israeli accessibility
// regulations), plus terms and privacy. Server- and client-safe: plain links, no hooks.
//
// Colours: --pub-foot-ink is deep enough to pass AA (4.5:1) on the cream paper; the tenant-accent tokens are never used here, because a
// business's pale accent could fail contrast on its own page.

import type { CSSProperties } from 'react';

const rowStyle: CSSProperties = {
  display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '4px 18px',
  padding: '18px 16px 28px', fontSize: 14, lineHeight: 1.6, direction: 'rtl',
};
const linkStyle: CSSProperties = {
  color: '#3F4F47', textDecoration: 'underline', textUnderlineOffset: 3, padding: '8px 2px', minHeight: 24,
};

export default function PublicFooterLinks({ style }: { style?: CSSProperties }) {
  return (
    <nav aria-label="קישורים משפטיים ונגישות" style={{ ...rowStyle, ...style }}>
      <a href="/accessibility" style={linkStyle}>הצהרת נגישות</a>
      <a href="/terms" style={linkStyle}>תנאי שימוש</a>
      <a href="/privacy" style={linkStyle}>מדיניות פרטיות</a>
    </nav>
  );
}
