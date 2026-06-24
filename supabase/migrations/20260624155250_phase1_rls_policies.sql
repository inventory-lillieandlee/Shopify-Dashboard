-- Migration: phase1_rls_policies
-- Enable Row Level Security on all 5 Phase 1 tables + DEMO-GRADE policies.
--
-- Applied to Supabase project iopmxrxmbusibazryxet via MCP apply_migration.
-- Recorded in migration history as version 20260624155250.
--
-- !!  DEMO-GRADE ACCESS — READ BEFORE PRODUCTION  !!
-- `anon` is granted SELECT on every table so the dashboard's public anon/
-- publishable key can read the demo data. Real inventory is NOT public.
-- BEFORE the real Shopify pipeline lands, REPLACE every "anon read ... (DEMO ONLY)"
-- policy below with authenticated-only access (Supabase Auth / Google sign-in),
-- e.g. `to authenticated using (auth.role() = 'authenticated')`, and drop anon read.
-- See docs/phase-1/TODO-before-production.md.
--
-- Writes are service_role only (server-side webhook handler, seed, backfill).
-- anon gets NO insert/update/delete policy -> all writes denied by default.

-- products
alter table public.products enable row level security;
create policy "service_role full access on products"
  on public.products for all
  to service_role
  using (true) with check (true);
create policy "anon read products (DEMO ONLY)"
  on public.products for select
  to anon
  using (true);

-- inventory_snapshots
alter table public.inventory_snapshots enable row level security;
create policy "service_role full access on inventory_snapshots"
  on public.inventory_snapshots for all
  to service_role
  using (true) with check (true);
create policy "anon read inventory_snapshots (DEMO ONLY)"
  on public.inventory_snapshots for select
  to anon
  using (true);

-- projections
alter table public.projections enable row level security;
create policy "service_role full access on projections"
  on public.projections for all
  to service_role
  using (true) with check (true);
create policy "anon read projections (DEMO ONLY)"
  on public.projections for select
  to anon
  using (true);

-- alert_log
alter table public.alert_log enable row level security;
create policy "service_role full access on alert_log"
  on public.alert_log for all
  to service_role
  using (true) with check (true);
create policy "anon read alert_log (DEMO ONLY)"
  on public.alert_log for select
  to anon
  using (true);

-- recharge_renewals
alter table public.recharge_renewals enable row level security;
create policy "service_role full access on recharge_renewals"
  on public.recharge_renewals for all
  to service_role
  using (true) with check (true);
create policy "anon read recharge_renewals (DEMO ONLY)"
  on public.recharge_renewals for select
  to anon
  using (true);
