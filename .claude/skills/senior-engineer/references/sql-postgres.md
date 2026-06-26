# SQL / Postgres

Idiomatic patterns for schema design, migrations, and queries (Postgres-
focused, mostly portable). Assumes the universal principles and compliance
layer in SKILL.md. Match the project's existing conventions first.

## Schema design

- **Right types, not stringly-typed everything.** `timestamptz` (never bare
  `timestamp` — timezone bugs are brutal), proper numeric types for money
  (integer cents or `numeric`, never float), `uuid`/`bigint` keys per
  project convention, `boolean` for flags. On Postgres, `citext` or a
  normalized column for case-insensitive fields like email.
- **Constraints are documentation the database enforces.** `NOT NULL`,
  `UNIQUE`, `CHECK` (including length bounds on text — unbounded text is a
  DoS/corruption vector), and **foreign keys** with deliberate
  `ON DELETE`/`ON UPDATE` behavior. Don't push integrity rules entirely
  into app code; the DB is the last line of defense.
- **Audit columns** on records touching real data: created/updated
  timestamps and the actor (created_by/updated_by) where the system tracks
  users. This is a SOC 2 expectation, not decoration.
- Normalize until it hurts, denormalize until it works — start normalized;
  denormalize only for a measured performance reason, knowingly.

## Queries

- **Parameterized, always.** Never interpolate values into SQL strings —
  it's the #1 injection vector. This holds in app code, scripts, and
  migrations alike.
- **Select the columns you need**, not `SELECT *`, in application queries —
  it's a contract with the schema and avoids surprise breakage and waste.
- **Know your indexes.** Index the columns you filter/join/sort on; verify
  with `EXPLAIN (ANALYZE, BUFFERS)` rather than guessing. Watch for the
  N+1 pattern from ORMs — fetch in a set, not in a loop.
- **Keep transactions tight** and consistent in lock ordering to avoid
  deadlocks. Be deliberate about isolation level for money/inventory-style
  invariants. Don't hold a transaction open across a network call.
- Prefer set-based operations over row-by-row procedural logic; the planner
  is better at bulk work than a loop is.

## Access control & sensitive data

- **Least-privilege database roles** — the app role can do what the app
  needs and no more (no superuser app connections). Consider Row-Level
  Security for multi-tenant isolation where the project uses it.
- For functions, check authorization explicitly and early; be deliberate
  with `SECURITY DEFINER` (it runs with the definer's rights — a privilege-
  escalation risk if careless). Set a safe `search_path`.
- **Prefer explicit, reviewable logic over hidden triggers** for behavior
  that matters — triggers create action-at-a-distance that's easy to miss
  in review. Use them when the team's convention does, sparingly.
- Encrypt/segregate sensitive columns per HIPAA/PII requirements; never log
  query parameters that contain PHI/PII.

## Migrations

- **Migrations are forward-only, reviewed, and reversible in plan.** Each
  is small and atomic. Test against production-like data volume.
- **Beware locks on large tables.** Adding a `NOT NULL` column with a
  default, or an index, can lock writes — use the concurrent/online
  patterns (`CREATE INDEX CONCURRENTLY`, add-nullable-then-backfill-then-
  constrain) on big tables.
- Separate schema changes from data backfills when the table is large or
  hot; backfill in batches.

## Common anti-patterns to avoid

- String-concatenated / interpolated SQL.
- `timestamp` instead of `timestamptz`; floats for money.
- `text` columns with no length `CHECK`; missing `NOT NULL`/FKs.
- `SELECT *` in application code.
- N+1 query loops instead of a single set-based query.
- Long-held transactions; transactions spanning external calls.
- App connecting as a superuser role.
- Careless `SECURITY DEFINER` / mutable `search_path`.
- Business-critical behavior buried in triggers.
- Blocking schema migrations run against large live tables at peak.
