'use client';
// app/dashboard/academy/PrintButton.tsx: the browser's own print dialog, where "Save as PDF" is one of the printers. No PDF service.
export default function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()}
      style={{ padding: '9px 16px', borderRadius: 'var(--r-full)', border: '1px solid var(--k-green)', background: 'var(--surface)', color: 'var(--k-green)', fontWeight: 700, fontSize: 'var(--t-md)', cursor: 'pointer', fontFamily: 'inherit' }}>
      להדפסה או לשמירה כקובץ
    </button>
  );
}
