-- ============================================================================
-- seed-dummy.sql  —  DEMO DATA, NOT LIVE INVENTORY
-- ============================================================================
-- Populates the real Phase 1 tables (products, inventory_snapshots, projections)
-- with illustrative values so the dashboard shell renders every state. The UI
-- reads these tables LIVE via the data-access module; when the real Shopify
-- pipeline lands it writes to these same tables and the UI does not change.
--
--   * 19 real SKUs (roadmap §1.2) with real names / shopify_product_id.
--   * shopify_variant_id and inventory_item_id are LEFT NULL on purpose —
--     real values arrive with the Shopify token. The products upsert below
--     deliberately does NOT touch those two columns, so the real pipeline can
--     set them and re-running this demo will not wipe them.
--   * alert_level is spread across all §3 tiers: 3 critical (2 overdue reorder
--     date + 1 spike>=15%), 3 red, 4 yellow, 9 ok.
--   * Reorder dates are relative to CURRENT_DATE so the demo stays fresh.
--   * Idempotent: products upsert on shopify_product_id; the demo snapshot +
--     projection rows for these 19 SKUs are cleared and re-inserted. Safe to re-run.
--
-- To remove ALL demo data (Phase 1, demo-only tables):
--   delete from public.inventory_snapshots where source = 'manual';
--   delete from public.projections;
--   -- (products can stay; they are the real catalog)
-- ============================================================================

-- One row per SKU carrying both catalog fields and demo metrics.
drop table if exists _ll_demo;
create temporary table _ll_demo (
  shopify_product_id bigint primary key,
  name               text,
  category           text,
  lead_time_days     integer,
  shopify_units      integer,
  ddr                numeric(10,4),  -- daily_demand_rate (units/day)
  dsr                numeric(10,2),  -- days_of_stock_remaining
  spike_pct          numeric(10,2),
  alert_level        text,
  reorder_offset     integer,        -- days from CURRENT_DATE (negative = overdue)
  snap_mins_ago      integer
);

-- !!  DEMO inventory levels tuned for tier-spread demonstration — NOT real data;
--     overwritten by Shopify ingestion (Phase C). The shopify_units below were
--     chosen against the Phase A deriveThresholds cutoffs (R = lead + safety;
--     yellow = R + round(0.22*lead); red = R + round(0.10*lead)) so the engine's
--     recompute lands a legible spread (~3 critical / 3 red / 3 yellow / 10 ok)
--     instead of a wall of critical-by-overdue. Hip & Joint is kept critical-by-
--     overdue (the roadmap worked example); 250mg CBD is kept critical-by-spike
--     (its inventory is untouched — the 22% spike stays the driver).
insert into _ll_demo
  (shopify_product_id, name, category, lead_time_days, shopify_units, ddr, dsr, spike_pct, alert_level, reorder_offset, snap_mins_ago)
values
  -- Supplement Chews (lead 98)
  (7706691436753, 'Hip & Joint Chews — Flex + Relief',            'supplement_chews', 98,  378, 13.5,  28,  6, 'critical', -35, 14),
  (7706691731665, 'Allergy Chews — Soothe + Shield',             'supplement_chews', 98,  910,  7.0, 130, 11, 'red',        2, 18),
  (7706691371217, 'Multi-Vitamin Chews — Energy + Defense',      'supplement_chews', 98,  864,  6.0, 144, 12, 'yellow',    16, 50),
  (7706691272913, 'Probiotic Digestive Chews — Flora + Flourish','supplement_chews', 98, 1260,  6.0, 210,  1, 'ok',        60, 70),
  (7706691207377, 'Skin & Coat Chews — Luster + Nourish',        'supplement_chews', 98,  730,  5.0, 146,  2, 'yellow',    18, 65),
  (7706692649169, 'Activ-Multi-V — Energy + Defense',            'supplement_chews', 98, 1095,  3.0, 365,  0, 'ok',       120, 80),
  -- CBD (lead 49)
  (7706692026577, '1000mg CBD Oil — Calm + Comfort',             'cbd',              49,  770,  7.0, 110,  5, 'ok',        31,  9),
  (7706691961041, '750mg CBD Oil — Calm + Comfort',              'cbd',              49, 1080,  6.0, 180,  2, 'ok',        50, 15),
  (7706691993809, '250mg CBD Oil — Calm + Comfort',              'cbd',              49,  720,  6.0, 120, 22, 'critical',  41, 21),
  (7706692157649, 'CBD Soft Chews — Calm + Comfort',             'cbd',              49,  328,  4.0,  82,  8, 'red',        3, 27),
  (7706690846929, '500mg CBD Balm — Relief + Restore',           'cbd',              49,  480,  2.0, 240,  1, 'ok',        90, 45),
  -- Treats (lead 98)
  (7706691698897, 'Beef Heart Treats — Strength + Health',       'treats',           98, 1400,  8.0, 175, 13, 'ok',        40, 22),
  (7706691666129, 'Beef Liver Treats — Protein + Power',         'treats',           98,  675,  5.0, 135,  4, 'red',        7, 40),
  (7706692092113, 'Beef Tendon Chews — Dental + Joint',          'treats',           98,  377,  9.2,  41,  9, 'critical', -12, 33),
  (7706692387025, 'Beef Trachea Chews — Dental + Joint',         'treats',           98,  580,  4.0, 145,  3, 'yellow',    18, 12),
  (7706691567825, 'Chicken Breast Treats — Lean + Protein',      'treats',           98, 1400,  7.0, 200,  4, 'ok',        55, 33),
  (7706691502289, 'Chicken Liver Treats — Glow + Strength',      'treats',           98, 1280,  4.0, 320,  0, 'ok',       100, 60),
  (7706692190417, 'Sweet Potato Treats — Nourish + Glow',        'treats',           98, 1300,  5.0, 260,  6, 'ok',        80, 28),
  -- Salmon Oil (lead 56)
  (7706690945233, 'Wild Alaskan Salmon & Pollock Oil — Brain + Heart', 'salmon_oil', 56, 1710,  9.0, 190,  7, 'ok',        70, 19);

-- 1) Products — upsert the 19 SKUs. variant/inventory_item_id intentionally untouched.
insert into public.products
  (shopify_product_id, name, category, lead_time_days, safety_stock_days, active)
select shopify_product_id, name, category, lead_time_days, 30, true
from _ll_demo
on conflict (shopify_product_id) do update
  set name              = excluded.name,
      category          = excluded.category,
      lead_time_days    = excluded.lead_time_days,
      safety_stock_days = excluded.safety_stock_days,
      active            = excluded.active;

-- 2) One current inventory snapshot per SKU (source='manual', recent).
delete from public.inventory_snapshots
where source = 'manual'
  and product_id in (select id from public.products
                     where shopify_product_id in (select shopify_product_id from _ll_demo));

insert into public.inventory_snapshots (product_id, shopify_units, source, snapshot_at)
select p.id, d.shopify_units, 'manual', now() - make_interval(mins => d.snap_mins_ago)
from public.products p
join _ll_demo d using (shopify_product_id);

-- 3) One projection per SKU (dummy DDR/DSR/reorder/spike/alert).
delete from public.projections
where product_id in (select id from public.products
                     where shopify_product_id in (select shopify_product_id from _ll_demo));

insert into public.projections
  (product_id, daily_demand_rate, days_of_stock_remaining, reorder_date, spike_pct, alert_level, calculated_at)
select p.id, d.ddr, d.dsr, current_date + d.reorder_offset, d.spike_pct, d.alert_level, now()
from public.products p
join _ll_demo d using (shopify_product_id);

drop table _ll_demo;
