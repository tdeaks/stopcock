---
'@stopcock/fp': minor
---

Add explicit fusion entries: `@stopcock/fp/fusion`, `@stopcock/fp/fusion/optimized`, and `@stopcock/fp/fusion/debug`.

Root `pipe` and `flow` fuse automatically today. In 2.0 they become sequential,
and these entries are how you keep fusion where you actually want it. They
delegate to the engine that has always implemented fused behaviour, not to the
root symbols, so an import written today means the same thing after root
changes.

`fusion` and `fusion/optimized` are the same implementation right now. They are
separate entries so you can commit to one now and not have to move later, when
optimized fusion gets its own runner.

`fusion/debug` carries the explanation and statistics surface. It is absent
from any bundle that does not import it.

Nothing about root changes in this release. These are additive.
