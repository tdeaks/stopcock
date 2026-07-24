import { isErr, type Result } from '@stopcock/fp/result'
import { isNone, none, some, type Option } from '@stopcock/fp/option'
import { failure, markConsumed, mergeFailures, success } from './internal'
import type {
  OffsetSpan,
  ParseFailure,
  ParseIssue,
  Parser,
  ParserValue,
  ParseReply,
  Spanned,
} from './types'

export type Predicate<A> = (value: A) => boolean
export type Refinement<A, B extends A> = (value: A) => value is B

export const map =
  <A, B>(parser: Parser<A>, transform: (value: A) => B): Parser<B> =>
  (source, position) => {
    const result = parser(source, position)
    return result.ok ? success(transform(result.value), result.position) : result
  }

export const as = <A, B>(parser: Parser<A>, value: B): Parser<B> => map(parser, () => value)

export const voided = <A>(parser: Parser<A>): Parser<void> => as(parser, undefined)

export const flatMap =
  <A, B>(parser: Parser<A>, next: (value: A) => Parser<B>): Parser<B> =>
  (source, position) => {
    const first = parser(source, position)
    if (!first.ok) return first
    const second = next(first.value)(source, first.position)
    return second.ok ? second : markConsumed(second, first.position !== position)
  }

export const flatten = <A>(parser: Parser<Parser<A>>): Parser<A> =>
  flatMap(parser, (inner) => inner)

export const mapResult =
  <A, B, E>(
    parser: Parser<A>,
    validate: (value: A) => Result<B, E>,
    describeError: (error: E) => string = String,
  ): Parser<B> =>
  (source, position) => {
    const parsed = parser(source, position)
    if (!parsed.ok) return parsed
    const validated = validate(parsed.value)
    return isErr(validated)
      ? failure(parsed.position, 'a valid value', {
          message: describeError(validated.error),
          consumed: parsed.position !== position,
        })
      : success(validated.value, parsed.position)
  }

export const mapOption =
  <A, B>(
    parser: Parser<A>,
    validate: (value: A) => Option<B>,
    expected = 'a valid value',
  ): Parser<B> =>
  (source, position) => {
    const parsed = parser(source, position)
    if (!parsed.ok) return parsed
    const validated = validate(parsed.value)
    return isNone(validated)
      ? failure(parsed.position, expected, {
          consumed: parsed.position !== position,
        })
      : success(validated.value, parsed.position)
  }

export function filter<A, B extends A>(
  parser: Parser<A>,
  refinement: Refinement<A, B>,
  expected: string,
): Parser<B>
export function filter<A>(parser: Parser<A>, predicate: Predicate<A>, expected: string): Parser<A>
export function filter<A>(parser: Parser<A>, predicate: Predicate<A>, expected: string): Parser<A> {
  return (source, position) => {
    const result = parser(source, position)
    if (!result.ok) return result
    return predicate(result.value)
      ? result
      : failure(result.position, expected, {
          consumed: result.position !== position,
        })
  }
}

export const tap = <A>(parser: Parser<A>, effect: (value: A) => void): Parser<A> =>
  map(parser, (value) => {
    effect(value)
    return value
  })

export const sequence =
  <const Parsers extends readonly Parser<unknown>[]>(
    ...parsers: Parsers
  ): Parser<{
    -readonly [Key in keyof Parsers]: ParserValue<Parsers[Key]>
  }> =>
  (source, position) => {
    const values: unknown[] = new Array(parsers.length)
    let cursor = position

    for (let index = 0; index < parsers.length; index++) {
      const result = parsers[index](source, cursor)
      if (!result.ok) return markConsumed(result, cursor !== position)
      values[index] = result.value
      cursor = result.position
    }

    return success(
      values as {
        -readonly [Key in keyof Parsers]: ParserValue<Parsers[Key]>
      },
      cursor,
    )
  }

export const sequenceObject = <const Parsers extends Readonly<Record<string, Parser<unknown>>>>(
  parsers: Parsers,
): Parser<{ readonly [Key in keyof Parsers]: ParserValue<Parsers[Key]> }> => {
  const keys = Object.keys(parsers) as Array<keyof Parsers>
  return (source, position) => {
    const output: Partial<Record<keyof Parsers, unknown>> = {}
    let cursor = position
    for (let index = 0; index < keys.length; index++) {
      const key = keys[index]
      const result = parsers[key](source, cursor)
      if (!result.ok) return markConsumed(result, cursor !== position)
      output[key] = result.value
      cursor = result.position
    }
    return success(output as { readonly [Key in keyof Parsers]: ParserValue<Parsers[Key]> }, cursor)
  }
}

export const pair = <A, B>(
  leftParser: Parser<A>,
  rightParser: Parser<B>,
): Parser<readonly [A, B]> =>
  map(sequence(leftParser, rightParser), ([left, right]) => [left, right] as const)

export const skipLeft = <A, B>(leftParser: Parser<A>, rightParser: Parser<B>): Parser<B> =>
  map(sequence(leftParser, rightParser), (values) => values[1])

export const skipRight = <A, B>(leftParser: Parser<A>, rightParser: Parser<B>): Parser<A> =>
  map(sequence(leftParser, rightParser), (values) => values[0])

export const between = <Open, A, Close>(
  open: Parser<Open>,
  parser: Parser<A>,
  close: Parser<Close>,
): Parser<A> => skipLeft(open, skipRight(parser, close))

export const choice =
  <const Parsers extends readonly Parser<unknown>[]>(
    ...parsers: Parsers
  ): Parser<ParserValue<Parsers[number]>> =>
  (source, position) => {
    let best: ParseFailure | undefined

    for (let index = 0; index < parsers.length; index++) {
      const result = parsers[index](source, position)
      if (result.ok) {
        return result as ParseReply<ParserValue<Parsers[number]>>
      }
      best = mergeFailures(best, result)
      if (result.committed || result.consumed) return result
    }

    return best ?? failure(position, 'an alternative')
  }

export const orElse = <A, B>(parser: Parser<A>, alternative: Parser<B>): Parser<A | B> =>
  choice(parser, alternative)

/**
 * Restore backtracking for a parser that consumed input before failing.
 */
export const attempt =
  <A>(parser: Parser<A>): Parser<A> =>
  (source, position) => {
    const result = parser(source, position)
    return result.ok ? result : { ...result, consumed: false, committed: false }
  }

/**
 * Prevent alternatives from being attempted after this parser fails.
 */
export const cut =
  <A>(parser: Parser<A>): Parser<A> =>
  (source, position) => {
    const result = parser(source, position)
    return result.ok ? result : { ...result, committed: true }
  }

export const label =
  <A>(parser: Parser<A>, expected: string): Parser<A> =>
  (source, position) => {
    const result = parser(source, position)
    return result.ok
      ? result
      : {
          ...result,
          issue: { ...result.issue, expected: [expected] },
        }
  }

export const context =
  <A>(name: string, parser: Parser<A>): Parser<A> =>
  (source, position) => {
    const result = parser(source, position)
    return result.ok
      ? result
      : {
          ...result,
          issue: {
            ...result.issue,
            contexts: [name, ...result.issue.contexts],
          },
        }
  }

export const mapError =
  <A>(parser: Parser<A>, transform: (issue: ParseIssue) => ParseIssue): Parser<A> =>
  (source, position) => {
    const result = parser(source, position)
    return result.ok ? result : { ...result, issue: transform(result.issue) }
  }

export const lookAhead =
  <A>(parser: Parser<A>): Parser<A> =>
  (source, position) => {
    const result = parser(source, position)
    return result.ok
      ? success(result.value, position)
      : { ...result, consumed: false, committed: false }
  }

export const notFollowedBy =
  (parser: Parser<unknown>, expected = 'input not to match'): Parser<void> =>
  (source, position) => {
    const result = parser(source, position)
    return result.ok ? failure(position, expected) : success(undefined, position)
  }

export const optional =
  <A>(parser: Parser<A>): Parser<Option<A>> =>
  (source, position) => {
    const result = parser(source, position)
    if (result.ok) return success(some(result.value), result.position)
    return result.consumed || result.committed ? result : success(none, position)
  }

export const maybe = <A>(parser: Parser<A>): Parser<A | undefined> =>
  map(optional(parser), (value) => (isNone(value) ? undefined : value.value))

export const withDefault = <A, B>(parser: Parser<A>, fallback: B): Parser<A | B> =>
  map(optional(parser), (value) => (isNone(value) ? fallback : value.value))

const zeroWidthFailure = (position: number, consumed: boolean): ParseFailure =>
  failure(position, 'a parser that consumes input', {
    message: 'A repeating parser succeeded without consuming input',
    consumed,
    committed: true,
  })

export const many =
  <A>(parser: Parser<A>): Parser<A[]> =>
  (source, position) => {
    const output: A[] = []
    let cursor = position

    while (true) {
      const result = parser(source, cursor)
      if (result.ok) {
        if (result.position === cursor) {
          return zeroWidthFailure(cursor, cursor !== position)
        }
        output.push(result.value)
        cursor = result.position
        continue
      }
      if (result.consumed || result.committed) {
        return markConsumed(result, cursor !== position)
      }
      return success(output, cursor)
    }
  }

export const many1 =
  <A>(parser: Parser<A>): Parser<[A, ...A[]]> =>
  (source, position) => {
    const first = parser(source, position)
    if (!first.ok) return first
    if (first.position === position) return zeroWidthFailure(position, false)

    const output: [A, ...A[]] = [first.value]
    let cursor = first.position
    while (true) {
      const result = parser(source, cursor)
      if (result.ok) {
        if (result.position === cursor) return zeroWidthFailure(cursor, true)
        output.push(result.value)
        cursor = result.position
        continue
      }
      if (result.consumed || result.committed) return markConsumed(result, true)
      return success(output, cursor)
    }
  }

export const repeat = <A>(parser: Parser<A>, minimum: number, maximum = minimum): Parser<A[]> => {
  if (
    !Number.isSafeInteger(minimum) ||
    !Number.isSafeInteger(maximum) ||
    minimum < 0 ||
    maximum < minimum
  ) {
    throw new RangeError('repeat requires 0 <= minimum <= maximum')
  }

  return (source, position) => {
    const output: A[] = []
    let cursor = position

    while (output.length < maximum) {
      const result = parser(source, cursor)
      if (result.ok) {
        if (result.position === cursor) {
          return zeroWidthFailure(cursor, cursor !== position)
        }
        output.push(result.value)
        cursor = result.position
        continue
      }
      if (result.consumed || result.committed) {
        return markConsumed(result, cursor !== position)
      }
      break
    }

    return output.length >= minimum
      ? success(output, cursor)
      : failure(cursor, `at least ${minimum} repetitions`, {
          consumed: cursor !== position,
        })
  }
}

export const count = <A>(parser: Parser<A>, amount: number): Parser<A[]> =>
  repeat(parser, amount, amount)

export const skipMany =
  (parser: Parser<unknown>): Parser<void> =>
  (source, position) => {
    let cursor = position
    while (true) {
      const result = parser(source, cursor)
      if (result.ok) {
        if (result.position === cursor) {
          return zeroWidthFailure(cursor, cursor !== position)
        }
        cursor = result.position
        continue
      }
      if (result.consumed || result.committed) {
        return markConsumed(result, cursor !== position)
      }
      return success(undefined, cursor)
    }
  }

export const sepBy1 =
  <A, Separator>(parser: Parser<A>, separator: Parser<Separator>): Parser<[A, ...A[]]> =>
  (source, position) => {
    const first = parser(source, position)
    if (!first.ok) return first
    const output: [A, ...A[]] = [first.value]
    let cursor = first.position

    while (true) {
      const separated = separator(source, cursor)
      if (!separated.ok) {
        if (separated.consumed || separated.committed) {
          return markConsumed(separated, cursor !== position)
        }
        return success(output, cursor)
      }
      if (separated.position === cursor) {
        return zeroWidthFailure(cursor, cursor !== position)
      }
      const item = parser(source, separated.position)
      if (!item.ok) return markConsumed(item, true)
      if (item.position === separated.position) {
        return zeroWidthFailure(item.position, true)
      }
      output.push(item.value)
      cursor = item.position
    }
  }

export const sepBy =
  <A, Separator>(parser: Parser<A>, separator: Parser<Separator>): Parser<A[]> =>
  (source, position) => {
    const result = sepBy1(parser, separator)(source, position)
    if (result.ok) return result
    return result.consumed || result.committed ? result : success([], position)
  }

export const sepEndBy =
  <A, Separator>(parser: Parser<A>, separator: Parser<Separator>): Parser<A[]> =>
  (source, position) => {
    const output: A[] = []
    let cursor = position
    const first = parser(source, cursor)
    if (!first.ok) {
      return first.consumed || first.committed ? first : success(output, position)
    }
    output.push(first.value)
    cursor = first.position

    while (true) {
      const separated = separator(source, cursor)
      if (!separated.ok) {
        return separated.consumed || separated.committed
          ? markConsumed(separated, cursor !== position)
          : success(output, cursor)
      }
      if (separated.position === cursor) return zeroWidthFailure(cursor, true)
      const item = parser(source, separated.position)
      if (!item.ok) {
        return item.consumed || item.committed
          ? markConsumed(item, true)
          : success(output, separated.position)
      }
      if (item.position === separated.position) {
        return zeroWidthFailure(item.position, true)
      }
      output.push(item.value)
      cursor = item.position
    }
  }

export const withSpan =
  <A>(parser: Parser<A>): Parser<Spanned<A>> =>
  (source, position) => {
    const result = parser(source, position)
    return result.ok
      ? success(
          {
            value: result.value,
            span: { start: position, end: result.position },
          },
          result.position,
        )
      : result
  }

export const span = <A>(parser: Parser<A>): Parser<OffsetSpan> =>
  map(withSpan(parser), (value) => value.span)

export type BinaryOperator<A> = (left: A, right: A) => A

export const chainLeft1 =
  <A>(operand: Parser<A>, operator: Parser<BinaryOperator<A>>): Parser<A> =>
  (source, position) => {
    const first = operand(source, position)
    if (!first.ok) return first
    let value = first.value
    let cursor = first.position

    while (true) {
      const operation = operator(source, cursor)
      if (!operation.ok) {
        return operation.consumed || operation.committed
          ? markConsumed(operation, cursor !== position)
          : success(value, cursor)
      }
      const right = operand(source, operation.position)
      if (!right.ok) return markConsumed(right, true)
      if (right.position === cursor) return zeroWidthFailure(cursor, true)
      value = operation.value(value, right.value)
      cursor = right.position
    }
  }

export const chainRight1 =
  <A>(operand: Parser<A>, operator: Parser<BinaryOperator<A>>): Parser<A> =>
  (source, position) => {
    const first = operand(source, position)
    if (!first.ok) return first
    const values: A[] = [first.value]
    const operations: BinaryOperator<A>[] = []
    let cursor = first.position

    while (true) {
      const operation = operator(source, cursor)
      if (!operation.ok) {
        if (operation.consumed || operation.committed) {
          return markConsumed(operation, cursor !== position)
        }
        break
      }
      const right = operand(source, operation.position)
      if (!right.ok) return markConsumed(right, true)
      if (right.position === cursor) return zeroWidthFailure(cursor, true)
      operations.push(operation.value)
      values.push(right.value)
      cursor = right.position
    }

    let value = values[values.length - 1]
    for (let index = operations.length - 1; index >= 0; index--) {
      value = operations[index](values[index], value)
    }
    return success(value, cursor)
  }

export const until =
  <A, End>(parser: Parser<A>, end: Parser<End>): Parser<A[]> =>
  (source, position) => {
    const output: A[] = []
    let cursor = position

    while (true) {
      const ending = attempt(end)(source, cursor)
      if (ending.ok) return success(output, ending.position)

      const item = parser(source, cursor)
      if (!item.ok) {
        return mergeFailures(
          markConsumed(ending, cursor !== position),
          markConsumed(item, cursor !== position),
        )
      }
      if (item.position === cursor) {
        return zeroWidthFailure(cursor, cursor !== position)
      }
      output.push(item.value)
      cursor = item.position
    }
  }
