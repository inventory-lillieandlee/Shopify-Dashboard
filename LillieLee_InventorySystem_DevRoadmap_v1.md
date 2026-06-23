# Lillie & Lee — Automated Inventory Management System
**Developer Roadmap & Technical Specification · v1.0 · 2026 · Internal / Confidential**

> **Maintainer's note (not part of the original spec — overrides where they conflict, see CLAUDE.md):**
> 1. Shopify Admin API version is **2026-04** (the doc's `2024-01` is out of date).
> 2. ReCharge requests must send the header **`X-Recharge-Version: 2021-11`** ("v1" in the doc maps to the 2021-01 base version).
> 3. **Phase 1 counts Shopify units ONLY.** The 3PL is not integrated until Phase 3. Never fold `tpl_units` into demand math in Phase 1, and never double-count 3PL stock.
> CLAUDE.md is the authoritative source for engineering decisions.

At a glance: **19** core SKUs · **3** alert tiers · **4** build phases · **5** data pipelines.

---

## 1. System Overview

Tracks real-time inventory across 19 core SKUs, generates reorder recommendations based on sell-through rate and supplier lead times, and delivers multi-tier alerts when stock levels or demand patterns deviate from defined thresholds.

### 1.1 System Objectives

| # | Objective | Description |
|---|---|---|
| 1 | Inventory Tracking | Real-time stock levels synced from Shopify and 3PL fulfillment center across all 19 core SKUs |
| 2 | Low Stock Alerts | Automated email and Slack notifications triggered when inventory crosses defined threshold levels |
| 3 | Reorder Timing Engine | Calculates when to place the next PO per SKU based on current inventory, daily sell-through rate, lead time, and safety stock buffer |
| 4 | Demand Spike Alerts | Detects and notifies when sell-through rate exceeds the 15% monthly growth threshold over a rolling 7-day window |

### 1.2 Scope — Core SKUs (19 Products)

Initial build covers these 19 SKUs across three categories. All other SKUs (digital, apparel, accessories, bundles) are excluded from Phase 1.

| # | Product Name | Category | Shopify Product ID | Lead Time |
|---|---|---|---|---|
| 1 | Hip & Joint Chews — Flex + Relief | Supplement Chews | 7706691436753 | 14 weeks |
| 2 | Allergy Chews — Soothe + Shield | Supplement Chews | 7706691731665 | 14 weeks |
| 3 | Multi-Vitamin Chews — Energy + Defense | Supplement Chews | 7706691371217 | 14 weeks |
| 4 | Probiotic Digestive Chews — Flora + Flourish | Supplement Chews | 7706691272913 | 14 weeks |
| 5 | Skin & Coat Chews — Luster + Nourish | Supplement Chews | 7706691207377 | 14 weeks |
| 6 | Activ-Multi-V — Energy + Defense | Supplement Chews | 7706692649169 | 14 weeks |
| 7 | 1000mg CBD Oil — Calm + Comfort | CBD | 7706692026577 | 7 weeks |
| 8 | 750mg CBD Oil — Calm + Comfort | CBD | 7706691961041 | 7 weeks |
| 9 | 250mg CBD Oil — Calm + Comfort | CBD | 7706691993809 | 7 weeks |
| 10 | CBD Soft Chews — Calm + Comfort | CBD | 7706692157649 | 7 weeks |
| 11 | 500mg CBD Balm — Relief + Restore | CBD | 7706690846929 | 7 weeks |
| 12 | Beef Heart Treats — Strength + Health | Treats | 7706691698897 | 14 weeks |
| 13 | Beef Liver Treats — Protein + Power | Treats | 7706691666129 | 14 weeks |
| 14 | Beef Tendon Chews — Dental + Joint | Treats | 7706692092113 | 14 weeks |
| 15 | Beef Trachea Chews — Dental + Joint | Treats | 7706692387025 | 14 weeks |
| 16 | Chicken Breast Treats — Lean + Protein | Treats | 7706691567825 | 14 weeks |
| 17 | Chicken Liver Treats — Glow + Strength | Treats | 7706691502289 | 14 weeks |
| 18 | Sweet Potato Treats — Nourish + Glow | Treats | 7706692190417 | 14 weeks |
| 19 | Wild Alaskan Salmon & Pollock Oil — Brain + Heart | Treats / Oil | 7706690945233 | 8 weeks |

**Category → lead-time mapping (in days, for seeding):**
- Supplement Chews → `supplement_chews` → **98 days**
- CBD → `cbd` → **49 days**
- Treats → `treats` → **98 days**
- Wild Alaskan Salmon & Pollock Oil → `salmon_oil` → **56 days**

---

## 2. Core Projection Formulas

All parameters are stored in the database and configurable without a code deploy. Confirmed inputs: 8% baseline monthly growth, 15% spike threshold, 30-day safety stock floor.

### 2.1 Daily Demand Rate (Formula 1)

```
DDR = ((30d_units_sold / 30) × growth_multiplier) + (upcoming_renewals_30d / 30)
```
- `growth_multiplier` = 1.08 (8% baseline MoM)
- `upcoming_renewals_30d` pulled from the ReCharge API (renewal dates are known in advance)

### 2.2 Days of Stock Remaining (Formula 2)

```
DSR = current_inventory / DDR
```
- `current_inventory` = Shopify units + 3PL units (3PL added in Phase 3). **Phase 1: Shopify only.**

### 2.3 Reorder Date (Formula 3)

```
Reorder Date = Today + DSR - lead_time_days - safety_stock_days
```
- `safety_stock_days` = 30
- `lead_time_days`: Supplement Chews 98, CBD 49, Treats 98, Salmon Oil 56
- A negative result means the PO is already overdue → Critical alert.

**Worked example (Hip & Joint Chews):** inventory 800, DDR 12/day → DSR 66. `66 - 98 - 30 = -62` → CRITICAL, PO overdue.

### 2.4 Demand Spike Detection (Formula 4)

```
Spike % = ((actual_7d_rate - projected_7d_rate) / projected_7d_rate) × 100
Alert fires when Spike % >= 15%
```
- `projected_7d_rate` = DDR × 7
- `actual_7d_rate` = units sold in the last 7 days

---

## 3. Alert Threshold Logic

| Tier | Trigger (DSR) | Severity | Channels | Required Action |
|---|---|---|---|---|
| YELLOW | DSR <= 150 days | Plan Ahead | Email (ops) | Review reorder date; begin PO prep for chews/treats. No urgency for CBD. |
| RED | DSR <= 90 days | Act Now | Email + Slack #inventory | PO within 48h; escalate to owner if unacknowledged. |
| CRITICAL | DSR <= 45 days OR reorder date passed OR spike >= 15% | Immediate | Email + Slack (all) | Stockout risk within lead-time window; evaluate expedited shipping; consider pausing ad spend. |

**Threshold rationale:** chews & treats have 98-day lead times, so a PO must be placed at ~128+ days of stock to avoid breaching the safety floor; the 150-day Yellow gives a 22-day buffer. CBD (49-day lead) is fine at a 90-day Yellow. *Thresholds apply per category* — see CLAUDE.md for how this is implemented (derive from lead_time + safety_stock rather than hardcoding global values).

### 3.1 Alert Notification Format

Each alert (email + Slack) includes: SKU Name, Alert Level (color-coded), Current Inventory, Days of Stock Remaining, Daily Demand Rate, Reorder Date (or OVERDUE), Lead Time, Spike Indicator (shown if >10%), Dashboard Link.

---

## 4. Technical Architecture

Event-driven: Shopify webhooks push data in real time; a daily cron syncs ReCharge renewals; a 6-hour cron runs projections and alert checks.

### 4.1 Stack

| Layer | Technology | Purpose |
|---|---|---|
| Backend / API | Node.js (Express or Fastify) | Webhook receiver, cron jobs, alert dispatcher |
| Database | Supabase (Postgres) | Inventory snapshots, sales history, projections, alert log |
| Dashboard | Vercel (Next.js) | Real-time inventory, alert history, reorder queue |
| Shopify | Admin REST API + Webhooks (API 2026-04) | Inventory levels, orders, product catalog |
| ReCharge | REST API (header X-Recharge-Version: 2021-11) | Active subscriptions, upcoming renewal dates per SKU |
| 3PL | TBD — API or flat file (Phase 3) | Physical warehouse stock to merge with Shopify |
| Alerting | Nodemailer (email) + Slack Webhooks | Multi-tier alert delivery |
| Scheduler | node-cron or Supabase Edge Functions | Scheduled syncs and projection recalculation |

### 4.2 Data Flow

**Pipeline 1 — Shopify real-time (webhooks):** subscribe to `inventory_levels/update`, `orders/create`, `orders/fulfilled`; on receipt, write an inventory snapshot to Supabase, update 30/60/90-day rolling sales arrays, recalculate DDR/DSR for the affected SKU.

**Pipeline 2 — ReCharge daily sync (cron):** daily at 06:00, pull active subscriptions and next renewal dates per SKU; store in Supabase (`sku_id, renewal_date, quantity, subscriber_count`); recalculate DDR for all 19 SKUs.

**Pipeline 3 — 3PL (Phase 3):** Phase 1–2 = manual CSV import (weekly); Phase 3 = automated API/SFTP. `total_inventory = shopify_units + tpl_units`.

### 4.3 Database Schema (Supabase / Postgres)

Five core tables. **All tables include `created_at` and `updated_at` timestamps.**

**Table 1 — `products`**

| Column | Type | Description |
|---|---|---|
| id | UUID PK | Internal product ID |
| shopify_product_id | BIGINT UNIQUE | Matches webhook payloads |
| shopify_variant_id | BIGINT | Variant-level inventory tracking |
| name | TEXT | Full product name |
| category | TEXT | supplement_chews / cbd / treats / salmon_oil |
| lead_time_days | INTEGER | Supplier lead time (98, 49, or 56) |
| safety_stock_days | INTEGER DEFAULT 30 | Minimum days of stock to maintain |
| active | BOOLEAN DEFAULT true | Toggle tracking per SKU |

**Table 2 — `inventory_snapshots`**

| Column | Type | Description |
|---|---|---|
| id | UUID PK | Snapshot ID |
| product_id | UUID FK → products.id | |
| shopify_units | INTEGER | Units in Shopify at snapshot time |
| tpl_units | INTEGER DEFAULT 0 | Units at 3PL (manual or synced) |
| total_units | INTEGER GENERATED | shopify_units + tpl_units |
| source | TEXT | shopify_webhook / manual / tpl_sync |
| snapshot_at | TIMESTAMPTZ | Exact time of snapshot |

**Table 3 — `projections`** (calculated every 6 hours)

| Column | Type | Description |
|---|---|---|
| id | UUID PK | Projection record ID |
| product_id | UUID FK → products.id | |
| daily_demand_rate | DECIMAL(10,4) | DDR in units/day |
| days_of_stock_remaining | DECIMAL(10,2) | DSR |
| reorder_date | DATE | Calculated PO placement date |
| spike_pct | DECIMAL(10,2) | 7-day actual vs projected (positive = above plan) |
| alert_level | TEXT | ok / yellow / red / critical |
| calculated_at | TIMESTAMPTZ | Timestamp of this projection run |

**Table 4 — `alert_log`**

| Column | Type | Description |
|---|---|---|
| id | UUID PK | Alert record ID |
| product_id | UUID FK → products.id | Affected SKU |
| alert_level | TEXT | yellow / red / critical / spike |
| message | TEXT | Full alert message body |
| channels_sent | TEXT[] | Channels the alert was dispatched to |
| acknowledged_at | TIMESTAMPTZ NULL | Set when ops marks the alert actioned |
| fired_at | TIMESTAMPTZ | Timestamp alert was dispatched |

**Table 5 — `recharge_renewals`**

| Column | Type | Description |
|---|---|---|
| id | UUID PK | Renewal record ID |
| product_id | UUID FK → products.id | |
| renewal_date | DATE | Scheduled renewal date from ReCharge |
| expected_units | INTEGER | Units expected to ship on this date |
| synced_at | TIMESTAMPTZ | When pulled from ReCharge API |

---

## 5. API Integration Specifications

### 5.1 Shopify Admin API
- **Auth:** Custom App — Admin API access token in Supabase env secrets.
- **API version:** **2026-04** (overrides the doc's 2024-01).
- **Inventory:** `GET /admin/api/2026-04/inventory_levels.json?inventory_item_ids={ids}`
- **Orders:** `GET /admin/api/2026-04/orders.json?status=any&created_at_min={date}&limit=250`
- **Webhooks:** `inventory_levels/update`, `orders/create`, `orders/fulfilled`
- **Scopes:** `read_inventory`, `read_orders`, `read_products`
- **Rate limits:** REST 2 req/s (40 burst); exponential backoff on 429.

### 5.2 ReCharge API
- **Auth:** `X-Recharge-Access-Token` header. **Also send `X-Recharge-Version: 2021-11`.**
- **Subscriptions:** `GET /subscriptions?status=active&limit=250` (cursor pagination).
- **Upcoming renewals:** `GET /orders?status=queued&scheduled_at_min={today}&scheduled_at_max={+30d}`
- **Key fields:** `shopify_product_id`, `shopify_variant_id`, `next_charge_scheduled_at`, `quantity` (map via `shopify_variant_id`).
- **Sync:** daily 06:00 — truncate & reload `recharge_renewals` for next 30 days.
- **Note:** processed charges older than 90 days are no longer returned by the API (affects historical backfill, not future renewals).

### 5.3 Alert Dispatchers
- **Email:** Nodemailer + SMTP (Gmail/SendGrid), color-coded HTML template, one email per SKU per escalation (suppressed if same alert active).
- **Slack:** Incoming Webhook to #inventory, Block Kit message with severity badge; pin critical alerts.
- **Dedup:** don't re-fire same SKU at same tier unless DSR drops further or 24h passed (check `alert_log.fired_at`).

---

## 6. Phased Development Roadmap

~10 weeks to full production. Each phase ships a usable system — no big-bang launch.

**Phase 1 — Foundation & Shopify Integration.** Supabase project + 5 tables (schema, indexes, RLS); Node.js server scaffold; Shopify webhook registration + HMAC-validated handler → `inventory_snapshots`; products seed script (19 SKUs); initial inventory backfill; basic Vercel dashboard (table of 19 SKUs, current units, last-updated); staging tested end-to-end.
*Exit:* a Shopify order updates Supabase within 60s and shows in the dashboard.

**Phase 2 — Projection Engine & Alerts.** ReCharge daily sync; DDR / DSR / reorder-date / spike services (Formulas 1–4); alert threshold engine with dedup; email + Slack dispatchers; dashboard adds DSR / reorder date / alert badge / spike columns; 6-hour projection cron.
*Exit:* seeded low-stock SKU fires Yellow→Red→Critical in sequence to email + Slack; reorder date correct; spike fires at 20% above baseline.

**Phase 3 — 3PL Integration & Dashboard Polish.** 3PL connector (API/SFTP or manual CSV UI); `total_units` merge drives calculations; reorder-queue view; alert history with acknowledge button; SKU detail page (30/60/90-day trend, DDR history); settings page (edit safety stock, lead times, thresholds, growth rate per SKU, no deploy); daily 08:00 digest email.
*Exit:* ops can enter 3PL counts, see combined inventory, acknowledge alerts, and adjust lead times/thresholds without a developer.

**Phase 4 — Hardening, Monitoring & SKU Expansion.** Webhook idempotency; Shopify backoff + queue; ReCharge sync error handling + health alert; PgBouncer pooling; system-health dashboard panel; data retention (archive snapshots >12 months); SKU-expansion admin UI; ops runbook.

---

## 7. Open Items & Configuration

### 7.1 Open Items — required before Phase 3
1. Confirm 3PL provider (API vs flat-file).
2. Recipient email addresses for Yellow / Red / Critical tiers.
3. Slack workspace + confirm #inventory channel.
4. Confirm Shopify store handle + whether a Custom App exists.
5. Confirm ReCharge plan (Pro/Custom) for API scope.

### 7.2 Configuration Parameters (editable post-launch, no deploy)

| Parameter | Initial Value | Location |
|---|---|---|
| Safety stock (days) | 30 | Settings > Global |
| Baseline growth rate | 8% MoM | Settings > Projections |
| Spike alert threshold | 15% above projection | Settings > Alerts |
| Yellow alert threshold | 150 days DSR | Settings > Alerts |
| Red alert threshold | 90 days DSR | Settings > Alerts |
| Critical alert threshold | 45 days DSR | Settings > Alerts |
| Lead time — Supplement Chews | 98 days | Settings > Products |
| Lead time — CBD | 49 days | Settings > Products |
| Lead time — Treats | 98 days | Settings > Products |
| Lead time — Salmon Oil | 56 days | Settings > Products |
| Projection recalculation frequency | Every 6 hours | Cron (dev change) |
| ReCharge sync time | Daily 06:00 | Cron (dev change) |
