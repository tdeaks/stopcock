# @stopcock/fp

## 2.0.0

### Major Changes

- [`b8d5ce2`](https://github.com/tdeaks/stopcock/commit/b8d5ce255e9d6866ba7e725d8e5689a64f7d68eb) Thanks [@tdeaks](https://github.com/tdeaks)! - Release the clean FP 2.0 architecture: a slim root, explicit subpaths, strict
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

- [`55ca6a1`](https://github.com/tdeaks/stopcock/commit/55ca6a1385ad7264af11bcbb6a7acfb61cafd05c) Thanks [@tdeaks](https://github.com/tdeaks)! - Root `pipe` and `flow` are sequential. Fusion is now something you ask for.

  `pipe(xs, map(f), filter(g))` used to fuse into a single pass automatically.
  It no longer does: it applies each step in turn, like every other pipe you have
  used. Same steps, same input, same result — what changes is that intermediate
  arrays are no longer elided and callbacks run stage by stage rather than
  interleaved per element.

  If you want fusion, import it by name:

  ```ts
  import { pipe } from "@stopcock/fp/fusion";
  ```

  That entry has meant exactly this since it shipped and keeps meaning it. If you
  build with a bundler, `@stopcock/fp-compiler` fuses at build time and leaves no
  runtime engine in your output at all.

  Why: the root is what most people import, and it was carrying an optimizer for
  everyone who only wanted to compose two functions. Importing `pipe` now costs
  191 gzip bytes.

  Four names also moved off the root to the subpaths that own them:

  | was                      | now                         |
  | ------------------------ | --------------------------- |
  | `compile`, `compilePure` | `@stopcock/fp/compile`      |
  | `dual`                   | `@stopcock/fp/dual`         |
  | `explain`                | `@stopcock/fp/fusion/debug` |

  `@stopcock/fp-codemod` rewrites all four.

  Nothing else about the root changed: `some`, `none`, `ok`, `err`, the guards,
  and the types are where they were.

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

- [`e0becf5`](https://github.com/tdeaks/stopcock/commit/e0becf549d2883f598f3a06e605449eca304215b) Thanks [@tdeaks](https://github.com/tdeaks)! - Optimized execution now requires trusted operator provenance.

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

  - Functions you build with the public `dual(..., { op })` stay callable and
    keep their `_op` field. They now always run the generic path instead of
    being fused. Behaviour and results are unchanged; only the execution
    strategy is.
  - Hand-written objects carrying `_op` are no longer fused. They run
    generically, which was always the correct outcome for a function this
    package did not build.
  - Deleting or overwriting `_op`, `_fn`, `_a1`, or `_a2` on an operator you got
    from this package no longer changes what it does.
  - A forged out-of-range opcode used to throw from the registry. It is now
    simply generic.

  There is no public registrar, and none ships in 2.0. If you need an operator
  that fuses, use the ones this package exports.

### Minor Changes

- [`90c3265`](https://github.com/tdeaks/stopcock/commit/90c326592d9f88506d05c6cfdf97a9b082f80b17) Thanks [@tdeaks](https://github.com/tdeaks)! - `@stopcock/fp/fusion` is now compact fusion, not an alias for the optimized engine.

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

- [`27ae9d3`](https://github.com/tdeaks/stopcock/commit/27ae9d393252b9ca64304efdb54e8dcffde2bb6b) Thanks [@tdeaks](https://github.com/tdeaks)! - Add explicit fusion entries: `@stopcock/fp/fusion`, `@stopcock/fp/fusion/optimized`, and `@stopcock/fp/fusion/debug`.

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

- [`e2481f3`](https://github.com/tdeaks/stopcock/commit/e2481f3754b613f4ec9038c511b9765ae63c80d9) Thanks [@tdeaks](https://github.com/tdeaks)! - Add `Obj.compilePathOf` and make plain-data path writes take a guarded fast
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

- [`d6c5d7b`](https://github.com/tdeaks/stopcock/commit/d6c5d7b124512a921835cacb429eb3f2dd997f85) Thanks [@tdeaks](https://github.com/tdeaks)! - Add `Map.getOrElse` in direct and data-last forms.

  The fallback is lazy and runs at most once, and only when the key is genuinely
  absent, so an expensive default costs nothing on a hit. The lookup calls `get`
  first and consults `has` only when `get` came back `undefined`, so a stored
  `undefined` is treated as present and returns `undefined` rather than the
  fallback.

  `get`, `getOrUndefined`, and the rest of the Map surface are unchanged.

- [`5db6fca`](https://github.com/tdeaks/stopcock/commit/5db6fcaac5d97e5c28edff63e4803eea6996015b) Thanks [@tdeaks](https://github.com/tdeaks)! - Add refinement-aware Result and Option predicates, fail-fast Result composition and absence
  traversal, collection guards, and the error-accumulating Validation namespace with its package
  subpath.

### Patch Changes

- [`5db6fca`](https://github.com/tdeaks/stopcock/commit/5db6fcaac5d97e5c28edff63e4803eea6996015b) Thanks [@tdeaks](https://github.com/tdeaks)! - Ship complete package descriptions, minimum Node.js engine metadata, README
  files, changelogs, and package-local MIT licences with every public package.

## 2.0.0-next.1

### Major Changes

- [`55ca6a1`](https://github.com/tdeaks/stopcock/commit/55ca6a1385ad7264af11bcbb6a7acfb61cafd05c) Thanks [@tdeaks](https://github.com/tdeaks)! - Root `pipe` and `flow` are sequential. Fusion is now something you ask for.

  `pipe(xs, map(f), filter(g))` used to fuse into a single pass automatically.
  It no longer does: it applies each step in turn, like every other pipe you have
  used. Same steps, same input, same result — what changes is that intermediate
  arrays are no longer elided and callbacks run stage by stage rather than
  interleaved per element.

  If you want fusion, import it by name:

  ```ts
  import { pipe } from "@stopcock/fp/fusion";
  ```

  That entry has meant exactly this since it shipped and keeps meaning it. If you
  build with a bundler, `@stopcock/fp-compiler` fuses at build time and leaves no
  runtime engine in your output at all.

  Why: the root is what most people import, and it was carrying an optimizer for
  everyone who only wanted to compose two functions. Importing `pipe` now costs
  191 gzip bytes.

  Four names also moved off the root to the subpaths that own them:

  | was                      | now                         |
  | ------------------------ | --------------------------- |
  | `compile`, `compilePure` | `@stopcock/fp/compile`      |
  | `dual`                   | `@stopcock/fp/dual`         |
  | `explain`                | `@stopcock/fp/fusion/debug` |

  `@stopcock/fp-codemod` rewrites all four.

  Nothing else about the root changed: `some`, `none`, `ok`, `err`, the guards,
  and the types are where they were.

- [`e0becf5`](https://github.com/tdeaks/stopcock/commit/e0becf549d2883f598f3a06e605449eca304215b) Thanks [@tdeaks](https://github.com/tdeaks)! - Optimized execution now requires trusted operator provenance.

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

  - Functions you build with the public `dual(..., { op })` stay callable and
    keep their `_op` field. They now always run the generic path instead of
    being fused. Behaviour and results are unchanged; only the execution
    strategy is.
  - Hand-written objects carrying `_op` are no longer fused. They run
    generically, which was always the correct outcome for a function this
    package did not build.
  - Deleting or overwriting `_op`, `_fn`, `_a1`, or `_a2` on an operator you got
    from this package no longer changes what it does.
  - A forged out-of-range opcode used to throw from the registry. It is now
    simply generic.

  There is no public registrar, and none ships in 2.0. If you need an operator
  that fuses, use the ones this package exports.

### Minor Changes

- [`90c3265`](https://github.com/tdeaks/stopcock/commit/90c326592d9f88506d05c6cfdf97a9b082f80b17) Thanks [@tdeaks](https://github.com/tdeaks)! - `@stopcock/fp/fusion` is now compact fusion, not an alias for the optimized engine.

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

- [`27ae9d3`](https://github.com/tdeaks/stopcock/commit/27ae9d393252b9ca64304efdb54e8dcffde2bb6b) Thanks [@tdeaks](https://github.com/tdeaks)! - Add explicit fusion entries: `@stopcock/fp/fusion`, `@stopcock/fp/fusion/optimized`, and `@stopcock/fp/fusion/debug`.

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

- [`e2481f3`](https://github.com/tdeaks/stopcock/commit/e2481f3754b613f4ec9038c511b9765ae63c80d9) Thanks [@tdeaks](https://github.com/tdeaks)! - Add `Obj.compilePathOf` and make plain-data path writes take a guarded fast
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

- [`d6c5d7b`](https://github.com/tdeaks/stopcock/commit/d6c5d7b124512a921835cacb429eb3f2dd997f85) Thanks [@tdeaks](https://github.com/tdeaks)! - Add `Map.getOrElse` in direct and data-last forms.

  The fallback is lazy and runs at most once, and only when the key is genuinely
  absent, so an expensive default costs nothing on a hit. The lookup calls `get`
  first and consults `has` only when `get` came back `undefined`, so a stored
  `undefined` is treated as present and returns `undefined` rather than the
  fallback.

  `get`, `getOrUndefined`, and the rest of the Map surface are unchanged.

## 2.0.0-next.0

### Major Changes

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

### Minor Changes

- 5db6fca: Add refinement-aware Result and Option predicates, fail-fast Result composition and absence
  traversal, collection guards, and the error-accumulating Validation namespace with its package
  subpath.

### Patch Changes

- 5db6fca: Ship complete package descriptions, minimum Node.js engine metadata, README
  files, changelogs, and package-local MIT licences with every public package.

## 2.0.0

### Major changes

- Rebuilt the package around a slim root and explicit, tree-shakeable
  subpaths.
- Replaced Stream with lazy Iter and added transducers and collectors.
- Removed all runtime JIT, source parsing, and adaptive execution tiers.
  Portable compilation is the only runtime path; build-time specialization
  lives in `@stopcock/fp-compiler`.
- Made partiality, equality, sparse-array behavior, mutation, and async error
  boundaries explicit.
- Expanded Option, Result, Validation, These, Nullable, algebra, collections,
  functions, guards, objects, strings, numbers, optics, matching, Reader,
  State, Writer, and stack-safe recursion.
- Added dependency-free Standard Schema V1 interop.
- Removed generated `@ts-nocheck`; the package and public declaration tests
  compile strictly with TypeScript 7.

### Measured performance

The final 23 July 2026 local characterization used Darwin arm64, Bun
1.3.14/JavaScriptCore, and Node 24.18.0/V8 13.6. Ratios are paired reference
time divided by Stopcock time:

| Contract                           | Cases and reference                             | Bun/JSC geo / min | Node/V8 geo / min |
| ---------------------------------- | ----------------------------------------------- | ----------------: | ----------------: |
| Portable `compile`                 | Frozen emitter, 44                              |   1.677× / 0.943× |   1.379× / 0.973× |
| Compiler, stratified               | Frozen emitter, 44                              |   2.044× / 0.906× |   1.572× / 0.997× |
| Compiler, operation-complete       | Frozen operation emitter, 37 timed + 2 canaries |   1.105× / 0.866× |   1.181× / 0.924× |
| Direct `Iter`                      | Hand-written early-exit loop, 3                 |   0.991× / 0.963× |   0.731× / 0.661× |
| Broad `Iter`                       | Frozen executor, 14                             |   1.941× / 1.047× |   2.159× / 0.999× |
| Transducers, collectors, `without` | Frozen implementations, 45                      |   1.762× / 0.993× |   1.597× / 0.993× |
| Typed arrays                       | Frozen implementations, 48                      |   8.879× / 0.973× |   2.272× / 0.814× |
| Typed arrays                       | Native equivalents, 48                          |   1.149× / 0.716× |   1.211× / 0.869× |
| Callback churn                     | Frozen compile contract, 4                      |   2.254× / 1.013× |   1.615× / 0.985× |
| `pipe` dispatch                    | Frozen dispatcher, 4                            |   1.097× / 1.025× |   1.072× / 1.033× |
| Core utilities                     | Frozen implementations, 18                      |   3.452× / 0.669× |   2.272× / 0.728× |
| Data and functional                | Frozen implementations, 11                      |   2.353× / 0.790× |   1.454× / 0.861× |
| Structural                         | Frozen implementations, 15                      |   1.813× / 0.967× |   2.113× / 0.847× |
| Scalar, text, and hash             | Frozen implementations, 11                      |   2.031× / 0.985× |   1.344× / 0.928× |
| Recursion, match, schema, writer   | Frozen implementations, 11                      |   3.229× / 0.988× |   4.345× / 0.946× |

Raw minima remain visible where semantics or native-call overhead impose a
documented trade-off. Gates fail closed on provenance, population, semantic,
sampling, statistical, confidence, and floor failures. The operation compiler
gate balances lexical call-site roles across fresh workers; fixed-input
`length` and `isEmpty` are retained as optimizer canaries rather than claimed
as literal latency. CI reruns all contracts with Bun 1.3.14 and Node 22 on
Linux x64 and macOS arm64.

The default runtime remains strict-CSP compatible: it does not use `eval`,
`new Function`, source parsing, or runtime JIT loading; optional specialization
happens at build time.

See [MIGRATION.md](./MIGRATION.md) for source-level changes.

## 0.0.3

### Patch changes

- Published the expanded functional core, subpath-based async imports,
  accelerated linear algebra, image colour filters, and the extended
  signal/DSP surface.
