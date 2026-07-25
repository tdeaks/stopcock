import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'
import { pipe } from '@stopcock/fp'
import { filter, map, take, takeWhile } from '@stopcock/fp/array'
import { transformStopcockPipelines } from '../../../packages/fp-compiler/src/transform'
import { FP_CONSUMER_FIXTURES } from './fixtures'
import type { JsonValue } from './types'

const directory = await mkdtemp(
  join(resolve(dirname(fileURLToPath(import.meta.url)), '../..'), '.consumer-fixtures-'),
)

afterAll(async () => {
  await rm(directory, { recursive: true, force: true })
})

const json = (value: JsonValue): string => JSON.stringify(value)

const executeFixture = async (
  fixture: (typeof FP_CONSUMER_FIXTURES)[number],
): Promise<JsonValue> => {
  if (fixture.source === null) throw new Error(`${fixture.id} has no active source`)
  let emitted = fixture.source
  if (fixture.sourceKind === 'compiler-transformed') {
    const transformed = transformStopcockPipelines(fixture.source, `${fixture.id}.js`, {
      diagnostics: 'error',
    })
    if (!transformed.diagnostics.some(({ transformed: didTransform }) => didTransform)) {
      throw new Error(`${fixture.id} did not produce compiler output`)
    }
    emitted = transformed.code
  }
  const path = join(directory, `${fixture.id.replaceAll('.', '-')}.mjs`)
  await writeFile(path, emitted)
  const imported = (await import(`${pathToFileURL(path).href}?fixture=${fixture.id}`)) as {
    readonly result?: JsonValue
  }
  if (!Object.hasOwn(imported, 'result')) {
    throw new Error(`${fixture.id} did not export result`)
  }
  return imported.result as JsonValue
}

describe('consumer-size fixture runtime oracles', () => {
  for (const fixture of FP_CONSUMER_FIXTURES) {
    if (fixture.applicability.status === 'not-applicable') continue
    it(`${fixture.id} executes unbundled`, async () => {
      expect(json(await executeFixture(fixture))).toBe(json(fixture.expected))
    })
  }

  it('covers callback count/order, empty input, early exit, and thrown errors', () => {
    const order: number[] = []
    const early = pipe(
      [1, 2, 8, 9],
      takeWhile((value) => {
        order.push(value)
        return value < 8
      }),
      map((value) => value * 2),
    )
    expect(early).toEqual([2, 4])
    expect(order).toEqual([1, 2, 8])
    expect(pipe([], filter(Boolean), take(1))).toEqual([])

    const error = new Error('fixture-callback-error')
    expect(() =>
      pipe(
        [1, 2, 3],
        map((value) => {
          if (value === 2) throw error
          return value
        }),
      ),
    ).toThrow(error)
  })

  it('makes a deliberately broken early-exit oracle fail', () => {
    const brokenExpected = [2, 4, 16]
    const actual = pipe(
      [1, 2, 8, 9],
      takeWhile((value) => value < 8),
      map((value) => value * 2),
    )
    expect(json(actual)).not.toBe(json(brokenExpected))
  })
})
