"use client";
import { useState, useEffect } from "react";

export default function WhatsAppCenter() {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  async function loadMessages() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/messages");
      const data = await res.json();
      if (data.success) {
        setMessages(data.messages);
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
    receipt: "קבלה",
    general: "כללי",
  };

  return (
    <div style={{ padding: 40, direction: "rtl", fontFamily: "Arial" }}>
      <h1>📱 מרכז הודעות WhatsApp</h1>
      <button
        onClick={loadMessages}
        style={{ padding: "8px 16px", marginBottom: 20, cursor: "pointer" }}
      >
        🔄 רענן
      </button>

      {loading && <p>טוען...</p>}
      {error && <p style={{ color: "red" }}>שגיאה: {error}</p>}

      {!loading && !error && messages.length === 0 && (
        <p>עדיין לא נשלחו הודעות.</p>
      )}

      {!loading && messages.length > 0 && (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#f0f0f0", textAlign: "right" }}>
              <th style={{ padding: 8, border: "1px solid #ddd" }}>שם</th>
              <th style={{ padding: 8, border: "1px solid #ddd" }}>טלפון</th>
              <th style={{ padding: 8, border: "1px solid #ddd" }}>סוג</th>
              <th style={{ padding: 8, border: "1px solid #ddd" }}>סטטוס</th>
              <th style={{ padding: 8, border: "1px solid #ddd" }}>תוכן</th>
              <th style={{ padding: 8, border: "1px solid #ddd" }}>תאריך</th>
            </tr>
          </thead>
          <tbody>
            {messages.map((m) => (
              <tr key={m.id}>
                <td style={{ padding: 8, border: "1px solid #ddd" }}>
                  {m.recipient_name || "-"}
                </td>
                <td style={{ padding: 8, border: "1px solid #ddd" }}>
                  {m.recipient_phone}
                </td>
                <td style={{ padding: 8, border: "1px solid #ddd" }}>
                  {typeLabels[m.message_type] || m.message_type}
                </td>
                <td style={{ padding: 8, border: "1px solid #ddd" }}>
                  {m.status === "sent" ? (
                    <span style={{ color: "green" }}>✅ נשלח</span>
                  ) : (
                    <span style={{ color: "red" }}>❌ נכשל</span>
                  )}
                </td>
                <td style={{ padding: 8, border: "1px solid #ddd", maxWidth: 300 }}>
                  {m.message_body}
                </td>
                <td style={{ padding: 8, border: "1px solid #ddd" }}>
                  {new Date(m.created_at).toLocaleString("he-IL")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}