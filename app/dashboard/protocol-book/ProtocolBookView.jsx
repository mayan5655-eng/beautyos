"use client";
// app/dashboard/protocol-book/ProtocolBookView.jsx — "ספר הפרוטוקולים", the reader.
//
// Design: a printed reference book in Kalmea's own colours (cream paper, deep green ink, petal for warnings, sage for
// adaptations, a thin gold rule). Kalmea chrome, never her accent: this is Kalmea teaching her, not her talking to clients.
// One page at a time, turned like a page; each page scrolls with the app (no scroll trapped inside a fixed book shape, which
// is what made the first draft hard to read on a phone).
//
// It only ever receives protocols she may open (app/dashboard/protocol-book/page.tsx decides on the server). Nothing here
// sells: no price, no buy button, no locked chapter, no "בקרוב".
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { UI, CHAPTERS, SECTIONS, SKIN, NAIL } from "@/lib/protocolBook/labels";
import { totalMinutes, withLink } from "@/lib/protocolBook/book";
import Bidi from "./Bidi";

const LANGS = [["he", "עברית"], ["ar", "العربية"], ["en", "English"]];
const pad = (n) => String(n).padStart(2, "0");

// ── Drawings ────────────────────────────────────────────────────────────────────────────────────────────────────────────

const ICONS = {
  drop: <path d="M9 2C6 6 4.5 8.5 4.5 11a4.5 4.5 0 0 0 9 0C13.5 8.5 12 6 9 2Z" />,
  loupe: <><circle cx="8" cy="8" r="5" /><path d="m12 12 4 4" /></>,
  prep: <><path d="M7 2h4v3l1.5 2v9h-7V7L7 5Z" /><path d="M5.5 10h7" /></>,
  peel: <><path d="M9 1v4M7 5h4v3l-1 1v4a1 1 0 0 1-2 0V9L7 8Z" /><path d="M9 16v1" /></>,
  extract: <><circle cx="9" cy="9" r="2" /><path d="M3 4l3.5 3.5M15 4l-3.5 3.5M3 14l3.5-3.5M15 14l-3.5-3.5" /></>,
  bolt: <path d="M10 1 4 10h5l-1 7 6-9H9Z" />,
  mask: <><path d="M3 5c4-3 8-3 12 0v5c0 4-3 6-6 6s-6-2-6-6Z" /><path d="M6 8h1.5M10.5 8H12M7 12c1.2.8 2.8.8 4 0" /></>,
  led: <><circle cx="9" cy="9" r="3.5" /><path d="M9 1v2M9 15v2M1 9h2M15 9h2M3.3 3.3l1.4 1.4M13.3 13.3l1.4 1.4M14.7 3.3l-1.4 1.4M4.7 13.3l-1.4 1.4" /></>,
  cream: <><rect x="3" y="8" width="12" height="7" rx="2" /><path d="M4 8V6h10v2" /></>,
  snow: <path d="M9 1v16M2 5l14 8M2 13l14-8" />,
  serum: <><path d="M7 1h4M8 1v3M10 1v3M6 4h6v12H6Z" /><path d="M6 9h6" /></>,
  sun: <><circle cx="9" cy="9" r="3.5" /><path d="M9 1v2.5M9 14.5V17M1 9h2.5M14.5 9H17M3.4 3.4l1.8 1.8M12.8 12.8l1.8 1.8M14.6 3.4l-1.8 1.8M5.2 12.8l-1.8 1.8" /></>,
  hands: <path d="M5 16V9a1.5 1.5 0 0 1 3 0V3a1.5 1.5 0 0 1 3 0v6l1-1a1.5 1.5 0 0 1 2.2 2L11 16Z" />,
  eye: <><path d="M1 9s3-5 8-5 8 5 8 5-3 5-8 5-8-5-8-5Z" /><circle cx="9" cy="9" r="2.5" /></>,
  file: <path d="M4 15 13 3l2 1.5L6 16.5Z" />,
  pusher: <><path d="M3 15 12 6" /><path d="M11 3h4v3l-3 1-2-2Z" /></>,
  drill: <><rect x="2" y="7" width="9" height="4" rx="1" /><path d="M11 9h3M14 8v2l3-1Z" /></>,
  buffer: <><rect x="3" y="6" width="12" height="6" rx="2" /><path d="M5 6v6M13 6v6" /></>,
  brush: <><path d="M9 1v8" /><path d="M6.5 9h5l-1 7h-3Z" /></>,
  lamp: <><path d="M2 13c0-5 3-8 7-8s7 3 7 8Z" /><path d="M5 16h8M7 9.5l-.5 1.5M11 9.5l.5 1.5M9 8v2" /></>,
  oil: <><path d="M7 1h4v3H7ZM6 4h6l1 3v9H5V7Z" /><path d="M9 9c-1.5 2-1.5 3.5 0 4.5 1.5-1 1.5-2.5 0-4.5Z" /></>,
  form: <><path d="M2 11h14v4H2Z" /><path d="M6 11V6a3 3 0 0 1 6 0v5" /></>,
  shield: <><path d="M9 1 3 3.5V9c0 3.5 2.5 6.5 6 8 3.5-1.5 6-4.5 6-8V3.5Z" /><path d="m6.5 9 2 2 3-3.5" /></>,
};
const StepIcon = ({ k }) => (
  <span className="pb-si" aria-hidden="true">
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">{ICONS[k] || ICONS.drop}</svg>
  </span>
);

function FaceMap({ zones = [], lift, label }) {
  const on = (z) => zones.includes(z);
  const f = { fill: "var(--pb-petal-mark)", opacity: 0.55 };
  return (
    <svg viewBox="0 0 200 240" role="img" aria-label={label} className="pb-face">
      <path d="M100 18C52 18 34 60 34 108c0 52 30 104 66 112 36-8 66-60 66-112 0-48-18-90-66-90Z" fill="var(--pb-paper-2)" stroke="var(--pb-ink)" strokeWidth="1.6" />
      {on("forehead") && <ellipse cx="100" cy="62" rx="44" ry="18" {...f} />}
      {on("nose") && <ellipse cx="100" cy="120" rx="11" ry="26" {...f} />}
      {on("cheek") && <><ellipse cx="62" cy="134" rx="19" ry="17" {...f} /><ellipse cx="138" cy="134" rx="19" ry="17" {...f} /></>}
      {on("chin") && <ellipse cx="100" cy="196" rx="20" ry="11" {...f} />}
      {on("lip") && <ellipse cx="100" cy="155" rx="20" ry="6" {...f} />}
      {on("eyes") && <><ellipse cx="72" cy="100" rx="21" ry="12" {...f} /><ellipse cx="128" cy="100" rx="21" ry="12" {...f} /></>}
      {on("jaw") && <path d="M44 150c8 30 30 58 56 66 26-8 48-36 56-66" stroke="var(--pb-petal-mark)" strokeWidth="10" fill="none" opacity=".6" />}
      <g stroke="var(--pb-ink)" strokeWidth="1.5" fill="none" strokeLinecap="round">
        <path d="M58 84q14-8 28-2M114 82q14-6 28 2" /><path d="M60 100q12-8 24 0q-12 7-24 0ZM116 100q12-8 24 0q-12 7-24 0Z" />
        <path d="M100 104v32q-6 6 0 8 6-2 0-8" /><path d="M86 160q14 8 28 0M86 160q14-6 28 0" />
      </g>
      <circle cx="72" cy="100" r="3" fill="var(--pb-ink)" /><circle cx="128" cy="100" r="3" fill="var(--pb-ink)" />
      {lift && (
        <g stroke="var(--pb-sage-ink)" strokeWidth="2.2" fill="none" strokeLinecap="round">
          <path d="M70 160q-14-14-20-34M130 160q14-14 20-34M84 56q-6-14 0-26M116 56q6-14 0-26" />
          <path d="M46 132l4-8 6 6M154 132l-4-8-6 6M80 34l4-6 4 6M112 34l4-6 4 6" />
        </g>
      )}
    </svg>
  );
}

const Marker = ({ n, x, y }) => (
  <g><circle cx={x} cy={y} r="10" fill="var(--pb-ink)" /><text x={x} y={y + 4} textAnchor="middle" fontSize="11" fontWeight="700" fill="var(--pb-paper)">{n}</text></g>
);

function SkinSection({ label }) {
  const fat = [];
  for (let x = 14; x < 360; x += 26) for (let y = 0; y < 2; y++) fat.push(<circle key={`${x}-${y}`} cx={x + (y ? 13 : 0)} cy={186 + y * 22} r="12" fill="#F1D58F" stroke="#E2BD62" />);
  return (
    <svg viewBox="0 0 360 230" role="img" aria-label={label} className="pb-fig-svg">
      <rect x="0" y="62" width="360" height="114" fill="#EFB3B8" />{fat}<rect x="0" y="170" width="360" height="6" fill="#EFB3B8" />
      <path d="M0 34 Q30 26 60 34 T120 34 T180 34 T240 34 T300 34 T360 34 V66 Q330 72 300 64 T240 64 T180 64 T120 64 T60 64 T0 64Z" fill="#F6CFCB" />
      <path d="M0 24 Q30 17 60 24 T120 24 T180 24 T240 24 T300 24 T360 24 V36 Q330 29 300 36 T240 36 T180 36 T120 36 T60 36 T0 36Z" fill="#F2E2D6" stroke="#D9BFAE" strokeWidth=".8" />
      {[40, 90, 140, 190, 240, 290].map((x) => <circle key={x} cx={x} cy="60" r="3" fill="#8A5A3C" />)}
      <path d="M0 120 Q60 105 120 125 T250 118 T360 128" stroke="#C43C4C" strokeWidth="2.5" fill="none" />
      <path d="M0 132 Q70 120 130 138 T260 130 T360 140" stroke="#4A6FB0" strokeWidth="2.5" fill="none" />
      <path d="M172 178 Q168 110 176 40 L190 40 Q196 110 196 178Z" fill="#E79AA3" stroke="#B65A68" />
      <path d="M184 170 Q182 80 188 2" stroke="#5A3A2A" strokeWidth="3" fill="none" />
      <g fill="#F6DC8E" stroke="#D8B25A"><circle cx="208" cy="90" r="8" /><circle cx="220" cy="98" r="7" /><circle cx="210" cy="104" r="7" /></g>
      <Marker n={1} x={330} y={30} /><Marker n={2} x={22} y={58} /><Marker n={3} x={330} y={100} /><Marker n={4} x={238} y={86} /><Marker n={5} x={330} y={198} />
    </svg>
  );
}

function DepthChart({ names, label }) {
  const ends = [34, 62, 100, 200], xs = [170, 220, 270, 320];
  return (
    <svg viewBox="0 0 360 230" role="img" aria-label={label} className="pb-fig-svg">
      <rect x="130" y="24" width="226" height="12" fill="#F2E2D6" /><rect x="130" y="36" width="226" height="30" fill="#F6CFCB" />
      <rect x="130" y="66" width="226" height="104" fill="#EFB3B8" /><rect x="130" y="170" width="226" height="56" fill="#F6DFA6" />
      <g fontSize="12" fontWeight="700" fill="var(--pb-ink)" textAnchor="end">
        <text x="122" y="34">{names[0]}</text><text x="122" y="56">{names[1]}</text><text x="122" y="122">{names[2]}</text><text x="122" y="202">{names[3]}</text>
      </g>
      {xs.map((x, i) => (
        <g key={x}>
          <path d={`M${x} 10V${ends[i]}`} stroke="var(--pb-petal-ink)" strokeWidth="3" />
          <path d={`M${x - 6} ${ends[i] - 8}L${x} ${ends[i]}L${x + 6} ${ends[i] - 8}`} fill="none" stroke="var(--pb-petal-ink)" strokeWidth="3" strokeLinejoin="round" />
          <Marker n={i + 1} x={x} y={10} />
        </g>
      ))}
    </svg>
  );
}

function NailUnit({ label }) {
  // Side section of a fingertip: plate on the bed, matrix under the proximal fold, numbered as in the legend.
  return (
    <svg viewBox="0 0 360 200" role="img" aria-label={label} className="pb-fig-svg">
      <path d="M20 150 C20 90 70 60 150 58 L300 58 C330 58 345 80 345 110 C345 150 320 172 280 176 L60 176 C35 176 20 166 20 150Z" fill="#F6D3C8" stroke="#D9AFA2" />
      <path d="M40 120 C60 86 100 74 150 72 L300 72 C318 72 330 84 330 100 L330 116 L150 112 C110 112 70 120 40 132Z" fill="#E9A9A1" opacity=".55" />
      <path d="M96 64 L312 52 C326 51 336 58 338 70 L338 76 L312 66 L100 76 Z" fill="#FBF3EE" stroke="#B7928A" strokeWidth="1.2" />
      <path d="M60 92 C70 78 86 70 104 68 L110 86 C92 88 76 94 66 104Z" fill="#C98C86" />
      <path d="M84 66 C92 58 104 56 116 58" stroke="#7A4F48" strokeWidth="2.2" fill="none" />
      <path d="M112 60 L134 59" stroke="#E8DCC8" strokeWidth="4" strokeLinecap="round" />
      <path d="M318 78 C326 84 332 92 334 100" stroke="#7A4F48" strokeWidth="2" fill="none" />
      <ellipse cx="128" cy="66" rx="16" ry="4" fill="#FFFFFF" opacity=".7" />
      <Marker n={1} x={220} y={36} /><Marker n={2} x={70} y={112} /><Marker n={3} x={86} y={44} /><Marker n={4} x={130} y={36} /><Marker n={5} x={344} y={132} /><Marker n={6} x={220} y={134} />
    </svg>
  );
}

// ── Pieces ──────────────────────────────────────────────────────────────────────────────────────────────────────────────

const RunningHead = ({ left, right }) => (
  <div className="pb-head"><span className="pb-wm">Kalmea</span><i /><span className="pb-head-r">{left}</span>{right != null && <span className="pb-folio-sq">{right}</span>}</div>
);

function Section({ title, children, tone }) {
  return (
    <section className={`pb-sec${tone ? ` pb-${tone}` : ""}`}>
      <h3 className="pb-h3">{title}</h3>
      {children}
    </section>
  );
}

function LinkPanel({ protocol, services, links, setLinks, t, lang, allProtocols }) {
  const [state, setState] = useState({}); // serviceId -> 'saving' | 'saved' | 'error'
  const titleOf = (key) => allProtocols.find((p) => p.key === key)?.text?.[lang]?.title || "";
  const toggle = async (sid, on) => {
    const before = links;
    const next = withLink(links, sid, on ? protocol.key : null);
    setLinks(next);
    setState((s) => ({ ...s, [sid]: "saving" }));
    try {
      const res = await fetch("/api/protocol-book/link", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ serviceId: sid, key: on ? protocol.key : null }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.success) throw new Error(j.error || "save");
      setState((s) => ({ ...s, [sid]: "saved" }));
    } catch {
      setLinks(before);
      setState((s) => ({ ...s, [sid]: "error" }));
    }
  };
  return (
    <section className="pb-sec pb-link" aria-labelledby={`link-${protocol.key}`}>
      <h3 className="pb-h3" id={`link-${protocol.key}`}>{t.link}</h3>
      <p className="pb-muted">{t.linkHint}</p>
      {services.length === 0 ? <p className="pb-muted">{t.noServices}</p> : (
        <ul className="pb-svc">
          {services.map((s) => {
            const cur = links[s.id];
            const mine = cur === protocol.key;
            const other = cur && !mine ? titleOf(cur) : "";
            const st = state[s.id];
            return (
              <li key={s.id}>
                <label>
                  <input type="checkbox" id={`svc-${protocol.key}-${s.id}`} checked={mine} onChange={(e) => toggle(s.id, e.target.checked)} disabled={st === "saving"} />
                  <span className="pb-svc-name">{s.name}</span>
                </label>
                <span className="pb-svc-state" aria-live="polite">
                  {st === "saved" ? t.linkSaved : st === "error" ? t.linkError : other ? `${t.linkTaken} ${other}` : ""}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function ProtocolPage({ p, lang, t, no, services, links, setLinks, allProtocols }) {
  const x = p.text[lang];
  const [lo, hi] = totalMinutes(p);
  const fmt = (m) => (m[0] === m[1] ? `${m[0]}` : `${m[0]}–${m[1]}`);
  return (
    <>
      <RunningHead left={(CHAPTERS[p.chapter] || {})[lang]} right={pad(no)} />
      <div className="pb-body">
        <p className="pb-eyebrow">{SECTIONS[p.field][lang]}{p.tier === "full" && <span className="pb-full">{t.full}</span>}</p>
        <h2 className="pb-h2">{x.title}</h2>
        <dl className="pb-meta">
          <div><dt>{t.total}</dt><dd className="pb-num"><bdi dir="ltr">{fmt([lo, hi])}</bdi> {t.min}</dd></div>
          <div><dt>{t.freq}</dt><dd><Bidi>{x.freq}</Bidi></dd></div>
        </dl>
        <div className="pb-rule" />

        <div className={p.zones ? "pb-intro-grid" : ""}>
          {p.zones && (
            <figure className="pb-fig pb-face-fig">
              <FaceMap zones={p.zones} lift={p.lift} label={t.map} />
              <figcaption>
                <span className="pb-chips">{p.zones.map((z) => <span key={z}>{t.zones[z]}</span>)}{p.lift && <span className="pb-chip-sage">{t.lift}</span>}</span>
              </figcaption>
            </figure>
          )}
          <div className="pb-stack">
            <Section title={t.goal}><p><Bidi>{x.goal}</Bidi></p></Section>
            <Section title={t.suits}><p><Bidi>{x.suits}</Bidi></p></Section>
          </div>
        </div>

        <div className="pb-contra">
          <Section title={t.stop} tone="stop"><ul>{x.contraStop.map((c) => <li key={c}><Bidi>{c}</Bidi></li>)}</ul></Section>
          <Section title={t.adapt} tone="adapt"><ul>{x.contraAdapt.map((c) => <li key={c}><Bidi>{c}</Bidi></li>)}</ul></Section>
        </div>

        <Section title={t.prep}><p><Bidi>{x.prep}</Bidi></p></Section>

        <Section title={t.steps}>
          <ol className="pb-steps">
            {x.steps.map(([name, detail], i) => (
              <li key={i}>
                <StepIcon k={p.steps[i]?.icon} />
                <div className="pb-step-tx"><strong><span className="pb-no">{pad(i + 1)}</span><Bidi>{name}</Bidi></strong><span><Bidi>{detail}</Bidi></span></div>
                <span className="pb-time pb-num">{p.steps[i] ? <><bdi dir="ltr">{fmt(p.steps[i].min)}</bdi> {t.min}</> : ""}</span>
              </li>
            ))}
          </ol>
        </Section>

        <div className="pb-contra">
          <Section title={t.expected} tone="adapt"><p><Bidi>{x.expected}</Bidi></p></Section>
          <Section title={t.stopNow} tone="stop"><p><Bidi>{x.stopNow}</Bidi></p></Section>
        </div>

        {x.warn && <p className="pb-warn"><Bidi>{x.warn}</Bidi></p>}
        <Section title={t.after}><p><Bidi>{x.after}</Bidi></p></Section>
        <Section title={t.home}><p><Bidi>{x.home}</Bidi></p></Section>
        <aside className="pb-tip"><b>{t.tip}</b> <Bidi>{x.tip}</Bidi></aside>

        <Section title={t.ask}>
          <p className="pb-muted">{t.askHint}</p>
          <ul className="pb-ask">{x.ask.map((q) => <li key={q}><Bidi>{q}</Bidi></li>)}</ul>
          <p className="pb-muted" style={{ marginTop: 8 }}>{t.askForm}</p>
        </Section>

        <LinkPanel protocol={p} services={services} links={links} setLinks={setLinks} t={t} lang={lang} allProtocols={allProtocols} />
      </div>
    </>
  );
}

// ── The reader ──────────────────────────────────────────────────────────────────────────────────────────────────────────

export default function ProtocolBookView({ protocols, fields, services, links: initialLinks, initialLang }) {
  const [lang, setLang] = useState(initialLang || "he");
  const [links, setLinks] = useState(initialLinks || {});
  const t = UI[lang];

  // Pages in reading order: contents, then per field its foundation chapter and its protocols.
  const pages = useMemo(() => {
    const out = [{ id: "contents" }];
    for (const f of ["cosmetics", "nails"]) {
      if (!fields.includes(f)) continue;
      const ps = protocols.filter((p) => p.field === f);
      if (!ps.length) continue;
      out.push({ id: f === "cosmetics" ? "skin" : "nail", field: f });
      ps.forEach((p) => out.push({ id: p.key, protocol: p }));
    }
    return out;
  }, [protocols, fields]);

  const idx = (id) => Math.max(0, pages.findIndex((p) => p.id === id));
  const [cur, setCur] = useState(0);
  const [dir, setDir] = useState(1);
  const topRef = useRef(null);

  // The page lives in the hash (#acne), so a protocol can be bookmarked and the browser's back button turns the page back.
  useEffect(() => {
    const read = () => { const h = decodeURIComponent(window.location.hash.slice(1)); setCur(h ? idx(h) : 0); };
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, [pages]); // eslint-disable-line react-hooks/exhaustive-deps

  const go = useCallback((n) => {
    if (n < 0 || n >= pages.length || n === cur) return;
    setDir(n > cur ? 1 : -1);
    const id = pages[n].id;
    if (id === "contents") history.pushState(null, "", window.location.pathname); else window.location.hash = id;
    setCur(n);
    topRef.current?.scrollIntoView({ block: "start", behavior: "instant" });
  }, [cur, pages]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      const rtl = lang !== "en";
      if (e.key === "ArrowLeft") go(rtl ? cur + 1 : cur - 1);
      if (e.key === "ArrowRight") go(rtl ? cur - 1 : cur + 1);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [cur, go, lang]);

  const page = pages[cur] || pages[0];
  const rtl = lang !== "en";
  let protoNo = 0;
  const numberOf = {};
  pages.forEach((p) => { if (p.protocol) numberOf[p.id] = ++protoNo; });

  const contents = (
    <>
      <div className="pb-cover">
        <span className="pb-wm pb-wm-lg">Kalmea</span>
        <span className="pb-gold" />
        <h1 className="pb-h1">{t.book}</h1>
        <p className="pb-sub">{t.sub}</p>
        <span className="pb-gold" />
      </div>
      <div className="pb-body">
        <h2 className="pb-h2 pb-center">{t.contents}</h2>
        {["cosmetics", "nails"].filter((f) => pages.some((p) => p.field === f)).map((f) => (
          <div key={f} className="pb-toc-group">
            <p className="pb-eyebrow">{SECTIONS[f][lang]}</p>
            <ul className="pb-toc">
              <li><button type="button" onClick={() => go(idx(f === "cosmetics" ? "skin" : "nail"))}>
                <span className="pb-toc-no">00</span><span className="pb-toc-nm">{(f === "cosmetics" ? SKIN : NAIL)[lang].title}</span><span className="pb-toc-tag">{t.foundations}</span>
              </button></li>
              {pages.filter((p) => p.protocol && p.protocol.field === f).map((p) => {
                const [lo, hi] = totalMinutes(p.protocol);
                return (
                  <li key={p.id}><button type="button" onClick={() => go(idx(p.id))}>
                    <span className="pb-toc-no">{pad(numberOf[p.id])}</span>
                    <span className="pb-toc-nm">{p.protocol.text[lang].title}{p.protocol.tier === "full" && <span className="pb-full">{t.full}</span>}</span>
                    <span className="pb-toc-tag pb-num"><bdi dir="ltr">{lo === hi ? lo : `${lo}–${hi}`}</bdi> {t.min}</span>
                  </button></li>
                );
              })}
            </ul>
          </div>
        ))}
        <p className="pb-disclaimer">{t.disclaimer}</p>
      </div>
    </>
  );

  const foundation = (field) => {
    if (field === "cosmetics") {
      const s = SKIN[lang];
      return (
        <>
          <RunningHead left={t.foundations} right="00" />
          <div className="pb-body">
            <h2 className="pb-h2">{s.title}</h2>
            <p className="pb-lead"><Bidi>{s.lead}</Bidi></p>
            <figure className="pb-fig"><SkinSection label={s.title} /></figure>
            <ol className="pb-legend">{s.layers.map(([a, b], i) => <li key={a}><span className="pb-nb">{i + 1}</span><span><b>{a}.</b> <Bidi>{b}</Bidi></span></li>)}</ol>
            <div className="pb-rule" />
            <h2 className="pb-h2">{s.depthTitle}</h2>
            <p className="pb-lead">{s.depthLead}</p>
            <figure className="pb-fig"><DepthChart names={s.layerNames} label={s.depthTitle} /></figure>
            <ol className="pb-legend">{s.depth.map(([a, b], i) => <li key={a}><span className="pb-nb">{i + 1}</span><span><b><Bidi>{a}</Bidi></b> · {b}</span></li>)}</ol>
            <p className="pb-warn"><Bidi>{s.medical}</Bidi></p>
            <div className="pb-facts">{s.facts.map(([a, b]) => <div key={a}><b>{a}</b><span><Bidi>{b}</Bidi></span></div>)}</div>
          </div>
        </>
      );
    }
    const n = NAIL[lang];
    return (
      <>
        <RunningHead left={t.foundations} right="00" />
        <div className="pb-body">
          <h2 className="pb-h2">{n.title}</h2>
          <p className="pb-lead"><Bidi>{n.lead}</Bidi></p>
          <figure className="pb-fig"><NailUnit label={n.title} /></figure>
          <ol className="pb-legend">{n.parts.map(([a, b], i) => <li key={a}><span className="pb-nb">{i + 1}</span><span><b>{a}.</b> <Bidi>{b}</Bidi></span></li>)}</ol>
          <div className="pb-facts">{n.facts.map(([a, b]) => <div key={a}><b>{a}</b><span><Bidi>{b}</Bidi></span></div>)}</div>
        </div>
      </>
    );
  };

  return (
    <div className="pb-root" dir={rtl ? "rtl" : "ltr"} lang={lang} ref={topRef}>
      <style>{CSS}</style>
      <div className="pb-top">
        <a href="/dashboard" className="pb-back">{rtl ? "→" : "←"} {t.backToApp}</a>
        <div className="pb-langs" role="group" aria-label="Language">
          {LANGS.map(([k, label]) => <button key={k} type="button" aria-pressed={lang === k} onClick={() => setLang(k)}>{label}</button>)}
        </div>
      </div>

      <article key={`${page.id}-${lang}`} className={`pb-page ${dir > 0 ? "pb-turn-fwd" : "pb-turn-back"}`}>
        {page.id === "contents" ? contents
          : page.protocol ? <ProtocolPage p={page.protocol} lang={lang} t={t} no={numberOf[page.id]} services={services} links={links} setLinks={setLinks} allProtocols={protocols} />
          : foundation(page.field)}
        <footer className="pb-foot">
          {cur > 0 ? <button type="button" onClick={() => go(0)}>{t.toContents}</button> : <span />}
          <span className="pb-num pb-folio">{t.page} {cur + 1} / {pages.length}</span>
        </footer>
      </article>

      <nav className="pb-nav" aria-label={t.contents}>
        <button type="button" onClick={() => go(cur - 1)} disabled={cur === 0}>{t.prev}</button>
        <div className="pb-prog" aria-hidden="true"><i style={{ width: `${((cur + 1) / pages.length) * 100}%` }} /></div>
        <button type="button" className="pb-next" onClick={() => go(cur + 1)} disabled={cur === pages.length - 1}>{t.next}</button>
      </nav>
    </div>
  );
}

// Kalmea's own colours (app/globals.css --k-*), named for their job in the book. Light only, like the rest of the app.
const CSS = `
.pb-root{--pb-paper:var(--k-cream,#FBF8F1);--pb-paper-2:#FFFDF8;--pb-ink:var(--k-green,#1F3A30);--pb-ink-2:var(--ink-2,#44594F);
--pb-gold:#B8975A;--pb-petal:var(--k-petal,#FBEDE9);--pb-petal-mark:var(--k-pink,#E9A9A1);--pb-petal-ink:#A4434F;--pb-sage:var(--k-sage,#DCE4D5);
--pb-sage-ink:#2E5243;--pb-line:var(--line,#E8E1D1);
max-width:760px;margin:0 auto;padding:12px max(16px,env(safe-area-inset-right,0px)) 40px max(16px,env(safe-area-inset-left,0px));
font-family:var(--sans);color:var(--pb-ink);display:flex;flex-direction:column;gap:14px}
.pb-root *{box-sizing:border-box;min-width:0}
.pb-top{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap}
.pb-back{font-size:var(--t-md);font-weight:600;color:var(--pb-ink-2);text-decoration:none}
.pb-langs{display:flex;gap:2px;background:var(--surface,#fff);border:1px solid var(--pb-line);padding:3px;border-radius:999px}
.pb-langs button{font:inherit;font-size:var(--t-sm);border:0;background:none;color:var(--pb-ink);padding:6px 14px;border-radius:999px;min-height:36px;cursor:pointer}
.pb-langs button[aria-pressed="true"]{background:var(--pb-ink);color:var(--pb-paper)}
.pb-page{background:var(--pb-paper-2);border:1px solid var(--pb-line);border-radius:6px 14px 14px 6px;box-shadow:0 1px 0 var(--pb-line),0 18px 40px -24px rgba(20,38,31,.35);
position:relative;overflow:hidden;transform-origin:right center}
.pb-root[dir="ltr"] .pb-page{border-radius:14px 6px 6px 14px;transform-origin:left center}
.pb-page::before{content:"";position:absolute;inset:0 0 0 auto;width:14px;background:linear-gradient(to left,rgba(31,58,48,.07),transparent);pointer-events:none}
.pb-root[dir="ltr"] .pb-page::before{inset:0 auto 0 0;background:linear-gradient(to right,rgba(31,58,48,.07),transparent)}
@keyframes pbTurnF{from{opacity:0;transform:perspective(1600px) rotateY(-9deg) translateX(-14px)}to{opacity:1;transform:none}}
@keyframes pbTurnB{from{opacity:0;transform:perspective(1600px) rotateY(9deg) translateX(14px)}to{opacity:1;transform:none}}
.pb-turn-fwd{animation:pbTurnF .42s cubic-bezier(.3,.7,.2,1) both}.pb-turn-back{animation:pbTurnB .42s cubic-bezier(.3,.7,.2,1) both}
.pb-root[dir="ltr"] .pb-turn-fwd{animation-name:pbTurnB}.pb-root[dir="ltr"] .pb-turn-back{animation-name:pbTurnF}
@media (prefers-reduced-motion:reduce){.pb-turn-fwd,.pb-turn-back{animation:none}}
.pb-head{display:flex;align-items:center;gap:10px;padding:16px 22px 4px;font-size:var(--t-sm);color:var(--pb-ink-2)}
.pb-head i{flex:1;height:1px;background:var(--pb-gold);opacity:.7}
.pb-wm{font-family:var(--display);font-weight:600;color:var(--pb-ink);letter-spacing:.02em;direction:ltr;unicode-bidi:isolate}
.pb-head .pb-wm{font-size:20px}
.pb-folio-sq{background:var(--pb-sage);color:var(--pb-ink);font-family:var(--display-heavy);font-weight:700;padding:1px 8px;border-radius:3px;font-variant-numeric:tabular-nums}
.pb-body{padding:8px 22px 18px;display:flex;flex-direction:column;gap:16px}
.pb-cover{background:var(--pb-ink);color:var(--pb-paper);text-align:center;padding:38px 22px 30px;display:flex;flex-direction:column;align-items:center;gap:6px}
.pb-cover .pb-wm{color:var(--pb-paper)}.pb-wm-lg{font-size:56px;line-height:1}
.pb-gold{display:block;width:84px;height:1.5px;background:var(--pb-gold);margin:10px 0}
.pb-h1{font-family:var(--display-heavy);font-weight:800;font-size:clamp(28px,6vw,36px);margin:0;line-height:1.15;text-wrap:balance}
.pb-sub{margin:0;font-size:var(--t-md);opacity:.85;letter-spacing:.02em}
.pb-h2{font-family:var(--display-heavy);font-weight:800;font-size:clamp(24px,5vw,30px);color:var(--pb-ink);margin:0;line-height:1.15;text-wrap:balance}
.pb-center{text-align:center}
.pb-h3{font-size:var(--t-xs);font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--pb-ink-2);margin:0 0 6px}
.pb-eyebrow{margin:0;font-size:var(--t-sm);font-weight:700;color:var(--pb-sage-ink);letter-spacing:.04em;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.pb-full{white-space:nowrap;display:inline-block;font-size:11px;font-weight:700;color:var(--pb-ink);background:var(--pb-sage);border-radius:999px;padding:1px 9px;letter-spacing:0;margin-inline-start:8px}
.pb-lead{margin:0;font-size:var(--t-md);color:var(--pb-ink-2);line-height:1.7;max-width:62ch}
.pb-rule{height:1px;background:var(--pb-gold);opacity:.55}
.pb-meta{display:flex;gap:10px 28px;flex-wrap:wrap;margin:0}
.pb-meta div{display:flex;flex-direction:column;gap:2px}
.pb-meta dt{font-size:var(--t-xs);color:var(--pb-ink-2);letter-spacing:.06em}
.pb-meta dd{margin:0;font-size:var(--t-md);font-weight:600}
.pb-num{font-variant-numeric:tabular-nums}
.pb-sec p{margin:0;line-height:1.7;font-size:var(--t-md)}
.pb-sec ul{margin:0;padding-inline-start:18px;display:flex;flex-direction:column;gap:5px;line-height:1.55;font-size:var(--t-md)}
.pb-stop,.pb-adapt{border-radius:10px;padding:12px 14px}
.pb-stop{background:var(--pb-petal)}.pb-stop .pb-h3{color:var(--pb-petal-ink)}.pb-stop li::marker{color:var(--pb-petal-ink)}
.pb-adapt{background:color-mix(in srgb,var(--pb-sage) 60%,#fff)}.pb-adapt .pb-h3{color:var(--pb-sage-ink)}.pb-adapt li::marker{color:var(--pb-sage-ink)}
.pb-contra{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.pb-intro-grid{display:grid;grid-template-columns:minmax(0,200px) 1fr;gap:18px;align-items:center}
.pb-stack{display:flex;flex-direction:column;gap:14px}
.pb-fig{margin:0;background:#fff;border:1px solid var(--pb-line);border-radius:10px;padding:10px;overflow-x:auto}
.pb-fig-svg{display:block;width:100%;min-width:300px;height:auto;direction:ltr}
.pb-face{display:block;width:100%;max-width:200px;height:auto;margin:0 auto}
.pb-face-fig figcaption{margin-top:6px}
.pb-chips{display:flex;flex-wrap:wrap;gap:5px;justify-content:center}
.pb-chips span{background:var(--pb-petal);color:var(--pb-petal-ink);font-size:12px;font-weight:600;padding:2px 9px;border-radius:999px}
.pb-chips .pb-chip-sage{background:var(--pb-sage);color:var(--pb-sage-ink)}
.pb-steps{list-style:none;margin:0;padding:0;border-top:1px solid var(--pb-line)}
.pb-steps li{display:grid;grid-template-columns:36px 1fr auto;gap:12px;align-items:start;padding:11px 0;border-bottom:1px solid var(--pb-line)}
.pb-si{width:36px;height:36px;border-radius:50%;background:var(--pb-sage);color:var(--pb-ink);display:grid;place-items:center}
.pb-step-tx{display:flex;flex-direction:column;gap:3px}
.pb-step-tx strong{font-size:var(--t-md);display:flex;align-items:baseline;gap:8px}
.pb-step-tx span{font-size:var(--t-sm);color:var(--pb-ink-2);line-height:1.5}
.pb-no{font-family:var(--display-heavy);font-weight:700;color:var(--pb-gold);font-variant-numeric:tabular-nums}
.pb-time{font-size:var(--t-sm);font-weight:700;color:var(--pb-ink);background:var(--pb-paper);border:1px solid var(--pb-line);border-radius:999px;padding:3px 10px;white-space:nowrap;margin-top:6px}
.pb-warn{margin:0;background:var(--pb-petal);border-inline-start:3px solid var(--pb-petal-ink);padding:10px 14px;border-radius:4px;font-size:var(--t-md);line-height:1.6}
.pb-tip{background:var(--pb-ink);color:var(--pb-paper);border-radius:10px;padding:13px 16px;font-size:var(--t-md);line-height:1.65}
.pb-tip b{color:#E6CF9C;margin-inline-end:6px}
.pb-muted{color:var(--pb-ink-2);font-size:var(--t-sm)!important;margin:0 0 8px!important}
.pb-ask{list-style:none!important;padding:0!important;counter-reset:q}
.pb-ask li{counter-increment:q;display:grid;grid-template-columns:28px 1fr;gap:8px;padding:8px 0;border-bottom:1px dashed var(--pb-line)}
.pb-ask li::before{content:counter(q);font-family:var(--display-heavy);font-weight:700;color:var(--pb-gold)}
.pb-legend{list-style:none;margin:0;padding:0;display:flex;flex-direction:column}
.pb-legend li{display:grid;grid-template-columns:26px 1fr;gap:10px;padding:8px 0;border-bottom:1px solid var(--pb-line);font-size:var(--t-md);line-height:1.55}
.pb-nb{width:22px;height:22px;border-radius:50%;background:var(--pb-ink);color:var(--pb-paper);font-size:12px;font-weight:700;display:grid;place-items:center;margin-top:2px}
.pb-facts{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.pb-facts div{background:var(--pb-paper);border:1px solid var(--pb-line);border-radius:10px;padding:12px;display:flex;flex-direction:column;gap:4px;font-size:var(--t-sm);line-height:1.55}
.pb-toc-group{display:flex;flex-direction:column;gap:8px}
.pb-toc{list-style:none;margin:0;padding:0;border-top:1px solid var(--pb-line)}
.pb-toc button{all:unset;box-sizing:border-box;width:100%;display:grid;grid-template-columns:40px 1fr auto;gap:12px;align-items:center;padding:12px 4px;border-bottom:1px solid var(--pb-line);cursor:pointer;font-size:var(--t-md)}
.pb-toc button:hover{background:var(--pb-paper)}
.pb-toc button:focus-visible,.pb-nav button:focus-visible,.pb-langs button:focus-visible,.pb-foot button:focus-visible{outline:2px solid var(--pb-gold);outline-offset:2px}
.pb-toc-no{font-family:var(--display-heavy);font-size:20px;font-weight:700;color:var(--pb-gold);font-variant-numeric:tabular-nums}
.pb-toc-nm{font-weight:600}
.pb-toc-tag{font-size:var(--t-xs);color:var(--pb-ink-2)}
.pb-disclaimer{margin:4px 0 0;font-size:var(--t-sm);color:var(--pb-ink-2);line-height:1.6;border-top:1px solid var(--pb-line);padding-top:12px}
.pb-link{border:1px solid var(--pb-line);border-radius:10px;padding:14px;background:var(--pb-paper)}
.pb-svc{list-style:none;margin:0;padding:0!important;gap:0!important}
.pb-svc li{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--pb-line);flex-wrap:wrap}
.pb-svc label{display:flex;align-items:center;gap:10px;cursor:pointer;min-height:32px}
.pb-svc input{width:18px;height:18px;accent-color:var(--pb-ink)}
.pb-svc-state{font-size:var(--t-xs);color:var(--pb-ink-2)}
.pb-foot{display:flex;justify-content:space-between;align-items:center;padding:10px 22px 14px;border-top:1px solid var(--pb-line);font-size:var(--t-sm)}
.pb-foot button{font:inherit;color:var(--pb-ink);background:none;border:0;cursor:pointer;min-height:36px;text-decoration:underline;text-underline-offset:3px}
.pb-folio{color:var(--pb-ink-2)}
.pb-nav{display:flex;align-items:center;gap:12px}
.pb-nav button{font:inherit;font-weight:600;font-size:var(--t-md);border:1px solid var(--pb-line);background:var(--surface,#fff);color:var(--pb-ink);border-radius:999px;padding:10px 20px;min-height:44px;cursor:pointer}
.pb-nav .pb-next{background:var(--pb-ink);color:var(--pb-paper);border-color:var(--pb-ink)}
.pb-nav button:disabled{opacity:.35;cursor:default}
.pb-prog{flex:1;height:3px;background:var(--pb-line);border-radius:3px;overflow:hidden}
.pb-prog i{display:block;height:100%;background:var(--pb-gold);transition:width .4s}
@media (max-width:560px){
.pb-contra,.pb-facts{grid-template-columns:1fr}
.pb-intro-grid{grid-template-columns:1fr}
.pb-body{padding:6px 16px 16px}.pb-head{padding:14px 16px 4px}.pb-foot{padding:10px 16px 12px}
.pb-steps li{grid-template-columns:32px 1fr}.pb-si{width:32px;height:32px}
.pb-time{grid-column:2;justify-self:start;margin-top:0}
.pb-wm-lg{font-size:46px}
}
`;
