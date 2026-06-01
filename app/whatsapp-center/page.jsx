"use client";
import { useState, useEffect } from "react";
import { supabase } from "../supabase";

// ============================================================
// WHATSAPP CENTER  —  /whatsapp-center
// Shows the WhatsApp message log for the LOGGED-IN cosmetician only.
//
// MULTI-TENANT: we first resolve the current user's tenant via the
// get_user_tenant_id() RPC, then ask the API only for that tenant's
// messages (?t=<tenantId>). Each business sees only her own log.
// ============================================================

export default function WhatsAppCenter() {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  async function loadMessages() {
    setLoading(true);
    setError(null);
    try {
      // 1. Resolve the current tenant (the logged-in cosmetician's business)
      const { data: tenantId, error: tErr } = await supabase.rpc("get_user_tenant_id");
      if (tErr || !tenantId) {
        setError("לא זוהה עסק מחובר. אנא התחברי מחדש.");
        setLoading(false);
        return;
      }

      // 2. Ask the API only for THIS tenant's messages
      const res = await fetch(`/api/messages?t=${tenantId}`);
      const data = await res.json();
      if (data.success) {
        setMessages(data.messages || []);
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  }

  useEffect(() => {
    loadMessages();
  }, []);

  const typeLabels = {
    reminder: "תזכורת",
    confirmation: "אישור הגעה",
    booking_confirm: "אישור תור",
    owner_alert: "התראת תור",
    receipt: "קבלה",
    skin_report: "דוח עור",
    skin_lead_alert: "ליד מהסורק",
    general: "כללי",
  };

  return (
    <div dir="rtl" style={{ fontFamily: "'Varela Round','Heebo',sans-serif", background: "linear-gradient(180deg,#FCEEF3 0%,#FFFFFF 420px)", minHeight: "100vh", padding: "30px 22px", color: "#2A2A2A" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=Varela+Round&display=swap'); .serif{font-family:'Playfair Display',serif}`}</style>

      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 22, flexWrap: "wrap", gap: 10 }}>
          <h1 className="serif" style={{ fontSize: 28, fontWeight: 700, color: "#2A2A2A" }}>מרכז הודעות WhatsApp</h1>
          <button onClick={loadMessages} style={{ padding: "9px 20px", borderRadius: 24, border: "none", background: "linear-gradient(90deg,#C77B92,#D89AAE)", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", boxShadow: "0 6px 16px rgba(199,123,146,0.25)" }}>
            רענני
          </button>
        </div>

        {loading && <p style={{ color: "#8A8088", fontSize: 14 }}>טוען...</p>}
        {error && (
          <div style={{ background: "#FFFAF7", border: "1px solid #FFDAC1", borderRadius: 14, padding: "12px 16px", marginBottom: 16 }}>
            <p style={{ color: "#C77B92", fontSize: 13, fontWeight: 600 }}>{error}</p>
          </div>
        )}

        {!loading && !error && messages.length === 0 && (
          <div style={{ background: "#fff", borderRadius: 18, padding: "40px 20px", textAlign: "center", border: "1px solid #EFE7EB" }}>
            <p style={{ color: "#8A8088", fontSize: 14 }}>עדיין לא נשלחו הודעות.</p>
          </div>
        )}

        {!loading && messages.length > 0 && (
          <div style={{ background: "#fff", borderRadius: 18, border: "1px solid #EFE7EB", overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "linear-gradient(90deg,#FCEEF3,#FFFFFF)", textAlign: "right" }}>
                  <th style={{ padding: "12px 14px", fontSize: 11, color: "#8A8088", fontWeight: 600 }}>שם</th>
                  <th style={{ padding: "12px 14px", fontSize: 11, color: "#8A8088", fontWeight: 600 }}>טלפון</th>
                  <th style={{ padding: "12px 14px", fontSize: 11, color: "#8A8088", fontWeight: 600 }}>סוג</th>
                  <th style={{ padding: "12px 14px", fontSize: 11, color: "#8A8088", fontWeight: 600 }}>סטטוס</th>
                  <th style={{ padding: "12px 14px", fontSize: 11, color: "#8A8088", fontWeight: 600 }}>תוכן</th>
                  <th style={{ padding: "12px 14px", fontSize: 11, color: "#8A8088", fontWeight: 600 }}>תאריך</th>
                </tr>
              </thead>
              <tbody>
                {messages.map((m, i) => (
                  <tr key={m.id} style={{ borderTop: "1px solid #F7F0F3", background: i % 2 === 0 ? "#fff" : "#FCEEF3" }}>
                    <td style={{ padding: "11px 14px", fontSize: 12, fontWeight: 600, color: "#2A2A2A" }}>{m.recipient_name || "-"}</td>
                    <td style={{ padding: "11px 14px", fontSize: 12, color: "#6B6B6B" }}>{m.recipient_phone}</td>
                    <td style={{ padding: "11px 14px", fontSize: 11 }}>
                      <span style={{ background: "#FBEEF2", color: "#C77B92", padding: "3px 10px", borderRadius: 20, fontWeight: 600 }}>
                        {typeLabels[m.message_type] || m.message_type}
                      </span>
                    </td>
                    <td style={{ padding: "11px 14px", fontSize: 11 }}>
                      {m.status === "sent" ? (
                        <span style={{ color: "#388E3C", fontWeight: 700 }}>✓ נשלח</span>
                      ) : (
                        <span style={{ color: "#C62828", fontWeight: 700 }}>✕ נכשל</span>
                      )}
                    </td>
                    <td style={{ padding: "11px 14px", fontSize: 11.5, color: "#6B6B6B", maxWidth: 300 }}>{m.message_body}</td>
                    <td style={{ padding: "11px 14px", fontSize: 10.5, color: "#8A8088", whiteSpace: "nowrap" }}>{new Date(m.created_at).toLocaleString("he-IL")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
