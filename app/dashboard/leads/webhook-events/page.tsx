// app/dashboard/leads/webhook-events/page.tsx
// The answer to "Facebook says a lead came in and I don't see it - where did
// it go?". Lists every webhook event the Facebook lead pipeline recorded for
// this tenant, failures first-class: a red row with the reason, not an absence.
//
// Reads on the SESSION client, so RLS scopes it to the tenant. Events with no
// tenant (a webhook for a page nobody registered) are visible only via the
// service role, deliberately.

import { createClient } from '../../../../lib/supabase/server';
import { redirect } from 'next/navigation';

// Per-request, always fresh: this page exists to be checked right after a
// lead was submitted.
export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface EventRow {
  id: string;
  leadgen_id: string | null;
  facebook_page_id: string | null;
  processed: boolean;
  error_message: string | null;
  created_at: string;
}

export default async function WebhookEventsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data, error } = await supabase
    .from('facebook_webhook_events')
    .select('id, leadgen_id, facebook_page_id, processed, error_message, created_at')
    .order('created_at', { ascending: false })
    .limit(100);

  const events = (data || []) as EventRow[];
  const failed = events.filter((e) => !e.processed).length;

  return (
    <div dir="rtl" style={{ maxWidth: 860, margin: '0 auto', padding: '24px 16px', fontFamily: 'inherit' }}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>אירועי לידים מפייסבוק</h1>
      <p style={{ color: '#666', fontSize: 13, marginTop: 0 }}>
        כל התראת ליד שפייסבוק שלחה אלינו — כולל כאלה שנכשלו. אם ליד לא הופיע ברשימת הלידים, הסיבה תופיע כאן.
      </p>

      {error && (
        <div style={{ background: '#FDECEA', color: '#B3261E', padding: '10px 14px', borderRadius: 8, fontSize: 13 }}>
          {/* Most likely: the migration has not been applied yet. */}
          שגיאה בטעינת האירועים: {error.message}
        </div>
      )}

      {!error && events.length === 0 && (
        <div style={{ background: '#F5F5F5', padding: '14px 16px', borderRadius: 8, fontSize: 13, color: '#555' }}>
          עדיין לא התקבל אף אירוע מפייסבוק. אם קמפיין רץ עכשיו וזה נשאר ריק — הדף כנראה לא מחובר או לא רשום לעדכוני לידים.
        </div>
      )}

      {!error && events.length > 0 && (
        <>
          <p style={{ fontSize: 13, color: failed > 0 ? '#B3261E' : '#2E7D32' }}>
            {events.length} אירועים אחרונים, מתוכם {failed} נכשלו.
          </p>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: 'right', color: '#888', borderBottom: '1px solid #ddd' }}>
                <th style={{ padding: '6px 8px' }}>מתי</th>
                <th style={{ padding: '6px 8px' }}>מזהה ליד</th>
                <th style={{ padding: '6px 8px' }}>סטטוס</th>
                <th style={{ padding: '6px 8px' }}>שגיאה</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id} style={{ borderBottom: '1px solid #eee', background: e.processed ? 'transparent' : '#FDECEA' }}>
                  <td style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>
                    {new Date(e.created_at).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' })}
                  </td>
                  <td style={{ padding: '6px 8px', direction: 'ltr', textAlign: 'right' }}>{e.leadgen_id || '—'}</td>
                  <td style={{ padding: '6px 8px', color: e.processed ? '#2E7D32' : '#B3261E', fontWeight: 600 }}>
                    {e.processed ? 'נקלט' : 'נכשל'}
                  </td>
                  <td style={{ padding: '6px 8px', direction: 'ltr', textAlign: 'right', color: '#555' }}>{e.error_message || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
