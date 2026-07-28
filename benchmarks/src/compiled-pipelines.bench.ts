import { bench, describe } from 'vite-plus/test'
import { pipe } from '@stopcock/fp'
import { pipe as fusionPipe } from '@stopcock/fp/fusion'
import * as A from '@stopcock/fp/array'
import * as Iter from '@stopcock/fp/iter'
import * as R from '@stopcock/fp/record'
import * as S from '@stopcock/fp/string'
import * as Ra from 'ramda'
import * as _ from 'lodash-es'
import { none } from '@stopcock/fp/option'
import { transformStopcockPipelines } from '../../packages/fp-compiler/src/transform'
import { getData } from './setup'

interface CompileModule {
  readonly source: string
  readonly value: unknown
}

function compileFixture(
  modules: Readonly<Record<string, CompileModule>>,
  source: string,
  fixtureName: string,
): (input: unknown) => unknown {
  const aliases = Object.keys(modules)
  const importLines = aliases
    .map((alias) => `import * as ${alias} from '${modules[alias]!.source}'`)
    .join('\n')
  const wrapped = `import { pipe } from '@stopcock/fp/fusion'\n${importLines}\nfunction run(input) {\n${source}\n}\nexport { run };`
  const result = transformStopcockPipelines(wrapped, fixtureName, { diagnostics: 'error' })
  if (result.code === wrapped) {
    throw new Error(`compiled-pipelines.bench: expected the compiler to transform: ${source}`)
  }
  if (result.diagnostics.length === 0 || result.diagnostics.some((site) => !site.transformed)) {
    throw new Error(
      `compiled-pipelines.bench: not every site compiled cleanly for ${fixtureName}: ${JSON.stringify(
        result.diagnostics,
      )}`,
    )
  }
  const noneAlias = result.code.match(/import\s*\{\s*none\s+as\s+([A-Za-z_$][\w$]*)\s*\}/u)?.[1]
  const stripped = result.code
    .replace(/^\s*import\s+.*?from\s+['"][^'"]+['"]\s*;?\s*$/gmu, '')
    .replace(/^\s*export\s*\{[^}]*\}\s*;?\s*$/gmu, '')
  const body = `${stripped}\nreturn run;`
  const argNames = ['pipe', ...aliases, ...(noneAlias ? [noneAlias] : [])]
  const argValues: unknown[] = [
    fusionPipe,
    ...aliases.map((alias) => modules[alias]!.value),
    ...(noneAlias ? [none] : []),
  ]
  // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
  const factory = new Function(...argNames, body) as (...args: unknown[]) => (input: unknown) => unknown
  return factory(...argValues)
}

function assertSame(label: string, actual: unknown, expected: unknown): void {
  const actualJson = JSON.stringify(actual)
  const expectedJson = JSON.stringify(expected)
  if (actualJson !== expectedJson) {
    throw new Error(
      `compiled-pipelines.bench: ${label} mismatch\nactual:   ${actualJson}\nexpected: ${expectedJson}`,
    )
  }
}

const SIZES = [100, 10_000, 100_000] as const

// -- 1. array: map -> filter -> reduce ------------------------------------

const arrayChainDouble = (x: number) => x * 2 + 1
const arrayChainNotDivisibleByThree = (x: number) => x % 3 !== 0
const arrayChainSum = (a: number, b: number) => a + b

function nativeArrayChainLoop(data: readonly number[]): number {
  let acc = 0
  for (let i = 0; i < data.length; i++) {
    const mapped = data[i]! * 2 + 1
    if (mapped % 3 !== 0) acc += mapped
  }
  return acc
}

const arrayChainCompiled = compileFixture(
  { A: { source: '@stopcock/fp/array', value: A } },
  `return pipe(input, A.map((x) => x * 2 + 1), A.filter((x) => x % 3 !== 0), A.reduce((a, b) => a + b, 0));`,
  'compiled-pipelines-array-chain.ts',
)

describe.each(SIZES)('array: map -> filter -> reduce — n=%i', (n) => {
  const xs = getData<number>('numbersWithDupes', n as any)

  const expected = pipe(
    xs,
    A.map(arrayChainDouble),
    A.filter(arrayChainNotDivisibleByThree),
    A.reduce(arrayChainSum, 0),
  )
  assertSame(`array chain n=${n}`, arrayChainCompiled(xs), expected)
  assertSame(`array chain hand loop n=${n}`, nativeArrayChainLoop(xs), expected)

  bench('stopcock (compiled)', () => arrayChainCompiled(xs))
  bench('stopcock', () =>
    pipe(xs, A.map(arrayChainDouble), A.filter(arrayChainNotDivisibleByThree), A.reduce(arrayChainSum, 0)))
  bench('native loop', () => nativeArrayChainLoop(xs))
  bench('ramda pipe', () =>
    Ra.pipe(
      Ra.map(arrayChainDouble),
      Ra.filter(arrayChainNotDivisibleByThree),
      Ra.reduce(arrayChainSum, 0),
    )(xs))
  bench('lodash chain', () =>
    _.chain(xs)
      .map(arrayChainDouble)
      .filter(arrayChainNotDivisibleByThree)
      .reduce(arrayChainSum, 0)
      .value())
})

// -- 2. array: map -> filter -> find, predicate hits at the last element --

const EARLY_EXIT_SENTINEL = 1_000

function earlyExitData(n: number): number[] {
  const xs = [...getData<number>('numbers', n as any)]
  xs[xs.length - 1] = EARLY_EXIT_SENTINEL
  return xs
}

const earlyExitDouble = (x: number) => x * 2
const earlyExitKeep = (x: number) => x > 0.1
const earlyExitPred = (x: number) => x > 100

function optionValueOrUndefined(option: { readonly _tag: number; readonly value?: unknown }): unknown {
  return option._tag === 1 ? option.value : undefined
}

function nativeEarlyExitLoop(data: readonly number[]): number | undefined {
  for (let i = 0; i < data.length; i++) {
    const mapped = data[i]! * 2
    if (mapped > 0.1 && mapped > 100) return mapped
  }
  return undefined
}

const earlyExitCompiled = compileFixture(
  { A: { source: '@stopcock/fp/array', value: A } },
  `return pipe(input, A.map((x) => x * 2), A.filter((x) => x > 0.1), A.find((x) => x > 100));`,
  'compiled-pipelines-early-exit.ts',
)

describe.each(SIZES)('array: map -> filter -> find (early exit) — n=%i', (n) => {
  const xs = earlyExitData(n)

  const expected = pipe(xs, A.map(earlyExitDouble), A.filter(earlyExitKeep), A.find(earlyExitPred))
  assertSame(`early-exit n=${n}`, earlyExitCompiled(xs), expected)
  assertSame(`early-exit hand loop n=${n}`, nativeEarlyExitLoop(xs), optionValueOrUndefined(expected))

  bench('stopcock (compiled)', () => earlyExitCompiled(xs))
  bench('stopcock', () => pipe(xs, A.map(earlyExitDouble), A.filter(earlyExitKeep), A.find(earlyExitPred)))
  bench('native loop early exit', () => nativeEarlyExitLoop(xs))
})

// -- 3. stream: Iter.from -> map -> filter -> take(100) -> toArray --------

const streamDouble = (x: number) => x * 2
const streamKeepMappedValue = (x: number) => x > 1
const streamTakeCount = 100

function nativeStreamLoop(data: readonly number[], limit: number): number[] {
  const out: number[] = []
  for (let i = 0; i < data.length && out.length < limit; i++) {
    const mapped = streamDouble(data[i]!)
    if (streamKeepMappedValue(mapped)) out.push(mapped)
  }
  return out
}

const streamCompiled = compileFixture(
  { I: { source: '@stopcock/fp/iter', value: Iter } },
  `return pipe(input, I.map((x) => x * 2), I.filter((x) => x > 1), I.take(100), I.toArray);`,
  'compiled-pipelines-stream.ts',
)

describe.each(SIZES)('stream: Iter.from -> map -> filter -> take(100) -> toArray — n=%i', (n) => {
  const xs = getData<number>('numbers', n as any)

  const expected = pipe(
    Iter.from(xs),
    Iter.map(streamDouble),
    Iter.filter(streamKeepMappedValue),
    Iter.take(streamTakeCount),
    Iter.toArray,
  )
  assertSame(`stream chain n=${n}`, streamCompiled(xs), expected)
  assertSame(`stream chain hand loop n=${n}`, nativeStreamLoop(xs, streamTakeCount), expected)

  bench('stopcock (compiled)', () => streamCompiled(xs))
  bench('stopcock', () =>
    pipe(
      Iter.from(xs),
      Iter.map(streamDouble),
      Iter.filter(streamKeepMappedValue),
      Iter.take(streamTakeCount),
      Iter.toArray,
    ))
  bench('native loop early exit', () => nativeStreamLoop(xs, streamTakeCount))
})

// -- 4. dict: filter -> map over a 1000-key string-keyed record -----------

const recordChainKeep = (v: number) => v % 2 === 0
const recordChainDouble = (v: number) => v * 2

// record.ts iterates Reflect.ownKeys, which includes symbol keys; this
// fixture's keys are all plain strings, so that path is never exercised.
function makeRecordFixture(size: number): Record<string, number> {
  return Object.fromEntries(Array.from({ length: size }, (_, i) => [`key${i}`, i]))
}

const recordChainCompiled = compileFixture(
  { R: { source: '@stopcock/fp/record', value: R } },
  `return pipe(input, R.filter((v) => v % 2 === 0), R.map((v) => v * 2));`,
  'compiled-pipelines-record.ts',
)

describe('dict: filter -> map (1000 keys)', () => {
  const record = makeRecordFixture(1000)

  const expected = pipe(record, R.filter(recordChainKeep), R.map(recordChainDouble))
  assertSame('record chain', recordChainCompiled(record), expected)

  bench('stopcock (compiled)', () => recordChainCompiled(record))
  bench('stopcock', () => pipe(record, R.filter(recordChainKeep), R.map(recordChainDouble)))
  bench('ramda', () => Ra.pipe(Ra.filter(recordChainKeep), Ra.map(recordChainDouble))(record))
  bench('lodash', () => _.mapValues(_.pickBy(record, recordChainKeep), recordChainDouble))
})

// -- 5. mixed scalar/string: trim -> toLowerCase -> filter(length) --------

function xorshift32(seed: number) {
  let state = seed
  return () => {
    state ^= state << 13
    state ^= state >> 17
    state ^= state << 5
    return (state >>> 0) / 0xffffffff
  }
}

const MIXED_CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'

function makeMixedStringData(size: number): string[] {
  const rand = xorshift32(size * 13 + 7)
  const out: string[] = new Array(size)
  for (let i = 0; i < size; i++) {
    const length = 1 + Math.floor(rand() * 8)
    let word = ''
    for (let j = 0; j < length; j++) word += MIXED_CHARS[Math.floor(rand() * MIXED_CHARS.length)]
    const padding = rand() < 0.3 ? '  ' : ''
    out[i] = padding + word + padding
  }
  return out
}

const mixedFilterLength = (s: string) => s.length > 3

function nativeMixedLoop(data: readonly string[]): string[] {
  const out: string[] = []
  for (let i = 0; i < data.length; i++) {
    const lowered = data[i]!.trim().toLowerCase()
    if (lowered.length > 3) out.push(lowered)
  }
  return out
}

const mixedCompiled = compileFixture(
  { A: { source: '@stopcock/fp/array', value: A }, S: { source: '@stopcock/fp/string', value: S } },
  `return pipe(input, A.map(S.trim), A.map(S.toLowerCase), A.filter((s) => s.length > 3));`,
  'compiled-pipelines-mixed.ts',
)

describe.each(SIZES)('mixed: trim -> toLowerCase -> filter(length) — n=%i', (n) => {
  const strs = makeMixedStringData(n)

  const expected = pipe(strs, A.map(S.trim), A.map(S.toLowerCase), A.filter(mixedFilterLength))
  assertSame(`mixed chain n=${n}`, mixedCompiled(strs), expected)
  assertSame(`mixed chain hand loop n=${n}`, nativeMixedLoop(strs), expected)

  bench('stopcock (compiled)', () => mixedCompiled(strs))
  bench('stopcock', () => pipe(strs, A.map(S.trim), A.map(S.toLowerCase), A.filter(mixedFilterLength)))
  bench('native loop', () => nativeMixedLoop(strs))
})
