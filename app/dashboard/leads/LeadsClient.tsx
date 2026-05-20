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

function getStatusDisplay(status: string | null) {
  switch (status) {
    case 'new':
      return { label: 'חדש', color: '#2196f3' };
    case 'in_progress':
      return { label: 'בטיפול', color: '#ff9800' };
    case 'converted':
      return { label: 'מומר ✓', color: '#4caf50' };
    case 'irrelevant':
      return { label: 'לא רלוונטי', color: '#999' };
    default:
      return { label: 'חדש', color: '#2196f3' };
  }
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
type SortBy = 'score' | 'date';
export default function LeadsClient({ initialLeads }: { initialLeads: Lead[] }) {
  const [leads, setLeads] = useState<Lead[]>(initialLeads);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [sortBy, setSortBy] = useState<SortBy>('score');
  const [updatingLeadId, setUpdatingLeadId] = useState<string | null>(null);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

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
  }, [leads, searchQuery, categoryFilter, sortBy]);

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
                <button
                  onClick={() => updateStatus(lead.id, 'in_progress')}
                  disabled={isUpdating || lead.status === 'in_progress'}
                  style={{
                    padding: '6px 12px',
                    fontSize: '12px',
                    borderRadius: '4px',
                    border: '1px solid #ff9800',
                    backgroundColor: lead.status === 'in_progress' ? '#ff9800' : 'white',
                    color: lead.status === 'in_progress' ? 'white' : '#ff9800',
                    cursor: isUpdating ? 'wait' : 'pointer',
                  }}
                >
                  ⏳ בטיפול
                </button>
                <button
                  onClick={() => updateStatus(lead.id, 'converted')}
                  disabled={isUpdating || lead.status === 'converted'}
                  style={{
                    padding: '6px 12px',
                    fontSize: '12px',
                    borderRadius: '4px',
                    border: '1px solid #4caf50',
                    backgroundColor: lead.status === 'converted' ? '#4caf50' : 'white',
                    color: lead.status === 'converted' ? 'white' : '#4caf50',
                    cursor: isUpdating ? 'wait' : 'pointer',
                  }}
                >
                  ✓ מומר
                </button>
                <button
                  onClick={() => updateStatus(lead.id, 'irrelevant')}
                  disabled={isUpdating || lead.status === 'irrelevant'}
                  style={{
                    padding: '6px 12px',
                    fontSize: '12px',
                    borderRadius: '4px',
                    border: '1px solid #999',
                    backgroundColor: lead.status === 'irrelevant' ? '#999' : 'white',
                    color: lead.status === 'irrelevant' ? 'white' : '#999',
                    cursor: isUpdating ? 'wait' : 'pointer',
                  }}
                >
                  ✗ לא רלוונטי
                </button>
              </div>

              <div style={{ fontSize: '12px', color: '#999', marginTop: '8px' }}>
                {formatDate(lead.received_at || lead.created_at)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}