"use client";
// app/ProtocolBookNavEntry.jsx — the "ספר הפרוטוקולים" entry: in the side menu (computer) and the "עוד" sheet (phone), never in
// the bottom bar, so the book adds no weight to the screens she uses every day. Renders NOTHING while NEXT_PUBLIC_PROTOCOL_BOOK
// is off (lib/protocolBook/book.ts): no entry ever leads to a 404.
import { protocolBookEnabled } from "@/lib/protocolBook/book";
import { tr } from "@/lib/i18n/tr";

const ON = protocolBookEnabled();

const book = (
  <svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true" style={{ fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round" }}>
    <path d="M4 5.5C4 4.7 4.7 4 5.5 4H11v15H5.5C4.7 19 4 18.3 4 17.5Z" /><path d="M20 5.5c0-.8-.7-1.5-1.5-1.5H13v15h5.5c.8 0 1.5-.7 1.5-1.5Z" /><path d="M7 8h2M15 8h2M7 11h2M15 11h2" />
  </svg>
);

/** @param {{ variant: "nav" | "more", onOpen: () => void }} props */
export default function ProtocolBookNavEntry({ variant, onOpen }) {
  if (!ON) return null;
  if (variant === "nav") {
    return (
      <button className="nav-item" data-testid="protocol-book-nav" onClick={onOpen}>
        <span className="nav-ico">{book}</span>
        <span style={{ flex: 1 }}>{tr("ספר הפרוטוקולים")}</span>
      </button>
    );
  }
  return (
    <button data-testid="protocol-book-more" onClick={onOpen}
      style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 7,
        padding: "14px 6px", borderRadius: "var(--r-md)", cursor: "pointer", fontFamily: "inherit",
        border: "1px solid var(--line)", background: "var(--surface-2)", color: "var(--ink-2)" }}>
      {book}
      <span style={{ fontSize: "var(--t-sm)", fontWeight: 600 }}>{tr("ספר הפרוטוקולים")}</span>
    </button>
  );
}
