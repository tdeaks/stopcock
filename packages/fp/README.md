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
  named object shapes—including interfaces without an index signature—belong
  in `object`, whose operations preserve their declared shape.
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

- `dual`, `compile`, `optic`, `match`
- `reader`, `state-fn`, `writer`, `recursion`

Every dual API supports data-first and data-last calls:

```ts
A.take(values, 5)
pipe(values, A.take(5))
```

## Portable compilation

Tagged pipelines share a bounded, callback-free shape cache and lower to
portable loops. Runtime behavior never changes after warm-up.

```ts
const summarize = compile(
  A.filter((value: number) => value > 0),
  A.map((value) => value * 2),
  A.sum,
)

const explanation = explain(
  A.filter((value: number) => value > 0),
  A.map((value) => value * 2),
  A.sum,
)
// explanation.executor === 'portable'
// explanation.runtimeCodeGeneration === false
```

Compact and optimized pipelines admit `take` and `drop` to streaming fusion
only when their quota is already a primitive number. The trusted private
binding stores its normalized integer value; the public `_fn` diagnostic still
shows the original argument. `dropWhile` remains a fused streaming operator.
Fused `take` preserves the established one-item lookahead at its lexical
position. Object, symbol, bigint, and other coercible quotas fail closed to the
real public callable after the upstream segment materializes, preserving
native `slice`, Array species, repeated coercions, and thrown-error timing.

`compilePure` can apply opt-in rewrites such as unused-map elision before
`length`. `explainPure`, imported from `@stopcock/fp/fusion/debug`, reports the
actual rewrites before you choose pure semantics. `sort -> take` deliberately
performs the full sort boundary before the selected tier's ordinary `take`;
the retired bounded top-k implementation could not preserve changing-length
Proxies or custom snapshot mutation and errors without a stronger, explicit
input contract.

For build-time source specialization, use `@stopcock/fp-compiler`.

## Performance tiers

FP 2.0 measures separate contracts with different comparators. A ratio is
reference time divided by Stopcock time, so greater than 1 means Stopcock was
faster for that row. Geomeans from different contracts must not be combined.

| Contract                           | Paired reference and cases                                | Bun/JSC geo / min | Node/V8 geo / min |
| ---------------------------------- | --------------------------------------------------------- | ----------------: | ----------------: |
| Portable `compile`                 | Frozen loop emitter, 44                                   |   1.677× / 0.943× |   1.379× / 0.973× |
| Build compiler, stratified         | Frozen loop emitter, 44                                   |   2.044× / 0.906× |   1.572× / 0.997× |
| Build compiler, operation-complete | Frozen operation emitter, 37 timed + 2 optimizer canaries |   1.105× / 0.866× |   1.181× / 0.924× |
| Direct `Iter` terminal             | Hand-written early-exit loop, 3                           |   0.991× / 0.963× |   0.731× / 0.661× |
| Broad `Iter` surface               | Frozen executor, 14                                       |   1.941× / 1.047× |   2.159× / 0.999× |
| `Array.without`                    | Frozen implementations, 27                                |   2.002× / 0.988× |                  — |
| Typed arrays                       | Frozen implementations, 48                                |   8.879× / 0.973× |   2.272× / 0.814× |
| Typed arrays                       | Native typed-array equivalents, 48                        |   1.149× / 0.716× |   1.211× / 0.869× |
| Callback-identity churn            | Frozen compile contract, 4                                |   2.254× / 1.013× |   1.615× / 0.985× |
| `pipe` dispatch                    | Frozen dispatcher, 4                                      |   1.097× / 1.025× |   1.072× / 1.033× |
| Core utilities                     | Frozen implementations, 18                                |   3.452× / 0.669× |   2.272× / 0.728× |
| Data and functional modules        | Frozen implementations, 11                                |   2.353× / 0.790× |   1.454× / 0.861× |
| Structural modules                 | Frozen implementations, 15                                |   1.813× / 0.967× |   2.113× / 0.847× |
| Scalar, text, and hash             | Frozen implementations, 11                                |   2.031× / 0.985× |   1.344× / 0.928× |
| Recursion, match, schema, writer   | Frozen implementations, 11                                |   3.229× / 0.988× |   4.345× / 0.946× |

These are final paired local measurements from 23 July 2026 on Darwin arm64
using Bun 1.3.14/JavaScriptCore and Node 24.18.0/V8 13.6. Raw minima are shown
even when a pinned contract documents an unavoidable semantic or native-call
trade-off; gates apply explicit engine and case policies rather than hiding
those rows.

Each gate validates provenance, population, semantics, sampling shape, raw
samples, recomputed statistics, confidence bounds, and performance floors.
The compiler-operation lane measures both sampler orientations in fresh
workers and retains all four timing arrays. `length` and `isEmpty` remain
validated code-generation canaries because JavaScriptCore reduces their
fixed-input repetitions to counter-loop work; they are not presented as
standalone latency measurements. CI reruns the contracts with Bun 1.3.14 and
Node 22 on Linux x64 and macOS arm64 and retains raw plus evaluated artifacts.

The portable runtime and fused `Iter` tier remain compatible with CSP policies
that omit `unsafe-eval`: the public runtime graph contains no `eval`,
`new Function`, function-source parsing, or dynamically loaded JIT. The
optional compiler transforms source during the build and is not imported by
the emitted application at runtime.

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

For asynchronous sources, bounded concurrency, cancellation, and Task
terminals, use `@stopcock/async/async-iter`.

See [MIGRATION.md](./MIGRATION.md) for the 1.x to 2.0 clean break.
