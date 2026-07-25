---
'@stopcock/fp': minor
---

Add `Obj.compilePathOf` and make plain-data path writes take a guarded fast
tier.

`compilePathOf<T>()(...segments)` returns a frozen reader with `get`,
`getOrUndefined`, and `has`. It copies and freezes the segments once and uses
bounded static depth branches for the first three, falling back to the generic
loop beyond that. Measured against the generic readers in the same process on
Bun 1.3.14 (Darwin arm64, canary lane): 0.235x at depth 1, 0.193x at depth 2,
0.148x at depth 3, and 0.117x for `hasPath` at depth 3. Depth 4 measures 0.516x
and is reported rather than gated.

`setPath` and `modifyPath` now skip the descriptor-by-descriptor clone when a
container is provably ordinary plain data: an `Object.prototype` or null
prototype, and own properties that are all enumerable, writable, configurable
data properties with no unsafe key. The guard reads through the same
`Reflect.ownKeys` plus `getOwnPropertyDescriptor` sequence as the exact clone,
so a Proxy source observes the same traps and no accessor runs before the
shortcut is chosen. Anything else falls back to the exact clone. Against the
frozen pre-change implementation in the same process: 1.68x at depth 1, 1.95x
at depth 2, 2.53x at depth 3, 2.02x on a null-prototype source, and 2.19x for
`modifyPath` at depth 2.

Descriptors, prototypes, symbol keys, own key order, accessors, frozen and
sealed sources, arrays, and prototype-pollution rejection are unchanged, and are
held to that by a differential corpus that compares every write against a pinned
copy of the exact clone.
