# @stopcock/fp-testing

Deterministic law checks, edge-case data, and iterator probes for functional
TypeScript libraries. The package has no runtime dependencies and its
structural interfaces accept Stopcock instances without adapters.

```bash
bun add -d @stopcock/fp-testing
```

```ts
import { assertLaws, checkMonoidLaws } from '@stopcock/fp-testing/laws'
import * as Monoid from '@stopcock/fp/monoid'

assertLaws(checkMonoidLaws(Monoid.numberSum, { equals: Object.is }, [-1, 0, 1, Number.NaN]))
```

Iterator probes make laziness and cleanup assertions explicit:

```ts
import { trackedIterable } from '@stopcock/fp-testing/iterable'
import * as Iter from '@stopcock/fp/iter'

const { iterable, probe } = trackedIterable([1, 2, 3])
Iter.toArray(Iter.take(iterable, 1))

console.log(probe.pulls) // 1
console.log(probe.returns) // 1
```

Subpaths:

- `@stopcock/fp-testing/laws` — Eq, Hash, Ord, Semigroup, Monoid, Group,
  Lens, and Iso laws with bounded deterministic reports.
- `@stopcock/fp-testing/data` — deterministic Option, Result, tuple, array,
  number, and string cases.
- `@stopcock/fp-testing/iterable` — tracked and throwing iterable fixtures plus
  small reference implementations.
