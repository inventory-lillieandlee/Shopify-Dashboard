-- Phase H — product picker: catalog table + product lifecycle columns.
-- All additive / non-destructive. The existing 19 products are untouched except the
-- new columns backfill to their safe defaults (history_status='ready', provisional=false).

-- 1) shopify_catalog — UPSERT-LATEST snapshot of the Shopify product/variant list
--    (NOT append-only; keyed on variant_id). Feeds the add-product dropdown.
create table if not exists public.shopify_catalog (
  variant_id          bigint primary key,
  shopify_product_id  bigint  not null,
  inventory_item_id   bigint,
  title               text    not null,
  sku                 text,
  variant_title       text,
  status              text,
  variant_count       integer not null default 1,
  synced_at           timestamptz not null default now(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists shopify_catalog_product_idx on public.shopify_catalog (shopify_product_id);
alter table public.shopify_catalog enable row level security;
-- demo-grade RLS: anon SELECT (dropdown reads), service_role full. No anon-write policy.
drop policy if exists shopify_catalog_anon_read on public.shopify_catalog;
create policy shopify_catalog_anon_read on public.shopify_catalog for select to anon using (true);

-- 2) products lifecycle columns.
alter table public.products
  add column if not exists history_status text not null default 'ready'
    check (history_status in ('pending','building','ready','failed')),
  add column if not exists lead_time_provisional boolean not null default false;
comment on column public.products.history_status is
  'Backfill lifecycle for a newly added product: pending -> building -> ready (or failed). '
  'The engine (readRecomputeInputs) only projects ready rows; the UI suppresses chart + tier until ready. '
  'Existing products are ready.';
comment on column public.products.lead_time_provisional is
  'true when lead_time_days came from a category DEFAULT at add-time and has not been confirmed '
  'by an operator. Read by the UI (badge) AND the alert dispatch path (annotation). Cleared when '
  'an admin confirms the lead time. products.lead_time_days remains the single authoritative value.';

-- 3) alert_log marker for provisional-lead-time alerts. Separate boolean so we never
--    overload alert_level (which has a CHECK) or the free-text message.
alter table public.alert_log
  add column if not exists lead_time_provisional boolean not null default false;

-- 4) category_thresholds: add-time DEFAULT lead/safety per category. These are read
--    ONLY when adding a new product (to seed products.lead_time_days/safety_stock_days).
--    They are NEVER read by the engine for an existing product — the engine uses the
--    per-SKU products.* values (authoritative). Seeded from the current uniform
--    per-category values on products (verified: exactly one (lead,safety) pair/category).
alter table public.category_thresholds
  add column if not exists lead_time_days   integer,
  add column if not exists safety_stock_days integer not null default 30;
comment on column public.category_thresholds.lead_time_days is
  'DEFAULT lead time for NEWLY ADDED products of this category (product picker seeds it, '
  'flagged provisional). NOT authoritative and NEVER read for an existing product — '
  'products.lead_time_days is the source of truth.';
comment on column public.category_thresholds.safety_stock_days is
  'DEFAULT safety stock for newly added products of this category. See lead_time_days.';
update public.category_thresholds set lead_time_days = 49, safety_stock_days = 30 where category = 'cbd';
update public.category_thresholds set lead_time_days = 56, safety_stock_days = 30 where category = 'salmon_oil';
update public.category_thresholds set lead_time_days = 98, safety_stock_days = 30 where category = 'supplement_chews';
update public.category_thresholds set lead_time_days = 98, safety_stock_days = 30 where category = 'treats';
