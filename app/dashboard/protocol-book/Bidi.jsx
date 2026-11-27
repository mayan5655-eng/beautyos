// app/dashboard/protocol-book/Bidi.jsx — numbers that keep their order inside Hebrew and Arabic sentences.
//
// In a right-to-left line, "3–5 ימים" renders as "5–3", "20%–30%" as "30%–20%" and "SPF 30+" as "+SPF 30": the dash and
// the % / + are neutral characters, and the bidi algorithm hands them to the surrounding Hebrew. (The kalmea skill's video
// lessons are the same bug.) Wrapping each number or range in a left-to-right isolate (<bdi dir="ltr">) keeps it whole.
import { bidiParts } from "@/lib/protocolBook/bidi";

export default function Bidi({ children }) {
  if (typeof children !== "string") return children ?? null;
  return bidiParts(children).map((p, i) => (p.num ? <bdi key={i} dir="ltr">{p.t}</bdi> : p.t));
}
