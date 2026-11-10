// app/landing/Testimonials.jsx
//
// What customers say, from lib/testimonials.ts. Renders NOTHING while that list is empty (it is, until real customers agree to
// be quoted): no heading, no empty frame, no "coming soon".

import Reveal from "./Reveal";
import { visibleTestimonials } from "@/lib/testimonials";

export default function Testimonials({ items }) {
  const list = visibleTestimonials(items);
  if (list.length === 0) return null;
  return (
    <section className="lp-sec is-white" data-testid="landing-testimonials">
      <div className="lp-wrap">
        <Reveal as="h2" className="serif lp-h2">מה אומרות מי שכבר עובדות עם Kalmea</Reveal>
        <div className="lp-quotes">
          {list.map((t, i) => (
            <Reveal key={`${t.name}-${i}`} as="figure" delay={Math.min(i, 3) * 50} className="lp-quote">
              <blockquote className="lp-quote-text">{t.quote}</blockquote>
              <figcaption className="lp-quote-who"><b>{t.name}</b>{t.role ? `, ${t.role}` : ""}</figcaption>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
