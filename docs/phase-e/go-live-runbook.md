# Phase E — Auth Go-Live Runbook

Phase E shipped invite-only auth **dormant**: production is public and works exactly as
before until you complete the ordered flip below. Nothing here happens automatically.

**Do the steps IN ORDER.** Two of them, if skipped or reordered, cause silent or total
failure — they're flagged ⚠️.

---

## Pre-flip configuration (no user-visible change yet)

1. **Supabase SMTP → Resend.** In Supabase → Auth → Emails, set the custom SMTP to your
   Resend account (only after your sending domain is verified in Resend). Without this,
   invite/magic-link emails won't send.

2. **Disable public signups.** Supabase → Auth → Providers/Settings → turn OFF "Allow new
   users to sign up." This is what makes it *invite-only* — otherwise anyone can self-register.

3. **Invite email template (PKCE / token_hash).** Supabase → Auth → Email Templates → *Invite
   user*. Set the action link to the server confirm route (NOT the default hash-fragment link):

   ```
   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite&redirect_to=/set-password
   ```

   Do the same for the *Magic Link* template if used (`type=magiclink`). Our
   `/auth/confirm` route verifies `token_hash` server-side (`verifyOtp`) and sets the session
   cookie — this is the PKCE fix; the default client `#access_token` flow will not work here.

4. **⚠️ Create AND VERIFY the first admin BEFORE enabling auth.** There is no self-signup and
   no admin yet, so if you enable auth first you lock everyone out of a gated dashboard with
   no way to invite anyone — a full production lockout.
   - Create the user (Supabase → Auth → Users → Add user, or invite yourself).
   - Set the admin role in **app_metadata** (NOT user_metadata — user_metadata is user-editable
     and is deliberately ignored by `isAdmin`). Via SQL or the Admin API, e.g.:
     ```
     -- run with service-role / SQL editor
     update auth.users
       set raw_app_meta_data = raw_app_meta_data || '{"role":"admin"}'
       where email = 'you@yourdomain.com';
     ```
   - **Log in successfully as that admin at least once** (locally against prod, or on a preview)
     and confirm `/settings?tab=team` loads the member list (not the 403 "admin sign-in
     required" state). **Do NOT proceed to step 6 until this login works.**

5. **⚠️ Switch the cron's reads to the service-role client — BEFORE applying the RLS migration.**
   The 6h cron (`/api/cron/recompute-and-alert`) currently reads via the **anon** client
   (`createSupabaseServerClient` for alert_log + recompute inputs; `getInventoryRows`, which is
   anon when there's no session). The cron has **no user session**. The moment the pending RLS
   drops anon SELECT, those reads return **zero rows** — so projections stop being written and
   **no alerts fire, while everything looks healthy** (empty reads, no errors). This is a hard
   ordering dependency:
   - Change the cron's read path to use `createSupabaseAdminClient()` (service-role) for
     `readRecomputeInputs`, the `alert_log` dedup read, and the rows it dispatches on
     (i.e. don't rely on the anon `getInventoryRows` inside the cron — read with service-role).
   - Deploy that change and confirm a cron dry-run still returns the full candidate set.
   - ONLY THEN apply the RLS migration (next step). Apply RLS first and you silently kill alerting.

---

## Flip (gating goes live)

6. **Apply the pending RLS migration.** Move `supabase/migrations-pending/20260626000000_authenticated_rls.sql`
   into `supabase/migrations/` (or apply it directly via the Supabase MCP/CLI). It drops the demo
   anon-SELECT policies and adds authenticated-only SELECT; service_role keeps full access.

7. **Set `AUTH_ENABLED=true` in Vercel** (Production env) — only now, with steps 4 & 5 done.

8. **Redeploy** so the middleware picks up `AUTH_ENABLED=true`.

9. **Verify gated:** an unauthenticated request to `/` redirects to `/login`; the admin can sign
   in and reach the dashboard + `/settings`; an invited user gets the email → `/auth/confirm` →
   `/set-password` → in. `POST /api/team/invite` without an admin session returns 403.

---

## Rollback
Set `AUTH_ENABLED=false` and redeploy → public again immediately (middleware no-ops). To fully
revert data access, re-add the anon-SELECT policies (reverse of the migration). Reverting the
cron to anon reads is only safe once anon SELECT is restored.

---

## Pre-production cleanup
- **Resolve 2 moderate npm-audit vulns (transitive via `@supabase/ssr`) before go-live; do not
  `audit fix --force` without testing.** (`--force` can pull breaking major bumps; verify
  `tsc` + build + the auth flow after any fix.)

---

## Standing rule — every `/api/*` route MUST self-authorize
The middleware allowlists `/api/*` (so cron/team APIs aren't redirected and can return their own
JSON 401/403). Therefore **the middleware provides NO protection for API routes** — each one must
authorize itself: the cron checks `CRON_SECRET`; team routes call `requireAdmin()` (403 otherwise,
including during dormancy). **Any new `/api/*` route must do its own auth check** — an unguarded
API route is an open, publicly-reachable endpoint. (Mirror this note in CLAUDE.md if/when API
surface grows.)
