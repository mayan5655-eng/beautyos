create index concurrently if not exists idx_tenant_members_user_id
  on public.tenant_members (user_id);

create index concurrently if not exists idx_appointments_tenant_date
  on public.appointments (tenant_id, date);

create index concurrently if not exists idx_leads_tenant_status
  on public.leads (tenant_id, status);

create index concurrently if not exists idx_leads_tenant_received_at
  on public.leads (tenant_id, received_at desc);

create index concurrently if not exists idx_receipts_tenant_created_at
  on public.receipts (tenant_id, created_at desc);

create index concurrently if not exists idx_whatsapp_messages_tenant_created_at
  on public.whatsapp_messages (tenant_id, created_at desc);

create index concurrently if not exists idx_clients_tenant_id
  on public.clients (tenant_id);

create index concurrently if not exists idx_settings_tenant_id
  on public.settings (tenant_id);

create index concurrently if not exists idx_forms_tenant_id
  on public.forms (tenant_id);

create index concurrently if not exists idx_service_prices_tenant_id
  on public.service_prices (tenant_id);

create index concurrently if not exists idx_packages_tenant_id
  on public.packages (tenant_id);

create index concurrently if not exists idx_waitlist_tenant_id
  on public.waitlist (tenant_id);

create index concurrently if not exists idx_expenses_tenant_id
  on public.expenses (tenant_id);

create index concurrently if not exists idx_appointments_tenant_client
  on public.appointments (tenant_id, client_id);

create index concurrently if not exists idx_receipts_tenant_client
  on public.receipts (tenant_id, client_id);
