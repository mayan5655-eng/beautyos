-- STATUS: NOT YET APPLIED.
-- The folder name is not a status. See README.md in this directory.

-- whatsapp-delivery-status.sql
--
-- WHY THIS EXISTS. whatsapp_messages.status has only ever meant "did OUR
-- HTTP call to GreenAPI's /sendMessage endpoint return 200" - the code sets
-- it the instant fetch() resolves, with no wait for anything downstream.
-- GreenAPI's own server returns 200 and a real idMessage even when the
-- underlying WhatsApp session is logged out (stateInstance = notAuthorized),
-- so "sent" in this table has never meant "a person is going to see it".
-- Confirmed by hand 2026-10-01: instance 7107629829 read notAuthorized while
-- 12 consecutive nightly alerts sat logged "sent" and none arrived.
--
-- GreenAPI answers the real question through a SEPARATE webhook
-- (typeWebhook: "outgoingMessageStatus") carrying the idMessage and its own
-- status (delivered / read / a failure). That webhook has always arrived
-- and always been thrown away - app/api/whatsapp-webhook/route.js matched
-- only "incomingMessageReceived" and discarded everything else, including
-- this. These columns are what that handler now writes into, once it stops
-- discarding it.
--
-- ADDITIVE, not a replacement: `status`/`error_detail` keep meaning exactly
-- what they always have (outboundCap.js, platform_tenant_metrics,
-- the failure-report cron all already read them that way). `delivery_status`
-- is the new, separate, honest answer to "did it actually arrive" - null
-- until a status webhook says otherwise, which is itself informative: a
-- message stuck at null for a long time is one nobody has confirmed ever
-- reached a phone.
--
-- Safe to run more than once.

alter table public.whatsapp_messages
  add column if not exists delivery_status text,
  add column if not exists delivered_at timestamptz,
  add column if not exists read_at timestamptz,
  add column if not exists undelivered_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'whatsapp_messages_delivery_status_check'
  ) then
    alter table public.whatsapp_messages
      add constraint whatsapp_messages_delivery_status_check
      check (delivery_status is null or delivery_status in ('delivered', 'read', 'undelivered'));
  end if;
end $$;

-- The webhook looks a row up by green_api_id (GreenAPI's idMessage) to
-- attach a status update to the send that produced it.
create index if not exists idx_whatsapp_messages_green_api_id
  on public.whatsapp_messages (green_api_id)
  where green_api_id is not null;

-- ── Verify ─────────────────────────────────────────────────────────────────
--
--   a) The columns exist.
--        select column_name, data_type from information_schema.columns
--         where table_name = 'whatsapp_messages'
--           and column_name in ('delivery_status','delivered_at','read_at','undelivered_at');
--
--   b) After the webhook has run for a day: how many "sent" rows still have
--      no delivery confirmation at all? A persistently large number here,
--      for an instance that reads authorized, is itself worth a look.
--        select count(*) from public.whatsapp_messages
--         where status = 'sent' and delivery_status is null
--           and created_at < now() - interval '1 hour';
