"use client";
// app/shared/pushSubscribe.jsx — the button that turns notifications on for this device.
//
// Moved out of app/beautyos.jsx by scripts/extract-module.mjs, byte for byte: nothing between the two markers below was
// rewritten. app/beautyos.jsx imports every name this file exports; scripts/check-screens.mjs holds the two lists and the
// declarations equal. When a test reads app/beautyos.jsx, scripts/test-source-view.mjs puts this body back in its place.
import { useState, useEffect } from "react";
import { tr, trv } from "@/lib/i18n/tr";

/* @module-body */
// Browser push opt-in for owner_notifications (new booking / cancellation /
// hot skin-scan lead) - lib/ownerNotify.js sends to every subscription stored
// here. A plain function component (not a hook mid-render) so it can sit
// inside Settings' JSX without its own effect tangling with the parent's.
function PushSubscribeButton({ pc, pcGrad }) {
  const [state, setState] = useState("idle"); // idle | checking | on | off | unsupported | error
  const [err, setErr] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) {
        if (!cancelled) setState("unsupported");
        return;
      }
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (!cancelled) setState(sub ? "on" : "off");
      } catch {
        if (!cancelled) setState("off");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const urlBase64ToUint8Array = (base64) => {
    const padding = "=".repeat((4 - (base64.length % 4)) % 4);
    const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
    const raw = atob(b64);
    return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
  };

  const subscribe = async () => {
    setState("checking"); setErr("");
    try {
      const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!vapidKey) { setErr(tr("התראות דפדפן עדיין לא מוגדרות במערכת.")); setState("off"); return; }
      const perm = await Notification.requestPermission();
      if (perm !== "granted") { setErr(tr("ההרשאה לא אושרה בדפדפן.")); setState("off"); return; }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription: sub.toJSON() }),
      });
      if (!res.ok) { setErr(tr("לא הצלחנו לשמור, אפשר לנסות שוב.")); setState("off"); return; }
      setState("on");
    } catch (e) {
      setErr(e?.message || tr("לא הצלחנו להפעיל, אפשר לנסות שוב."));
      setState("off");
    }
  };

  const unsubscribe = async () => {
    setState("checking");
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setState("off");
    } catch {
      setState("on");
    }
  };

  if (state === "unsupported") {
    // An iPhone only offers push to a web app that was added to the home screen (iOS 16.4+), and an Instagram/Facebook browser has none:
    // "this browser does not support it" sent her away with nothing to do (2026-10-24 phone review).
    const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
    const text = /Instagram|FBAN|FBAV|FB_IAB|Messenger/i.test(ua)
      ? "בדפדפן של אינסטגרם או פייסבוק אי אפשר לקבל התראות. פתחי את קלמיה בספארי או בכרום."
      : /iPhone|iPad|iPod/.test(ua)
        ? "באייפון ההתראות עובדות רק מאפליקציה שהוספת למסך הבית: בספארי לחצי על שיתוף ← הוספה למסך הבית, ופתחי את קלמיה משם."
        : "הדפדפן הזה לא תומך בהתראות דחיפה.";
    return <p style={{ fontSize: "var(--t-sm)", color: "var(--ink-3)" }}>{trv(text)}</p>;
  }
  return (
    <div>
      <button
        onClick={state === "on" ? unsubscribe : subscribe}
        disabled={state === "checking" || state === "idle"}
        style={{
          background: state === "on" ? "var(--surface)" : pcGrad,
          color: state === "on" ? "var(--ink-2)" : "var(--pc-contrast)",
          border: state === "on" ? "1px solid var(--line-2)" : "none",
          borderRadius: "var(--r-sm)", padding: "9px 16px", fontSize: "var(--t-sm)", fontWeight: 600,
          cursor: state === "checking" ? "default" : "pointer", fontFamily: "inherit",
          opacity: state === "checking" ? 0.6 : 1,
        }}
      >
        {state === "checking" ? tr("רגע...") : state === "on" ? tr("כיבוי התראות") : tr("הפעלת התראות")}
      </button>
      {err && <p style={{ fontSize: "var(--t-xs)", color: "var(--danger)", marginTop: 6 }}>{err}</p>}
    </div>
  );
}
/* @module-end */
export {
  PushSubscribeButton,
};
