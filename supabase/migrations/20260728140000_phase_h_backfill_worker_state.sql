-- Phase H P2: persisted cursor + lease + attempt state for the resumable backfill worker.
-- All additive. Applied to prod via apply_migration (phase_h_backfill_worker_state).
alter table public.products
  add column if not exists history_cursor        text,          -- next month "YYYY-MM" or "__demand__"; NULL when idle
  add column if not exists history_target_month  text,          -- last month (inclusive), frozen at claim
  add column if not exists history_lease_until   timestamptz,   -- held during an in-flight tick; NULL between clean returns
  add column if not exists history_error         text,          -- last failure message when status='failed'
  add column if not exists history_attempts      integer not null default 0,   -- transient-retry counter
  add column if not exists history_auto_activate boolean not null default true; -- set active=true on ready? (verification passes false)
