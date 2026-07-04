# CLAUDE.md — Lillie & Lee Automated Inventory System

Context for Claude Code. Read this fully before scaffolding or writing code.

## What we're building

A real-time inventory + reorder system for Lillie & Lee (pet supplements/treats/CBD).
It tracks stock for 19 core SKUs, calculates how many days of stock remain, tells the
team exactly when to place each purchase order, and fires tiered alerts (email + Slack)
before anything stocks out. Lead times are long (up to 14 weeks), so early warning is the
whole point.

## Stack (use these exact versions)

- **App + dashboard**: Next.js (App Router, TypeScript) on Vercel — single app, not a separate backend.
- **Webhooks**: Next.js API routes (`/api/webhooks/shopify`).
- **Scheduled jobs**: Vercel Cron (ReCharge daily sync; projection recalc every 6h).
- **Database + Auth**: Supabase (Postgres). Use Supabase Auth (Google sign-in) for the dashboard.
- **Shopify**: Admin REST API + webhooks. **API version `2026-04`** (current stable — NOT the `2024-01` in the original spec). REST is fine for our endpoints; no need for GraphQL.
- **ReCharge**: REST API, pin header `X-Recharge-Version: 2021-11`. Use **cursor pagination** (page-based is deprecated).
- **Email**: Nodemailer over Gmail SMTP (App Password) for now; keep the dispatcher swappable to SendGrid/Resend later.
- **Slack**: Incoming Webhook, Block Kit messages to `#inventory`.

## Architecture note (deviation from spec)

The original spec proposed a separate Express/Fastify service. We deliberately consolidated
into Next.js + Vercel Cron because the load is tiny (19 SKUs) and one deployment is simpler.
Keep all business logic in `/lib` so it's framework-agnostic and easy to move if that changes.

## Proposed repo structure

```
lillie-lee-inventory/
  CLAUDE.md
  README.md
  .env.example
  /src
    /app                      # dashboard (App Router)
    /app/api
      /webhooks/shopify       # HMAC-verified webhook receiver
      /cron/recharge-sync     # daily, Vercel Cron
      /cron/projections       # every 6h, Vercel Cron
    /lib
      /shopify                # client, webhook verify, inventory + orders
      /recharge               # client, renewal sync
      /supabase               # typed client
      /calc                   # the four formulas (pure functions, unit-tested)
      /alerts                 # email + slack dispatchers, dedup logic
  /supabase/migrations        # SQL for the 5 tables + indexes + RLS
  /scripts
    seed-products.ts          # load the 19 SKUs
    backfill-orders.ts        # pull ~90 days of Shopify order history
```

## Core formulas (the heart of the system)

Implement these as pure, unit-tested functions in `/lib/calc`. Parameters come from the DB, not hardcoded.

1. **Daily Demand Rate**
   `DDR = ((units_sold_30d / 30) * growth_multiplier) + (upcoming_renewals_30d / 30)`
   `growth_multiplier = 1.08` (8% baseline). `upcoming_renewals_30d` from ReCharge.

2. **Days of Stock Remaining**
   `DSR = current_inventory / DDR`
   `current_inventory = shopify_units + tpl_units`

3. **Reorder Date**
   `reorder_date = today + DSR - lead_time_days - safety_stock_days`
   `safety_stock_days = 30`. A negative result = PO overdue = Critical.

4. **Demand Spike**
   `spike_pct = ((actual_7d_rate - projected_7d_rate) / projected_7d_rate) * 100`
   `projected_7d_rate = DDR * 7`. Alert when `spike_pct >= 15`.

Lead times by category (days): supplement_chews `98`, cbd `49`, treats `98`, salmon_oil `56`.

## Alert tiers

| Tier | Trigger | Channels |
|------|---------|----------|
| Yellow | DSR <= threshold (150 for chews/treats; 90 for CBD) | Email |
| Red | DSR <= 90 | Email + Slack |
| Critical | DSR <= 45 OR reorder date passed OR (spike >= 15% AND DSR <= red) | Email + Slack (all) |

**Spike escalation (policy).** A demand spike (`spike_pct >= 15`) escalates a SKU to
Critical **only when stock is also low** — i.e. `DSR <= deriveThresholds(...).red` for that
SKU. On a well-stocked SKU (DSR above red) a spike does **not** force Critical: the SKU
keeps its stock-based tier (ok/yellow/red) and the spike stays visible as the ▲% indicator
(and is still counted in the "Spiking" summary). Overdue-reorder and `DSR <= critical`
remain unconditional Criticals. Rationale: a transient demand bump on a SKU with months of
stock is not a stockout risk — flagging it Critical erodes trust in the label.

Dedup: don't re-fire the same SKU/tier unless DSR drops further or 24h pass. Check `alert_log.fired_at`.

## Database schema (5 tables, Supabase/Postgres)

All tables get `created_at` / `updated_at`.

- **products**: id (uuid pk), shopify_product_id (bigint unique), shopify_variant_id (bigint), `inventory_item_id` (bigint — ADD THIS; it's what webhooks key on), name, category, lead_time_days, safety_stock_days (default 30), active (bool).
- **inventory_snapshots**: id, product_id (fk), shopify_units, tpl_units (default 0), total_units (generated = shopify+tpl), source (`shopify_webhook|manual|tpl_sync`), snapshot_at.
- **projections** (written every 6h): id, product_id (fk), daily_demand_rate, days_of_stock_remaining, reorder_date, spike_pct, alert_level (`ok|yellow|red|critical`), calculated_at.
- **alert_log**: id, product_id (fk), alert_level, message, channels_sent (text[]), acknowledged_at (null), fired_at.
- **recharge_renewals**: id, product_id (fk), renewal_date, expected_units, synced_at.

Consider a small **settings/config** table (or per-category threshold columns) — see decision #3 below.

## Phase 1 scope (build this first — and ONLY this)

Goal: live Shopify inventory flowing into Supabase and visible on a basic dashboard.

- Supabase project + all 5 tables, indexes, RLS.
- Seed the 19 SKUs (`seed-products.ts`) from the source roadmap doc.
- Shopify Custom App + register webhooks: `inventory_levels/update`, `orders/create`, `orders/fulfilled`.
- Webhook handler: **verify HMAC**, parse, write to `inventory_snapshots`.
- Initial inventory backfill from the Shopify inventory API.
- Basic dashboard: table of 19 SKUs with current units + last-updated.

**Exit criteria**: a Shopify order updates the count in Supabase within ~60s and shows on the dashboard.

Do **not** build ReCharge, projections, spike detection, or alerts in Phase 1.

## Decisions already made

- Consolidated Next.js/Vercel architecture (above).
- Shopify `2026-04`, ReCharge `2021-11`.
- Google sign-in via Supabase Auth for the dashboard.

## Decisions PENDING (do not guess — leave a clear TODO and ask)

1. **DDR double-count**: `units_sold_30d` already includes subscription orders that renewed, and the formula adds upcoming renewals on top — overstates demand for high-sub SKUs. Preferred fix is to base the run-rate on *one-time* orders + renewal forecast. **Awaiting confirmation.**
2. **Flat vs compounding 8%**: applied flat today; over a 98-day lead time, compounding is arguably more accurate. **Awaiting confirmation.**
3. **Per-category thresholds**: spec narrative says thresholds vary by category but the config stores single global values. Recommended approach: store thresholds per category (or derive from `lead_time + safety_stock`). Note these gaps — **CBD only has Yellow (90) defined; its Red/Critical and ALL salmon_oil thresholds are unspecified.** Confirm before wiring alerts.

## Gotchas / conventions

- **Inventory is per-variant + per-location.** Webhooks key on `inventory_item_id`, not product id — store it on `products` and map back from it. Confirm which Shopify location(s) count as on-hand before backfill.
- **Never hard-delete a product row — deactivate with `active=false`.** Hard deletes cascade and wipe `alert_log` history, which Phase 4 requires retained.
- **Always verify the Shopify webhook HMAC** before processing.
- **Idempotency**: Shopify retries webhooks — dedupe on `X-Shopify-Webhook-Id` so you don't double-write snapshots.
- **Shopify rate limit**: REST is 2 req/s (40 burst, leaky bucket). Exponential backoff on 429.
- **ReCharge**: cursor pagination; processed charges older than 90 days are no longer returned (affects historical charge pulls, not future renewals).
- **Timezone**: do all date math (reorder dates, cron times, digest) in the business timezone — set `APP_TIMEZONE`, don't rely on UTC defaults.
- **Phase 1 caveat**: `tpl_units = 0` until 3PL data exists, so DSR will under-report if most stock sits at the 3PL. Keep external alerts gated/off until 3PL counts are flowing — otherwise they'll over-fire.
- **Secrets**: env only, never commit. Protect cron + webhook routes with a shared `CRON_SECRET` / verified signature.

## Environment variables (`.env.example`)

```
SHOPIFY_STORE_DOMAIN=
SHOPIFY_ADMIN_API_TOKEN=
SHOPIFY_API_VERSION=2026-04
SHOPIFY_WEBHOOK_SECRET=
RECHARGE_API_TOKEN=
RECHARGE_API_VERSION=2021-11
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SLACK_WEBHOOK_URL=
GMAIL_USER=
GMAIL_APP_PASSWORD=
ALERT_RECIPIENTS_YELLOW=
ALERT_RECIPIENTS_RED=
ALERT_RECIPIENTS_CRITICAL=
APP_TIMEZONE=
CRON_SECRET=
```
