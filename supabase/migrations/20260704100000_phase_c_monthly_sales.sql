-- Migration: phase_c_monthly_sales
-- Applied to Supabase project iopmxrxmbusibazryxet via MCP apply_migration.
-- Per-SKU monthly sales history (net of refunds, cancelled orders excluded) for the
-- sales chart + a durable base for real demand. One row per (product, month).
create table if not exists public.monthly_sales (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  month date not null,               -- first day of the calendar month (UTC)
  units_sold integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, month)
);
create index if not exists idx_monthly_sales_product on public.monthly_sales(product_id);

alter table public.monthly_sales enable row level security;
create policy "service_role full access on monthly_sales" on public.monthly_sales for all to service_role using (true) with check (true);
create policy "authenticated read monthly_sales" on public.monthly_sales for select to authenticated using (true);
create policy "anon read monthly_sales (DEMO ONLY)" on public.monthly_sales for select to anon using (true);