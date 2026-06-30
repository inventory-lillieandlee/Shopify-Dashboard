-- Migration: phase_c_real_inventory
-- Phase C — support real Shopify inventory snapshots.
--
-- Applied to Supabase project iopmxrxmbusibazryxet via MCP apply_migration.
-- This file is the exact SQL applied, committed for version control / reproducibility.
--
-- Both changes are ADDITIVE and safe (existing rows unaffected):
--  1. shopify_units_raw: preserve the raw Shopify on_hand (incl. negatives) as signal.
--     The Shop location drifts negative when real stock is at the 3PL (Phase 3); the
--     displayed shopify_units = max(on_hand, 0), but the raw value is kept here.
--  2. widen the source CHECK to allow 'shopify' (a direct Admin API pull is not a
--     webhook, so 'shopify_webhook' would be inaccurate).

alter table public.inventory_snapshots add column if not exists shopify_units_raw integer;
comment on column public.inventory_snapshots.shopify_units_raw is
  'Raw Shopify on_hand at snapshot time, incl. negatives (Shop-location drifts negative when real stock is at the 3PL). shopify_units = max(this,0).';

alter table public.inventory_snapshots drop constraint inventory_snapshots_source_check;
alter table public.inventory_snapshots add constraint inventory_snapshots_source_check
  check (source in ('shopify_webhook','manual','tpl_sync','shopify'));
