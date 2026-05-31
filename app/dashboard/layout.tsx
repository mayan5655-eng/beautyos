// app/dashboard/layout.tsx
// Shared layout for all dashboard pages
// Sidebar removed - navigation handled by the top menu

import { createClient } from '../../lib/supabase/server';
import { redirect } from 'next/navigation';

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
    <div style={{ minHeight: '100vh', direction: 'rtl' }}>
      {/* Main content - full width */}
      <main style={{ padding: '32px', backgroundColor: 'white' }}>
        {children}
      </main>
    </div>
  );
}