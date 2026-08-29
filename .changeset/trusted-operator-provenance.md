---
'@stopcock/fp': major
---

Optimized execution now requires trusted operator provenance.

Until now, any function carrying an `_op` field with a valid opcode was treated
as one of this package's operators, and its `_fn`/`_a1`/`_a2` fields became the
bindings a fused kernel executed. Those fields are public and settable by
anyone, so a caller could hand `pipe` a hand-made object and have it drive a
kernel.

Operators built by this package are now recorded in a module-private table when
they are constructed, and only that table can promote a step to a fused plan.
The public fields stay exactly where they were and remain readable for
diagnostics, but they no longer grant anything.

What changes for you:

- The public `dual` authoring helper is removed. Custom functions remain
  ordinary untagged pipeline steps.
- Hand-written objects carrying `_op` are no longer fused. They run
  generically, which was always the correct outcome for a function this
  package did not build.
- Deleting or overwriting `_op`, `_fn`, `_a1`, or `_a2` on an operator you got
  from this package no longer changes what it does.
- A forged out-of-range opcode used to throw from the registry. It is now
  simply generic.

There is no public registrar, and none ships in 2.0. If you need an operator
that fuses, use the ones this package exports.
