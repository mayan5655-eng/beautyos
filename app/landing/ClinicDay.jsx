"use client";
// app/landing/ClinicDay.jsx
//
// A real day in the clinic: pick a moment, flip between before and with Kalmea. The "with" side never shows more than the product does:
// a message is ready for her to send, an offer waits for her OK. Names are made up and the note under the card says so.

import { useState } from "react";
import Image from "next/image";

function Whatsapp({ time, text, status }) {
  return (
    <div className="lp-wa">
      <p className="lp-wa-head">וואטסאפ</p>
      <div className="lp-wa-bubble">{text}<span dir="ltr" className="lp-wa-time">{time}</span></div>
      <p className="lp-wa-status">{status}</p>
    </div>
  );
}

function ClientCard({ name, line, last, note }) {
  return (
    <div className="lp-card">
      <p className="lp-card-name">{name}</p>
      <p className="lp-card-line">{line}</p>
      <p className="lp-card-row"><span>ביקור אחרון</span><b>{last}</b></p>
      <p className="lp-card-note">{note}</p>
    </div>
  );
}

function Draft({ to, text }) {
  return (
    <div className="lp-card">
      <p className="lp-card-line">הודעה מוכנה ל{to}</p>
      <div className="lp-wa-bubble is-draft">{text}</div>
      <div className="lp-acts"><span className="lp-act is-main">שליחה</span><span className="lp-act">עריכה</span></div>
      <p className="lp-card-note">שום דבר לא יוצא בלי שאת שולחת.</p>
    </div>
  );
}

function Day({ rows, note }) {
  return (
    <div className="lp-card">
      <p className="lp-card-line">היומן של מחר</p>
      {rows.map((r) => (
        <p key={r.time} className={`lp-slot${r.empty ? " is-empty" : ""}`}><span dir="ltr">{r.time}</span><b>{r.text}</b></p>
      ))}
      {note && <p className="lp-card-note">{note}</p>}
    </div>
  );
}

function Offer({ text }) {
  return (
    <div className="lp-card">
      <p className="lp-card-line">שאלה אחת</p>
      <p className="lp-offer">{text}</p>
      <div className="lp-acts"><span className="lp-act is-main">להציע</span><span className="lp-act">לא עכשיו</span></div>
      <p className="lp-card-note">את מחליטה, ואת רואה למי זה יוצא לפני ששולחים.</p>
    </div>
  );
}

const SCREEN = { whatsapp: Whatsapp, client: ClientCard, draft: Draft, day: Day, offer: Offer };

function Panel({ side, data }) {
  if (data.shot) {
    return <div className="lp-shot-wrap"><Image src={data.shot} alt={data.alt} width={560} height={1212} sizes="240px" className="lp-shot-img" /></div>;
  }
  const Screen = SCREEN[data.screen];
  return <div className={`lp-panel is-${side}`}><Screen {...data.props} /></div>;
}

export default function ClinicDay({ moments }) {
  const [at, setAt] = useState(0);
  const [side, setSide] = useState("before");
  const m = moments[at];
  const pick = (i) => { setAt(i); setSide("before"); };
  return (
    <div className="lp-day">
      <div className="lp-day-tabs" role="tablist" aria-label="רגעים ביום">
        {moments.map((x, i) => (
          <button key={x.id} type="button" role="tab" aria-selected={i === at} onClick={() => pick(i)} className={`lp-day-tab${i === at ? " is-on" : ""}`}>{x.tab}</button>
        ))}
      </div>
      <h3 className="lp-day-title">{m.title}</h3>
      <div className="lp-switch" role="group" aria-label="לפני או עם Kalmea">
        <button type="button" aria-pressed={side === "before"} onClick={() => setSide("before")} className={side === "before" ? "is-on is-before" : ""}>לפני</button>
        <button type="button" aria-pressed={side === "after"} onClick={() => setSide("after")} className={side === "after" ? "is-on is-after" : ""}>עם Kalmea</button>
      </div>
      <div className="lp-day-stage">
        <Panel key={`${m.id}-${side}`} side={side} data={m[side]} />
        <p className="lp-day-text">{m[side].text}</p>
      </div>
    </div>
  );
}
