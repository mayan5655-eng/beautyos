// app/api/academy/progress/route.ts
//
// "סיימתי" on a lesson (app/dashboard/academy/FinishButton.tsx). The business and the user come from the SESSION only; the body
// names just the lesson. lib/academyData.ts markLessonDone refuses a lesson she cannot open (404) and writes at most one row per
// business + user + lesson (the first completion time is kept). NEXT_PUBLIC_ACADEMY off -> 404 before anything is read.
import { NextResponse } from 'next/server';
import { createClient as createSessionClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/adminGuard';
import { academyEnabled } from '@/lib/academy';
import { resolveViewer, markLessonDone, type Db } from '@/lib/academyData';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  if (!academyEnabled()) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const viewer = await resolveViewer((await createSessionClient()) as never);
  if (!viewer) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const r = await markLessonDone(createAdminClient() as unknown as Db, viewer, typeof body?.lessonId === 'string' ? body.lessonId : '');
  if (!r.ok) return NextResponse.json({ success: false, error: r.error }, { status: r.status });
  return NextResponse.json({ success: true, already: r.already, progress: r.progress, certificate: r.certificate });
}
