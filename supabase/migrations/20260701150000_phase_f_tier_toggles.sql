-- Migration: phase_f_tier_toggles
-- Applied to Supabase project iopmxrxmbusibazryxet via MCP apply_migration.
-- Per-(category, tier) alert mute. Additive; default true (alerts on, unchanged
-- behavior). When a flag is false, the cron suppresses EMAILS for SKUs in that
-- category at that tier (the dashboard still classifies/shows the tier).
alter table public.category_thresholds
  add column if not exists yellow_enabled   boolean not null default true,
  add column if not exists red_enabled      boolean not null default true,
  add column if not exists critical_enabled boolean not null default true;
