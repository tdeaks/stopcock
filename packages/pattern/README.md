# @stopcock/pattern

Exhaustive, structural pattern matching for TypeScript. Patterns are plain
values plus tiny predicate objects. There is no service container, effect
runtime, code generation step, or global registry.

```bash
bun add @stopcock/pattern
```

## Exhaustive matching

```ts
import { match, select, string } from '@stopcock/pattern'

type Event =
  | { type: 'created'; id: number }
  | { type: 'renamed'; id: number; name: string }
  | { type: 'deleted'; id: number }

const label = (event: Event) =>
  match(event)
    .with({ type: 'created' }, ({ id }) => `created ${id}`)
    .with(
      { type: 'renamed', name: select('name', string) },
      ({ id }, { name }) => `renamed ${id} to ${name}`,
    )
    .with({ type: 'deleted' }, ({ id }) => `deleted ${id}`)
    .exhaustive()
```

`exhaustive()` is only callable after every member of a discriminated union is
covered. Use `otherwise(handler)` for an explicit fallback or `run()` when an
unmatched result should be `undefined`.

For dispatch tables, `discriminant(key, value, handlers)`, `tag(value,
handlers)`, and `value(value, handlers)` require a complete handler map.

## Patterns

Literal values and nested object/tuple patterns work directly. Reusable
combinators include:

- primitive matchers: `string`, `number`, `finite`, `bigint`, `boolean`,
  `symbol`, `object`, `defined`, and `nullish`;
- `literal`, `union`/`or`, `intersection`/`and`, and `not`;
- `when`/`guard`, `instanceOf`, `property`, `optional`, and `nullable`;
- `array`, `tuple`, partial `record`, exact-key `strict`, `setOf`, and `mapOf`;
- `select(name, pattern)` for typed named captures;
- `test`, `isMatching`, `extract`, and `assert` for guard-style use.

Subpath imports are available from `@stopcock/pattern/match` and
`@stopcock/pattern/pattern`.
