// app/dashboard/layout.tsx
// Shared layout for all dashboard pages
// Includes sidebar navigation and logout

import { createClient } from '../../lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Check that user is logged in
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', direction: 'rtl' }}>
      {/* Sidebar */}
      <aside
        style={{
          width: '240px',
          backgroundColor: '#f5f5f5',
          padding: '24px 16px',
          borderLeft: '1px solid #e0e0e0',
        }}
      >
        <h1 style={{ fontSize: '24px', marginBottom: '32px', color: '#333' }}>
          🌸 BeautyOS
        </h1>

        <nav style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <Link
            href="/dashboard"
            style={{
              padding: '12px 16px',
              borderRadius: '8px',
              textDecoration: 'none',
              color: '#333',
              backgroundColor: 'white',
            }}
          >
            🏠 בית
          </Link>

          <Link
            href="/dashboard/leads"
            style={{
              padding: '12px 16px',
              borderRadius: '8px',
              textDecoration: 'none',
              color: '#333',
              backgroundColor: 'white',
            }}
          >
            📋 לידים
          </Link>
        </nav>

        <div style={{ marginTop: '32px', fontSize: '12px', color: '#999' }}>
          {user.email}
        </div>
      </aside>

      {/* Main content */}
      <main style={{ flex: 1, padding: '32px', backgroundColor: 'white' }}>
        {children}
      </main>
    </div>
  );
}