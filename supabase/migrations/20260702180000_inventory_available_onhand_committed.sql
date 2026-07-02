-- Migration: inventory_available_onhand_committed
-- Applied to Supabase project iopmxrxmbusibazryxet via MCP apply_migration.
-- The dashboard now stores Shopify `available` as the displayed value (unclamped,
-- negatives kept). Keep on_hand + committed alongside for reference. Additive/nullable;
-- the next refresh populates them.
alter table public.inventory_snapshots
  add column if not exists shopify_on_hand   integer,
  add column if not exists shopify_committed integer;