// app/data-deletion/page.tsx
//
// /data-deletion returned 404 (2026-11-16 audit): it is the address people (and Meta's reviewers) try first. The instructions live
// in the privacy policy (app/privacy/page.tsx, id="data-deletion"), so this sends them there. Public: lib/supabase/middleware.ts
// already lists '/data-deletion' (the Facebook status page sits under it, app/data-deletion/status).
import { redirect } from 'next/navigation';

export default function DataDeletion() {
  redirect('/privacy#data-deletion');
}
