"use client";

// app/layout-debug.tsx
//
// TEMPORARY. Delete this file, its import and its mount in beautyos.jsx once
// the iPhone layout question is settled. It ships to production because the bug
// only reproduces in a standalone home-screen install, where there is no
// address bar to add ?debug= to and no desktop inspector to attach.
//
// HOW TO OPEN IT: tap the BloomOS logo in the header five times within two
// seconds. Nothing else triggers it, and it renders nothing at all until then.
//
// It reads and displays. It never writes, never calls an API, and touches no
// tenant data - every number below comes from the DOM of the page it is already
// on.

import { useCallback, useEffect, useState } from "react";

type Row = { k: string; v: string };

/** Resolve the four env(safe-area-inset-*) values by probing a real element. */
function readInsets(): Record<string, string> {
  const probe = document.createElement("div");
  probe.style.cssText =
    "position:fixed;top:0;left:0;width:0;height:0;visibility:hidden;" +
    "padding-top:env(safe-area-inset-top,0px);" +
    "padding-right:env(safe-area-inset-right,0px);" +
    "padding-bottom:env(safe-area-inset-bottom,0px);" +
    "padding-left:env(safe-area-inset-left,0px);";
  document.body.appendChild(probe);
  const cs = getComputedStyle(probe);
  const out = {
    top: cs.paddingTop,
    right: cs.paddingRight,
    bottom: cs.paddingBottom,
    left: cs.paddingLeft,
  };
  probe.remove();
  return out;
}

/** Short identifier for an element: tag#id.class1.class2 */
function label(e: Element): string {
  const id = (e as HTMLElement).id ? `#${(e as HTMLElement).id}` : "";
  const cls =
    typeof e.className === "string" && e.className.trim()
      ? "." + e.className.trim().split(/\s+/).slice(0, 2).join(".")
      : "";
  return `${e.tagName.toLowerCase()}${id}${cls}`;
}

/**
 * Every ancestor from the shell up to <html>, with the properties that can
 * inset a child without appearing on the child itself.
 *
 * This is the measurement that matters: the shell reports no margin, no
 * padding, no max-width and no horizontal safe-area inset, yet sits 32px in
 * from each edge in standalone. Something above it is doing that, and the only
 * way to find out which is to read every level rather than reason about it.
 */
function parentChain(): Row[] {
  const start =
    (document.querySelector(".app-header")?.parentElement as HTMLElement | null) ??
    (document.body.firstElementChild as HTMLElement | null);
  if (!start) return [{ k: "chain", v: "shell not found" }];

  const out: Row[] = [];
  let el: HTMLElement | null = start;
  let depth = 0;
  while (el && depth < 12) {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    out.push({ k: `[${depth}] ${label(el)}`, v: "" });
    out.push({ k: "   rect L/R/W", v: `${r.left.toFixed(1)} / ${r.right.toFixed(1)} / ${r.width.toFixed(1)}` });
    out.push({ k: "   width / maxW", v: `${cs.width} / ${cs.maxWidth}` });
    out.push({ k: "   pad L/R", v: `${cs.paddingLeft} / ${cs.paddingRight}` });
    out.push({ k: "   mar L/R", v: `${cs.marginLeft} / ${cs.marginRight}` });
    out.push({ k: "   bor L/R", v: `${cs.borderLeftWidth} / ${cs.borderRightWidth}` });
    out.push({ k: "   position", v: cs.position });
    // Any of these can scale or shift a subtree without touching its box model.
    out.push({ k: "   transform", v: cs.transform === "none" ? "none" : cs.transform });
    out.push({
      k: "   scale/zoom",
      v: `${(cs as unknown as { scale?: string }).scale ?? "-"} / ${(cs as unknown as { zoom?: string }).zoom ?? "-"}`,
    });
    out.push({ k: "   box-sizing", v: cs.boxSizing });
    out.push({ k: "   overflow X/Y", v: `${cs.overflowX} / ${cs.overflowY}` });
    if (cs.display === "flex" || cs.display === "grid" || cs.display === "inline-flex") {
      out.push({ k: "   display", v: `${cs.display} justify:${cs.justifyContent} align:${cs.alignItems}` });
    }
    el = el.parentElement;
    depth += 1;
  }
  return out;
}

/**
 * The widest element that can actually affect layout, and how far past the
 * viewport it reaches.
 *
 * Skips elements that are visibility:hidden or display:none, and skips
 * position:fixed subtrees that are translated off-screen: a closed slide-out
 * drawer legitimately sits beyond the right edge, paints nothing and scrolls
 * nothing, so reporting it as an overflow sends the reader after a non-problem.
 */
function widestOverflower(viewportWidth: number): string {
  let worst: { el: Element; right: number } | null = null;
  for (const el of Array.from(document.body.querySelectorAll("*"))) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none" || cs.opacity === "0") continue;
    if (cs.position === "fixed" && cs.transform !== "none") continue;
    if (r.right > viewportWidth + 1 && (!worst || r.right > worst.right)) {
      worst = { el, right: r.right };
    }
  }
  if (!worst) return "none";
  const e = worst.el;
  const id = e.id ? `#${e.id}` : "";
  const cls = typeof e.className === "string" && e.className
    ? "." + e.className.trim().split(/\s+/).slice(0, 2).join(".")
    : "";
  return `${e.tagName.toLowerCase()}${id}${cls} → right ${worst.right.toFixed(1)} (+${(worst.right - viewportWidth).toFixed(1)})`;
}

function collect(): Row[] {
  const de = document.documentElement;
  const body = document.body;
  const vv = window.visualViewport;
  const insets = readInsets();
  const bodyCs = getComputedStyle(body);
  const htmlCs = getComputedStyle(de);

  // The app shell: the first dir="rtl" flex column under body, which is the
  // element the gutters would be showing either side of.
  const shell =
    (document.querySelector(".app-header")?.parentElement as HTMLElement | null) ??
    (body.firstElementChild as HTMLElement | null);
  const sr = shell?.getBoundingClientRect();
  const shellCs = shell ? getComputedStyle(shell) : null;

  const iw = window.innerWidth;

  return [
    { k: "mode", v: window.matchMedia("(display-mode: standalone)").matches ||
        (navigator as unknown as { standalone?: boolean }).standalone === true
          ? "STANDALONE" : "browser tab" },
    { k: "screen.width", v: `${screen.width} (dpr ${window.devicePixelRatio})` },
    { k: "window.innerWidth", v: `${iw}` },
    { k: "documentElement.clientWidth", v: `${de.clientWidth}` },
    { k: "documentElement.scrollWidth", v: `${de.scrollWidth}` },
    { k: "body.clientWidth", v: `${body.clientWidth}` },
    { k: "body.scrollWidth", v: `${body.scrollWidth}` },
    { k: "visualViewport.width", v: vv ? `${vv.width.toFixed(1)}` : "n/a" },
    { k: "visualViewport.scale", v: vv ? `${vv.scale.toFixed(3)}` : "n/a" },
    { k: "visualViewport.offsetLeft", v: vv ? `${vv.offsetLeft.toFixed(1)}` : "n/a" },
    { k: "— shell —", v: "" },
    { k: "shell tag/class", v: shell ? `${shell.tagName.toLowerCase()}.${String(shell.className).trim().split(/\s+/)[0] || "(none)"}` : "NOT FOUND" },
    { k: "shell rect L / R", v: sr ? `${sr.left.toFixed(1)} / ${sr.right.toFixed(1)}` : "-" },
    { k: "shell rect width", v: sr ? `${sr.width.toFixed(1)}` : "-" },
    { k: "shell computed width", v: shellCs ? shellCs.width : "-" },
    { k: "shell margin L/R", v: shellCs ? `${shellCs.marginLeft} / ${shellCs.marginRight}` : "-" },
    { k: "shell maxWidth", v: shellCs ? shellCs.maxWidth : "-" },
    { k: "— html / body —", v: "" },
    { k: "html margin L/R", v: `${htmlCs.marginLeft} / ${htmlCs.marginRight}` },
    { k: "html padding L/R", v: `${htmlCs.paddingLeft} / ${htmlCs.paddingRight}` },
    { k: "body margin L/R", v: `${bodyCs.marginLeft} / ${bodyCs.marginRight}` },
    { k: "body padding L/R", v: `${bodyCs.paddingLeft} / ${bodyCs.paddingRight}` },
    { k: "body maxWidth", v: bodyCs.maxWidth },
    { k: "— safe-area insets —", v: "" },
    { k: "inset T / B", v: `${insets.top} / ${insets.bottom}` },
    { k: "inset L / R", v: `${insets.left} / ${insets.right}` },
    { k: "— overflow —", v: "" },
    { k: "widest past viewport", v: widestOverflower(iw) },
    { k: "— PARENT CHAIN: shell → html —", v: "" },
    ...parentChain(),
  ];
}

export default function LayoutDebug() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [copied, setCopied] = useState(false);

  const refresh = useCallback(() => { setRows(collect()); }, []);

  // Five taps on the header logo within two seconds.
  useEffect(() => {
    let count = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onTap = (e: Event) => {
      const t = e.target as HTMLElement | null;
      if (!t || !t.closest(".hdr-logo")) return;
      count += 1;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { count = 0; }, 2000);
      if (count >= 5) {
        count = 0;
        setRows(collect());
        setOpen((o) => !o);
      }
    };
    document.addEventListener("click", onTap, true);
    return () => {
      document.removeEventListener("click", onTap, true);
      if (timer) clearTimeout(timer);
    };
  }, []);

  // Re-measure on rotate / resize while it is open, so the numbers are live.
  useEffect(() => {
    if (!open) return undefined;
    const on = () => refresh();
    window.addEventListener("resize", on);
    window.visualViewport?.addEventListener("resize", on);
    return () => {
      window.removeEventListener("resize", on);
      window.visualViewport?.removeEventListener("resize", on);
    };
  }, [open, refresh]);

  if (!open) return null;

  const text = rows.map((r) => (r.v === "" ? r.k : `${r.k}: ${r.v}`)).join("\n");

  return (
    <div
      dir="ltr"
      style={{
        position: "fixed", inset: 0, zIndex: 999999, background: "rgba(12,8,16,0.94)",
        color: "#E9E2F0", font: "12px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace",
        padding: "14px", overflow: "auto", WebkitOverflowScrolling: "touch",
      }}
    >
      <div style={{ display: "flex", gap: 8, marginBottom: 10, position: "sticky", top: 0, background: "rgba(12,8,16,0.98)", paddingBottom: 8 }}>
        <button type="button" onClick={refresh}
          style={{ flex: 1, padding: "10px 0", borderRadius: 8, border: "1px solid #5B3E67", background: "#241A2B", color: "#E9E2F0", font: "inherit" }}>
          re-measure
        </button>
        <button type="button"
          onClick={async () => {
            try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }
            catch { setCopied(false); }
          }}
          style={{ flex: 1, padding: "10px 0", borderRadius: 8, border: "1px solid #5B3E67", background: "#241A2B", color: "#E9E2F0", font: "inherit" }}>
          {copied ? "copied ✓" : "copy all"}
        </button>
        <button type="button" onClick={() => setOpen(false)}
          style={{ flex: 1, padding: "10px 0", borderRadius: 8, border: "1px solid #5B3E67", background: "#241A2B", color: "#E9E2F0", font: "inherit" }}>
          close
        </button>
      </div>

      {rows.map((r, i) =>
        r.v === "" ? (
          <div key={i} style={{ marginTop: 10, marginBottom: 3, color: "#9B86A8" }}>{r.k}</div>
        ) : (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "2px 0", borderBottom: "1px solid #2A1F31" }}>
            <span style={{ color: "#9B86A8", flexShrink: 0 }}>{r.k}</span>
            <span style={{ textAlign: "right", wordBreak: "break-all" }}>{r.v}</span>
          </div>
        )
      )}

      <p style={{ marginTop: 14, color: "#7C6A88" }}>
        Tap the logo 5× to toggle. Temporary — remove app/layout-debug.tsx when done.
      </p>
    </div>
  );
}
