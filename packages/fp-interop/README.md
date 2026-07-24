# @stopcock/fp-interop

Explicit boundaries between `@stopcock/fp` values, foreign tagged values, and
native JavaScript protocols. The package has no runtime dependency on fp-ts,
Effect, or another FP runtime. `@stopcock/fp` is its only peer.

```bash
bun add @stopcock/fp @stopcock/fp-interop
```

## Foreign Option and Either values

Reading a foreign value uses a caller-supplied structural reader. Converting
back requires the foreign library's real constructors, so this package never
fabricates branded values with a type assertion.

```ts
import * as O from '@stopcock/fp/option'
import {
  fromOptionLike,
  toOptionLike,
} from '@stopcock/fp-interop/option-like'

const local = fromOptionLike(foreignOption, {
  read: (value) =>
    foreignIsSome(value)
      ? { _tag: 'Some', value: foreignValue(value) }
      : { _tag: 'None' },
})

const foreign = toOptionLike(O.some(42), {
  none: foreignNone,
  some: foreignSome,
})
```

`fromTaggedOption` and `fromTaggedEither` read the common
`None | Some` and `Left | Right` shapes used by fp-ts and Effect. Their
`decodeTagged*` counterparts accept `unknown` and validate the container
before reading it. Conversion in the other direction remains
constructor-driven via `toTaggedOptionWith` and `toTaggedEitherWith`.

Validation adapters use a `NonEmptyArray` error channel and reject an empty
foreign Left rather than casting it to non-empty.

## Native boundaries

The boundary helpers name potentially lossy or effectful semantics:

- `optionFromNullable`, `optionToNullable`, and `optionToUndefined`
- `captureThrown` and `resultOrThrow`
- `settlePromise`, `resultToPromise`, and `optionToPromise`
- `optionFromIterableFirst` and `resultFromIterableExactlyOne`
- async-iterable equivalents with the same `First` and `ExactlyOne` names

First-value and multiple-value reads close non-exhausted iterators.

## Standard Schema

```ts
import { decodeStandardSchema } from '@stopcock/fp-interop/standard-schema'

const result = await decodeStandardSchema(untrusted, schema)
```

The Standard Schema entry delegates to `@stopcock/fp/schema`. It provides
interop-oriented aliases and re-exports only the protocol types; it does not
define a competing schema runtime.

## JSON wire values

Wire encoders validate that encoded payloads are genuinely JSON-safe: finite
numbers, dense arrays, plain objects, no cycles, and no symbol keys.
Deserializers parse into `unknown` and always require explicit payload
decoders.

```ts
import { err, ok } from '@stopcock/fp/result'
import {
  deserializeResult,
  serializeResult,
} from '@stopcock/fp-interop/wire'

const encoded = serializeResult(result, encodeValue, encodeError)

const decoded = deserializeResult(
  text,
  (input) => typeof input === 'number' ? ok(input) : err('not a number'),
  (input) => typeof input === 'string' ? ok(input) : err('not a string'),
)
```

Option wire tags are `None | Some`; Result wire tags are `Err | Ok`. These are
versionable data-transfer shapes, not claims that the values belong to another
library.

## Node callbacks

Node callback adapters are isolated in `@stopcock/fp-interop/node`; the root
entry contains no Node-only API or import.

```ts
import { liftNodeCallback } from '@stopcock/fp-interop/node'

const read = liftNodeCallback(readFile, (error) => ({
  kind: 'ReadError',
  cause: error,
}))

const result = await read('config.json')
```

The adapter returns a native `Promise<Result<...>>`, settles only once, and
captures synchronous registration throws. It does not introduce task
execution, cancellation, scopes, fibers, or dependency injection.

## Exports

- `@stopcock/fp-interop`
- `@stopcock/fp-interop/option-like`
- `@stopcock/fp-interop/either-like`
- `@stopcock/fp-interop/boundary`
- `@stopcock/fp-interop/standard-schema`
- `@stopcock/fp-interop/wire`
- `@stopcock/fp-interop/node`
