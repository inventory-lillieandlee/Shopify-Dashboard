# AI / LLM / SaaS Integration

Patterns for the AI layer of a SaaS product — LLM calls, agents, RAG,
prompts, vector stores, and the surrounding plumbing. Assumes the universal
principles and compliance layer in SKILL.md. This is the youngest, fastest-
moving part of the stack, so judgment matters more than fixed recipes — and
APIs change, so verify current SDK/model details rather than trusting
memory.

## Treat the model as an untrusted, non-deterministic dependency

- **Outputs are not validated input.** Parse and validate every model
  response against a schema before it touches your system — especially if
  it drives a tool call, a DB write, or rendered HTML. "The model said so"
  is never authorization. Structured-output / tool-calling modes with a
  strict schema beat free-text parsing.
- **Non-determinism is the default.** The same prompt yields different
  outputs. Design for it: validate, set sensible temperature, and don't
  build logic that assumes a fixed string back.
- **Latency and failure are normal.** Timeouts, retries with backoff,
  graceful degradation, and a fallback path for when the provider is down
  or rate-limiting. A model call is a network call to a flaky dependency.
- **Cost is a first-class concern.** Token usage is real money. Cache where
  you can, pick the right-sized model for the task, cap `max_tokens`, and
  log usage for visibility.

## Prompt-injection & data boundaries (the AI-specific OWASP)

- **Untrusted content in the context window is the new injection surface.**
  Retrieved documents, user messages, web/page content, tool results — all
  can contain instructions aimed at the model. Keep a clear boundary
  between *trusted instructions* (your system prompt) and *untrusted data*,
  and never let retrieved/user content silently escalate privileges or
  trigger sensitive actions.
- **Constrain tools, don't trust intentions.** A tool the agent can call is
  a capability you've granted. Scope each one narrowly, authorize the
  *action* server-side (the user's permissions, not the model's say-so),
  require confirmation for irreversible/sensitive operations, and never
  expose a tool that can exfiltrate data or move money without a human gate.
- **PII/PHI into a third-party model is a compliance event.** Know what
  data leaves your boundary, whether the provider's terms/BAA permit it,
  and minimize/redact what you send. Don't log full prompts/responses
  containing sensitive data.

## RAG & vector stores

- Retrieval quality is mostly a data problem: thoughtful chunking, good
  embeddings, metadata filters, and (often) a rerank step beat prompt
  tweaking. Measure retrieval (did the right context come back?) separately
  from generation (did the answer use it?).
- Enforce access control **at retrieval time** — a user must only retrieve
  chunks they're authorized to see. A shared vector index without per-tenant
  / per-user filtering is a data-leak vector.
- Always ground with citations the user can verify; handle "context didn't
  contain the answer" explicitly rather than letting the model invent one.

## Agents & orchestration

- Start with the simplest thing that works: a single well-prompted call
  with tools often beats an elaborate multi-agent graph. Add structure only
  when a concrete need justifies it.
- Bound autonomy: max steps/iterations, loop detection, timeouts, and a
  hard stop. An unbounded agent loop burns money and can take destructive
  actions. Make every state transition and tool call observable/traceable.
- Make agent actions idempotent and reversible where possible; checkpoint
  long runs so a failure doesn't redo everything.

## Evaluation & operability

- **You can't ship what you can't evaluate.** Build an eval set of
  representative inputs with expected properties; run it on prompt/model
  changes instead of vibe-checking one example. Track regressions.
- Log prompts, responses, token counts, latency, and tool calls (with
  sensitive data redacted) — for debugging, cost, and audit.
- Pin model versions deliberately; a provider silently changing a model can
  shift behavior under you. Re-run evals when you upgrade.

## Common anti-patterns to avoid

- Trusting model output as validated/authorized input.
- `eval()`-ing or directly executing model-generated code/SQL/shell.
- No timeout/retry/fallback on provider calls.
- Mixing trusted instructions and untrusted data with no boundary
  (prompt-injection exposure).
- Tools that perform irreversible/sensitive actions with no human gate or
  server-side authorization.
- Sending PII/PHI to a provider without checking terms/BAA; logging it.
- Vector index with no per-user/tenant access filtering at retrieval.
- Unbounded agent loops; no step/cost ceiling.
- Shipping prompt/model changes with no eval set, judged on one happy path.
