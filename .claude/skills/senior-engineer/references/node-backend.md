# Node.js Backend

Idiomatic patterns for Node.js APIs, services, and background workers
(Express/Fastify/Nest/etc.). Assumes the universal principles and
compliance layer in SKILL.md. Match the project's existing conventions
first. If the project is TypeScript (it usually should be on the backend
too), also see `typescript-react.md` for the TS-language portions.

## Foundations

- **TypeScript on the backend** unless the project is committed to plain
  JS. Types catch the class of bug that's most expensive in a service.
- **Async/await, not callback pyramids or raw `.then` chains.** Always
  `await` (or explicitly handle) every promise — a floating promise is an
  unhandled rejection waiting to crash the process. Use
  `Promise.all`/`allSettled` for genuine parallelism instead of awaiting in
  a loop.
- **One responsibility per module.** Route/controller → service (logic) →
  repository/data layer. Keep handlers thin: parse and validate input, call
  the service, shape the response. Business logic does not belong in a
  route handler.

## Errors & process safety

- **Centralized error handling** (error middleware) rather than try/catch
  copy-pasted everywhere. Distinguish operational errors (bad input,
  not-found — expected, handled) from programmer errors (bugs — let them
  surface). Wrap errors with context as they bubble.
- **Never let the process die silently or run on after a fatal error.**
  Handle `unhandledRejection`/`uncaughtException` to log and exit cleanly;
  let the orchestrator restart. Don't swallow rejections to "keep it
  running" in a corrupted state.
- Validate every external input at the edge with a schema validator (zod,
  Joi, class-validator). Bounded lengths, typed fields, default-deny on
  unexpected shapes.

## Security (OWASP-aware)

- **Parameterized queries / ORM bindings only** — never string-built SQL.
  Same for any shell-out: avoid it, and if unavoidable, never interpolate
  user input.
- **Auth on every protected route**, checked server-side via middleware,
  default-deny. Validate and verify tokens properly (signature, expiry,
  audience). Never trust a client-sent user id or role.
- **Secrets from env/secret manager**, never committed, never logged. Use a
  config module that loads and validates env at startup and fails fast if
  something required is missing.
- Set security headers, sane CORS (not `*` on credentialed endpoints), rate
  limiting on public/auth endpoints, and request size limits.
- Keep dependencies patched; treat a known-vuln advisory as a real ticket.

## Performance & operability

- **Don't block the event loop.** Move CPU-heavy work to worker threads or
  a queue. A synchronous crypto/parse/compress call on the request path
  stalls every other request.
- **Stream large payloads** rather than buffering whole files in memory.
- **Structured logging** (pino/winston) with request correlation ids, no
  secrets/PII in logs. Graceful shutdown: drain in-flight requests, close
  DB pools, on SIGTERM.
- Backpressure and idempotency for workers/queue consumers — assume
  at-least-once delivery and design handlers to be safely retryable.

## Testing

- Unit-test services with the data layer mocked at the boundary;
  integration-test the wiring. A bug fix ships with a regression test.
  Table-driven cases via `test.each`.

## Common anti-patterns to avoid

- Floating promises / missing `await` / unhandled rejections.
- `await` inside a loop when the calls are independent.
- Business logic crammed into route handlers.
- String-concatenated SQL or shell commands.
- Trusting client-supplied identity/role; auth checked only client-side.
- Secrets in code, in the repo, or in logs.
- Blocking the event loop with sync CPU work on the request path.
- `process.exit()` mid-request with no graceful drain.
