# @stopcock/parser

Fast, typed parser combinators for synchronous text formats and small
languages. Parsers operate on one source string plus an absolute offset, so
successful parsing does not repeatedly allocate `remaining` substrings or
line/column objects.

```bash
bun add @stopcock/parser @stopcock/fp
```

`@stopcock/fp` is a peer dependency. Final parse operations return its
`Result`, optional grammar branches return its `Option`, and `mapResult` /
`mapOption` connect domain validation without adapters.

## Example

```ts
import { between, comma, integer, parse, sepEndBy, symbol } from '@stopcock/parser'

const integers = between(symbol('['), sepEndBy(integer, comma), symbol(']'))

const result = parse(integers, '[1, 2, 3,]')
```

## Core model

`Parser<A>` is a function from `(source, absoluteOffset)` to a compact reply.
The success path contains only `{ ok, value, position }`. Use:

- `parse` for complete input and `parsePrefix` for a prefix plus remainder;
- `parseOption` when diagnostics are intentionally discarded;
- `unsafeParse` when a thrown `ParserError` is appropriate;
- `runReply` for low-level embedding;
- `defer` / `lazy` for recursive grammars.

Failures retain expected labels, consumption and commit state, context, and
the farthest offset. Public `ParseError` values add one-based line/column,
source span, and the found code point only at the parse boundary.

## Combinators

The package includes:

- `map`, `flatMap`, `filter`, `mapResult`, `mapOption`, `sequence`,
  `sequenceObject`, `pair`, `skipLeft`, `skipRight`, and `between`;
- `choice`, `orElse`, `attempt`, `cut`, `lookAhead`, `notFollowedBy`,
  `label`, `context`, and `mapError`;
- `optional`, `maybe`, `many`, `many1`, `repeat`, `count`, `skipMany`,
  `sepBy`, `sepBy1`, `sepEndBy`, and `until`;
- stack-safe `chainLeft1` and `chainRight1`;
- `withSpan` and `position` for source-aware ASTs.

Repeating combinators detect successful zero-width parsers and return an error
instead of hanging.

## Primitives and tokens

Character, string, sticky-regex, lookahead, whitespace, identifier, numeric,
boolean, null, and quoted-string primitives are included. `token`, `lexeme`,
`symbol`, and `keyword` consume configurable ignored input. Common punctuation
tokens such as `comma`, `openParen`, `closeBracket`, and `colon` are exported.

Subpath imports are available from `@stopcock/parser/core`,
`@stopcock/parser/combinators`, and `@stopcock/parser/primitives`.
