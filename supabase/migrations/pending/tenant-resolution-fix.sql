-- STATUS: APPLIED. Found already live on 2026-09-02.
-- The folder name is not a status. See README.md in this directory.

-- tenant-resolution-fix.sql
-- ALREADY APPLIED. Confirmed by reading the live definition, which is the only
-- way this could have been established:
--
--     select pg_get_functiondef('public.get_user_tenant_id()'::regprocedure);
--
-- returns a body containing "order by tm.created_at asc, tm.id asc". That is
-- this file's Step 1, verbatim. Nobody recorded running it, so when or by whom
-- is unknown; what is known is that the function is deterministic now.
--
-- THIS FILE SAID "PARKED - do not run yet" WHILE THE FIX WAS ALREADY LIVE. That
-- is the second status header in this repo to have been stale in that
-- direction: add_appointment_no_overlap.sql spent time claiming NOT APPLIED
-- while its constraint was enforcing in production. Both were discovered by
-- asking the database instead of the file. The pattern is worth naming - a
-- status line is a claim about a system it cannot observe, and it only stays
-- true if someone updates it in the same hour they run the SQL.
--
-- Re-running Step 1 is harmless: it is CREATE OR REPLACE with an identical
-- body. Steps 0 and 2 are read-only.
--
-- The reasoning below is unchanged and was the argument for running it.
--
-- Membership re-checked on 2026-09-02: the owner holds exactly ONE
-- tenant_members row, 448e9e45-2251-4572-b665-886c5bc7a4c8, joined 2026-05-06.
-- So the premise under "WHY IT IS NOT URGENT" still holds, and running this
-- today is still provably a no-op for her session - it cannot change what
-- anything currently resolves to.
--
-- What prompted the decision was a different failure that rhymes with this one.
-- For several weeks a second tenant, b09637c8-…, was labelled "(yours)" in
-- STAGE_SUMMARY.md and copied from there into two scripts, two migrations and a
-- doc comment. Every check run "against the owner's data" ran against a
-- near-empty tenant instead. Nothing leaked and nothing was lost, because the
-- tools involved hold the service-role key and see all tenants equally - which
-- is exactly why nothing contradicted the label for weeks.
--
-- That is the same shape as this bug. Not the same mechanism, but the same
-- consequence: something quietly answers "which business is this?" with the
-- wrong tenant, and every tool that could have caught it is one that cannot
-- tell tenants apart. It cost a day of investigation with the answer already
-- written down in the repo. The ordered version of this function is one line
-- and removes an entire category of that question having an unstable answer.
--
-- "Earliest is safest" was already this file's own conclusion. Taking it.
--
-- Makes public.get_user_tenant_id() deterministic by giving its LIMIT 1 an
-- explicit ORDER BY: the OLDEST membership wins.
--
-- ===========================================================================
-- WHAT IS WRONG TODAY
-- ===========================================================================
-- get_user_tenant_id() selects the caller's tenant with LIMIT 1 and NO ORDER
-- BY. With no ordering, Postgres may return ANY matching row, and which one it
-- returns can change over time as row storage shifts (updates, vacuum, plan
-- changes). It is not stable.
--
-- That function is the most load-bearing thing in this database. Every RLS
-- policy keys on it, including all 60 trial-gate policies from gate.sql, and
-- so does is_tenant_active(). Whatever it returns IS which business you are.
--
-- public.tenant_members has UNIQUE (tenant_id, user_id) -- the PAIR. Nothing
-- prevents one user from holding rows in several tenants.
--
-- ===========================================================================
-- WHY IT IS NOT URGENT (verified 2026-07-30)
-- ===========================================================================
-- The duplicates check returned ZERO rows: no user currently holds more than
-- one membership. With exactly one row per user, "LIMIT 1 with no ORDER BY"
-- and "LIMIT 1 ordered by created_at" return the SAME row, always. So the bug
-- is latent, not live.
--
-- ===========================================================================
-- WHEN TO RUN
-- ===========================================================================
-- BEFORE the first time anyone is added to a second tenant. In practice that
-- means: before you add yourself to a customer's tenant to debug something.
-- The moment a second membership row exists, your own dashboard may start
-- resolving to that customer's tenant -- you would be reading their calendar,
-- writing into their data, and seeing their plan state instead of yours,
-- non-deterministically.
--
-- NOTE, and this is worth weighing: because there are zero duplicates today,
-- running this NOW is provably a no-op for every existing user. It cannot
-- change what any current session resolves to. Running it LATER, once a second
-- membership exists, is the version that actually changes behaviour for
-- somebody. Earliest is safest here.
--
-- ===========================================================================
-- STEP 0. MANDATORY. Capture the current definition first.
-- ===========================================================================
-- This file REPLACES a function whose exact current body has not been read.
-- Do not skip this: if the live function contains logic beyond the simple
-- lookup below (a fallback, a role filter, a coalesce), Step 1 would silently
-- discard it.
--
-- Run this, read the output, and check TWO things:
--   1. Paste the full result into tenant-resolution-rollback.sql, replacing the
--      placeholder there. That is your way back.
--   2. Compare it to Step 1 below. If the live body does ANYTHING other than
--      "select tenant_id from tenant_members where user_id = auth.uid()
--       limit 1", STOP and show me. Step 1 assumes that shape.
select pg_get_functiondef('public.get_user_tenant_id()'::regprocedure) as current_definition;


-- ===========================================================================
-- STEP 1. The fix. Ordering only -- no change to what it selects.
-- ===========================================================================
-- Verified against the real production definition, captured 2026-07-30 and
-- embedded in tenant-resolution-rollback.sql Section 1. Signature, return type,
-- volatility and SECURITY DEFINER are preserved exactly, and the ONLY
-- difference is the ORDER BY. The two files are exact mirrors of each other.
--
-- NOTE ON search_path, deliberately absent: an earlier draft of this file added
-- `set search_path = public, pg_temp`. Production does NOT have it, so that
-- would have been a second, undocumented change riding along with the ordering
-- fix. It has been removed. On the one function every RLS policy in this
-- database calls, a diff you can verify at a glance beats a bundled
-- improvement.
--
-- Not a live vulnerability either way: the body fully schema-qualifies both
-- public.tenant_members and auth.uid(), so there is no unqualified name for a
-- hostile search_path to capture. Adding it is still reasonable hardening, but
-- it is a SEPARATE change that deserves its own test and its own rollback.
--
--   created_at asc  -> the membership you have held longest wins, so your own
--                      original tenant always beats one added later for support
--                      work. This is the property that makes support safe.
--   id asc          -> tie-breaker, in case two rows share a created_at (they
--                      would if ever inserted in the same transaction). Without
--                      it, a tie is non-deterministic again and the fix is
--                      incomplete.
--
-- created_at is NOT NULL on this table, so no NULLS FIRST/LAST handling is
-- needed.
begin;

create or replace function public.get_user_tenant_id()
returns uuid
language sql
stable
security definer
as $$
  select tm.tenant_id
    from public.tenant_members tm
   where tm.user_id = auth.uid()
   order by tm.created_at asc, tm.id asc
   limit 1;
$$;

commit;


-- ===========================================================================
-- STEP 2. VERIFY. Run each separately, AS YOURSELF in the SQL editor.
-- ===========================================================================

-- 2a. The definition now contains an ORDER BY. Eyeball it.
select pg_get_functiondef('public.get_user_tenant_id()'::regprocedure) as new_definition;

-- 2b. Still SECURITY DEFINER and still STABLE. Both must hold: dropping
--     SECURITY DEFINER would break every RLS policy that calls this.
--     EXPECT is_security_definer = true, volatility = 's'.
select proname,
       prosecdef  as is_security_definer,
       provolatile as volatility,
       pg_get_userbyid(proowner) as owner
  from pg_proc
 where oid = 'public.get_user_tenant_id()'::regprocedure;

-- 2c. Nobody gained or lost a tenant. EXPECT zero rows: every user still
--     resolves to the same tenant the raw table says they belong to.
--     (With one membership each, these are identical by definition. This check
--     earns its keep later, once someone has two.)
select tm.user_id,
       tm.tenant_id as oldest_membership
  from public.tenant_members tm
  join (
    select user_id, min(created_at) as first_join
      from public.tenant_members group by user_id
  ) f on f.user_id = tm.user_id and f.first_join = tm.created_at
 where (select count(*) from public.tenant_members x where x.user_id = tm.user_id) > 1;


-- ===========================================================================
-- STEP 3. TEST IN THE APP before trusting it
-- ===========================================================================
-- 1. Log in as YOURSELF. The dashboard must load your own business, your own
--    calendar, your own clients. No banner change.
-- 2. Save something (an appointment, or settings). RLS still passes, so
--    get_user_tenant_id() is still returning a real tenant to the policies.
-- 3. On a THROWAWAY account, add a second membership by hand:
--      insert into public.tenant_members (tenant_id, user_id, role)
--      values ('<some other tenant>', '<throwaway user_id>', 'member');
--    Log in as the throwaway. It must resolve to its ORIGINAL tenant every
--    time, across several reloads. Before this fix that was not guaranteed.
-- 4. Remove the test row:
--      delete from public.tenant_members
--       where user_id = '<throwaway user_id>' and tenant_id = '<some other tenant>';
