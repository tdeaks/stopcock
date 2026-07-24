import type { Option } from '@stopcock/fp/option'
import type { Result } from '@stopcock/fp/result'
import { expectTypeOf, test } from 'vite-plus/test'
import {
  char,
  choice,
  filter,
  integer,
  optional,
  parse,
  sequence,
  sequenceObject,
  string,
  type ParseError,
  type Parser,
} from '..'

test('parser combinators preserve tuple, object, union, and integration types', () => {
  const tuple = sequence(string('count'), char(':'), integer)
  expectTypeOf(tuple).toEqualTypeOf<Parser<['count', ':', number]>>()

  const object = sequenceObject({
    label: string('count'),
    value: integer,
  })
  expectTypeOf(object).toEqualTypeOf<Parser<{ readonly label: 'count'; readonly value: number }>>()

  expectTypeOf(choice(string('yes'), integer)).toEqualTypeOf<Parser<'yes' | number>>()
  expectTypeOf(optional(integer)).toEqualTypeOf<Parser<Option<number>>>()
  expectTypeOf(parse(integer, '1')).toEqualTypeOf<Result<number, ParseError>>()
})

test('filter refinements narrow parser values', () => {
  const input: Parser<string | number> = choice(string('value'), integer)
  const numbers = filter(input, (value): value is number => typeof value === 'number', 'a number')
  expectTypeOf(numbers).toEqualTypeOf<Parser<number>>()
})
