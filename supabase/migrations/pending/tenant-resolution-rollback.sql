-- tenant-resolution-rollback.sql
-- The way back out of tenant-resolution-fix.sql.
--
-- STATUS: READY TO RUN. Section 1 now contains the real definition of
-- public.get_user_tenant_id() as captured from production on 2026-07-30, so
-- this file no longer needs filling in before it can be used.
--
-- ===========================================================================
-- HOW TO USE IN A HURRY
-- ===========================================================================
-- Run SECTION 1 on its own. That is the whole rollback. Everything after it is
-- verification, and the Supabase SQL editor only shows the last statement's
-- result set, so run the checks separately, one block at a time.
--
-- ===========================================================================
-- WHY A ROLLBACK MATTERS MORE HERE THAN ANYWHERE ELSE
-- ===========================================================================
-- get_user_tenant_id() is called by every RLS policy in this database,
-- including all 60 trial-gate policies from gate.sql, and by
-- is_tenant_active(). If a replacement is wrong there are two failure modes:
--   * returns NULL for everyone -> every policy fails -> total lockout.
--     Nobody can read or write anything. Loud, obvious, and recoverable.
--   * returns the WRONG tenant -> policies pass against someone else's data
--     -> silent cross-tenant leak. Quiet, and far worse.
-- The second is why the verification below exists and why it is not optional.


-- ===========================================================================
-- SECTION 1: RESTORE THE ORIGINAL FUNCTION
-- ===========================================================================
-- Verbatim as captured from production. Note what it does NOT have: no
-- ORDER BY (that is the bug the fix addresses) and no SET search_path (see the
-- note at the bottom of this file).
--
-- Wrapped in a transaction so it either lands completely or not at all.

begin;

CREATE OR REPLACE FUNCTION public.get_user_tenant_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  SELECT tenant_id
  FROM public.tenant_members
  WHERE user_id = auth.uid()
  LIMIT 1;
$function$;

commit;


-- ===========================================================================
-- SECTION 2: VERIFY THE ROLLBACK LANDED. Run each block separately.
-- ===========================================================================

-- 2a. The definition is back to the original. It must contain LIMIT 1 and
--     must NOT contain an ORDER BY.
select pg_get_functiondef('public.get_user_tenant_id()'::regprocedure) as restored_definition;

-- 2b. Still SECURITY DEFINER and still STABLE. If either of these is wrong,
--     every RLS policy in the database is now behaving differently.
--     EXPECT is_security_definer = true, volatility = 's'.
select proname,
       prosecdef   as is_security_definer,
       provolatile as volatility,
       pg_get_userbyid(proowner) as owner
  from pg_proc
 where oid = 'public.get_user_tenant_id()'::regprocedure;

-- 2c. The function still resolves a real tenant. Run this logged in as
--     yourself in the SQL editor: it must return YOUR tenant id, not null.
--     A null here means every RLS policy is now failing for you.
select public.get_user_tenant_id() as my_tenant_id;

-- 2d. End to end: writes still work. As yourself in the app, create an
--     appointment and save settings. Both must succeed. This is the check
--     that actually proves the policies are still passing.


-- ===========================================================================
-- AFTER ROLLING BACK: WHAT YOU ARE LEFT WITH
-- ===========================================================================
-- You are back on the original non-deterministic LIMIT 1. That is an
-- acceptable resting state ONLY while no user holds more than one membership.
-- Confirm that is still true. This must return ZERO ROWS:
select user_id, count(*) as memberships
  from public.tenant_members
 group by user_id having count(*) > 1;
-- If it returns anything, the original function is actively unsafe for those
-- users: their tenant resolution can change between calls. Either remove the
-- extra membership rows, or go forward with tenant-resolution-fix.sql instead
-- of resting here.


-- ===========================================================================
-- NOTE ON search_path, FOR WHOEVER READS THIS NEXT
-- ===========================================================================
-- The production function has NO `SET search_path`. That is preserved exactly
-- above, because a rollback must restore what was actually there, not an
-- improved version of it.
--
-- It is not a live vulnerability: the body fully schema-qualifies both
-- public.tenant_members and auth.uid(), so there is no unqualified name for a
-- hostile search_path to capture. Adding `SET search_path = public, pg_temp`
-- would still be reasonable hardening, but it is a SEPARATE change from the
-- ordering fix and should be made and tested on its own.
