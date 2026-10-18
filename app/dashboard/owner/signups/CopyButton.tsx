'use client'
// app/dashboard/owner/signups/CopyButton.tsx
// Copies one value to the clipboard and says so for two seconds. It receives only the text to copy; it imports no contact module and
// reads nothing itself.
import { useState } from 'react'

export default function CopyButton({ text, label = 'העתקה', ariaLabel }: { text: string; label?: string; ariaLabel?: string }) {
  const [state, setState] = useState<'idle' | 'done' | 'failed'>('idle')
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setState('done')
    } catch {
      setState('failed')
    }
    setTimeout(() => setState('idle'), 2000)
  }
  return (
    <button type="button" onClick={copy} aria-label={ariaLabel || label}
      style={{ flexShrink: 0, padding: '4px 10px', borderRadius: 999, border: '1px solid #D9CFDD', background: state === 'done' ? '#E8F1EA' : '#FFFFFF', color: '#183024', fontSize: 13, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap' }}>
      {state === 'done' ? 'הועתק ✓' : state === 'failed' ? 'לא הועתק' : label}
    </button>
  )
}
