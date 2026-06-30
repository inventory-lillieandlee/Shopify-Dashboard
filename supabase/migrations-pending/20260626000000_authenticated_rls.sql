-- ============================================================================
-- PENDING MIGRATION — DO NOT APPLY YET.  (Phase E, go-live only.)
-- ============================================================================
-- This file lives in supabase/migrations-pending/ ON PURPOSE — it is OUTSIDE the
-- normal supabase/migrations/ run path so it is never auto-applied. Move/apply it
-- ONLY as the go-live step in docs/phase-e/go-live-runbook.md, and ONLY together
-- with AUTH_ENABLED=true. Until then the demo stays public (anon SELECT live).
--
-- What it does: replaces the DEMO anon-SELECT policies (from migration
-- 20260624155250) with authenticated-only SELECT. service_role keeps full access;
-- writes stay service_role-only.
--
-- ⚠️ HARD ORDERING DEPENDENCY — read the runbook. Applying this WITHOUT first
-- switching the cron's reads to the service-role client will SILENTLY KILL
-- ALERTING: the cron has no user session, so its anon reads return zero rows →
-- no projections written, no alerts fired, dashboard looks fine. Switch the cron
-- to service-role reads FIRST, then apply this.
-- ============================================================================

-- products
drop policy if exists "anon read products (DEMO ONLY)" on public.products;
create policy "authenticated read products"
  on public.products for select
  to authenticated
  using (true);

-- inventory_snapshots
drop policy if exists "anon read inventory_snapshots (DEMO ONLY)" on public.inventory_snapshots;
create policy "authenticated read inventory_snapshots"
  on public.inventory_snapshots for select
  to authenticated
  using (true);

-- projections
drop policy if exists "anon read projections (DEMO ONLY)" on public.projections;
create policy "authenticated read projections"
  on public.projections for select
  to authenticated
  using (true);

-- alert_log
drop policy if exists "anon read alert_log (DEMO ONLY)" on public.alert_log;
create policy "authenticated read alert_log"
  on public.alert_log for select
  to authenticated
  using (true);

-- recharge_renewals
drop policy if exists "anon read recharge_renewals (DEMO ONLY)" on public.recharge_renewals;
create policy "authenticated read recharge_renewals"
  on public.recharge_renewals for select
  to authenticated
  using (true);

-- sku_demand (Phase D) — drop the demo anon read. The cron reads it via service-role;
-- the dashboard does not read it directly, so no authenticated policy is needed.
drop policy if exists "anon read sku_demand (DEMO ONLY)" on public.sku_demand;

-- alert_recipients (Phase D) is already service_role-only (no anon policy) — nothing
-- to change; recipient emails stay private and are managed via the admin API.

-- service_role "full access" policies (incl. sku_demand + alert_recipients) are unchanged.
