---
'@stopcock/fp': patch
'@stopcock/fp-optimizer': patch
'@stopcock/fp-compiler': patch
---

Restore the documented pure compilation tier after optimizer extraction.

`@stopcock/fp/compile` now gives `compilePure` its own compact pure executor
instead of aliasing exact `compile`. Cardinality-only `map -> length` plans
skip unused pure callbacks, while unsafe bounded `sort -> take` selection is
retired fail-closed across compact, optimizer, diagnostics, and compiler
retention. Endpoint inference on the compatibility facade is also restored.

The extracted optimizer no longer reuses another compiled runner's comparator,
limit, or callback bindings through the shared shape cache. Its generated
templates snapshot source length exactly once, preserving dynamic-length
Proxies and operand-coercion order.

Align quota admission across compact, optimizer, and compiler execution.
Primitive-number `take` and `drop` quotas are normalized once into private
trusted bindings and remain eligible for the frozen fused-stream contract;
`dropWhile` remains fused as well. Coercible or otherwise non-number quotas
fail closed to the real opaque callable, preserving native `slice`, repeated
coercions, and thrown-error timing after the upstream segment materializes.
Fused `take` keeps its established one-item lookahead at its lexical position.
The build-time compiler preserves root sequential stages, and lowers a fused
`take` or `drop` only when its count is statically known to produce a primitive
number.
