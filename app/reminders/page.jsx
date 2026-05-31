"use client";
import { useState } from "react";

export default function RemindersPage() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  async function handleSend() {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/send-reminders", { method: "POST" });
      const data = await res.json();
      setResult(data);
    } catch (err) {
      setResult({ success: false, error: err.message });
    }
    setLoading(false);
  }

  return (
    <div style={{ padding: 40, direction: "rtl", fontFamily: "Arial" }}>
      <h1>תזכורות תור 💆‍♀️</h1>
      <p>שליחת תזכורת WhatsApp לכל התורים של מחר.</p>

      <button
        onClick={handleSend}
        disabled={loading}
        style={{
          padding: "12px 24px",
          fontSize: 16,
          background: loading ? "#ccc" : "#25D366",
          color: "white",
          border: "none",
          borderRadius: 8,
          cursor: loading ? "default" : "pointer",
        }}
      >
        {loading ? "שולח..." : "שלח תזכורות למחר"}
      </button>

      {result && (
        <div style={{ marginTop: 20 }}>
          {result.success ? (
            <div>
              <p style={{ color: "green", fontWeight: "bold" }}>
                ✅ בוצע! תאריך: {result.date || "-"}
              </p>
              {result.message && <p>{result.message}</p>}
              {result.results && (
                <ul>
                  {result.results.map((r, i) => (
                    <li key={i}>
                      {r.name} — {r.status}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <p style={{ color: "red" }}>❌ שגיאה: {result.error}</p>
          )}
        </div>
      )}
    </div>
  );
}