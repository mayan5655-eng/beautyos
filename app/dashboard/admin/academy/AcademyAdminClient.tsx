'use client'
// app/dashboard/admin/academy/AcademyAdminClient.tsx
//
// The platform admin's Academy screen. Every action POSTs to /api/admin/academy (requirePlatformAdmin there) and reloads on
// success; a failure shows the server's message and changes nothing on screen. No price field while purchase is not live (the
// column keeps whatever it holds). Nothing can be deleted from here: un-publish a course or lesson, revoke a grant.
import Link from 'next/link'
import { useState } from 'react'
import { parseVideoUrl } from '@/lib/academy'
import type { AdminOverview } from '@/lib/academyData'

type Course = AdminOverview['courses'][number]
type Lesson = Course['lessons'][number]

const input: React.CSSProperties = { width: '100%', boxSizing: 'border-box', border: '1px solid var(--line-2)', borderRadius: 'var(--r-sm)', padding: '9px 12px', fontSize: 'var(--t-md)', fontFamily: 'inherit', background: 'var(--surface)', color: 'var(--ink)' }
const label: React.CSSProperties = { display: 'block', fontSize: 'var(--t-sm)', fontWeight: 600, color: 'var(--ink-2)', margin: '10px 0 4px' }
const btn: React.CSSProperties = { padding: '9px 16px', borderRadius: 'var(--r-full)', border: 'none', background: 'var(--k-green)', color: 'var(--k-cream)', fontWeight: 700, fontSize: 'var(--t-md)', cursor: 'pointer', fontFamily: 'inherit' }
const ghost: React.CSSProperties = { ...btn, background: 'var(--surface)', color: 'var(--ink)', border: '1px solid var(--line-2)' }
const box: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--r-lg)', padding: 16, marginBottom: 14 }
const muted: React.CSSProperties = { fontSize: 'var(--t-sm)', color: 'var(--ink-2)' }

async function post(body: Record<string, unknown>): Promise<string | null> {
  try {
    const res = await fetch('/api/admin/academy', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const j = await res.json().catch(() => ({}))
    if (!res.ok || !j?.success) return typeof j?.error === 'string' ? j.error : 'הפעולה נכשלה'
    return null
  } catch {
    return 'אין חיבור כרגע. אפשר לנסות שוב בעוד רגע.'
  }
}

function useAction() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const run = async (body: Record<string, unknown>) => {
    setBusy(true); setError('')
    const e = await post(body)
    setBusy(false)
    if (e) { setError(e); return false }
    window.location.reload()
    return true
  }
  return { busy, error, run }
}

function CourseForm({ course, onCancel }: { course?: Course; onCancel?: () => void }) {
  const [f, setF] = useState({ slug: course?.slug || '', title: course?.title || '', subtitle: course?.subtitle || '', sort: String(course?.sort ?? 0), published: !!course?.published })
  const a = useAction()
  return (
    <div>
      <label style={label}>כותרת</label>
      <input style={input} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
      <label style={label}>שורת משנה</label>
      <input style={input} value={f.subtitle} onChange={(e) => setF({ ...f, subtitle: e.target.value })} />
      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ flex: 2 }}><label style={label}>כתובת קצרה (באנגלית)</label><input dir="ltr" style={input} value={f.slug} onChange={(e) => setF({ ...f, slug: e.target.value })} placeholder="paid-social" /></div>
        <div style={{ flex: 1 }}><label style={label}>סדר</label><input dir="ltr" style={input} value={f.sort} onChange={(e) => setF({ ...f, sort: e.target.value })} inputMode="numeric" /></div>
      </div>
      <label style={{ ...label, display: 'flex', alignItems: 'center', gap: 8 }}>
        <input type="checkbox" checked={f.published} onChange={(e) => setF({ ...f, published: e.target.checked })} /> מפורסם (עסקים עם גישה רואים אותו)
      </label>
      {a.error && <p role="alert" style={{ color: 'var(--danger)', fontSize: 'var(--t-md)' }}>{a.error}</p>}
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button style={btn} disabled={a.busy} onClick={() => a.run({ action: 'save-course', id: course?.id, ...f, sort: f.sort })}>{a.busy ? 'שומרת...' : 'שמירה'}</button>
        {onCancel && <button style={ghost} onClick={onCancel}>ביטול</button>}
      </div>
    </div>
  )
}

function LessonForm({ courseId, lesson, onCancel }: { courseId: string; lesson?: Lesson; onCancel: () => void }) {
  const [f, setF] = useState({
    slug: lesson?.slug || '', title: lesson?.title || '', minutes: lesson?.minutes == null ? '' : String(lesson.minutes),
    video_url: lesson?.video_url || '', body: lesson?.body || '', task: lesson?.task || '', sort: String(lesson?.sort ?? 0), published: !!lesson?.published,
  })
  const a = useAction()
  const videoOk = !f.video_url.trim() || !!parseVideoUrl(f.video_url)
  return (
    <div style={{ borderTop: '1px solid var(--line)', paddingTop: 10, marginTop: 10 }}>
      <label style={label}>כותרת השיעור</label>
      <input style={input} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ flex: 2 }}><label style={label}>כתובת קצרה (באנגלית)</label><input dir="ltr" style={input} value={f.slug} onChange={(e) => setF({ ...f, slug: e.target.value })} /></div>
        <div style={{ flex: 1 }}><label style={label}>דקות</label><input dir="ltr" style={input} value={f.minutes} onChange={(e) => setF({ ...f, minutes: e.target.value })} inputMode="numeric" /></div>
        <div style={{ flex: 1 }}><label style={label}>סדר</label><input dir="ltr" style={input} value={f.sort} onChange={(e) => setF({ ...f, sort: e.target.value })} inputMode="numeric" /></div>
      </div>
      <label style={label}>קישור לווידאו (יוטיוב לא רשום או וימאו)</label>
      <input dir="ltr" style={input} value={f.video_url} onChange={(e) => setF({ ...f, video_url: e.target.value })} placeholder="https://youtu.be/..." />
      {!videoOk && <p style={{ color: 'var(--danger)', fontSize: 'var(--t-sm)', margin: '4px 0 0' }}>הקישור לא מזוהה כיוטיוב או וימאו</p>}
      <label style={label}>תוכן השיעור (## לכותרת, - לרשימה)</label>
      <textarea style={{ ...input, minHeight: 140, resize: 'vertical' }} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} />
      <label style={label}>המשימה</label>
      <textarea style={{ ...input, minHeight: 70, resize: 'vertical' }} value={f.task} onChange={(e) => setF({ ...f, task: e.target.value })} />
      <label style={{ ...label, display: 'flex', alignItems: 'center', gap: 8 }}>
        <input type="checkbox" checked={f.published} onChange={(e) => setF({ ...f, published: e.target.checked })} /> מפורסם
      </label>
      {a.error && <p role="alert" style={{ color: 'var(--danger)', fontSize: 'var(--t-md)' }}>{a.error}</p>}
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button style={btn} disabled={a.busy || !videoOk} onClick={() => a.run({ action: 'save-lesson', id: lesson?.id, course_id: courseId, ...f })}>{a.busy ? 'שומרת...' : 'שמירה'}</button>
        <button style={ghost} onClick={onCancel}>ביטול</button>
      </div>
    </div>
  )
}

function CourseCard({ course }: { course: Course }) {
  const [editing, setEditing] = useState(false)
  const [lessonEdit, setLessonEdit] = useState<string | null>(null)
  const s = course.stats
  return (
    <section style={box} data-testid="academy-admin-course">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ fontFamily: 'var(--display)', fontSize: 'var(--t-xl)', margin: 0 }}>{course.title}</h2>
          <p style={{ ...muted, margin: '4px 0 0' }}>
            {course.published ? 'מפורסם' : 'טיוטה'} · {course.lessons.length} שיעורים · {s.grantees} עסקים עם גישה · {s.started} התחילו · {s.completed} סיימו
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <a href={`/dashboard/academy/${course.slug}`} style={{ ...ghost, textDecoration: 'none' }}>תצוגה</a>
          <button style={ghost} onClick={() => setEditing((v) => !v)}>{editing ? 'סגירה' : 'עריכה'}</button>
        </div>
      </div>
      {editing && <CourseForm course={course} onCancel={() => setEditing(false)} />}
      <ol style={{ margin: '12px 0 0', paddingInlineStart: 20 }}>
        {course.lessons.map((l) => (
          <li key={l.id} style={{ margin: '6px 0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 'var(--t-md)' }}>
                {l.title} <span style={muted}>({l.published ? 'מפורסם' : 'טיוטה'}{l.video_url ? ', יש וידאו' : ', בלי וידאו'} · {s.perLesson[l.id] || 0} סיימו)</span>
              </span>
              <button style={{ ...ghost, padding: '5px 12px', fontSize: 'var(--t-sm)' }} onClick={() => setLessonEdit(lessonEdit === l.id ? null : l.id)}>עריכה</button>
            </div>
            {lessonEdit === l.id && <LessonForm courseId={course.id} lesson={l} onCancel={() => setLessonEdit(null)} />}
          </li>
        ))}
      </ol>
      {lessonEdit === 'new'
        ? <LessonForm courseId={course.id} onCancel={() => setLessonEdit(null)} />
        : <button style={{ ...ghost, marginTop: 10 }} onClick={() => setLessonEdit('new')}>+ שיעור חדש</button>}
    </section>
  )
}

function Grants({ data }: { data: AdminOverview }) {
  const [f, setF] = useState({ course_id: data.courses[0]?.id || '', tenant: '', source: 'gift', note: '' })
  const a = useAction()
  const titleOf = (id: string) => data.courses.find((c) => c.id === id)?.title || ''
  return (
    <section style={box}>
      <h2 style={{ fontFamily: 'var(--display)', fontSize: 'var(--t-xl)', margin: '0 0 4px' }}>גישה לעסקים</h2>
      <p style={{ ...muted, margin: 0 }}>גישה שניתנת כאן היא לכל החיים, עד שמבטלים אותה. מתאים לבודקות בטא.</p>
      <label style={label}>קורס</label>
      <select style={input} value={f.course_id} onChange={(e) => setF({ ...f, course_id: e.target.value })}>
        {data.courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
      </select>
      <label style={label}>עסק (מזהה העסק או הכתובת של עמוד התורים)</label>
      <input dir="ltr" style={input} value={f.tenant} onChange={(e) => setF({ ...f, tenant: e.target.value })} />
      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ flex: 1 }}>
          <label style={label}>סוג</label>
          <select style={input} value={f.source} onChange={(e) => setF({ ...f, source: e.target.value })}>
            <option value="gift">מתנה</option>
            <option value="admin">גישת מנהלת</option>
          </select>
        </div>
        <div style={{ flex: 2 }}><label style={label}>הערה</label><input style={input} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></div>
      </div>
      {a.error && <p role="alert" style={{ color: 'var(--danger)', fontSize: 'var(--t-md)' }}>{a.error}</p>}
      <button style={{ ...btn, marginTop: 10 }} disabled={a.busy || !f.course_id || !f.tenant.trim()} onClick={() => a.run({ action: 'grant', ...f })}>{a.busy ? 'שומרת...' : 'מתן גישה'}</button>
      {data.grants.length > 0 && (
        <ul style={{ listStyle: 'none', padding: 0, margin: '16px 0 0', display: 'grid', gap: 6 }}>
          {data.grants.map((g) => (
            <li key={`${g.tenant_id}|${g.course_id}|${g.source}`} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 'var(--t-md)' }}>
              <span>{g.business || g.tenant_id} · {titleOf(g.course_id)} · {g.source === 'gift' ? 'מתנה' : g.source === 'admin' ? 'גישת מנהלת' : g.source}{g.revoked_at ? ' · בוטלה' : ''}</span>
              {!g.revoked_at && (g.source === 'gift' || g.source === 'admin') && (
                <button style={{ ...ghost, padding: '5px 12px', fontSize: 'var(--t-sm)' }} disabled={a.busy} onClick={() => a.run({ action: 'revoke', tenant: g.tenant_id, course_id: g.course_id, source: g.source })}>ביטול גישה</button>
              )}
              {g.revoked_at && (g.source === 'gift' || g.source === 'admin') && (
                <button style={{ ...ghost, padding: '5px 12px', fontSize: 'var(--t-sm)' }} disabled={a.busy} onClick={() => a.run({ action: 'grant', tenant: g.tenant_id, course_id: g.course_id, source: g.source })}>החזרת גישה</button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export default function AcademyAdminClient({ data }: { data: AdminOverview }) {
  const [adding, setAdding] = useState(false)
  return (
    <div dir="rtl" style={{ maxWidth: 820, margin: '0 auto', padding: '0 16px 40px', fontFamily: 'var(--sans)', color: 'var(--ink)' }}>
      <Link href="/dashboard/admin" style={{ fontSize: 'var(--t-md)', fontWeight: 600, color: 'var(--ink-2)', textDecoration: 'none' }}>→ ניהול מנויים</Link>
      <h1 style={{ fontFamily: 'var(--display-heavy)', fontSize: 'var(--t-3xl)', fontWeight: 800, color: 'var(--brand-accent)', margin: '8px 0 6px' }}>האקדמיה</h1>
      <p style={{ fontSize: 'var(--t-md)', color: 'var(--ink-2)', lineHeight: 1.7, margin: '0 0 16px' }}>
        קורסים ושיעורים, קישורי וידאו, ומי קיבלה גישה. עסק רואה רק קורס מפורסם שיש לו גישה אליו. שום פעולה כאן לא מוחקת.
      </p>
      {data.courses.map((c) => <CourseCard key={c.id} course={c} />)}
      <section style={box}>
        {adding ? <CourseForm onCancel={() => setAdding(false)} /> : <button style={ghost} onClick={() => setAdding(true)}>+ קורס חדש</button>}
      </section>
      {data.courses.length > 0 && <Grants data={data} />}
    </div>
  )
}
