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

The FP-to-optimizer boundary now negotiates generated identities for the
semantic manifest, runner-bank wire schema, call-local binding schema,
consumption reporting, and the exact execution contract. A stale, swapped, or
duplicate physical package pair fails closed to FP's compact exact executor
before any specialized runner can execute.

Compiler receipts may now carry a deterministic packed-artifact context. The
receipt identity binds the selected FP, compiler, optional optimizer, FP ABI,
and optimizer runner bank so post-extraction qualification cannot accidentally
reuse source-workspace or pre-extraction evidence.

The compiler tarball now also carries the generated dependency-free receipt
validator as executable JavaScript beside its declaration, so extracted S11R
qualification can validate the packed internal authority without importing
workspace source or guessing a shared-chunk name. It is not a new public
package export.

The compiler's default source filter now includes standard ESM/CommonJS
JavaScript and TypeScript module extensions. Extracted qualification attributes
runtime retention only to modules that contribute to emitted host chunks,
rather than every module observed before tree-shaking.

Receipt source paths now use physical containment for existing regular files,
so system and symlink aliases of the configured project root produce the same
project-relative identity. Virtual, queried, missing, non-file, and escaping
host IDs remain opaque domain-separated external locators.
