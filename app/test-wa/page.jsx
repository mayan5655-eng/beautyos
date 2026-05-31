"use client";
import { useState } from "react";

export default function TestWhatsApp() {
  const [phone, setPhone] = useState("0542845655");
  const [message, setMessage] = useState("שלום מ-BeautyOS!");
  const [result, setResult] = useState("");

  async function handleSend() {
    setResult("שולח...");
    try {
      const res = await fetch("/api/test-whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, message }),
      });
      const data = await res.json();
      setResult(JSON.stringify(data, null, 2));
    } catch (err) {
      setResult("Error: " + err.message);
    }
  }

  return (
    <div style={{ padding: 40, direction: "rtl", fontFamily: "Arial" }}>
      <h1>בדיקת WhatsApp</h1>
      <input
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        placeholder="טלפון"
        style={{ display: "block", margin: "10px 0", padding: 8, width: 300 }}
      />
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="הודעה"
        style={{ display: "block", margin: "10px 0", padding: 8, width: 300, height: 80 }}
      />
      <button onClick={handleSend} style={{ padding: "10px 20px", fontSize: 16 }}>
        שלח הודעה
      </button>
      <pre style={{ marginTop: 20, background: "#f0f0f0", padding: 15 }}>
        {result}
      </pre>
    </div>
  );
}