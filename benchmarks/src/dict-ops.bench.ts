import { bench, describe } from 'vite-plus/test'
import { pipe } from '@stopcock/fp/fusion'
import * as D from '@stopcock/fp/record'
import * as R from 'remeda'
import * as _ from 'lodash-es'
import * as Ra from 'ramda'
import { transformStopcockPipelines } from '../../packages/fp-compiler/src/transform'

/**
 * Phase 3: compiles `source` (a `pipe(input, ...)` expression over
 * `@stopcock/fp/fusion`) once at bench setup and returns the generated
 * `(input) => result` function, so the "stopcock (compiled)" rows measure
 * the actual generated fused loop over the same live dict fixture, not a
 * hand-written stand-in -- same pattern as `option-result.bench.ts`.
 */
function compileFixture(source: string): (input: unknown) => unknown {
  const wrapped = `import { pipe } from '@stopcock/fp/fusion'\nimport * as D from '@stopcock/fp/record'\nfunction run(input) {\n${source}\n}\nexport { run };`
  const result = transformStopcockPipelines(wrapped, 'dict-ops-bench.ts', { diagnostics: 'error' })
  if (result.code === wrapped) {
    throw new Error(`dict-ops.bench: expected the compiler to transform: ${source}`)
  }
  const stripped = result.code
    .replace(/^\s*import\s+.*?from\s+['"][^'"]+['"]\s*;?\s*$/gmu, '')
    .replace(/^\s*export\s*\{[^}]*\}\s*;?\s*$/gmu, '')
  const body = `${stripped}\nreturn run;`
  // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
  const factory = new Function('D', body) as (recordModule: typeof D) => (input: unknown) => unknown
  return factory(D)
}

const small: Record<string, number> = Object.fromEntries(
  Array.from({ length: 10 }, (_, i) => [`key${i}`, i]),
)
const medium: Record<string, number> = Object.fromEntries(
  Array.from({ length: 100 }, (_, i) => [`key${i}`, i]),
)
const large: Record<string, number> = Object.fromEntries(
  Array.from({ length: 1000 }, (_, i) => [`key${i}`, i]),
)
const dicts = { 10: small, 100: medium, 1000: large } as Record<number, Record<string, number>>

describe.each([10, 100, 1000])('keys — n=%i', (n) => {
  const dict = dicts[n]
  bench('stopcock', () => D.keys(dict))
  bench('ramda', () => Ra.keys(dict))
  bench('lodash', () => _.keys(dict))
})

describe.each([10, 100, 1000])('values — n=%i', (n) => {
  const dict = dicts[n]
  bench('stopcock', () => D.values(dict))
  bench('ramda', () => Ra.values(dict))
  bench('lodash', () => _.values(dict))
})

describe.each([10, 100, 1000])('map (dict) — n=%i', (n) => {
  const dict = dicts[n]
  const fn = (v: number) => v * 2
  const stopcockMap = D.map(fn) // hoisted: isolate execution cost, not closure construction

  bench('stopcock', () => stopcockMap(dict))
  bench('remeda', () => R.mapValues(dict, fn))
  bench('ramda', () => Ra.map(fn, dict))
  bench('lodash', () => _.mapValues(dict, fn))
})

describe.each([10, 100, 1000])('filter (dict) — n=%i', (n) => {
  const dict = dicts[n]
  const pred = (_: number, k: string) => parseInt(k.slice(3)) % 2 === 0
  const stopcockFilter = D.filter(pred) // hoisted: isolate execution cost, not closure construction

  bench('stopcock', () => stopcockFilter(dict))
  bench('lodash', () => _.pickBy(dict, (v, k) => parseInt(k!.slice(3)) % 2 === 0))
})

describe.each([10, 100, 1000])('filter -> map chain (dict), n=%i', (n) => {
  const dict = dicts[n]
  const pred = (_: number, k: string) => parseInt(k.slice(3)) % 2 === 0
  const fn = (v: number) => v * 2
  const compiled = compileFixture(
    `return pipe(input, D.filter((v, k) => parseInt(k.slice(3)) % 2 === 0), D.map((v) => v * 2));`,
  )

  bench('stopcock', () => pipe(dict, D.filter(pred), D.map(fn)))
  bench('stopcock (compiled)', () => compiled(dict))
})

describe.each([10, 100, 1000])('fromEntries — n=%i', (n) => {
  const entries: [string, number][] = Array.from({ length: n }, (_, i) => [`key${i}`, i])

  bench('stopcock', () => D.fromEntries(entries))
  bench('ramda', () => Ra.fromPairs(entries))
  bench('lodash', () => _.fromPairs(entries))
})

describe.each([10, 100, 1000])('entries — n=%i', (n) => {
  const dict = dicts[n]

  bench('stopcock', () => D.entries(dict))
  bench('ramda', () => Ra.toPairs(dict))
  bench('lodash', () => _.toPairs(dict))
})

describe('merge', () => {
  const stopcockMerge = D.merge(medium) // hoisted: isolate execution cost, not closure construction

  bench('stopcock', () => stopcockMerge(small))
  bench('ramda', () => Ra.mergeRight(small, medium))
  bench('lodash', () => Object.assign({}, small, medium))
})
