import { expectTypeOf, test } from 'vite-plus/test'
import * as P from '..'

type Event =
  | { readonly type: 'created'; readonly id: number }
  | { readonly type: 'renamed'; readonly id: number; readonly name: string }
  | { readonly type: 'deleted'; readonly id: number }

test('builder patterns narrow unions and type named selections', () => {
  const event = null as unknown as Event
  const output = P.match(event)
    .with({ type: 'renamed', name: P.select('name', P.string) }, (matched, selections) => {
      expectTypeOf(matched).toMatchTypeOf<Extract<Event, { type: 'renamed' }>>()
      expectTypeOf(selections.name).toEqualTypeOf<string>()
      return selections.name
    })
    .with({ type: 'created' }, ({ id }) => id)
    .with({ type: 'deleted' }, ({ id }) => id)
    .exhaustive()

  expectTypeOf(output).toEqualTypeOf<string | number>()
})

test('incomplete matches cannot call exhaustive', () => {
  const event = null as unknown as Event
  const incomplete = P.match(event).with({ type: 'created' }, ({ id }) => id)
  // @ts-expect-error created is handled, but renamed and deleted remain.
  incomplete.exhaustive()
})

test('guards and structural predicates refine unknown values', () => {
  const isPoint = P.isMatching({
    kind: 'point',
    coordinates: P.tuple(P.number, P.number),
  })
  const input: unknown = { kind: 'point', coordinates: [1, 2] }
  if (isPoint(input)) {
    expectTypeOf(input.coordinates).toMatchTypeOf<readonly [number, number]>()
  }
})
