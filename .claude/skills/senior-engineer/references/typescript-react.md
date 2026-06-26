# TypeScript / React / Next.js

Idiomatic patterns for frontend and TypeScript work. Assumes the universal
principles and compliance layer in SKILL.md. Match the project's existing
conventions first; these are defaults for when none exist.

## TypeScript

- **`strict` is the baseline.** No `any` as an escape hatch — use `unknown`
  and narrow, or define the type. `any` silently disables the one tool
  doing the checking. If a type is genuinely dynamic, model it honestly.
- **Make illegal states unrepresentable.** Discriminated unions over
  loosely-related optional fields. A `Result<T, E>` or a `{ status }` union
  beats `data?` + `error?` + `loading?` that can all be true at once.
- **Exhaustive switches.** Assign the default case to `never` so adding a
  variant becomes a compile error, not a runtime surprise.
- **Validate external data at the boundary.** API responses, form input,
  env vars, `localStorage` — none of it is the type you wish it were. Use a
  runtime validator (zod or similar) at the edge, then trust the type
  inside. A `as User` cast on a fetch response is a lie to the compiler.
- **Type guards** for runtime narrowing; prefer `const`; barrel files for
  clean public imports without over-exporting internals.

## React

- **Logic lives in hooks; components render.** A component that fetches,
  transforms, subscribes, and renders is doing too much. Extract the
  non-visual work into a custom hook so the component reads as markup.
- **Components small and single-purpose** (a few hundred lines is already a
  smell). One responsibility; compose rather than branch heavily inside.
- **State updates are immutable.** New array/object every time
  (`setItems(prev => [...prev, x])`), never `.push` then set. Mutating state
  is the classic "why didn't it re-render" bug.
- **Effects are for synchronizing with the outside world**, not for
  deriving state you could compute during render. Every effect needs a
  correct dependency array and, where it subscribes or fetches, a cleanup.
  If you're "syncing" two pieces of state with an effect, you probably have
  one source of truth too many.
- **Keys are stable identities**, never array indices for dynamic lists.
- **Accessibility is not optional**: semantic elements, labels, keyboard
  paths, focus management. It's part of "done."

### State management

Reach for the lightest thing that works: local state → lifted state →
context (for genuinely cross-cutting, low-churn values) → a store
(Zustand/Redux/etc.) for real shared app state. With a store, **select
narrowly** — subscribe to the slice you use, not the whole store, or every
component re-renders on every change.

## Next.js

- **Respect the rendering model.** Know whether code runs on the server or
  client and why. Keep `"use client"` as low in the tree as possible — push
  interactivity to the leaves, keep data-fetching on the server.
- **Secrets stay server-side.** Anything not prefixed for public exposure
  must never reach the client bundle. Never put an API key, DB URL, or
  service token in client-reachable code. Server actions and route handlers
  are the boundary — validate and authorize inside them, every time.
- **Data fetching close to where it's used**, with the framework's caching
  semantics understood, not guessed. Don't waterfall sequential awaits that
  could be parallel.

## Common anti-patterns to avoid

- `any` to silence the compiler instead of modeling the type.
- Trusting `await res.json()` as a typed object with no runtime check.
- Business logic and data fetching wired directly into JSX.
- Mutating state/props; deriving state into `useState` + effect when a
  plain computed value would do.
- Full-store subscriptions causing app-wide re-renders.
- Leaking server-only secrets or logic into client components.
- `useEffect` with missing deps or no cleanup on subscriptions.
