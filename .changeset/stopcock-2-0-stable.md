---
'@stopcock/fp': major
'@stopcock/fp-compiler': major
'@stopcock/diff': major
'@stopcock/state': major
'@stopcock/async': minor
'@stopcock/date': patch
'@stopcock/color': patch
'@stopcock/autodiff': patch
---

Stopcock 2.0: one way to write an operation, one way to make it fast.

Every operator has a single curried form: `op(args)` returns a function you
apply to your data, directly or in a `pipe`. The dual data-first calls are
gone, and with them the arity dispatch on every call, the overload types
that fought inference, and about a third of the bundle weight an op-heavy
consumer paid. `diff`, `state`, `async`, `color`, and `autodiff` follow the
same form throughout.

`pipe` and `flow` are plain function application and composition. The
runtime fusion engine is deleted. For fused loops, the
`@stopcock/fp-compiler` build plugin rewrites pipelines at build time, and
that is the only fusion there is. Compiled pipelines beat every library we
measure against on every shape in the decision suite, including
sort-then-take and scan chains. Uncompiled chains hold a gated floor
against ramda on everyday shapes; for chains that stop early on large
inputs, use the lazy `Iter` module or compile.

The compiler understands arrays, Option, Result, dicts, and iterables,
elides operator construction at fully lowered sites, and ships with a
differential corpus asserting compiled output equals plain sequential
application on results and early-exit counts. Callback interleaving across
tiers is deliberately unspecified; counts are pinned per tier. The public
runtime has no `eval`, `new Function`, or runtime-loaded code; everything
clever happens at build time.
