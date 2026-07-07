'use client'

import { useState, useRef } from 'react'

// ============================================================
// BeautyOS - Designed Post (PostDesigner)
// Takes a campaign post + the business primary color.
// Lets the user upload a background image and export PNG.
// All comments in English (PowerShell-safe).
// ============================================================

type Post = {
  id: string
  title: string
  body: string
  call_to_action: string
  hashtags: string[]
  image_suggestion: string
  variation_number: number
  variation_type: string
}

declare global {
  interface Window {
    html2canvas?: any
  }
}

export default function PostDesigner({
  post,
  primaryColor,
  businessName,
  phone,
  onClose,
}: {
  post: Post
  primaryColor: string
  businessName: string
  phone: string
  onClose: () => void
}) {
  const [image, setImage] = useState<string | null>(null)
  const cardRef = useRef<HTMLDivElement>(null)

  // Derived accent color (the chosen business color) with a soft fallback
  const pc = primaryColor || '#C77B92'

  // Read uploaded file as data URL
  const handleImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setImage(reader.result as string)
    reader.readAsDataURL(file)
  }

  // Export the card as PNG using html2canvas loaded from CDN
  const downloadImage = async () => {
    if (!window.html2canvas) {
      const s = document.createElement('script')
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js'
      document.body.appendChild(s)
      await new Promise((res) => (s.onload = res))
    }
    if (!cardRef.current) return
    const canvas = await window.html2canvas(cardRef.current, { scale: 2, useCORS: true })
    const link = document.createElement('a')
    link.download = 'beautyos-post.png'
    link.href = canvas.toDataURL('image/png')
    link.click()
  }

  return (
    <div
      dir="rtl"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        background: 'rgba(45,55,48,0.55)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'flex-start',
        gap: 20,
        padding: '24px 16px',
        overflowY: 'auto',
        fontFamily: "'Heebo', sans-serif",
      }}
      onClick={onClose}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Suez+One&family=Heebo:wght@400;600;800&display=swap');
      `}</style>

      {/* Stop clicks inside the panel from closing the modal */}
      <div onClick={(e) => e.stopPropagation()} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18 }}>
        {/* ============ THE POST CARD ============ */}
        <div
          ref={cardRef}
          style={{
            width: 360,
            height: 360,
            position: 'relative',
            borderRadius: 24,
            overflow: 'hidden',
            background: `linear-gradient(150deg, ${pc} 0%, ${pc}cc 45%, ${pc}88 100%)`,
            boxShadow: '0 20px 50px rgba(0,0,0,0.3)',
          }}
        >
          {/* Uploaded image as background */}
          {image && (
            <img
              src={image}
              alt=""
              crossOrigin="anonymous"
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
            />
          )}

          {/* Readability overlay */}
          {image && (
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(30,30,30,0.78) 0%, rgba(30,30,30,0.15) 55%, rgba(30,30,30,0.35) 100%)' }} />
          )}

          {/* Business name */}
          <div style={{ position: 'absolute', top: 22, right: 24, color: '#fff', fontWeight: 800, fontSize: 14, letterSpacing: 0.5, textShadow: '0 1px 3px rgba(0,0,0,0.25)' }}>
            {businessName || 'BloomOS'}
          </div>

          {/* Headline + body */}
          <div style={{ position: 'absolute', bottom: 96, right: 24, left: 24, textAlign: 'right' }}>
            <div style={{ fontFamily: "'Suez One', serif", color: '#fff', fontSize: 30, lineHeight: 1.15, textShadow: '0 2px 8px rgba(0,0,0,0.25)' }}>
              {post.title}
            </div>
            <div style={{ color: '#FBF3EC', fontSize: 14, fontWeight: 600, marginTop: 8, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
              {post.body}
            </div>
          </div>

          {/* CTA pill */}
          <div style={{ position: 'absolute', bottom: 28, right: 24, display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ background: '#fff', color: pc, borderRadius: 999, padding: '10px 20px', fontWeight: 800, fontSize: 14, boxShadow: '0 6px 16px rgba(0,0,0,0.2)' }}>
              {post.call_to_action} ›
            </div>
            {phone && (
              <div style={{ color: '#fff', fontWeight: 600, fontSize: 13, textShadow: '0 1px 3px rgba(0,0,0,0.25)' }}>
                {phone}
              </div>
            )}
          </div>
        </div>

        {/* ============ CONTROLS ============ */}
        <div style={{ width: 360, background: '#fff', borderRadius: 18, padding: 18, display: 'flex', flexDirection: 'column', gap: 12, boxShadow: '0 8px 24px rgba(0,0,0,0.15)' }}>
          {post.image_suggestion && (
            <div style={{ fontSize: 13, color: '#8a6d3b', background: '#FDF6E3', borderRadius: 10, padding: 10 }}>
              💡 הצעת תמונה: {post.image_suggestion}
            </div>
          )}

          <label style={{ background: '#F4EFE9', border: `1px dashed ${pc}`, borderRadius: 10, padding: 12, textAlign: 'center', color: pc, fontWeight: 600, cursor: 'pointer' }}>
            {image ? '✓ תמונה הועלתה — לחצי להחלפה' : '📷 העלי תמונה'}
            <input type="file" accept="image/*" onChange={handleImage} style={{ display: 'none' }} />
          </label>

          <button
            onClick={downloadImage}
            style={{ background: pc, color: '#fff', border: 'none', borderRadius: 12, padding: 14, fontFamily: "'Heebo', sans-serif", fontWeight: 800, fontSize: 16, cursor: 'pointer' }}
          >
            📥 הורד תמונה לאינסטגרם
          </button>

          <button
            onClick={onClose}
            style={{ background: 'transparent', color: '#6B7A6E', border: 'none', padding: 6, fontFamily: "'Heebo', sans-serif", fontWeight: 600, fontSize: 14, cursor: 'pointer' }}
          >
            סגור
          </button>
        </div>
      </div>
    </div>
  )
}
