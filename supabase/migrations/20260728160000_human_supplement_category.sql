-- Add the 'human_supplement' product category. Purely ADDITIVE — no drop/rename of data.
--
-- The store carries human CBD/supplement SKUs (titled "… - for People") alongside the pet
-- line; this widens the category domain so they can be tracked like any other category.
--
-- TWO CHECK constraints pin the category domain (products AND category_thresholds); both must
-- be widened (drop + re-add) or the inserts below / future products would be rejected. There
-- is no FK — the CHECK is the gate.

-- 1. widen products.category domain
alter table products drop constraint products_category_check;
alter table products add constraint products_category_check
  check (category = any (array['supplement_chews', 'cbd', 'treats', 'salmon_oil', 'human_supplement']));

-- 2. widen category_thresholds.category domain
alter table category_thresholds drop constraint category_thresholds_category_check;
alter table category_thresholds add constraint category_thresholds_category_check
  check (category = any (array['supplement_chews', 'cbd', 'treats', 'salmon_oil', 'human_supplement']));

-- 3. seed the threshold row. Tier days are deriveThresholds(98, 30) => yellow 150 / red 138 /
--    critical 30 — identical to supplement_chews & treats, and to the engine's own fallback
--    when a category_thresholds row is absent (so DB and code agree). All tiers email-enabled,
--    matching the other four categories.
--    LEAD TIME UNCONFIRMED: 98 days / 30 safety is the conservative default and the modal value
--    in the existing data. Confirm the real human-supplement lead time with the client and
--    update lead_time_days (and re-derive the tier days) if it differs.
insert into category_thresholds
  (category, lead_time_days, safety_stock_days, yellow_days, red_days, critical_days,
   yellow_enabled, red_enabled, critical_enabled)
values
  ('human_supplement', 98, 30, 150, 138, 30, true, true, true);
