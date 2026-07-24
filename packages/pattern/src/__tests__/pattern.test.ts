import { describe, expect, it } from 'vite-plus/test'
import {
  PatternMatchError,
  array,
  discriminant,
  extract,
  finite,
  instanceOf,
  intersection,
  isMatching,
  literal,
  mapOf,
  match,
  not,
  nullish,
  number,
  optional,
  property,
  record,
  select,
  setOf,
  strict,
  string,
  tag,
  test,
  tuple,
  union,
  value,
  valueOr,
  when,
} from '..'

type Event =
  | { readonly type: 'created'; readonly id: number }
  | { readonly type: 'renamed'; readonly id: number; readonly name: string }
  | { readonly type: 'deleted'; readonly id: number }

describe('@stopcock/pattern', () => {
  it('matches exhaustive discriminated unions without a runtime registry', () => {
    const event: Event = { type: 'renamed', id: 2, name: 'Ada' }
    const output = discriminant('type', event, {
      created: ({ id }) => `created:${id}`,
      renamed: ({ name }) => `renamed:${name}`,
      deleted: ({ id }) => `deleted:${id}`,
    })

    expect(output).toBe('renamed:Ada')
  })

  it('matches _tag unions and literal values exhaustively', () => {
    type State = { readonly _tag: 'idle' } | { readonly _tag: 'ready'; readonly count: number }

    const state: State = { _tag: 'ready', count: 3 }
    expect(
      tag(state, {
        idle: () => 0,
        ready: ({ count }) => count,
      }),
    ).toBe(3)

    const direction: 'left' | 'right' = 'right'
    expect(
      value(direction, {
        left: () => -1,
        right: () => 1,
      }),
    ).toBe(1)
    expect(valueOr(direction, { left: () => -1 }, () => 0)).toBe(0)
  })

  it('supports nested structural matching and named selections', () => {
    const input: Event = { type: 'renamed', id: 7, name: 'Grace' }
    const output = match(input)
      .with(
        { type: 'renamed', name: select('name', string) },
        (event, { name }) => `${event.id}:${name.toUpperCase()}`,
      )
      .otherwise(() => 'other')

    expect(output).toBe('7:GRACE')
    expect(extract({ type: 'renamed', id: select('identifier', number) }, input)).toEqual({
      value: input,
      selections: { identifier: 7 },
    })
  })

  it('supports refinements, when clauses, and exhaustive builder matching', () => {
    const input: string | number = 42
    const output = match(input)
      .when(
        (candidate): candidate is number => typeof candidate === 'number',
        (candidate) => candidate + 1,
      )
      .with(string, (candidate) => candidate.length)
      .exhaustive()

    expect(output).toBe(43)
    expect(
      test(
        when<number>((candidate) => candidate > 10),
        input,
      ),
    ).toBe(true)
  })

  it('offers composable collection and logical patterns', () => {
    expect(test(array(finite), [1, 2, 3])).toBe(true)
    expect(test(tuple(literal('ok'), number), ['ok', 2])).toBe(true)
    expect(test(union(string, number), 'yes')).toBe(true)
    expect(test(intersection(number, not(literal(Number.NaN))), 4)).toBe(true)
    expect(test(optional(string), undefined)).toBe(true)
    expect(test(nullish, null)).toBe(true)
    expect(test(setOf(number), new Set([1, 2]))).toBe(true)
    expect(test(mapOf(string, number), new Map([['one', 1]]))).toBe(true)
  })

  it('distinguishes partial, strict, property, and instance patterns', () => {
    const value = { kind: 'point', x: 1, y: 2 }
    expect(test(record({ kind: 'point', x: number }), value)).toBe(true)
    expect(test(strict({ kind: 'point', x: number }), value)).toBe(false)
    expect(test(property('x', number), value)).toBe(true)
    expect(test(instanceOf(Date), new Date())).toBe(true)
  })

  it('creates reusable refinement guards', () => {
    const isStringArray = isMatching(array(string))
    const input: unknown = ['a', 'b']
    expect(isStringArray(input)).toBe(true)
    if (isStringArray(input)) {
      expect(input.join('')).toBe('ab')
    }
  })

  it('does not leak captures from failed alternatives', () => {
    const result = extract(
      union(
        { kind: 'wrong', value: select('captured') },
        { kind: 'right', value: select('captured') },
      ),
      { kind: 'right', value: 2 },
    )

    expect(result?.selections).toEqual({ captured: 2 })
  })

  it('distinguishes an unmatched case from a handler returning undefined', () => {
    expect(
      match(1)
        .with(1, () => undefined)
        .otherwise(() => 'fallback'),
    ).toBeUndefined()
    expect(() =>
      match('missing' as 'missing')
        .with('other' as never, () => 'no')
        .run(),
    ).not.toThrow()
    expect(() =>
      (
        match('missing') as unknown as {
          readonly exhaustive: () => never
        }
      ).exhaustive(),
    ).toThrow(PatternMatchError)
  })
})
