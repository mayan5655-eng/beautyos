-- Reels and captions on designs.
--
-- format 'reel': a design made from a reel template (lib/design/reels) -
-- same row, same values/images maps (namespaced sN_), export_path points
-- at the video she rendered in the browser.
--
-- copy: the post text that goes with the design - { text, hashtags[] } -
-- written by the AI card when it generates, editable by her, shared from
-- the design page. Before this, the caption lived only on the screen that
-- produced it.
--
-- Safe to run more than once. Run after add_designs.sql.

alter table public.designs drop constraint if exists designs_format_check;
alter table public.designs
  add constraint designs_format_check check (format in ('feed45','story','square','reel'));

alter table public.designs
  add column if not exists copy jsonb not null default '{}'::jsonb;

-- Tenants update their own rows through the API with a column grant; the new column joins it.
grant update (copy) on public.designs to authenticated;
