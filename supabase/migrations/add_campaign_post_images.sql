-- add_campaign_post_images.sql
-- Persist the Unsplash image chosen at generation time onto each campaign post.
--
-- Why: /api/marketing/variations already fetches one Unsplash image per post
-- variation and returns it to the client, but both save routes dropped it at
-- insert time. Only the AI's text hint (image_suggestion) was stored, so every
-- saved post lost its picture.
--
-- Safe to re-run. All columns are nullable with no defaults, so existing rows
-- stay valid and the current insert paths keep working even before the app
-- code is updated.
--
-- Run in the Supabase SQL Editor.

-- ============================================================================
-- 1) Columns
-- ============================================================================
alter table public.campaign_posts
  add column if not exists image_url         text,  -- urls.regular  (hotlink, per Unsplash ToS)
  add column if not exists image_thumb_url   text,  -- urls.small    (list / preview views)
  add column if not exists image_credit_name text,  -- user.name
  add column if not exists image_credit_url  text,  -- user.links.html (profile link for the credit)
  add column if not exists image_alt         text;  -- alt_description (accessibility, RTL cards)

-- ============================================================================
-- 2) Documentation
-- ============================================================================
comment on column public.campaign_posts.image_url is
  'Unsplash hotlink (urls.regular) captured at generation time. Null for posts saved before this migration. Images are hotlinked, never rehosted, as required by the Unsplash API terms.';

comment on column public.campaign_posts.image_credit_name is
  'Unsplash photographer name. Must be displayed alongside the image.';

comment on column public.campaign_posts.image_credit_url is
  'Unsplash photographer profile URL. The credit name must be hyperlinked to this, per the Unsplash API guidelines.';

-- ============================================================================
-- 3) Notes
-- ============================================================================
-- No RLS changes: new columns inherit the existing campaign_posts policies.
-- No indexes: nothing queries or filters by image.
