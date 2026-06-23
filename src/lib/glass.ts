// Visual-only: the frosted-glass panel recipe, shared so every panel matches.
//
// Translucent tint + backdrop-blur + 1px hairline border + soft shadow + rounded-2xl.
// The leading `glass` marker class is a no-op normally; globals.css uses it to make
// panels solid + un-blurred under `prefers-reduced-transparency: reduce`.
//
// Apply ONLY to panel containers (cards, table wrapper, queue, header) — never to
// inner children — to keep the number of simultaneous backdrop-blur layers low.
export const glassPanel =
  "glass rounded-2xl border border-white/60 bg-white/20 shadow-[0_12px_40px_-16px_rgba(120,72,16,0.45)] backdrop-blur-xl dark:border-white/10 dark:bg-white/[0.07]";
