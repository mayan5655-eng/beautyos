"use client";

// One empty state, used by every screen that can be empty.
//
// The screens each had their own, and most of them said some variant of "אין
// נתונים" — which tells her the truth and nothing else. An empty screen is the
// one moment she is most likely to close the app, so it is the worst place in
// the product to answer "what now?" with silence.
//
// Three rules this component exists to enforce:
//
//   1. Name the reason, not the absence. "עוד לא רשמת הכנסות" rather than
//      "אין נתונים" — the first is a stage she is at, the second is a fault.
//   2. Always offer the next action, and make it the thing she would actually
//      do next rather than a link to the same screen.
//   3. Distinguish EMPTY from FILTERED. "You have none" and "none match this
//      filter" need different words and different buttons: the second one's
//      action is to clear the filter, and offering "add your first" there is
//      wrong and slightly insulting.
//
// Icons are inline stroked SVGs on the 24-box, like the rest of the app. No
// emoji: they render in colour on iOS against a monochrome design, which is the
// bug this codebase has now hit five times.

const STROKE = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

export const EMPTY_ICONS = {
  calendar: <><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M3 10h18M8 3v4M16 3v4" /></>,
  cash: <><rect x="2.5" y="6" width="19" height="12" rx="2.5" /><circle cx="12" cy="12" r="2.6" /><path d="M6 9.5v5M18 9.5v5" /></>,
  chart: <><path d="M4 20V4" /><path d="M4 20h16" /><path d="M8 20v-6M12.5 20V8.5M17 20v-9" /></>,
  receipt: <><path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3z" /><path d="M9.5 8.5h5M9.5 12.5h5" /></>,
  package: <><path d="M12 2.8l8.4 4.6v9.2L12 21.2 3.6 16.6V7.4z" /><path d="M3.8 7.5L12 12l8.2-4.5M12 12v9" /></>,
  spark: <><path d="M12 3.2l2.1 5.4 5.4 2.1-5.4 2.1L12 18.2l-2.1-5.4L4.5 10.7l5.4-2.1z" /><path d="M18.6 16.4l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" /></>,
  people: <><circle cx="9" cy="8.4" r="3.4" /><path d="M2.8 20a6.2 6.2 0 0 1 12.4 0" /><path d="M16.2 5.4a3.4 3.4 0 0 1 0 6.6M17.4 20a6.2 6.2 0 0 0-1.9-4.5" /></>,
  home: <><path d="M3.5 10.5L12 3.5l8.5 7" /><path d="M5.5 9.6V20h13V9.6" /><path d="M10 20v-5.5h4V20" /></>,
};

export default function EmptyState({
  icon = "spark",
  title,
  body,
  accent = "var(--pc)",
  accentTint = "var(--pc-tint)",
  actions = [],
  compact = false,
}) {
  return (
    <div
      style={{
        textAlign: "center",
        padding: compact ? "20px 14px" : "34px 18px",
        background: accentTint,
        borderRadius: 16,
        margin: compact ? "6px 0" : "10px 0",
      }}
    >
      <div
        aria-hidden="true"
        style={{
          width: compact ? 40 : 52,
          height: compact ? 40 : 52,
          margin: "0 auto 12px",
          borderRadius: "50%",
          background: "var(--surface)",
          color: accent,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <svg viewBox="0 0 24 24" width={compact ? 20 : 25} height={compact ? 20 : 25} style={STROKE}>
          {EMPTY_ICONS[icon] || EMPTY_ICONS.spark}
        </svg>
      </div>

      <p style={{ fontSize: compact ? 13 : 15, fontWeight: 700, color: "var(--ink)", marginBottom: 5 }}>
        {title}
      </p>
      {body && (
        <p
          style={{
            fontSize: compact ? 11.5 : 12.5,
            color: "var(--ink-2)",
            lineHeight: 1.65,
            maxWidth: 300,
            margin: "0 auto",
          }}
        >
          {body}
        </p>
      )}

      {actions.length > 0 && (
        <div
          style={{
            display: "flex",
            gap: 8,
            justifyContent: "center",
            flexWrap: "wrap",
            marginTop: 14,
          }}
        >
          {actions.filter(Boolean).map((a, i) => (
            <button
              key={a.label}
              type="button"
              onClick={a.onClick}
              className="empty-cta"
              style={
                i === 0
                  ? {
                      background: accent, color: "var(--surface)", border: "none",
                      borderRadius: 24, padding: "11px 20px", fontSize: 12.5,
                      fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                    }
                  : {
                      background: "var(--surface)", color: "var(--ink-2)",
                      border: "1px solid var(--line-2)", borderRadius: 24,
                      padding: "11px 18px", fontSize: 12.5, fontWeight: 600,
                      cursor: "pointer", fontFamily: "inherit",
                    }
              }
            >
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
