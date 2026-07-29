-- Allow products with no category (e.g. merchandise: tote bags, water bottles, pet wash) to be
-- tracked as inventory-only stock lines. Applied to prod via MCP; committed here for repro.
--
-- The category CHECK already tolerates NULL (a CHECK passes on NULL), so only the NOT NULL is
-- dropped. The projection engine (readRecomputeInputs) filters out NULL-category rows, so an
-- uncategorized product shows its stock + last-updated on the dashboard but a BLANK category,
-- alert tier, and reorder date — no invented lead time. inventory_item_id stays UNIQUE.
alter table products alter column category drop not null;
