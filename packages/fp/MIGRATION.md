# Migrating from @stopcock/fp 1.x to 2.0

Version 2 is a clean break. It removes the compatibility aliases and adaptive
runtime tiers that would otherwise make the long-term surface harder to learn,
optimize, and tree-shake.

## Imports

The root is intentionally slim. Replace namespace bundles with subpaths:

```diff
- import { pipe, A, O, R, G, Obj } from '@stopcock/fp'
+ import { pipe } from '@stopcock/fp'
+ import * as A from '@stopcock/fp/array'
+ import * as O from '@stopcock/fp/option'
+ import * as R from '@stopcock/fp/result'
+ import * as G from '@stopcock/fp/guard'
+ import * as Obj from '@stopcock/fp/object'
```

The root still exports `pipe`, `flow`, `dual`, `compile`, `compilePure`,
`explain`, Option constructors/guards, and Result constructors/guards.

## Stream became Iter

`Stream` and `@stopcock/fp/stream` were removed rather than aliased.

```diff
- import { Stream } from '@stopcock/fp'
- Stream.from(values).map(f).take(10).toArray()
+ import * as Iter from '@stopcock/fp/iter'
+ pipe(values, Iter.from, Iter.map(f), Iter.take(10), Iter.toArray)
```

Use `@stopcock/async/async-iter` for asynchronous sources.

## Runtime JIT was removed

`compileJit`, JIT loaders, vector tiers, and fusion-mode controls no longer
exist. `pipe`, `flow`, and `compile` always use portable prebuilt code.

| 1.x | 2.0 |
| --- | --- |
| `explainPipeline(...steps)` | `explain(...steps)` or `explainPure(...steps)` |
| `setFusionMode(...)` | removed; there is one portable runtime |
| `compileJit(...)` | use `@stopcock/fp-compiler` at build time |
| tier/JIT statistics | `getOptimizerStats()` from `@stopcock/fp/compile` |

The diagnostic result is versioned and reports
`runtimeCodeGeneration: false`.

## Partial APIs are explicit

Partial collection operations now prefer Option:

```diff
- A.head(values) // A | undefined
+ A.head(values) // Option<A>
+ A.headOrUndefined(values) // A | undefined
+ A.headNonEmpty(nonEmptyValues) // A
```

Numeric aggregates follow the same naming contract:

```ts
N.mean(values)             // Option<number>
N.meanOrUndefined(values)  // number | undefined
N.meanNonEmpty(values)     // number
```

`dotProduct` now rejects unequal lengths. Use `dotProductTruncate` when
truncation is intentional.

## Result is synchronous

Promise helpers were removed from Result. Move asynchronous error capture to
Task:

```diff
- R.tryCatchAsync(load)
+ Task.tryPromise(load)
```

`Option.match` and `Result.match` now take named handler records:

```diff
- R.match(onErr, onOk)(result)
+ R.match({ err: onErr, ok: onOk })(result)
```

`Result.fromNullable` accepts a lazy error producer.

## Object paths and optics

Object mutation paths are tuple-only, immutable, and prototype-safe:

```diff
- Obj.path(user, 'profile.name')
+ Obj.getPath(user, ['profile', 'name'])

- Obj.pathOr(user, 'profile.name', 'Unknown')
+ pipe(Obj.getPath(user, ['profile', 'name']), O.getOrElse(() => 'Unknown'))
+ Obj.getPathOrUndefined(user, ['profile', 'name'])
```

The old separate lens/prism/traversal modules were replaced by
`@stopcock/fp/optic`, which supports Lens, Optional, Prism, Traversal, Iso,
Getter, Fold, Setter, `at`, composition, and a typed builder.

## Equality and collections

- `Eq.strict` and collection membership use SameValueZero.
- `Eq.objectIs` is available when signed zero must remain distinct.
- `Eq.deep` recursively compares arrays and plain records, including cycles.
  Other built-ins are atomic unless you provide an explicit Eq.
- Set operations are stable and unique.
- Records created by structural combinators use a null prototype.
- Sparse arrays are treated densely.

## Automated migration

`@stopcock/fp-codemod` includes root-import splitting, Stream-to-Iter import
migration, diagnostics renames, and match-handler rewrites. Run it on a clean
branch, then use `@stopcock/eslint-plugin-fp` to catch remaining legacy imports
and unsafe partial operations.
