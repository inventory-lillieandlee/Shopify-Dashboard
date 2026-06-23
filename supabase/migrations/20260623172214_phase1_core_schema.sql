-- Migration: phase1_core_schema
-- Lillie & Lee Inventory — Phase 1 core schema (Section 4.3)
-- Shopify units only in Phase 1; tpl_units carried but never in demand math.
--
-- Applied to Supabase project iopmxrxmbusibazryxet via MCP apply_migration.
-- Recorded in migration history as version 20260623172214.
-- This file is the exact SQL applied, committed for version control / reproducibility.

-- Shared updated_at trigger function
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Table 1: products
create table public.products (
  id                 uuid        primary key default gen_random_uuid(),
  shopify_product_id bigint      not null unique,
  shopify_variant_id bigint,
  inventory_item_id  bigint      unique,
  name               text        not null,
  category           text        not null,
  lead_time_days     integer     not null,
  safety_stock_days  integer     not null default 30,
  active             boolean     not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint products_category_check
    check (category in ('supplement_chews','cbd','treats','salmon_oil'))
);
create trigger trg_products_updated_at
  before update on public.products
  for each row execute function public.set_updated_at();

-- Table 2: inventory_snapshots
create table public.inventory_snapshots (
  id            uuid        primary key default gen_random_uuid(),
  product_id    uuid        not null references public.products(id) on delete cascade,
  shopify_units integer     not null,
  tpl_units     integer     not null default 0,
  total_units   integer     generated always as (shopify_units + tpl_units) stored,
  source        text        not null,
  snapshot_at   timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint inventory_snapshots_source_check
    check (source in ('shopify_webhook','manual','tpl_sync'))
);
create index idx_inventory_snapshots_product_id
  on public.inventory_snapshots (product_id);
create index idx_inventory_snapshots_product_snapshot
  on public.inventory_snapshots (product_id, snapshot_at desc);
create trigger trg_inventory_snapshots_updated_at
  before update on public.inventory_snapshots
  for each row execute function public.set_updated_at();

-- Table 3: projections (written in Phase 2; columns nullable for now)
create table public.projections (
  id                      uuid          primary key default gen_random_uuid(),
  product_id              uuid          not null references public.products(id) on delete cascade,
  daily_demand_rate       decimal(10,4),
  days_of_stock_remaining decimal(10,2),
  reorder_date            date,
  spike_pct               decimal(10,2),
  alert_level             text,
  calculated_at           timestamptz   not null default now(),
  created_at              timestamptz   not null default now(),
  updated_at              timestamptz   not null default now(),
  constraint projections_alert_level_check
    check (alert_level in ('ok','yellow','red','critical'))
);
create index idx_projections_product_id
  on public.projections (product_id);
create trigger trg_projections_updated_at
  before update on public.projections
  for each row execute function public.set_updated_at();

-- Table 4: alert_log (written in Phase 2)
create table public.alert_log (
  id              uuid        primary key default gen_random_uuid(),
  product_id      uuid        not null references public.products(id) on delete cascade,
  alert_level     text,
  message         text,
  channels_sent   text[]      not null default '{}',
  acknowledged_at timestamptz,
  fired_at        timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint alert_log_alert_level_check
    check (alert_level in ('yellow','red','critical','spike'))
);
create index idx_alert_log_product_id
  on public.alert_log (product_id);
create trigger trg_alert_log_updated_at
  before update on public.alert_log
  for each row execute function public.set_updated_at();

-- Table 5: recharge_renewals (written in Phase 2)
create table public.recharge_renewals (
  id             uuid        primary key default gen_random_uuid(),
  product_id     uuid        not null references public.products(id) on delete cascade,
  renewal_date   date,
  expected_units integer,
  synced_at      timestamptz not null default now(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index idx_recharge_renewals_product_id
  on public.recharge_renewals (product_id);
create trigger trg_recharge_renewals_updated_at
  before update on public.recharge_renewals
  for each row execute function public.set_updated_at();
