'use client'

// A toast and a confirm dialog for the standalone /dashboard routes.
//
// app/beautyos.jsx has both already (toast, askConfirm), but it is one enormous
// client component and the marketing and admin pages are separate routes that
// cannot reach into it. They were using window.alert and window.confirm
// instead — a system dialog over a Hebrew RTL page, unstyleable, that says
// "localhost:3000 says" in production and leaves no record of what happened
// once dismissed. This is the smallest thing that replaces both properly.
//
// Deliberately not a context or a provider: these pages render one at a time
// and a hook plus a component is less machinery than a tree-wide singleton.

import { useCallback, useEffect, useRef, useState } from 'react'
import Spinner from "./Spinner";
import Sheet from "./Sheet";

type Kind = 'ok' | 'error'

export function useMiniToast() {
  const [msg, setMsg] = useState<{ text: string; kind: Kind } | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const notify = useCallback((text: string, kind: Kind = 'ok') => {
    setMsg({ text, kind })
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setMsg(null), 3600)
  }, [])

  // A pending timeout that fires after unmount would set state on a dead
  // component; on a route push (the delete path does exactly that) it always
  // would have.
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  const toastNode = msg ? (
    <div
      role="status"
      aria-live="polite"
      dir="rtl"
      style={{
        position: 'fixed',
        // Clear of the bottom nav on phones, which is 74px plus the home
        // indicator — the same reservation .app-main makes.
        bottom: 'calc(74px + env(safe-area-inset-bottom, 0px) + 14px)',
        insetInlineStart: '50%',
        transform: 'translateX(50%)',
        zIndex: 6000,
        maxWidth: 'min(92vw, 380px)',
        padding: '12px 18px',
        borderRadius:"var(--r-md)",
        background: msg.kind === 'error' ? 'var(--danger, #C2557A)' : 'var(--ink, #2B2233)',
        color: '#fff',
        fontSize:"var(--t-md)",
        fontWeight: 600,
        lineHeight: 1.5,
        textAlign: 'center',
        fontFamily: 'inherit',
        boxShadow:"var(--shadow-lg)",
      }}
    >
      {msg.text}
    </div>
  ) : null

  return { notify, toastNode }
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmText = 'אישור',
  cancelText = 'ביטול',
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  message?: string
  confirmText?: string
  cancelText?: string
  danger?: boolean
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  // Escape and backdrop close it; <Sheet> owns both, like every modal in the app.
  return (
    <Sheet open={open} onClose={onCancel} busy={busy} width={380} zIndex={6100} ariaLabel={typeof title === 'string' ? title : 'אישור'}>
        <h3 style={{ fontSize:"var(--t-lg)", fontWeight: 700, color: 'var(--ink, #2B2233)', marginBottom: message ? 8 : 16 }}>
          {title}
        </h3>
        {message && (
          <p style={{ fontSize:"var(--t-md)", color: 'var(--ink-2, #5C4F63)', lineHeight: 1.65, marginBottom: 18 }}>
            {message}
          </p>
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            onClick={onCancel}
            style={{
              flex: 1, padding: '12px 0', borderRadius:"var(--r-sm)",
              border: '1px solid var(--line-2, #E6DDE4)', background: 'var(--surface, #fff)',
              color: 'var(--ink-2, #5C4F63)', fontSize:"var(--t-md)", fontWeight: 600,
              fontFamily: 'inherit', cursor: 'pointer',
            }}
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            style={{
              flex: 2, padding: '12px 0', borderRadius:"var(--r-sm)", border: 'none',
              background: danger ? 'var(--danger, #C2557A)' : 'var(--pc, #4A2E5A)',
              color: '#fff', fontSize:"var(--t-md)", fontWeight: 700,
              fontFamily: 'inherit', cursor: busy ? 'default' : 'pointer',
              opacity: busy ? 0.6 : 1,
            }}
          >
            {busy ? <Spinner inline label="רגע" /> : confirmText}
          </button>
        </div>
    </Sheet>
  )
}
