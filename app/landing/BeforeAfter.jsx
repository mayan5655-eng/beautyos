// app/landing/BeforeAfter.jsx
//
// Before and after Kalmea: one pair per row, so on a phone each problem sits right above its answer, and on a wide screen the pairs
// line up as two columns. Soft red for the load, soft green for the order. The server HTML is the finished picture; Reveal only adds
// a short rise on scroll (nothing under reduced motion).

import Reveal from "./Reveal";

const PATHS = {
  chat: "M4 5h16v11H9l-5 4V5z",
  clock: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2",
  calendar: "M4 6h16v14H4zM4 10h16M8 3v4M16 3v4",
  heart: "M12 20s-7-4.4-7-9.5A4 4 0 0 1 12 8a4 4 0 0 1 7 2.5C19 15.6 12 20 12 20z",
  spark: "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z",
  wallet: "M3 7h18v12H3zM3 7l3-3h12l3 3M16 13h2",
  layers: "M12 4l9 5-9 5-9-5 9-5zM3 14l9 5 9-5",
  chart: "M4 20V10M10 20V4M16 20v-7M21 20H3",
  person: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c1-4 4-6 8-6s7 2 8 6",
};

const Glyph = ({ name }) => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d={PATHS[name]} />
  </svg>
);

export default function BeforeAfter({ rows }) {
  return (
    <div className="lp-ba">
      <div className="lp-ba-head" aria-hidden>
        <span className="lp-ba-title is-before">לפני Kalmea</span>
        <span className="lp-ba-title is-after">עם Kalmea</span>
      </div>
      {rows.map((r, i) => (
        <Reveal key={r.before} delay={Math.min(i, 4) * 40} className="lp-ba-row">
          <p className="lp-ba-cell is-before"><span className="lp-ba-icon"><Glyph name={r.icon} /></span><span><b className="lp-ba-tag">לפני</b>{r.before}</span></p>
          <p className="lp-ba-cell is-after"><span className="lp-ba-icon"><Glyph name={r.icon} /></span><span><b className="lp-ba-tag">עם Kalmea</b>{r.after}</span></p>
        </Reveal>
      ))}
    </div>
  );
}
