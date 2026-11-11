-- add_academy_2026-11-11.sql
--
-- STATUS: pending (run by hand in the Supabase SQL editor). Safe to run more than once. Deletes NOTHING.
-- Run order: 1) this file, 2) academy_seed_2026-11-11.sql (optional, the three draft courses).
--
-- "Kalmea Academy": courses for the business owner (lib/academy.ts). The code works before this runs: with NEXT_PUBLIC_ACADEMY
-- empty nothing exists anywhere; with it on and this file not run, /dashboard/academy and the admin screen say the update is missing.
--
-- Four tables:
--   academy_courses          the catalog. price_ils is stored for later; nothing shows or charges it while billing is off.
--   academy_lessons          a course's lessons. video_url is an unlisted YouTube or Vimeo link (checked in code, lib/academy.ts).
--   academy_course_access    who may open which course: 'purchase' (later, lifetime), 'gift' / 'admin' (beta testers, lifetime),
--                            'premium' (later; Premium itself is read from her plan, a row here gives nothing on its own).
--                            One row per business + course + source; revoking sets revoked_at, never deletes.
--   academy_lesson_progress  "סיימתי": one row per business + user + lesson. The primary key makes a second tap a no-op.
--
-- Security:
--   * Every table has RLS on. A logged-in business may READ published courses, the published lessons of a course she holds an
--     active grant for, her own grants, and her own progress. She may INSERT only her own progress row, for a lesson she can open.
--   * Writes to courses, lessons and access: service role only (the platform-admin screen, behind requirePlatformAdmin).
--   * anon can read nothing.

create table if not exists public.academy_courses (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 60),
  title       text not null check (char_length(title) between 1 and 120),
  subtitle    text check (subtitle is null or char_length(subtitle) <= 240),
  price_ils   integer check (price_ils is null or price_ils >= 0),
  published   boolean not null default false,
  sort        integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.academy_lessons (
  id          uuid primary key default gen_random_uuid(),
  course_id   uuid not null references public.academy_courses(id) on delete cascade,
  slug        text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 60),
  title       text not null check (char_length(title) between 1 and 160),
  minutes     integer check (minutes is null or minutes between 0 and 600),
  video_url   text check (video_url is null or (video_url like 'https://%' and char_length(video_url) <= 300)),
  body        text not null default '' check (char_length(body) <= 20000),
  task        text not null default '' check (char_length(task) <= 4000),
  sort        integer not null default 0,
  published   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (course_id, slug)
);
create index if not exists idx_academy_lessons_course on public.academy_lessons (course_id, sort);

create table if not exists public.academy_course_access (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  course_id   uuid not null references public.academy_courses(id) on delete cascade,
  source      text not null check (source in ('premium', 'purchase', 'gift', 'admin')),
  granted_at  timestamptz not null default now(),
  revoked_at  timestamptz,
  granted_by  uuid,
  note        text check (note is null or char_length(note) <= 300),
  unique (tenant_id, course_id, source)
);
create index if not exists idx_academy_access_course on public.academy_course_access (course_id);

create table if not exists public.academy_lesson_progress (
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  user_id       uuid not null,
  lesson_id     uuid not null references public.academy_lessons(id) on delete cascade,
  completed_at  timestamptz not null default now(),
  primary key (tenant_id, user_id, lesson_id)
);
create index if not exists idx_academy_progress_lesson on public.academy_lesson_progress (lesson_id);

alter table public.academy_courses         enable row level security;
alter table public.academy_lessons         enable row level security;
alter table public.academy_course_access   enable row level security;
alter table public.academy_lesson_progress enable row level security;

revoke all on public.academy_courses         from anon, authenticated;
revoke all on public.academy_lessons         from anon, authenticated;
revoke all on public.academy_course_access   from anon, authenticated;
revoke all on public.academy_lesson_progress from anon, authenticated;

grant select on public.academy_courses         to authenticated;
grant select on public.academy_lessons         to authenticated;
grant select on public.academy_course_access   to authenticated;
grant select, insert on public.academy_lesson_progress to authenticated;

-- Does the signed-in business hold an active lifetime grant for this course? security definer so the lesson and progress policies
-- can ask without granting wider reads; it only ever answers for the caller's own business.
create or replace function public.academy_has_grant(p_course uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.academy_course_access a
     where a.course_id = p_course
       and a.tenant_id = public.get_user_tenant_id()
       and a.revoked_at is null
       and a.source in ('purchase', 'gift', 'admin')
  );
$$;
revoke all on function public.academy_has_grant(uuid) from public, anon;
grant execute on function public.academy_has_grant(uuid) to authenticated;

drop policy if exists academy_courses_read_published on public.academy_courses;
create policy academy_courses_read_published on public.academy_courses
  for select to authenticated using (published);

drop policy if exists academy_lessons_read_granted on public.academy_lessons;
create policy academy_lessons_read_granted on public.academy_lessons
  for select to authenticated using (
    published
    and exists (select 1 from public.academy_courses c where c.id = course_id and c.published)
    and public.academy_has_grant(course_id)
  );

drop policy if exists academy_access_read_own on public.academy_course_access;
create policy academy_access_read_own on public.academy_course_access
  for select to authenticated using (tenant_id = public.get_user_tenant_id());

drop policy if exists academy_progress_read_own on public.academy_lesson_progress;
create policy academy_progress_read_own on public.academy_lesson_progress
  for select to authenticated using (tenant_id = public.get_user_tenant_id() and user_id = auth.uid());

drop policy if exists academy_progress_insert_own on public.academy_lesson_progress;
create policy academy_progress_insert_own on public.academy_lesson_progress
  for insert to authenticated with check (
    tenant_id = public.get_user_tenant_id()
    and user_id = auth.uid()
    and exists (
      select 1 from public.academy_lessons l
        join public.academy_courses c on c.id = l.course_id
       where l.id = lesson_id and l.published and c.published and public.academy_has_grant(l.course_id)
    )
  );

notify pgrst, 'reload schema';

-- Verify (run after the above)
-- 1. Four tables, RLS on. Expect four rows, rls_on = true.
--      select relname, relrowsecurity as rls_on from pg_class
--       where oid in ('public.academy_courses'::regclass, 'public.academy_lessons'::regclass,
--                     'public.academy_course_access'::regclass, 'public.academy_lesson_progress'::regclass);
-- 2. Five policies. Expect 5.
--      select count(*) from pg_policies where schemaname = 'public' and tablename like 'academy_%';
-- 3. The browser cannot write courses, lessons or access. Expect three rows, all false.
--      select t, has_table_privilege('authenticated', t, 'INSERT') from unnest(array['public.academy_courses','public.academy_lessons','public.academy_course_access']) t;
-- 4. Progress is one row per business + user + lesson. Expect the primary key to name those three columns.
--      select pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.academy_lesson_progress'::regclass and contype = 'p';
