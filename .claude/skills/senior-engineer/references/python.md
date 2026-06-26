# Python

Idiomatic patterns for Python services, scripts, data work, and FastAPI.
Assumes the universal principles and compliance layer in SKILL.md. Match
the project's existing conventions first.

## Language & style

- **Type hints on anything non-trivial**, especially public functions and
  module boundaries. They document intent and let the type checker
  (mypy/pyright) catch real bugs. Treat checker warnings as errors in
  production code.
- **Idiomatic Python, not translated-from-another-language Python.**
  Comprehensions over manual loops where they read clearly, context
  managers (`with`) for anything with setup/teardown, `enumerate`/`zip`,
  `pathlib` over `os.path` string surgery, f-strings for formatting.
- **Dataclasses / Pydantic models / `NamedTuple`** over passing around
  loose dicts. A typed model makes illegal states harder and reads better
  than `data["maybe_present_key"]`.
- **`enum.Enum`** for fixed sets of values, not bare string constants
  scattered through the code.
- **Prefer pure functions**; isolate side effects. Don't mutate arguments
  (especially the classic mutable-default-argument trap — use `None` and
  create inside).

## Errors

- Catch **specific** exceptions, never bare `except:` (it swallows
  `KeyboardInterrupt` and hides real failures). Re-raise with context
  (`raise X from err`). Define custom exception types for your domain so
  callers can handle them precisely.
- Don't use exceptions for normal control flow where a return value is
  clearer. Validate inputs early; fail fast with a clear message.

## Structure & dependencies

- **Virtual environments always**; pin dependencies (lockfile). Reproducible
  installs are a compliance and sanity requirement.
- Separate business logic from I/O (HTTP, DB, filesystem) so logic is
  testable without mocks-of-mocks. Inject dependencies rather than
  importing concrete clients deep in the call tree.
- Keep modules focused; avoid the god-`utils.py` that becomes a junk
  drawer.

## FastAPI / web services

- **Pydantic models for every request and response.** Validation at the
  boundary is the point — bounded string lengths, value ranges, required
  vs optional made explicit. Never accept an unbounded free-text field into
  a sensitive system.
- **Dependency injection** (`Depends`) for auth, DB sessions, config —
  check authorization in a dependency, server-side, default-deny.
- **`async` end to end** when doing I/O — don't block the event loop with a
  sync DB driver or `requests` inside an async handler. If a library is
  sync-only, run it in a threadpool deliberately.
- Return generic error responses to clients; log the detail server-side.
  Never leak tracebacks or query text in a response.

## Data / scripts

- For data work, prefer vectorized operations (pandas/numpy/polars) over
  row-by-row Python loops when the dataset is non-trivial — but write the
  clear version first and optimize against a real measurement.
- Even in a "quick script," handle the file-not-found / bad-row / empty-
  input cases; quick scripts have a way of becoming load-bearing.

## Testing

- `pytest` with fixtures; **parametrize** for table-driven cases. A bug fix
  ships with a test that reproduces the bug first. Mock at the boundary
  (the external client), not the internals of your own logic.

## Common anti-patterns to avoid

- Bare `except:` / catching `Exception` then `pass`.
- Mutable default arguments (`def f(x, items=[])`).
- Passing untyped dicts where a model belongs.
- Blocking I/O inside `async` handlers.
- Unbounded/unvalidated input into Pydantic-free endpoints.
- Building SQL or shell commands with f-strings/concatenation — parameterize.
- `pip install` into the system interpreter with no venv/lockfile.
