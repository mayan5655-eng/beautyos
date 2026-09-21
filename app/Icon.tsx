'use client';

// app/Icon.tsx
//
// The one icon set. Stroked, 24-unit viewbox, currentColor, so an icon
// takes the colour and size of the text beside it and renders flat on every
// platform. This is what replaces the ~50 emoji that sat in buttons and
// headings: an emoji is a full-colour picture drawn by the phone's vendor,
// and on iOS it renders as one even at 12px inside a tinted button - the
// problem this codebase had already fixed by hand five separate times.
//
// The nav icons in app/beautyos.jsx (navIcon) and the empty-state icons in
// app/EmptyState.jsx keep their own drawings; this set is for everything
// else. Add a name here rather than reaching for a glyph.

import type { CSSProperties } from 'react';

const P: Record<string, string> = {
  // media / marketing
  film: 'M4 5.5h16v13H4zM4 9h16M4 14h16M8 5.5v13M16 5.5v13',
  video: 'M3.5 7h11v10h-11zM14.5 10.5l6-3v9l-6-3',
  camera: 'M4 8h3l2-2.5h6L17 8h3v10H4zM12 16a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  image: 'M4 5h16v14H4zM4 15l5-5 4 4 3-3 4 4M15.5 9.5h.01',
  palette: 'M12 3.5a8.5 8.5 0 1 0 0 17c1.4 0 2-1 1.6-2.1-.5-1.3.4-2.4 1.8-2.4H17a3.5 3.5 0 0 0 3.5-3.5C20.5 7.5 16.7 3.5 12 3.5zM8 12h.01M10 8h.01M14 8h.01',
  music: 'M9 18a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0zM9 18V6l11-2v11M20 15a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0z',
  mic: 'M12 3a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3zM6 11a6 6 0 0 0 12 0M12 17v4M9 21h6',
  megaphone: 'M3 10v4h3l8 4V6l-8 4H3zM17 9.5a3.5 3.5 0 0 1 0 5',
  sparkle: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z',
  share: 'M16 5a2 2 0 1 1 0 4 2 2 0 0 1 0-4zM6 10a2 2 0 1 1 0 4 2 2 0 0 1 0-4zM16 15a2 2 0 1 1 0 4 2 2 0 0 1 0-4zM8 11l6-3M8 13l6 3',
  copy: 'M9 9h10v11H9zM5 15V4h10',
  download: 'M12 4v11M7 10l5 5 5-5M4 19h16',
  upload: 'M12 15V4M7 9l5-5 5 5M4 19h16',
  print: 'M7 8V4h10v4M5 8h14v7h-3v5H8v-5H5zM8 15h8',
  // people / contact
  contacts: 'M6 4h12v16H6zM9 12a3 3 0 1 0 6 0 3 3 0 0 0-6 0M8.5 20c.5-2.5 2-4 3.5-4s3 1.5 3.5 4M3 8h3M3 12h3M3 16h3',
  id: 'M3 6h18v12H3zM6 15c.6-1.7 1.7-2.5 3-2.5s2.4.8 3 2.5M9 10.5a1.75 1.75 0 1 0 0-3.5 1.75 1.75 0 0 0 0 3.5zM14 10h4M14 13h4',
  people: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM3.5 20c.6-3.4 2.9-5 5.5-5s4.9 1.6 5.5 5M16 11a3 3 0 1 0-.01-6M18.5 15c1.4.6 2.5 2 2.9 5',
  heart: 'M12 20.3s-7.4-4.6-7.4-9.6a4.3 4.3 0 0 1 7.4-3 4.3 4.3 0 0 1 7.4 3c0 5-7.4 9.6-7.4 9.6z',
  smile: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM8.5 14.5c.9 1.3 2.1 2 3.5 2s2.6-.7 3.5-2M9 10h.01M15 10h.01',
  phone: 'M6 3h4l1.5 4.5L9 9a11 11 0 0 0 6 6l1.5-2.5L21 14v4a2 2 0 0 1-2 2A16 16 0 0 1 4 5a2 2 0 0 1 2-2z',
  chat: 'M4 5h16v11H9l-5 4z',
  whatsapp: 'M12 3a9 9 0 0 0-7.7 13.6L3 21l4.5-1.2A9 9 0 1 0 12 3zM9.2 8.5c.3-.6.6-.6.9-.6h.6c.2 0 .4.1.5.4l.8 1.9c.1.2 0 .4-.1.6l-.5.6c-.1.2-.2.3 0 .6.5.9 1.4 1.9 2.6 2.5.3.1.4.1.6-.1l.7-.8c.2-.2.4-.2.6-.1l1.8.9c.2.1.4.2.4.4 0 .3-.1 1-.5 1.4-.4.4-1.1.7-1.6.7-2.5 0-6.3-3.5-6.9-6.6-.2-.9 0-1.4.1-1.8z',
  // money / work
  money: 'M3 7h18v10H3zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 10h.01M18 14h.01',
  card: 'M3 6h18v12H3zM3 10h18M7 15h4',
  receipt: 'M6 3h12v18l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5L6 21zM9 8h6M9 12h6M9 16h3',
  calendar: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  clipboard: 'M8 4h8v3H8zM6 6h12v15H6zM9 12h6M9 16h4',
  package: 'M12 3l8 4.5v9L12 21l-8-4.5v-9zM4 7.5l8 4.5 8-4.5M12 12v9',
  chart: 'M4 20h16M7 16V9M12 16V5M17 16v-6',
  settings: 'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 0 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 0 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 0 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 0 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z',
  lock: 'M6 11h12v10H6zM8 11V7a4 4 0 0 1 8 0v4',
  search: 'M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13zM20 20l-4.5-4.5',
  edit: 'M4 20h4l11-11-4-4L4 16zM13 7l4 4',
  pen: 'M4 20l4-1 10-10-3-3L5 16zM14 7l3 3',
  trash: 'M5 7h14M9 7V4h6v3M7 7l1 13h8l1-13M10 11v6M14 11v6',
  plus: 'M12 5v14M5 12h14',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  x: 'M6 6l12 12M18 6L6 18',
  refresh: 'M4 12a8 8 0 0 1 14-5.3L20 8M20 4v4h-4M20 12a8 8 0 0 1-14 5.3L4 16M4 20v-4h4',
  hourglass: 'M6 3h12M6 21h12M7 3c0 5 5 6 5 9s-5 4-5 9M17 3c0 5-5 6-5 9s5 4 5 9',
  pause: 'M8 5v14M16 5v14',
  play: 'M7 4l13 8-13 8z',
  bolt: 'M13 3L5 13h6l-1 8 8-10h-6z',
  star: 'M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3l-5.5 2.9 1-6.2L3 9.6l6.2-.9z',
  gift: 'M4 11h16v10H4zM3 7h18v4H3zM12 7v14M12 7c-1.5-3-5-3-5-1s3.5 1 5 1zM12 7c1.5-3 5-3 5-1s-3.5 1-5 1',
  cake: 'M4 13h16v7H4zM6 13V9h12v4M12 9V6M8 9V7M16 9V7M4 16c1.5 1.5 3 1.5 4 0s2.5-1.5 4 0 2.5 1.5 4 0 2.5-1.5 4 0',
  ribbon: 'M12 14a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM9 13.5L7 21l5-2 5 2-2-7.5',
  block: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM6 6l12 12',
  ban: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM5.5 5.5l13 13',
  warning: 'M12 3l10 18H2zM12 10v4M12 18h.01',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v6M12 7.5h.01',
  bulb: 'M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.7.6 1 1.3 1 2.1h5c0-.8.3-1.5 1-2.1A6 6 0 0 0 12 3z',
  signal: 'M4 18h2M9 18v-4M14 18v-8M19 18V6',
  coffee: 'M4 8h13v7a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5zM17 10h2a2.5 2.5 0 0 1 0 5h-2M8 3v2M12 3v2',
  leaf: 'M5 20c0-8 5-14 15-14 0 10-6 15-14 15M5 20c3-4 6-7 10-9',
  plane: 'M21 12L4 5l3 7-3 7zM7 12h14',
  sun: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  moon: 'M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z',
  home: 'M4 11l8-7 8 7v9h-5v-6H9v6H4z',
  pin: 'M12 21s6-6.5 6-11a6 6 0 1 0-12 0c0 4.5 6 11 6 11zM12 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  robot: 'M5 9h14v10H5zM9 13h.01M15 13h.01M9 16h6M12 5v4M12 5a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM3 13v3M21 13v3',
  spa: 'M12 21c-4-3-7-6.5-7-10.5C5 7 8 4.5 12 3c4 1.5 7 4 7 7.5 0 4-3 7.5-7 10.5zM12 3v18',
  nails: 'M8 21V9a4 4 0 0 1 8 0v12zM8 12h8',
  muscle: 'M4 15l3-8h3l1 3 2-1 3 2-1 4-3 1-1 3H6zM14 8l3-3 3 2-1 3',
  'arrow-up': 'M12 19V5M5 12l7-7 7 7',
  'arrow-down': 'M12 5v14M5 12l7 7 7-7',
  'arrow-left': 'M19 12H5M12 5l-7 7 7 7',
  'arrow-right': 'M5 12h14M12 5l7 7-7 7',
  'chevron-down': 'M6 9l6 6 6-6',
  'chevron-up': 'M6 15l6-6 6 6',
  menu: 'M4 7h16M4 12h16M4 17h16',
  target: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 11a1 1 0 1 0 0 2 1 1 0 0 0 0-2z',
  gem: 'M6 3h12l4 6-10 12L2 9zM2 9h20M9 3l3 6 3-6M12 9l-3 12M12 9l3 12',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  scissors: 'M6 6a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM6 12a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM20 4L8.6 15.4M14.5 14.5L20 20M8.6 8.6L12 12',
  envelope: 'M3 6h18v12H3zM3 7l9 6 9-6',
  percent: 'M19 5L5 19M7 5a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM17 15a2 2 0 1 0 0 4 2 2 0 0 0 0-4z',
  drop: 'M12 3s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11z',
};

export type IconName = keyof typeof P;

export default function Icon({ name, size = 18, strokeWidth = 1.7, style, className, title }: {
  name: IconName | string; size?: number; strokeWidth?: number; style?: CSSProperties; className?: string; title?: string;
}) {
  const d = P[name] || P.sparkle;
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      style={{ flexShrink: 0, verticalAlign: '-0.2em', ...style }}
      aria-hidden={title ? undefined : 'true'}
      role={title ? 'img' : undefined}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {title ? <title>{title}</title> : null}
      <path d={d} />
    </svg>
  );
}
