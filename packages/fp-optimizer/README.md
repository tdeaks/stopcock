# @stopcock/fp-optimizer

The maximum-throughput tier for [`@stopcock/fp`](https://www.npmjs.com/package/@stopcock/fp).

It swaps the generic exact executor for a bank of 233 fused loop runners
covering the common pipeline shapes. Same results, same callback order, same
early-exit counts — only faster.

## You probably don't need this

`@stopcock/fp` on its own is complete. It ships sequential `pipe`/`flow`,
compact fusion, and the direct operations, and none of them get slower because
you skipped this package.

Reach for the optimizer when you have measured a hot pipeline and want the
fused runners. If you build with a bundler, try
[`@stopcock/fp-compiler`](https://www.npmjs.com/package/@stopcock/fp-compiler)
first: it beats both tiers and leaves no runtime engine in your bundle at all.

## Install

```sh
npm install @stopcock/fp @stopcock/fp-optimizer
```

Both, deliberately. `@stopcock/fp` has no dependency or optional peer on this
package, so it can never become a hidden install cost for people who don't want
it. This package declares an exact peer on `@stopcock/fp`.

## Use

```ts
import { filter, map } from '@stopcock/fp/array'
import { pipe } from '@stopcock/fp-optimizer'

pipe([1, 2, 3], map((x) => x * 2), filter((x) => x > 2))
```

## Compatibility

Matching version ranges are necessary but not sufficient, so the two packages
negotiate on hashes at runtime: ABI version, protocol version, and the semantic
manifest the runners were generated against. A mismatched pair executes no
fused runner — it routes to the exact executor or raises
`IncompatibleOptimizerError`. It never guesses.

```ts
import { assertCompatible, negotiationFailure } from '@stopcock/fp-optimizer'

assertCompatible() // throws on a mismatched install
negotiationFailure // or inspect the reason yourself
```

Operator authenticity stays inside `@stopcock/fp`. This package receives only
vetted, call-local data and cannot register an operator or claim that anything
is Stopcock-verified.

## License

MIT
