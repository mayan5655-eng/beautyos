'use client';

// app/HelpChat.jsx
//
// "שאלי את העוזרת": the top of the "תקועה?" sheet. She asks how to do something in Kalmea and gets a short answer
// from the in-app help text (app/api/help-chat, lib/ai/helpChat.ts), with "▶ סרטון" chips that open the matching
// tutorial in a new tab. When it does not help, "לא עזר?" copies her question into the human form underneath, which
// is unchanged and still the way to reach a person.
//
// The conversation lives in the dashboard (messages/setMessages), so closing and reopening the sheet keeps it.
// Only the last few turns are sent back, and the server bounds them again.
import { useState, useRef, useEffect } from 'react';
import BrandImage from './BrandImage';
import { ICON_SPARKLE } from '@/lib/brand';
import { TUTORIAL_TITLES, tutorialHref } from '@/lib/helpSections';

export const HELP_SUGGESTIONS = [
  'איך שולחים תזכורת?',
  'איך מחברים מורנינג?',
  'איך מוסיפים לקוחות מהטלפון?',
  'איך משתפים את הדף שלי?',
];

const HISTORY_SENT = 6;
const FALLBACK_ERROR = 'משהו נתקע אצלנו. אפשר לנסות שוב בעוד רגע, או לשלוח לנו הודעה למטה.';

const tap = { minHeight: 44, fontFamily: 'inherit', cursor: 'pointer' };

export default function HelpChat({ messages, setMessages, activeTab, onAskHuman, pcGrad, pcDeep }) {
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const logRef = useRef(null);

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, busy]);

  const lastQuestion = [...messages].reverse().find((m) => m.role === 'user')?.content || '';
  const answered = messages.some((m) => m.role === 'assistant' || m.kind === 'error');

  async function ask(text) {
    const q = String(text || '').trim();
    if (!q || busy) return;
    const history = messages
      .filter((m) => (m.role === 'user' || m.role === 'assistant') && !m.kind)
      .slice(-HISTORY_SENT)
      .map((m) => ({ role: m.role, content: m.content }));
    setMessages((prev) => [...prev, { role: 'user', content: q }]);
    setInput('');
    setBusy(true);
    try {
      const res = await fetch('/api/help-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: q, history, tab: activeTab }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data && typeof data.answer === 'string' && data.answer) {
        const videos = (Array.isArray(data.videos) ? data.videos : []).filter((v) => TUTORIAL_TITLES[v]);
        setMessages((prev) => [...prev, { role: 'assistant', content: data.answer, videos, capNotice: data.capNotice || null }]);
      } else {
        const reason = data?.reason || (res.status === 429 ? 'rate' : 'busy');
        setMessages((prev) => [...prev, { role: 'note', kind: 'error', reason, content: (data && data.error) || FALLBACK_ERROR }]);
      }
    } catch {
      setMessages((prev) => [...prev, { role: 'note', kind: 'error', reason: 'network', content: FALLBACK_ERROR }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="help-chat-title" data-testid="help-chat" style={{ marginBottom: 6 }}>
      <style>{`
        @keyframes hcDot { 0%, 80%, 100% { opacity: .25; transform: translateY(0); } 40% { opacity: 1; transform: translateY(-3px); } }
        .hc-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--ink-3); display: inline-block; animation: hcDot 1.2s infinite ease-in-out; }
        .hc-dot:nth-child(2) { animation-delay: .15s; } .hc-dot:nth-child(3) { animation-delay: .3s; }
        @media (prefers-reduced-motion: reduce) { .hc-dot { animation: none; opacity: .6; } }
        .hc-chip:focus-visible, .hc-send:focus-visible, .hc-input:focus-visible { outline: 2px solid var(--ink); outline-offset: 2px; }
      `}</style>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
        <BrandImage width={32} height={32} aria-hidden alt="" src={ICON_SPARKLE} style={{ width: 32, height: 32, objectFit: 'contain', flexShrink: 0 }} />
        <h4 id="help-chat-title" className="serif" style={{ fontSize: 'var(--t-lg)', fontWeight: 600, margin: 0, color: 'var(--ink)' }}>שאלי את העוזרת</h4>
      </div>
      <p style={{ fontSize: 'var(--t-sm)', color: 'var(--ink-3)', lineHeight: 1.6, margin: '0 0 10px' }}>
        תשובה מיידית מתוך המדריך של קלמיה, ולרוב גם סרטון קצר שמראה איך.
      </p>

      {(messages.length > 0 || busy) && (
        <div ref={logRef} role="log" aria-live="polite" aria-label="השיחה עם העוזרת" style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: '42vh', overflowY: 'auto', padding: '2px 0 6px', marginBottom: 8 }}>
          {messages.map((m, i) => m.role === 'user' ? (
            <div key={i} style={{ alignSelf: 'flex-start', maxWidth: '85%', padding: '9px 12px', borderRadius: '14px 14px 14px 4px', background: 'var(--surface-2)', border: '1px solid var(--line-2)', color: 'var(--ink)', fontSize: 'var(--t-md)', lineHeight: 1.55, whiteSpace: 'pre-line', overflowWrap: 'anywhere' }}>
              {m.content}
            </div>
          ) : m.kind === 'error' ? (
            <div key={i} role="alert" data-testid={m.reason === 'cap' ? 'help-chat-cap' : 'help-chat-error'} style={{ alignSelf: 'stretch', padding: '10px 12px', borderRadius: 'var(--r-sm)', background: 'var(--brand-cream, #FBF8F1)', border: '1px solid var(--line-2)', color: 'var(--ink-2)', fontSize: 'var(--t-sm)', lineHeight: 1.6 }}>
              {m.content}
              {(m.reason === 'cap' || m.reason === 'cap-unreadable') && (
                <span style={{ display: 'block', marginTop: 4, fontWeight: 700, color: 'var(--ink)' }}>אפשר עדיין לשלוח לנו הודעה למטה, ונחזור אלייך.</span>
              )}
            </div>
          ) : (
            <div key={i} data-testid="help-chat-answer" style={{ alignSelf: 'flex-end', maxWidth: '92%', padding: '10px 12px', borderRadius: '14px 14px 4px 14px', background: 'var(--surface)', border: '1px solid var(--line-2)', boxShadow: 'var(--shadow-sm)', color: 'var(--ink)', fontSize: 'var(--t-md)', lineHeight: 1.6 }}>
              <div style={{ whiteSpace: 'pre-line', overflowWrap: 'anywhere' }}>{m.content}</div>
              {Array.isArray(m.videos) && m.videos.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                  {m.videos.map((v) => (
                    <a key={v} href={tutorialHref(v)} target="_blank" rel="noreferrer" className="hc-chip" data-testid="help-chat-video"
                      style={{ ...tap, display: 'inline-flex', alignItems: 'center', padding: '0 14px', borderRadius: 'var(--r-full)', border: '1px solid var(--line-2)', background: 'var(--surface-2)', color: pcDeep || 'var(--ink)', fontSize: 'var(--t-sm)', fontWeight: 700, textDecoration: 'none' }}>
                      ▶ סרטון: {TUTORIAL_TITLES[v]}
                    </a>
                  ))}
                </div>
              )}
              {m.capNotice && <p style={{ margin: '8px 0 0', fontSize: 'var(--t-sm)', color: 'var(--ink-3)' }}>{m.capNotice}</p>}
            </div>
          ))}
          {busy && (
            <div data-testid="help-chat-typing" style={{ alignSelf: 'flex-end', display: 'inline-flex', gap: 5, alignItems: 'center', padding: '12px 14px', borderRadius: 14, background: 'var(--surface)', border: '1px solid var(--line-2)' }}>
              <span className="hc-dot" /><span className="hc-dot" /><span className="hc-dot" />
              <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>העוזרת כותבת</span>
            </div>
          )}
        </div>
      )}

      {messages.length === 0 && !busy && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }} aria-label="שאלות לדוגמה">
          {HELP_SUGGESTIONS.map((q) => (
            <button key={q} type="button" className="hc-chip" onClick={() => ask(q)} data-testid="help-chat-suggestion"
              style={{ ...tap, padding: '0 14px', borderRadius: 'var(--r-full)', border: '1px solid var(--line-2)', background: 'var(--surface)', color: 'var(--ink-2)', fontSize: 'var(--t-sm)', fontWeight: 600 }}>
              {q}
            </button>
          ))}
        </div>
      )}

      <form onSubmit={(e) => { e.preventDefault(); ask(input); }} style={{ display: 'flex', gap: 8 }}>
        <input
          className="hc-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          maxLength={600}
          placeholder="איך עושים..."
          aria-label="השאלה שלך לעוזרת"
          enterKeyHint="send"
          style={{ flex: 1, minWidth: 0, minHeight: 44, padding: '0 12px', borderRadius: 'var(--r-xl)', border: '1px solid var(--line-2)', fontSize: 'var(--t-md)', fontFamily: 'inherit', background: 'var(--surface-2)', color: 'var(--ink)', boxSizing: 'border-box' }}
        />
        <button type="submit" className="primary-btn hc-send" disabled={!input.trim() || busy}
          style={{ ...tap, minWidth: 76, padding: '0 16px', borderRadius: 'var(--r-xl)', background: pcGrad, color: 'var(--pc-contrast)', fontSize: 'var(--t-sm)', opacity: (!input.trim() || busy) ? 0.55 : 1 }}>
          שאלי
        </button>
      </form>

      {answered && lastQuestion && !busy && (
        <button type="button" className="hc-chip" data-testid="help-chat-ask-human" onClick={() => onAskHuman(lastQuestion)}
          style={{ ...tap, width: '100%', marginTop: 8, padding: '0 12px', borderRadius: 'var(--r-xl)', border: '1px dashed var(--line-2)', background: 'transparent', color: 'var(--ink-2)', fontSize: 'var(--t-sm)', fontWeight: 700 }}>
          לא עזר? העבירי את השאלה אלינו
        </button>
      )}
    </section>
  );
}
