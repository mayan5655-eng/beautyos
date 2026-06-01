"use client";
import { useState, useEffect } from "react";
import { supabase } from "../supabase";

// ============================================================
// AI AGENT TEST PAGE  —  /test-agent
// Lets you chat with the AI agent locally, before Vercel.
// Internal testing page (not shown to clients).
//
// MULTI-TENANT: resolves the logged-in cosmetician's tenant via
// get_user_tenant_id() and passes it to the agent, so the test chat
// reflects YOUR business's real services, prices and hours.
// ============================================================

export default function TestAgentPage() {
  const [messages, setMessages] = useState([
    { role: "agent", text: "שלום! אני העוזרת הווירטואלית 💗 אפשר לשאול אותי על טיפולים, מחירים, שעות, או לקבוע תור. איך אפשר לעזור?" },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [tenantId, setTenantId] = useState(null);

  // Resolve the current tenant once on load
  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase.rpc("get_user_tenant_id");
        if (data) setTenantId(data);
      } catch {}
    })();
  }, []);

  const send = async () => {
    if (!input.trim() || loading) return;
    const userMsg = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "client", text: userMsg }]);
    setLoading(true);
    try {
      const res = await fetch("/api/ai-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMsg, clientName: "", tenantId }),
      });
      const data = await res.json();
      if (data.success) {
        setMessages((prev) => [...prev, { role: "agent", text: data.reply }]);
      } else {
        setMessages((prev) => [...prev, { role: "agent", text: "⚠️ שגיאה: " + (data.error || "לא ידועה") }]);
      }
    } catch (err) {
      setMessages((prev) => [...prev, { role: "agent", text: "⚠️ שגיאת חיבור" }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div dir="rtl" style={{ fontFamily: "'Heebo',sans-serif", background: "#E5DDD5", minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", padding: "20px 0" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Heebo:wght@400;500;600;700&display=swap');`}</style>
      <div style={{ width: "100%", maxWidth: 440, display: "flex", flexDirection: "column", height: "92vh", background: "#fff", borderRadius: 14, overflow: "hidden", boxShadow: "0 8px 30px rgba(0,0,0,0.15)" }}>

        {/* HEADER */}
        <div style={{ background: "#075E54", color: "#fff", padding: "14px 18px", display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 38, height: 38, borderRadius: "50%", background: "#25D366", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>🤖</div>
          <div>
            <p style={{ fontSize: 15, fontWeight: 700 }}>סוכן AI (בדיקה)</p>
            <p style={{ fontSize: 11, opacity: 0.8 }}>{loading ? "מקליד..." : "מחובר"}</p>
          </div>
        </div>

        {/* MESSAGES */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px", display: "flex", flexDirection: "column", gap: 8, background: "#E5DDD5" }}>
          {messages.map((m, i) => (
            <div key={i} style={{ alignSelf: m.role === "client" ? "flex-start" : "flex-end", maxWidth: "80%", background: m.role === "client" ? "#fff" : "#DCF8C6", padding: "9px 13px", borderRadius: 12, fontSize: 14, color: "#222", whiteSpace: "pre-wrap", lineHeight: 1.5, boxShadow: "0 1px 2px rgba(0,0,0,0.1)" }}>
              {m.text}
            </div>
          ))}
          {loading && (
            <div style={{ alignSelf: "flex-end", background: "#DCF8C6", padding: "9px 13px", borderRadius: 12, fontSize: 14, color: "#888" }}>...</div>
          )}
        </div>

        {/* INPUT */}
        <div style={{ display: "flex", gap: 8, padding: "12px", background: "#F0F0F0" }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") send(); }}
            placeholder="כתבי הודעה..."
            style={{ flex: 1, border: "none", borderRadius: 22, padding: "11px 16px", fontSize: 14, fontFamily: "inherit", outline: "none", direction: "rtl" }}
          />
          <button onClick={send} disabled={loading} style={{ background: "#25D366", color: "#fff", border: "none", borderRadius: "50%", width: 44, height: 44, fontSize: 18, cursor: "pointer", flexShrink: 0 }}>➤</button>
        </div>

      </div>
      <p style={{ fontSize: 11, color: "#888", marginTop: 12 }}>זהו דף בדיקה פנימי — לא נראה ללקוחות 🔒</p>
    </div>
  );
}
