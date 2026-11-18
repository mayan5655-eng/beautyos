-- public_reviews_first_name_2026-11-18.sql
--
-- WHY: the review page promises "הביקורת תופיע בעמוד של העסק עם שמך הפרטי", but get_public_reviews returned the full name the
-- client gave at booking, to anyone with the public key (2026-11-18 audit). The app now shortens it before showing it
-- (lib/personName.js reviewerName), but the public function itself still handed out the full name. This makes the FUNCTION return
-- the first name and the first letter of the last word ("מאיה פרץ" -> "מאיה פ."), the same rule as the app.
--
-- NOTHING IS DELETED OR CHANGED in the reviews table: the business still sees the full name in her own dashboard.
-- Same signature, same grants: the pages that call it keep working. Safe to run more than once.

create or replace function public.get_public_reviews(p_tenant_id uuid)
returns table (
  client_name text,
  rating      int,
  body        text,
  created_at  timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
           when cardinality(p.w) > 1
             then p.w[1] || ' ' || left(regexp_replace(p.w[cardinality(p.w)], '[^[:alpha:]]', '', 'g'), 1) || '.'
           else coalesce(p.w[1], '')
         end as client_name,
         r.rating, r.body, r.created_at
    from public.reviews r
    cross join lateral (select regexp_split_to_array(btrim(coalesce(r.client_name, '')), '\s+') as w) p
   where r.tenant_id = p_tenant_id
     and r.status = 'published'
   order by r.created_at desc
   limit 50;
$$;

revoke execute on function public.get_public_reviews(uuid) from public;
grant  execute on function public.get_public_reviews(uuid) to anon, authenticated;

-- CHECK: select client_name from public.get_public_reviews('00000000-0000-0000-0000-000000000001') limit 3;
--        expect "מאיה פ." style names, never a full family name.
