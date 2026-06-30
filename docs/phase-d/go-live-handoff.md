# Phase D — Go-Live Handoff (SQL + env vars)

The dashboard now shows **real Shopify data** (real inventory + real demand-driven
projections). Auth is still **dormant** (public) and alerts are **not yet emailing**
(no recipients/Resend configured in prod). This doc has the exact SQL to run and env
vars to set to finish the go-live.

## Already done (by me, via the Supabase MCP — one shared project)
- Migrations applied: `sku_demand`, `alert_recipients` (committed in `supabase/migrations/`).
- Real data loaded from a live Shopify pull (6,097 orders): `sku_demand`, fresh
  `inventory_snapshots` (`source='shopify'`), recomputed `projections`.
- Tier distribution now: **ok=3, critical=16** (real — the Shop location is thin vs real
  sales velocity because stock is at the 3PL).

## What's automated once deployed
- **Daily** cron `/api/cron/demand-sync` → refresh real demand.
- **Every 6h** cron `/api/cron/recompute-and-alert` → refresh inventory, recompute, email alerts.

---

## SQL for you to run in Supabase (in order)

### 1. Seed the first alert recipient (so the first alert goes to YOU, not the client)
```sql
insert into public.alert_recipients (email, min_level, active)
values ('YOU@yourdomain.com', 'red', true)
on conflict (email) do update set active = true, min_level = excluded.min_level;
```
(After auth is on you can manage recipients in **Settings → Alerts** instead.)

### 2. Create the first admin (BEFORE turning auth on — lockout prevention)
First create the user in **Supabase → Authentication → Add user** (set a password), then:
```sql
update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"admin"}'::jsonb
where email = 'YOU@yourdomain.com';
```
Then **log in once** on the deployed site and confirm `/settings?tab=team` loads (not the
403 "admin sign-in required" state). Do NOT proceed until this works.

### 3. RLS cutover — run ONLY at the coordinated deploy (last step, with `AUTH_ENABLED=true`)
Run `supabase/migrations-pending/20260626000000_authenticated_rls.sql` (drops anon SELECT,
adds authenticated). ⚠️ Running it before the new code is deployed will break the live public
dashboard (anon reads dropped). The cron already reads via service-role, so it survives.

---

## Env vars to set in Vercel (Production)
| Var | Purpose | Notes |
|---|---|---|
| `SHOPIFY_STORE` | store domain | `…myshopify.com` |
| `SHOPIFY_API_KEY` | custom-app **client_id** | NEW — public id |
| `SHOPIFY_API_SECRET` | custom-app secret | server-only |
| `SHOPIFY_API_VERSION` | `2026-04` | |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | dashboard reads | |
| `SUPABASE_SERVICE_ROLE_KEY` | cron writes + post-RLS reads | server-only — required |
| `CRON_SECRET` | protects the cron routes | Vercel Cron sends it automatically |
| `RESEND_API_KEY` | email send | server-only |
| `ALERT_FROM_EMAIL` | sender | **must be on a Resend-verified domain** |
| `ALERT_TIMEZONE` | `America/New_York` | email date rendering |
| `ALERT_DASHBOARD_URL` | `https://<your-app>` | SKU links in emails |
| `AUTH_ENABLED` | `true` | **only at the cutover**, after steps 1–2 |

`ALERT_TO_EMAILS` / `ALERT_MIN_LEVEL` are **no longer used** (recipients live in the DB).

## Go-live order (recap)
1. Set all env vars above **except** `AUTH_ENABLED` (leave it off / unset for now).
2. Deploy `main`. Verify the public dashboard + that the crons run (check Vercel logs / hit
   `/api/cron/recompute-and-alert?dryRun=1` with the `CRON_SECRET` bearer).
3. Run SQL #1 (recipient) and #2 (admin); verify admin login on the deployed site.
4. Set `AUTH_ENABLED=true`, redeploy, run SQL #3 (RLS) — verify anon → `/login`, admin in,
   cron still recomputes.

## Still out of scope (disclosed)
ReCharge (no token → renewals 0), 3PL (no feed → 6 SKUs read 0; banner discloses this),
real-time webhooks (we poll inventory 6h), Slack alerts, acknowledge button, editable
thresholds, Phase 4 hardening. 2 moderate `@supabase/ssr` transitive vulns — see go-live-runbook.
