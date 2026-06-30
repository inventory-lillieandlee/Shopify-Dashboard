-- Migration: phase_d_demand_recipients
-- Phase D — real demand + editable alert recipients.
-- Applied to Supabase project iopmxrxmbusibazryxet via MCP apply_migration.
-- Additive. Both tables get created_at/updated_at + the shared set_updated_at trigger.

-- 1) sku_demand — real units sold per SKU (written by the daily demand-sync cron).
create table if not exists public.sku_demand (
  id             uuid        primary key default gen_random_uuid(),
  product_id     uuid        not null unique references public.products(id) on delete cascade,
  units_sold_30d integer     not null default 0,
  units_sold_7d  integer     not null default 0,
  computed_at    timestamptz not null default now(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists idx_sku_demand_product on public.sku_demand (product_id);
create trigger trg_sku_demand_updated_at
  before update on public.sku_demand
  for each row execute function public.set_updated_at();
alter table public.sku_demand enable row level security;
create policy "service_role full access on sku_demand"
  on public.sku_demand for all to service_role using (true) with check (true);
-- DEMO-grade anon read (so the current anon recompute path can read it); the Phase E
-- RLS cutover replaces this with authenticated-only (see migrations-pending).
create policy "anon read sku_demand (DEMO ONLY)"
  on public.sku_demand for select to anon using (true);

-- 2) alert_recipients — editable "who gets alerts" (managed in Settings, admin-only).
create table if not exists public.alert_recipients (
  id         uuid        primary key default gen_random_uuid(),
  email      text        not null unique,
  min_level  text        not null default 'red',
  active     boolean     not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint alert_recipients_min_level_check check (min_level in ('yellow','red','critical'))
);
create trigger trg_alert_recipients_updated_at
  before update on public.alert_recipients
  for each row execute function public.set_updated_at();
alter table public.alert_recipients enable row level security;
-- service_role ONLY — recipient emails are private (read/written via the admin API).
create policy "service_role full access on alert_recipients"
  on public.alert_recipients for all to service_role using (true) with check (true);
