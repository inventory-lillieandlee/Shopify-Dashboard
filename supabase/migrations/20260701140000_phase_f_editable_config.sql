-- Migration: phase_f_editable_config
-- Applied to Supabase project iopmxrxmbusibazryxet via MCP apply_migration.
-- Admin-editable projection settings: global (growth %, spike %) + per-category
-- alert day-cutoffs. Seeded from the current deriveThresholds() output so behavior
-- is unchanged until an admin edits. service_role full; authenticated + (demo) anon read.

-- app_config — single global row (id guard keeps it a singleton)
create table if not exists public.app_config (
  id                  boolean     primary key default true,
  growth_pct          numeric     not null default 8,
  spike_threshold_pct numeric     not null default 15,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint app_config_singleton check (id = true)
);
insert into public.app_config (id) values (true) on conflict (id) do nothing;
create trigger trg_app_config_updated_at
  before update on public.app_config for each row execute function public.set_updated_at();

-- category_thresholds — per-category DSR day cutoffs for the alert tiers
create table if not exists public.category_thresholds (
  category      text        primary key,
  yellow_days   integer     not null,
  red_days      integer     not null,
  critical_days integer     not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint category_thresholds_category_check
    check (category in ('supplement_chews','cbd','treats','salmon_oil')),
  constraint category_thresholds_order_check
    check (yellow_days >= red_days and red_days >= critical_days)
);
insert into public.category_thresholds (category, yellow_days, red_days, critical_days) values
  ('supplement_chews', 150, 138, 30),
  ('cbd', 90, 84, 30),
  ('treats', 150, 138, 30),
  ('salmon_oil', 98, 92, 30)
on conflict (category) do nothing;
create trigger trg_category_thresholds_updated_at
  before update on public.category_thresholds for each row execute function public.set_updated_at();

-- RLS: service_role full; authenticated + demo anon read (recompute + Settings read these).
alter table public.app_config enable row level security;
alter table public.category_thresholds enable row level security;
create policy "service_role full access on app_config" on public.app_config for all to service_role using (true) with check (true);
create policy "authenticated read app_config" on public.app_config for select to authenticated using (true);
create policy "anon read app_config (DEMO ONLY)" on public.app_config for select to anon using (true);
create policy "service_role full access on category_thresholds" on public.category_thresholds for all to service_role using (true) with check (true);
create policy "authenticated read category_thresholds" on public.category_thresholds for select to authenticated using (true);
create policy "anon read category_thresholds (DEMO ONLY)" on public.category_thresholds for select to anon using (true);
