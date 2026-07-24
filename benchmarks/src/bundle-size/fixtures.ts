import { FP_CONSUMER_EXPECTED } from './expected'
import type { ConsumerFixtureDefinition, JsonValue } from './types'

const source = (body: string): string => `${body.trim()}\n`

const active = <const Id extends keyof typeof FP_CONSUMER_EXPECTED>(
  id: Id,
  fixtureSource: string,
  options: Readonly<{
    entryKind?: ConsumerFixtureDefinition['entryKind']
    sourceKind?: ConsumerFixtureDefinition['sourceKind']
  }> = {},
): Readonly<{
  readonly id: Id
  readonly entryKind: ConsumerFixtureDefinition['entryKind']
  readonly sourceKind: ConsumerFixtureDefinition['sourceKind']
  readonly source: string
  readonly expected: (typeof FP_CONSUMER_EXPECTED)[Id]
  readonly applicability: Readonly<{ status: 'active' }>
}> =>
  Object.freeze({
    id,
    entryKind: options.entryKind ?? 'single',
    sourceKind: options.sourceKind ?? 'consumer',
    source: source(fixtureSource),
    expected: FP_CONSUMER_EXPECTED[id],
    applicability: Object.freeze({ status: 'active' }),
  })

const expectedExportAbsent = <const Id extends string>(
  id: Id,
  expectedSpecifier: string,
  activationStage: 'S6' | 'S9',
): Readonly<{
  readonly id: Id
  readonly entryKind: 'single'
  readonly sourceKind: 'consumer'
  readonly source: null
  readonly expected: null
  readonly applicability: Readonly<{
    status: 'not-applicable'
    reason: 'expected-export-absent'
    expectedSpecifier: string
    activationStage: 'S6' | 'S9'
  }>
}> =>
  Object.freeze({
    id,
    entryKind: 'single',
    sourceKind: 'consumer',
    source: null,
    expected: null,
    applicability: Object.freeze({
      status: 'not-applicable',
      reason: 'expected-export-absent',
      expectedSpecifier,
      activationStage,
    }),
  })

export const FP_CONSUMER_FIXTURES = Object.freeze([
  active(
    'root.pipe',
    `
      import { pipe } from '@stopcock/fp'
      export const result = pipe(3, (value) => value + 2, (value) => value * 4)
    `,
  ),
  active(
    'root.flow',
    `
      import { flow } from '@stopcock/fp'
      const transform = flow((value) => value + 2, (value) => value * 4)
      export const result = transform(3)
    `,
  ),
  active(
    'array.map.direct',
    `
      import { map } from '@stopcock/fp/array'
      export const result = map([1, 2, 3, 4], (value) => value * 2)
    `,
  ),
  active(
    'array.map.data-last',
    `
      import { map } from '@stopcock/fp/array'
      export const result = map((value) => value * 2)([1, 2, 3, 4])
    `,
  ),
  active(
    'pipeline.collect.common',
    `
      import { pipe } from '@stopcock/fp'
      import { filter, map, take } from '@stopcock/fp/array'
      export const result = pipe(
        [1, 2, 3, 4, 5, 6],
        filter((value) => value % 2 === 0),
        map((value) => value * 3),
        take(2),
      )
    `,
  ),
  active(
    'pipeline.reduce.common',
    `
      import { pipe } from '@stopcock/fp'
      import { filter, map, reduce } from '@stopcock/fp/array'
      export const result = pipe(
        [1, 2, 3, 4, 5, 6],
        filter((value) => value % 2 === 0),
        map((value) => value * 2),
        reduce((total, value) => total + value, 0),
      )
    `,
  ),
  active(
    'pipeline.deep',
    `
      import { pipe } from '@stopcock/fp'
      import { drop, filter, map, take } from '@stopcock/fp/array'
      export const result = pipe(
        [1, 2, 3, 4, 5, 6, 7, 8],
        filter((value) => value % 2 === 0),
        map((value) => value * 3),
        drop(1),
        take(2),
        map((value) => value - 4),
      )
    `,
  ),
  active(
    'option.flow',
    `
      import { pipe } from '@stopcock/fp'
      import { getOrElse, map, some } from '@stopcock/fp/option'
      export const result = pipe(
        some(5),
        map((value) => value * 3),
        getOrElse(() => -1),
      )
    `,
  ),
  active(
    'result.flow',
    `
      import { pipe } from '@stopcock/fp'
      import { map, match, ok } from '@stopcock/fp/result'
      export const result = pipe(
        ok(5),
        map((value) => value * 3),
        match({ ok: (value) => 'ok:' + value, err: (error) => 'err:' + error }),
      )
    `,
  ),
  active(
    'helpers.object-pick',
    `
      import { pick } from '@stopcock/fp/object'
      export const result = pick(
        { id: 7, name: 'Ada', ignored: true },
        ['id', 'name'],
      )
    `,
  ),
  active(
    'helpers.string-trim',
    `
      import { trim } from '@stopcock/fp/string'
      export const result = trim('  Stopcock  ')
    `,
  ),
  active(
    'helpers.two-unrelated',
    `
      import { map } from '@stopcock/fp/array'
      import { trim } from '@stopcock/fp/string'
      export const result = {
        mapped: map([1, 2, 3], (value) => value * 3),
        trimmed: trim('  fp  '),
      }
    `,
  ),
  active(
    'root.named',
    `
      import { isSome, pipe, some } from '@stopcock/fp'
      const option = some(pipe(2, (value) => value * 4))
      export const result = isSome(option) ? option.value + 1 : -1
    `,
  ),
  active(
    'root.namespace.static',
    `
      import * as FP from '@stopcock/fp'
      const option = FP.some(FP.pipe(2, (value) => value * 4))
      export const result = FP.isSome(option) ? option.value + 1 : -1
    `,
  ),
  active(
    'root.namespace.enumerated',
    `
      import * as FP from '@stopcock/fp'
      export const result = Object.keys(FP).sort()
    `,
  ),
  active(
    'compat.compile',
    `
      import { compile } from '@stopcock/fp/compile'
      import { filter, map, take } from '@stopcock/fp/array'
      const run = compile(
        filter((value) => value % 2 === 0),
        map((value) => value * 3),
        take(2),
      )
      export const result = run([1, 2, 3, 4, 5, 6])
    `,
  ),
  active(
    'compiler.collect.common',
    `
      import { pipe } from '@stopcock/fp'
      import { filter, map, take } from '@stopcock/fp/array'
      export const result = pipe(
        [1, 2, 3, 4, 5, 6],
        filter((value) => value % 2 === 0),
        map((value) => value * 3),
        take(2),
      )
    `,
    { sourceKind: 'compiler-transformed' },
  ),
  active(
    'compiler.reduce.common',
    `
      import { pipe } from '@stopcock/fp'
      import { filter, map, reduce } from '@stopcock/fp/array'
      export const result = pipe(
        [1, 2, 3, 4, 5, 6],
        filter((value) => value % 2 === 0),
        map((value) => value * 2),
        reduce((total, value) => total + value, 0),
      )
    `,
    { sourceKind: 'compiler-transformed' },
  ),
  active(
    'compiler.deep',
    `
      import { pipe } from '@stopcock/fp'
      import { drop, filter, map, take } from '@stopcock/fp/array'
      export const result = pipe(
        [1, 2, 3, 4, 5, 6, 7, 8],
        filter((value) => value % 2 === 0),
        map((value) => value * 3),
        drop(1),
        take(2),
        map((value) => value - 4),
      )
    `,
    { sourceKind: 'compiler-transformed' },
  ),
  active(
    'compiler.option-terminal',
    `
      import { pipe } from '@stopcock/fp'
      import { filter, find } from '@stopcock/fp/array'
      export const result = pipe(
        [1, 2, 3, 4, 5, 6, 12],
        filter((value) => value % 2 === 0),
        find((value) => value > 10),
      )
    `,
    { sourceKind: 'compiler-transformed' },
  ),
  active(
    'multi.fused-a',
    `
      import { compile } from '@stopcock/fp/compile'
      import { filter, map, take } from '@stopcock/fp/array'
      const run = compile(
        filter((value) => value % 2 === 0),
        map((value) => value * 3),
        take(2),
      )
      export const result = run([1, 2, 3, 4, 5, 6])
    `,
    { entryKind: 'multi-entry-closure' },
  ),
  active(
    'multi.fused-b',
    `
      import { compile } from '@stopcock/fp/compile'
      import { filter, map, reduce } from '@stopcock/fp/array'
      const run = compile(
        filter((value) => value % 2 === 0),
        map((value) => value * 2),
        reduce((total, value) => total + value, 0),
      )
      export const result = run([1, 2, 3, 4, 5, 6])
    `,
    { entryKind: 'multi-entry-closure' },
  ),
  active(
    'multi.direct',
    `
      import { map } from '@stopcock/fp/array'
      export const result = map([1, 2, 3, 4], (value) => value * 2)
    `,
    { entryKind: 'multi-entry-closure' },
  ),
  expectedExportAbsent('fusion.compact', '@stopcock/fp/fusion', 'S6'),
  expectedExportAbsent('fusion.optimized', '@stopcock/fp/fusion/optimized', 'S9'),
  expectedExportAbsent('fusion.debug', '@stopcock/fp/fusion/debug', 'S9'),
] as const satisfies readonly ConsumerFixtureDefinition[])

export type FpConsumerFixture = (typeof FP_CONSUMER_FIXTURES)[number]
export type FpConsumerFixtureId = FpConsumerFixture['id']

export const activeFpConsumerFixtures = (): readonly FpConsumerFixture[] =>
  FP_CONSUMER_FIXTURES.filter(
    (fixture): fixture is FpConsumerFixture => fixture.applicability.status === 'active',
  )

export const fpConsumerExpectedFor = (id: keyof typeof FP_CONSUMER_EXPECTED): JsonValue =>
  FP_CONSUMER_EXPECTED[id]
