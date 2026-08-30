# @stopcock/fp

A performance-first functional standard library for TypeScript. It combines a
small composition root, tree-shakeable specialist modules, explicit data types,
lazy iteration, immutable collection utilities, and a portable pipeline
compiler.

```bash
bun add @stopcock/fp
```

```ts
import { pipe } from '@stopcock/fp'
import * as A from '@stopcock/fp/array'
import * as O from '@stopcock/fp/option'

const firstActiveName = pipe(
  users,
  A.filter((user) => user.active),
  A.map((user) => user.name),
  A.head,
  O.getOrElse(() => 'Nobody'),
)
```

The root deliberately contains only sequential composition and the core
Option/Result constructors and guards. Import compilation, diagnostics, and
specialist APIs from subpaths:

```ts
import { pipe, flow, some, ok } from '@stopcock/fp'
import { compile, compilePure } from '@stopcock/fp/compile'
import { explain, explainPure } from '@stopcock/fp/fusion/debug'
import * as A from '@stopcock/fp/array'
import * as Iter from '@stopcock/fp/iter'
import * as R from '@stopcock/fp/result'
import * as Optic from '@stopcock/fp/optic'
```

## Design contracts

- Modern ESM for Node 22+, Bun 1.3+, Deno 2+, browsers, workers, and edge
  runtimes.
- No `eval`, `new Function`, runtime source parsing, or hidden JIT download.
- `compile` preserves exact callback semantics; `compilePure` may apply
  explicitly reported pure rewrites.
- Ordinary collection operations return new values. Destination reuse is
  opt-in through named `*Into` APIs.
- `*Into` APIs preserve the concrete destination type. Fixed tuples,
  heterogeneous or refined record destinations, and ambiguous mutable target
  unions are rejected when mutation cannot be proven sound.
- Sparse arrays have dense semantics: a hole is observed as `undefined`.
- Callback-driven traversals in the `array` module snapshot the input length
  before the first callback; appends are not visited and truncation is
  observed as dense `undefined` slots through the original length.
- Partial operations return `Option` by default. Explicit throwing and
  `undefined` variants are named.
- SameValueZero is the default equality for collection membership.
- `record` is the homogeneous dictionary API (`ReadonlyRecord<A>`). Closed,
  named object shapes, including interfaces without an index signature,
  belong in `object`, whose operations preserve their declared shape.
- Synchronous failures use `Result`. Asynchronous failures and cancellation
  live in `@stopcock/async` as `Task`; there is no competing `AsyncResult`.

## Modules

Collections and iteration:

- `array`, `readonly-array`, `non-empty-array`, `tuple`
- `record`, `map`, `set`, `typed-array`, `indexed`
- `iter`

Data and validation:

- `option`, `result`, `validation`, `these`, `nullable`
- `schema` for dependency-free Standard Schema V1 interoperability

Algebra and functions:

- `eq`, `hash`, `ord`, `ordering`, `semigroup`, `monoid`, `group`
- `function`, `guard`, `object`, `string`, `number`, `math`, `boolean`

Composition and programs:

- `compile`, `optic`, `match`
- `reader`, `state-fn`, `writer`, `recursion`

The package exposes 491 dual operations. Each supports direct data-first and
curried data-last calls under the same name. The [complete dual-call
catalogue](https://stopcock.dev/api/modules#complete-dual-call-catalogue) lists
both public shapes for every operation, including staged currying and optional
arguments.

```ts
const firstFive = A.take(values, 5)
const alsoFirstFive = A.take(5)(values)
pipe(values, A.take(5))
```

## Compiling pipelines

There is one runtime path: `pipe`, `flow`, `compile`, and `compilePure` are
all the same plain, left-to-right, sequential application. `compile` exists
so a call site can say "this is a pipeline I intend to compile" by name;
uncompiled, it behaves exactly like `pipe`, including callback order and
early-exit counts.

```ts
const summarize = compile(
  A.filter((value: number) => value > 0),
  A.map((value) => value * 2),
  A.sum,
)
```

The actual fusion is `@stopcock/fp-compiler`: a build-time transform that
recognizes a `pipe`/`flow`/`compile` call over these operators and replaces
it with an inlined, single-pass loop, so the runtime engine above never runs
for that call at all. See its own README for what it supports and what
fusing changes about callback order and count.

```ts
const explanation = explain(
  A.filter((value: number) => value > 0),
  A.map((value) => value * 2),
  A.sum,
)
// explanation === 'sequential', always -- explain() runs at runtime, and a
// call the compiler actually fused never reaches this code to be explained.
```

`compilePure` exists for source parity with the compiler's `assumePure`
option; at runtime it is `compile` under a different name. `explainPure` is
`explain` under a different name for the same reason.

Uncompiled `pipe` is already at or near hand-loop speed for most chains (see
"Performance tiers" below) -- you do not need the compiler to get reasonable
performance. Reach for `@stopcock/fp-compiler` for pipelines you've actually
measured as hot: add the plugin for your bundler, then run `stopcock check`
(the package's own CLI) to see which sites it recognized and which it didn't,
without changing any code:

```bash
stopcock check --strict src
```

A bailed site is not broken, it just runs the uncompiled path; the report
tells you why (an unsupported operator, a dynamic step, ambiguous imports)
so you can decide whether to restructure it or leave it alone.

## Performance tiers

Each row is its own contract with its own reference and its own cases;
geomeans from different rows must not be combined. A ratio is reference time
divided by Stopcock time, so greater than 1 means Stopcock was faster for
that row.

| Contract                            | Paired reference and cases                                 | Bun/JSC geo / min |
| ----------------------------------- | ---------------------------------------------------------- | ----------------: |
| Build compiler, stratified          | Frozen loop emitter, 44                                    |   1.785× / 0.839× |
| Build compiler, operation-complete  | Frozen operation emitter, 138 timed + 2 optimizer canaries |   1.049× / 0.158× |
| Uncompiled `pipe` floor (invariant) | ramda, 10                                                  |   1.848× / 1.193× |
| Direct `Iter` terminal              | Hand-written early-exit loop, 3                            |   0.834× / 0.787× |
| Broad `Iter` surface                | Frozen executor, 14                                        |   1.509× / 0.182× |
| `Array.without`                     | Frozen implementations, 27                                 |   1.974× / 0.938× |
| Typed arrays                        | Frozen implementations, 48                                 |   8.653× / 0.373× |
| Typed arrays                        | Native typed-array equivalents, 48                         |   1.072× / 0.690× |
| `pipe` dispatch                     | Frozen dispatcher, 4                                       |   1.081× / 1.018× |
| Core utilities                      | Frozen implementations, 18                                 |   5.135× / 0.748× |
| Data and functional modules         | Frozen implementations, 11                                 |   2.311× / 0.786× |
| Structural modules                  | Frozen implementations, 15                                 |   2.317× / 0.999× |
| Scalar, text, and hash              | Frozen implementations, 11                                 |   2.008× / 0.988× |
| Recursion, match, schema, writer    | Frozen implementations, 11                                 |   1.816× / 0.464× |

Measured 28 July 2026 on Darwin arm64, Bun 1.3.14/JavaScriptCore, ambient
load (no attempt made to get a quiet machine -- these gates are designed to
pass under normal development load, and re-run repeatedly to confirm it).
Node/V8 isn't in this table: this pass didn't have a working Node+tsx
toolchain to measure it with, so rather than carry forward an old Node
number next to a fresh Bun one, it's left out.

A handful of rows carry a documented, evidenced floor below the shared
default for specific cases -- an early-exit or expansion shape that the
runtime engine's removal (see "Compiling pipelines" above) intentionally
stopped optimizing at the runtime level, a genuinely bimodal case across
process runs, or an architectural gap against one frozen reference's
strategy -- rather than every case in that row clearing one blanket bar.
See the comments in each gate under `benchmarks/src/reference/` for the
specific reasoning and evidence behind each one.

Each gate validates provenance, population, semantics, sampling shape, raw
samples, recomputed statistics, confidence bounds, and performance floors.
The compiler-operation lane measures both sampler orientations in fresh
workers and retains all four timing arrays. `length` and `isEmpty` remain
validated code-generation canaries because JavaScriptCore reduces their
fixed-input repetitions to counter-loop work; they are not presented as
standalone latency measurements. CI reruns the contracts with Bun 1.3.14 and
Node 22 on Linux x64 and macOS arm64 and retains raw plus evaluated artifacts.

The package stays compatible with CSP policies that omit `unsafe-eval`: the
public runtime graph contains no `eval`, `new Function`, function-source
parsing, or dynamically loaded JIT. The optional compiler transforms source
during the build and is not imported by the emitted application at runtime.

## Lazy iteration

`Iter` replaces the old `Stream` API. It is lazy, re-iterable when its source
is, closes upstream iterators on early termination, and uses Option terminals.

```ts
const values = pipe(
  Iter.range(0, Infinity),
  Iter.filter((value) => value % 2 === 0),
  Iter.take(3),
  Iter.toArray,
)
```

Default to `array`. It wins 2-4x over `Iter` on chains that consume the
whole input, at every size measured. Reach for `Iter` when a chain stops
early -- `find`, `take`, `head` -- on an input of 1,000 elements or more:
eager loses there, and `Iter` wins 5-884x on those same shapes. Compile
whichever chain you've actually measured as hot (see "Compiling pipelines"
above).

For asynchronous sources, bounded concurrency, cancellation, and Task
terminals, use `@stopcock/async/async-iter`.

See [MIGRATION.md](./MIGRATION.md) for the 1.x to 2.0 clean break.
