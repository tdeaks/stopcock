---
'@stopcock/fp': minor
---

`@stopcock/fp/fusion` is now compact fusion, not an alias for the optimized engine.

Since it shipped, `/fusion` has been the same implementation as
`/fusion/optimized`, kept separate so you could commit to one without moving
later. This is that move.

Compact fuses through one generic exact executor rather than a bank of
specialized templates. It is honestly size-first: **2,874 gzip bytes against
optimized fusion's 11,495**, and slower than optimized in exchange. Results,
callback order, and early-exit counts are identical — the tiers are tested
against each other on all three.

Pick by what you need:

| you want                 | import                             |
| ------------------------ | ---------------------------------- |
| smallest fused runtime   | `@stopcock/fp/fusion`              |
| fastest fused runtime    | `@stopcock/fp/fusion/optimized`    |
| no runtime engine at all | build with `@stopcock/fp-compiler` |

If you were importing `/fusion` for speed, move to `/fusion/optimized` and
nothing else changes. Compact carries no operation-name registry, no
descriptions and no statistics; diagnostics stay in `@stopcock/fp/fusion/debug`,
which production compact never imports.
