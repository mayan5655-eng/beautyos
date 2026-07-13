// app/dashboard/leads/LeadsClient.tsx
// Interactive client component for the leads page

'use client';

import { useState, useMemo } from 'react';
import { createBrowserClient } from '@supabase/ssr';

// Lead type - matches the actual database schema
export interface Lead {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  source: string | null;
  status: string | null;
  received_at: string | null;
  created_at: string;
  ai_score: number | null;
  ai_category: string | null;
  ai_reasoning: string | null;
  ai_tags: string[] | null;
  ai_suggested_action: string | null;
  service_interest: string | null;
}

function getCategoryDisplay(category: string | null) {
  switch (category) {
    case 'hot':
      return { emoji: '🔥', label: 'חם', color: '#ff4444', bg: '#ffe5e5' };
    case 'warm':
      return { emoji: '🟡', label: 'פושר', color: '#ff9800', bg: '#fff3e0' };
    case 'cold':
      return { emoji: '❄️', label: 'קר', color: '#2196f3', bg: '#e3f2fd' };
    case 'spam':
      return { emoji: '🚫', label: 'זבל', color: '#999', bg: '#f5f5f5' };
    default:
      return { emoji: '⏳', label: 'ממתין', color: '#666', bg: '#f0f0f0' };
  }
}

// The manual workflow statuses a cosmetician sets on a lead. This is the single
// source of truth for the status buttons on each card AND the status filter
// chips. `status` is a free-text column in the DB, so these keys are just the
// canonical set we write/read; order here is the order shown in the UI.
export const LEAD_STATUSES: Record<
  string,
  { label: string; color: string; bg: string }
> = {
  no_answer:   { label: 'אין מענה',    color: '#9e9e9e', bg: '#f5f5f5' },
  in_progress: { label: 'בטיפול',      color: '#ff9800', bg: '#fff3e0' },
  scheduled:   { label: 'נקבע תור',    color: '#2196f3', bg: '#e3f2fd' },
  no_show:     { label: 'לא הגיע',     color: '#e53935', bg: '#ffebee' },
  closed:      { label: 'נסגר',        color: '#4caf50', bg: '#e8f5e9' },
  irrelevant:  { label: 'לא רלוונטי',  color: '#795548', bg: '#efebe9' },
};

// Ordered keys, for iterating over the canonical statuses in the UI.
export const LEAD_STATUS_KEYS = Object.keys(LEAD_STATUSES);

// Legacy values that may still exist on rows created before this status model
// (no migration is run as part of this change). Shown read-only so old leads
// don't render blank; they are NOT offered as canonical buttons/chips.
const LEGACY_STATUS_DISPLAY: Record<string, { label: string; color: string }> = {
  new:       { label: 'חדש', color: '#2196f3' },
  contacted: { label: 'יצרתי קשר', color: '#a67c52' },
  converted: { label: 'מומר ✓', color: '#4caf50' },
  lost:      { label: 'לא רלוונטי', color: '#999' },
};

function getStatusDisplay(status: string | null): { label: string; color: string } {
  if (status && LEAD_STATUSES[status]) {
    const s = LEAD_STATUSES[status];
    return { label: s.label, color: s.color };
  }
  if (status && LEGACY_STATUS_DISPLAY[status]) {
    return LEGACY_STATUS_DISPLAY[status];
  }
  // Unknown/empty status: still visible, clearly not one of the canonical set.
  return { label: status || 'ללא סטטוס', color: '#999' };
}

function formatDate(dateString: string | null): string {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleString('he-IL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

type CategoryFilter = 'all' | 'hot' | 'warm' | 'cold' | 'spam';
type StatusFilter = 'all' | string;
type SortBy = 'score' | 'date';
export default function LeadsClient({ initialLeads }: { initialLeads: Lead[] }) {
  const [leads, setLeads] = useState<Lead[]>(initialLeads);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sortBy, setSortBy] = useState<SortBy>('score');
  const [updatingLeadId, setUpdatingLeadId] = useState<string | null>(null);

  // --- Bulk WhatsApp send state ---
  // bulkStatus = which status group we're composing a message for (null = closed).
  // bulkStep walks the flow: compose -> confirm -> sending -> result.
  const [bulkStatus, setBulkStatus] = useState<string | null>(null);
  const [bulkMessage, setBulkMessage] = useState('');
  const [bulkStep, setBulkStep] = useState<'compose' | 'confirm' | 'sending' | 'result'>('compose');
  const [bulkResult, setBulkResult] = useState<{ sent: number; failed: number; skipped_no_phone: number } | null>(null);
  const [bulkError, setBulkError] = useState('');

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  // Recipients for the status group currently being composed. Derived from the
  // live leads state so the counts always match what's on screen.
  const bulkGroup = useMemo(() => {
    if (!bulkStatus) return { total: 0, withPhone: 0, noPhone: 0 };
    const inGroup = leads.filter((l) => l.status === bulkStatus);
    const withPhone = inGroup.filter((l) => l.phone).length;
    return { total: inGroup.length, withPhone, noPhone: inGroup.length - withPhone };
  }, [leads, bulkStatus]);

  function openBulk(status: string) {
    setBulkStatus(status);
    setBulkMessage('');
    setBulkResult(null);
    setBulkError('');
    setBulkStep('compose');
  }

  function closeBulk() {
    setBulkStatus(null);
    setBulkStep('compose');
    setBulkMessage('');
    setBulkResult(null);
    setBulkError('');
  }

  async function confirmBulkSend() {
    if (!bulkStatus || !bulkMessage.trim()) return;
    setBulkStep('sending');
    setBulkError('');
    try {
      const res = await fetch('/api/leads/send-bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: bulkStatus, message: bulkMessage.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setBulkError(data.error || 'שליחה נכשלה');
        setBulkStep('confirm');
        return;
      }
      setBulkResult({
        sent: data.sent ?? 0,
        failed: data.failed ?? 0,
        skipped_no_phone: data.skipped_no_phone ?? 0,
      });
      setBulkStep('result');
    } catch (err) {
      setBulkError(err instanceof Error ? err.message : 'שליחה נכשלה');
      setBulkStep('confirm');
    }
  }

  const filteredLeads = useMemo(() => {
    let result = [...leads];

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter((lead) => {
        return (
          (lead.name && lead.name.toLowerCase().includes(q)) ||
          (lead.phone && lead.phone.includes(q)) ||
          (lead.email && lead.email.toLowerCase().includes(q))
        );
      });
    }

    if (categoryFilter !== 'all') {
      result = result.filter((lead) => lead.ai_category === categoryFilter);
    }

    // Manual status filter — independent of the AI category filter above.
    if (statusFilter !== 'all') {
      result = result.filter((lead) => lead.status === statusFilter);
    }

    if (sortBy === 'score') {
      result.sort((a, b) => {
        const scoreA = a.ai_score ?? -1;
        const scoreB = b.ai_score ?? -1;
        return scoreB - scoreA;
      });
    } else {
      result.sort((a, b) => {
        const dateA = new Date(a.received_at || a.created_at).getTime();
        const dateB = new Date(b.received_at || b.created_at).getTime();
        return dateB - dateA;
      });
    }

    return result;
  }, [leads, searchQuery, categoryFilter, statusFilter, sortBy]);

  async function updateStatus(leadId: string, newStatus: string) {
    setUpdatingLeadId(leadId);
    const { error } = await supabase
      .from('leads')
      .update({ status: newStatus })
      .eq('id', leadId);

    if (error) {
      alert('שגיאה בעדכון הסטטוס: ' + error.message);
    } else {
      setLeads((prev) =>
        prev.map((l) => (l.id === leadId ? { ...l, status: newStatus } : l))
      );
    }
    setUpdatingLeadId(null);
  }

  const counts = useMemo(() => {
    return {
      all: leads.length,
      hot: leads.filter((l) => l.ai_category === 'hot').length,
      warm: leads.filter((l) => l.ai_category === 'warm').length,
      cold: leads.filter((l) => l.ai_category === 'cold').length,
      spam: leads.filter((l) => l.ai_category === 'spam').length,
    };
  }, [leads]);

  // Per-status counts for the manual-status filter chips.
  const statusCounts = useMemo(() => {
    const map: Record<string, number> = { all: leads.length };
    for (const key of LEAD_STATUS_KEYS) {
      map[key] = leads.filter((l) => l.status === key).length;
    }
    return map;
  }, [leads]);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h1 style={{ fontSize: '28px', margin: 0 }}>📋 לידים</h1>
        <div style={{ color: '#666', fontSize: '14px' }}>
          מציג {filteredLeads.length} מתוך {leads.length}
        </div>
      </div>

      <input
        type="text"
        placeholder="🔍 חיפוש לפי שם, טלפון או אימייל..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        style={{
          width: '100%',
          padding: '12px 16px',
          fontSize: '16px',
          border: '1px solid #ddd',
          borderRadius: '8px',
          marginBottom: '16px',
          direction: 'rtl',
        }}
      />

      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
        {(['all', 'hot', 'warm', 'cold', 'spam'] as CategoryFilter[]).map((cat) => {
          const display = cat === 'all'
            ? { emoji: '📋', label: 'הכל', color: '#333' }
            : getCategoryDisplay(cat);
          const isActive = categoryFilter === cat;
          return (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat)}
              style={{
                padding: '8px 16px',
                borderRadius: '20px',
                border: isActive ? `2px solid ${display.color}` : '1px solid #ddd',
                backgroundColor: isActive ? display.color : 'white',
                color: isActive ? 'white' : '#333',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: isActive ? 'bold' : 'normal',
              }}
            >
              {display.emoji} {display.label} ({counts[cat]})
            </button>
          );
        })}
      </div>

      {/* Manual status filter — independent from the AI category chips above. */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <button
          onClick={() => setStatusFilter('all')}
          style={{
            padding: '6px 14px',
            borderRadius: '20px',
            border: statusFilter === 'all' ? '2px solid #333' : '1px solid #ddd',
            backgroundColor: statusFilter === 'all' ? '#333' : 'white',
            color: statusFilter === 'all' ? 'white' : '#333',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: statusFilter === 'all' ? 'bold' : 'normal',
          }}
        >
          כל הסטטוסים ({statusCounts.all})
        </button>
        {LEAD_STATUS_KEYS.map((key) => {
          const s = LEAD_STATUSES[key];
          const isActive = statusFilter === key;
          return (
            <button
              key={key}
              onClick={() => setStatusFilter(isActive ? 'all' : key)}
              style={{
                padding: '6px 14px',
                borderRadius: '20px',
                border: isActive ? `2px solid ${s.color}` : '1px solid #ddd',
                backgroundColor: isActive ? s.color : 'white',
                color: isActive ? 'white' : '#333',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: isActive ? 'bold' : 'normal',
              }}
            >
              {s.label} ({statusCounts[key] ?? 0})
            </button>
          );
        })}
      </div>

      {/* Bulk WhatsApp — one send action per status group. Sends REAL messages,
          but only after the explicit confirmation step in the modal below. */}
      <div style={{ backgroundColor: '#f0f7f2', border: '1px solid #cfe8d8', borderRadius: '12px', padding: '14px 16px', marginBottom: '20px' }}>
        <div style={{ fontSize: '15px', fontWeight: 'bold', marginBottom: '4px' }}>
          📤 שליחת תזכורת בוואטסאפ לפי סטטוס
        </div>
        <div style={{ fontSize: '13px', color: '#666', marginBottom: '10px' }}>
          בחרי קבוצת סטטוס — המספר הוא כמות הלידים עם טלפון שיקבלו את ההודעה.
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {LEAD_STATUS_KEYS.map((key) => {
            const s = LEAD_STATUSES[key];
            const withPhone = leads.filter((l) => l.status === key && l.phone).length;
            return (
              <button
                key={key}
                onClick={() => openBulk(key)}
                disabled={withPhone === 0}
                title={withPhone === 0 ? 'אין לידים עם טלפון בסטטוס זה' : undefined}
                style={{
                  padding: '8px 14px',
                  borderRadius: '20px',
                  border: `1px solid ${s.color}`,
                  backgroundColor: 'white',
                  color: withPhone === 0 ? '#bbb' : s.color,
                  cursor: withPhone === 0 ? 'not-allowed' : 'pointer',
                  fontSize: '13px',
                  opacity: withPhone === 0 ? 0.6 : 1,
                }}
              >
                שליחת תזכורת · {s.label} ({withPhone} 📱)
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ marginBottom: '24px', fontSize: '14px', color: '#666' }}>
        מיון לפי:{' '}
        <button
          onClick={() => setSortBy('score')}
          style={{
            background: 'none',
            border: 'none',
            color: sortBy === 'score' ? '#ff4444' : '#999',
            cursor: 'pointer',
            fontWeight: sortBy === 'score' ? 'bold' : 'normal',
            fontSize: '14px',
            padding: '4px 8px',
          }}
        >
          ציון
        </button>
        |
        <button
          onClick={() => setSortBy('date')}
          style={{
            background: 'none',
            border: 'none',
            color: sortBy === 'date' ? '#ff4444' : '#999',
            cursor: 'pointer',
            fontWeight: sortBy === 'date' ? 'bold' : 'normal',
            fontSize: '14px',
            padding: '4px 8px',
          }}
        >
          תאריך
        </button>
      </div>

    {filteredLeads.length === 0 && (
        <div style={{ padding: '48px', textAlign: 'center', backgroundColor: '#f9f9f9', borderRadius: '12px', color: '#666' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>📭</div>
          <p style={{ fontSize: '18px' }}>
            {leads.length === 0
              ? 'אין עדיין לידים - לידים חדשים מפייסבוק יופיעו כאן אוטומטית'
              : 'לא נמצאו תוצאות לחיפוש'}
          </p>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {filteredLeads.map((lead) => {
          const display = getCategoryDisplay(lead.ai_category);
          const statusDisplay = getStatusDisplay(lead.status);
          const isUpdating = updatingLeadId === lead.id;

          return (
            <div
              key={lead.id}
              style={{
                backgroundColor: display.bg,
                borderRight: `4px solid ${display.color}`,
                borderRadius: '8px',
                padding: '16px',
                opacity: isUpdating ? 0.6 : 1,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap', gap: '8px' }}>
                <div style={{ fontSize: '18px', fontWeight: 'bold' }}>
                  {display.emoji} {lead.name || 'ללא שם'}
                  <span style={{ fontSize: '12px', backgroundColor: statusDisplay.color, color: 'white', padding: '2px 8px', borderRadius: '4px', marginRight: '8px' }}>
                    {statusDisplay.label}
                  </span>
                </div>
                <div style={{ fontSize: '20px', fontWeight: 'bold', color: display.color }}>
                  {lead.ai_score !== null ? lead.ai_score : '—'}
                  <span style={{ fontSize: '12px', marginRight: '4px' }}>{display.label}</span>
                </div>
              </div>

              <div style={{ fontSize: '14px', color: '#555', marginBottom: '8px' }}>
                {lead.phone && <span>📞 {lead.phone}</span>}
                {lead.email && <span style={{ marginRight: '12px' }}>📧 {lead.email}</span>}
                {lead.source && <span style={{ marginRight: '12px' }}>· {lead.source}</span>}
              </div>

              {lead.service_interest && (
                <div style={{ fontSize: '14px', color: '#666', marginBottom: '8px' }}>
                  🎯 {lead.service_interest}
                </div>
              )}

              {lead.ai_reasoning && (
                <div style={{ fontSize: '14px', color: '#333', marginBottom: '8px', fontStyle: 'italic' }}>
                  💭 {lead.ai_reasoning}
                </div>
              )}

              {lead.ai_tags && lead.ai_tags.length > 0 && (
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '8px' }}>
                  {lead.ai_tags.map((tag, i) => (
                    <span key={i} style={{ backgroundColor: 'white', padding: '2px 8px', borderRadius: '4px', fontSize: '12px', color: '#555' }}>
                      🏷️ {tag}
                    </span>
                  ))}
                </div>
              )}

              {lead.ai_suggested_action && (
                <div style={{ fontSize: '14px', fontWeight: 'bold', color: display.color, marginBottom: '12px' }}>
                  💡 {lead.ai_suggested_action}
                </div>
              )}

              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '8px', paddingTop: '8px', borderTop: '1px solid rgba(0,0,0,0.1)' }}>
                {LEAD_STATUS_KEYS.map((key) => {
                  const s = LEAD_STATUSES[key];
                  const isCurrent = lead.status === key;
                  return (
                    <button
                      key={key}
                      onClick={() => updateStatus(lead.id, key)}
                      disabled={isUpdating || isCurrent}
                      style={{
                        padding: '6px 12px',
                        fontSize: '12px',
                        borderRadius: '4px',
                        border: `1px solid ${s.color}`,
                        backgroundColor: isCurrent ? s.color : 'white',
                        color: isCurrent ? 'white' : s.color,
                        cursor: isUpdating ? 'wait' : isCurrent ? 'default' : 'pointer',
                      }}
                    >
                      {s.label}
                    </button>
                  );
                })}
              </div>

              <div style={{ fontSize: '12px', color: '#999', marginTop: '8px' }}>
                {formatDate(lead.received_at || lead.created_at)}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Bulk WhatsApp modal ────────────────────────────────────────────
          Nothing is sent until the user reaches the 'confirm' step and clicks
          the explicit send button, which shows the exact recipient count. */}
      {bulkStatus && (
        <div
          onClick={bulkStep === 'sending' ? undefined : closeBulk}
          style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '16px' }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            dir="rtl"
            style={{ backgroundColor: 'white', borderRadius: '14px', padding: '22px', width: '100%', maxWidth: '460px', boxShadow: '0 10px 40px rgba(0,0,0,0.2)' }}
          >
            <div style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '4px' }}>
              📤 שליחת תזכורת — {LEAD_STATUSES[bulkStatus]?.label}
            </div>
            <div style={{ fontSize: '13px', color: '#666', marginBottom: '16px' }}>
              {bulkGroup.total} לידים בסטטוס זה · {bulkGroup.withPhone} עם טלפון
              {bulkGroup.noPhone > 0 ? ` · ${bulkGroup.noPhone} ללא טלפון (לא יקבלו)` : ''}
            </div>

            {/* STEP: compose */}
            {bulkStep === 'compose' && (
              <>
                <textarea
                  value={bulkMessage}
                  onChange={(e) => setBulkMessage(e.target.value)}
                  rows={5}
                  placeholder="כתבי כאן את ההודעה שתישלח לכל הלידים בסטטוס זה..."
                  style={{ width: '100%', border: '1px solid #ddd', borderRadius: '8px', padding: '12px', fontSize: '15px', fontFamily: 'inherit', direction: 'rtl', resize: 'vertical', boxSizing: 'border-box', marginBottom: '16px' }}
                />
                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-start' }}>
                  <button
                    onClick={() => setBulkStep('confirm')}
                    disabled={!bulkMessage.trim() || bulkGroup.withPhone === 0}
                    style={{ padding: '10px 20px', borderRadius: '8px', border: 'none', backgroundColor: !bulkMessage.trim() || bulkGroup.withPhone === 0 ? '#ccc' : '#25D366', color: 'white', fontSize: '15px', fontWeight: 'bold', cursor: !bulkMessage.trim() || bulkGroup.withPhone === 0 ? 'not-allowed' : 'pointer' }}
                  >
                    המשך
                  </button>
                  <button
                    onClick={closeBulk}
                    style={{ padding: '10px 20px', borderRadius: '8px', border: '1px solid #ddd', backgroundColor: 'white', color: '#333', fontSize: '15px', cursor: 'pointer' }}
                  >
                    ביטול
                  </button>
                </div>
              </>
            )}

            {/* STEP: confirm — explicit, shows real recipient count */}
            {bulkStep === 'confirm' && (
              <>
                <div style={{ backgroundColor: '#fff8e1', border: '1px solid #ffe082', borderRadius: '8px', padding: '12px', marginBottom: '14px', fontSize: '14px', color: '#5d4037' }}>
                  ⚠️ פעולה זו תשלח הודעת <b>וואטסאפ אמיתית</b> ל-<b>{bulkGroup.withPhone}</b> נמענים.
                  {bulkGroup.noPhone > 0 ? ` (${bulkGroup.noPhone} ללא טלפון יידלגו)` : ''}
                </div>
                <div style={{ backgroundColor: '#f5f5f5', borderRadius: '8px', padding: '12px', marginBottom: '14px', fontSize: '14px', whiteSpace: 'pre-wrap', maxHeight: '140px', overflowY: 'auto' }}>
                  {bulkMessage}
                </div>
                {bulkError && (
                  <div style={{ color: '#c62828', fontSize: '14px', marginBottom: '12px' }}>{bulkError}</div>
                )}
                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-start' }}>
                  <button
                    onClick={confirmBulkSend}
                    style={{ padding: '10px 20px', borderRadius: '8px', border: 'none', backgroundColor: '#25D366', color: 'white', fontSize: '15px', fontWeight: 'bold', cursor: 'pointer' }}
                  >
                    כן, שלחי ל-{bulkGroup.withPhone} נמענים
                  </button>
                  <button
                    onClick={() => { setBulkStep('compose'); setBulkError(''); }}
                    style={{ padding: '10px 20px', borderRadius: '8px', border: '1px solid #ddd', backgroundColor: 'white', color: '#333', fontSize: '15px', cursor: 'pointer' }}
                  >
                    חזרה לעריכה
                  </button>
                </div>
              </>
            )}

            {/* STEP: sending */}
            {bulkStep === 'sending' && (
              <div style={{ textAlign: 'center', padding: '24px', fontSize: '16px', color: '#666' }}>
                ⏳ שולח הודעות... נא לא לסגור את החלון.
              </div>
            )}

            {/* STEP: result */}
            {bulkStep === 'result' && bulkResult && (
              <>
                <div style={{ display: 'flex', gap: '10px', marginBottom: '18px', flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: '90px', backgroundColor: '#e8f5e9', borderRadius: '8px', padding: '14px', textAlign: 'center' }}>
                    <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#2e7d32' }}>{bulkResult.sent}</div>
                    <div style={{ fontSize: '13px', color: '#555' }}>נשלחו ✓</div>
                  </div>
                  <div style={{ flex: 1, minWidth: '90px', backgroundColor: '#ffebee', borderRadius: '8px', padding: '14px', textAlign: 'center' }}>
                    <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#c62828' }}>{bulkResult.failed}</div>
                    <div style={{ fontSize: '13px', color: '#555' }}>נכשלו</div>
                  </div>
                  <div style={{ flex: 1, minWidth: '90px', backgroundColor: '#f5f5f5', borderRadius: '8px', padding: '14px', textAlign: 'center' }}>
                    <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#757575' }}>{bulkResult.skipped_no_phone}</div>
                    <div style={{ fontSize: '13px', color: '#555' }}>דילוג (אין טלפון)</div>
                  </div>
                </div>
                <button
                  onClick={closeBulk}
                  style={{ padding: '10px 20px', borderRadius: '8px', border: 'none', backgroundColor: '#333', color: 'white', fontSize: '15px', fontWeight: 'bold', cursor: 'pointer', width: '100%' }}
                >
                  סגירה
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}