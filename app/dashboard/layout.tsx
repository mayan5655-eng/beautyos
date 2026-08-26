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
    <div style={{ minHeight: '100dvh', direction: 'rtl' }}>
      {/*
        Horizontal padding is 0, and that is the whole point of this comment.

        This wrapper used to be `padding: '32px'`, which is 32px on all four
        sides. The comment above it said "full width"; it was not. Inside a
        440pt standalone window that took 64px out of the app and left the
        shell 376px wide, sitting at x=32 with white showing either side -
        the "gutters in standalone but not in a browser tab" symptom, which
        looked like a safe-area bug for days and was never one. The reason it
        only appeared installed is that /dashboard is the manifest's start_url,
        so a home-screen launch always lands in this layout.

        The vertical 32px stays: the other pages under /dashboard (admin,
        marketing, reel-studio) are ordinary content pages that want breathing
        room at the top. Only the horizontal padding was ever wrong, because
        only this route also hosts the full-bleed app shell, which draws its own
        header, main and bottom bar and manages its own safe-area insets.
      */}
      <main style={{ padding: '32px 0', backgroundColor: 'white' }}>
        {children}
      </main>
    </div>
  );
}