---
"@stopcock/fp": minor
---

Tiered execution engine for pipe/flow: plan IR with portable AOT lowering, JIT codegen tiers with a shape/vector cache, iterable-source codegen, and a reference interpreter as the semantic oracle. Hand-written stable merge-sort kernel shared by every tier replaces Array.prototype.sort in sortBy/sort/sortAsc/sortDesc, and sort-then-take lowers to a bounded top-k under compilePure. Registers scan and without in the fusion registry.
