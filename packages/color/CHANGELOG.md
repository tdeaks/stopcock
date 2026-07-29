# @stopcock/color

## 2.0.0

### Patch Changes

- [`5db6fca`](https://github.com/tdeaks/stopcock/commit/5db6fcaac5d97e5c28edff63e4803eea6996015b) Thanks [@tdeaks](https://github.com/tdeaks)! - Ship complete package descriptions, minimum Node.js engine metadata, README
  files, changelogs, and package-local MIT licences with every public package.

- [`c9d24c7`](https://github.com/tdeaks/stopcock/commit/c9d24c78655be6b998c792e1a24aa24c7edd08d6) Thanks [@tdeaks](https://github.com/tdeaks)! - Stopcock 2.0: one way to write an operation, one way to make it fast.

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

- Updated dependencies [[`90c3265`](https://github.com/tdeaks/stopcock/commit/90c326592d9f88506d05c6cfdf97a9b082f80b17), [`27ae9d3`](https://github.com/tdeaks/stopcock/commit/27ae9d393252b9ca64304efdb54e8dcffde2bb6b), [`b8d5ce2`](https://github.com/tdeaks/stopcock/commit/b8d5ce255e9d6866ba7e725d8e5689a64f7d68eb), [`e2481f3`](https://github.com/tdeaks/stopcock/commit/e2481f3754b613f4ec9038c511b9765ae63c80d9), [`d6c5d7b`](https://github.com/tdeaks/stopcock/commit/d6c5d7b124512a921835cacb429eb3f2dd997f85), [`5db6fca`](https://github.com/tdeaks/stopcock/commit/5db6fcaac5d97e5c28edff63e4803eea6996015b), [`5db6fca`](https://github.com/tdeaks/stopcock/commit/5db6fcaac5d97e5c28edff63e4803eea6996015b), [`55ca6a1`](https://github.com/tdeaks/stopcock/commit/55ca6a1385ad7264af11bcbb6a7acfb61cafd05c), [`c9d24c7`](https://github.com/tdeaks/stopcock/commit/c9d24c78655be6b998c792e1a24aa24c7edd08d6), [`e0becf5`](https://github.com/tdeaks/stopcock/commit/e0becf549d2883f598f3a06e605449eca304215b), [`c9d24c7`](https://github.com/tdeaks/stopcock/commit/c9d24c78655be6b998c792e1a24aa24c7edd08d6)]:
  - @stopcock/fp@2.0.0
  - @stopcock/la@2.0.0

## 2.0.0-next.1

### Patch Changes

- Updated dependencies [[`90c3265`](https://github.com/tdeaks/stopcock/commit/90c326592d9f88506d05c6cfdf97a9b082f80b17), [`27ae9d3`](https://github.com/tdeaks/stopcock/commit/27ae9d393252b9ca64304efdb54e8dcffde2bb6b), [`e2481f3`](https://github.com/tdeaks/stopcock/commit/e2481f3754b613f4ec9038c511b9765ae63c80d9), [`d6c5d7b`](https://github.com/tdeaks/stopcock/commit/d6c5d7b124512a921835cacb429eb3f2dd997f85), [`55ca6a1`](https://github.com/tdeaks/stopcock/commit/55ca6a1385ad7264af11bcbb6a7acfb61cafd05c), [`e0becf5`](https://github.com/tdeaks/stopcock/commit/e0becf549d2883f598f3a06e605449eca304215b)]:
  - @stopcock/fp@2.0.0-next.1

## 2.0.0-next.0

### Patch Changes

- b8d5ce2: Release the clean FP 2.0 architecture: a slim root, explicit subpaths, strict
  generated sources, portable-only pipeline compilation, Iter in place of
  Stream, comprehensive data/algebra/collection/optic modules, and explicit
  partiality and equality contracts. Move build-time specialization to the
  compiler package, asynchronous failures to Task/AsyncIter, and migrate all
  first-party consumers to the new subpath and optic APIs.

  Performance contracts now cover 311 required rows per engine across portable
  compilation, build-time specialization, Iter, transducers, collectors, typed
  arrays, dispatch, and every FP module hot-path family. On the final local
  Darwin arm64 characterization, portable compilation measured 1.677×/0.943×
  geomean/minimum on Bun and 1.379×/0.973× on Node; stratified build output
  measured 2.044×/0.906× and 1.572×/0.997× respectively. The separate
  operation-complete compiler lane measured 1.105×/0.866× and 1.181×/0.924×
  across 37 timed operations while retaining `length` and `isEmpty` as
  optimizer canaries. These are comparator-relative paired ratios, not
  cross-machine absolute-throughput claims.

  Linux x64 and macOS arm64 release jobs run Bun 1.3.14 and Node 22, fail closed
  on provenance, completeness, correctness, sampling, statistical, confidence,
  or floor failures, and retain raw plus evaluated artifacts. Package size is
  also gated. The public runtime has no `eval`, `new Function`, function-source
  parsing, or runtime-loaded JIT; optional specialization happens at build time.

- 5db6fca: Ship complete package descriptions, minimum Node.js engine metadata, README
  files, changelogs, and package-local MIT licences with every public package.
- Updated dependencies [b8d5ce2]
- Updated dependencies [5db6fca]
- Updated dependencies [5db6fca]
  - @stopcock/fp@2.0.0-next.0
  - @stopcock/la@2.0.0-next.0

## 0.0.2

### Patch Changes

- Updated dependencies []:
  - @stopcock/fp@0.0.3
  - @stopcock/la@0.0.3
