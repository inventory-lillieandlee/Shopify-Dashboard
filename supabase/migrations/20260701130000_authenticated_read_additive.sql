-- Migration: authenticated_read_additive
-- Applied to Supabase project iopmxrxmbusibazryxet via MCP execute_sql.
--
-- Why: the demo RLS granted SELECT to `anon` only. Once a user signs in, the
-- dashboard's cookie-aware client reads as role `authenticated`, which had NO read
-- policy → RLS returned 0 rows (blank dashboard for logged-in users). This ADDS
-- authenticated SELECT alongside the existing anon policies, so the dashboard works
-- both logged-out (public/dormant) and logged-in. The go-live cutover
-- (migrations-pending/..._authenticated_rls.sql) later DROPS the anon policies.
--
-- alert_recipients stays service_role-only (emails private). Writes stay service_role.

do $$
declare t text;
begin
  foreach t in array array['products','inventory_snapshots','projections','alert_log','recharge_renewals','sku_demand']
  loop
    execute format('drop policy if exists "authenticated read %1$s" on public.%1$I', t);
    execute format('create policy "authenticated read %1$s" on public.%1$I for select to authenticated using (true)', t);
  end loop;
end $$;
