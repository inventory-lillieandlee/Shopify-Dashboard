-- ============================================================================
-- PENDING MIGRATION — DO NOT APPLY YET.  (go-live only.)
-- ============================================================================
-- Outside the normal supabase/migrations/ run path so it is never auto-applied.
-- Apply ONLY as the go-live step in docs/phase-e/go-live-runbook.md, together with
-- AUTH_ENABLED=true. Until then the demo stays public (anon SELECT live).
--
-- What it does: removes the DEMO anon-SELECT policies. The authenticated-SELECT
-- policies already exist (added during Phase D so logged-in admins can read while
-- still dormant) — the create statements below are guarded with drop-if-exists so
-- this is idempotent whether or not they were pre-applied. service_role keeps full
-- access; writes stay service_role-only.
--
-- ⚠️ HARD ORDERING DEPENDENCY — the cron already reads via service-role, so it
-- survives this cutover. Do NOT revert the cron to anon reads after applying.
-- ============================================================================

-- products
drop policy if exists "anon read products (DEMO ONLY)" on public.products;
drop policy if exists "authenticated read products" on public.products;
create policy "authenticated read products"
  on public.products for select to authenticated using (true);

-- inventory_snapshots
drop policy if exists "anon read inventory_snapshots (DEMO ONLY)" on public.inventory_snapshots;
drop policy if exists "authenticated read inventory_snapshots" on public.inventory_snapshots;
create policy "authenticated read inventory_snapshots"
  on public.inventory_snapshots for select to authenticated using (true);

-- projections
drop policy if exists "anon read projections (DEMO ONLY)" on public.projections;
drop policy if exists "authenticated read projections" on public.projections;
create policy "authenticated read projections"
  on public.projections for select to authenticated using (true);

-- alert_log
drop policy if exists "anon read alert_log (DEMO ONLY)" on public.alert_log;
drop policy if exists "authenticated read alert_log" on public.alert_log;
create policy "authenticated read alert_log"
  on public.alert_log for select to authenticated using (true);

-- recharge_renewals
drop policy if exists "anon read recharge_renewals (DEMO ONLY)" on public.recharge_renewals;
drop policy if exists "authenticated read recharge_renewals" on public.recharge_renewals;
create policy "authenticated read recharge_renewals"
  on public.recharge_renewals for select to authenticated using (true);

-- sku_demand
drop policy if exists "anon read sku_demand (DEMO ONLY)" on public.sku_demand;
drop policy if exists "authenticated read sku_demand" on public.sku_demand;
create policy "authenticated read sku_demand"
  on public.sku_demand for select to authenticated using (true);

-- alert_recipients (Phase D) is already service_role-only (no anon policy) — nothing
-- to change; recipient emails stay private and are managed via the admin API.

-- service_role "full access" policies (incl. sku_demand + alert_recipients) are unchanged.
