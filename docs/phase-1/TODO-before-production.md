# Phase 1 — TODO before production

Hard gates that must be resolved **before real Shopify inventory data lands**.
Demo-grade shortcuts are tracked here so they can't be forgotten.

## Security

- [ ] **Replace anon SELECT policies with authenticated-only access** (Supabase Auth / Google sign-in) **before real Shopify data lands.**
  - The `phase1_rls_policies` migration grants `anon` SELECT on all 5 tables
    (`products`, `inventory_snapshots`, `projections`, `alert_log`, `recharge_renewals`)
    so the demo dashboard can read with the public anon/publishable key.
    **Real inventory is not public.**
  - Action: replace each `anon read … (DEMO ONLY)` policy with `to authenticated`
    (e.g. `using (auth.role() = 'authenticated')`) and drop the anon read policies.
  - **Depends on:** dashboard auth decision (who logs in).
