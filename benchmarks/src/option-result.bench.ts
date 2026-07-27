import { bench, describe } from 'vite-plus/test'
import { ok, pipe, some } from '@stopcock/fp'
import * as O from '@stopcock/fp/option'
import * as R from '@stopcock/fp/result'
import { O as BeltO, R as BeltR, pipe as beltPipe } from '@mobily/ts-belt'
import { transformStopcockPipelines } from '../../packages/fp-compiler/src/transform'

const jsonInput = '{"a":1}'
const double = (x: number) => x * 2
const increment = (x: number) => x + 1
const greaterThanFive = (x: number) => x > 5

/**
 * Phase 2: compiles `source` (a `pipe(...)` expression over `@stopcock/fp/
 * fusion`, the fused tier) once at bench setup and returns the generated
 * function, so the "stopcock (compiled)" rows below measure the actual
 * generated `_ok`/`_v` lowering, not a hand-written stand-in for it -- same
 * new-Function-from-transformed-text pattern as
 * `benchmarks/src/reference/compiler-diff.test.ts`.
 */
function compileFixture(source: string): () => unknown {
  const wrapped = `import { pipe } from '@stopcock/fp/fusion'\nimport * as O from '@stopcock/fp/option'\nimport * as R from '@stopcock/fp/result'\nfunction run() {\n${source}\n}\nexport { run };`
  const result = transformStopcockPipelines(wrapped, 'option-result-bench.ts', {
    diagnostics: 'error',
  })
  if (result.code === wrapped) {
    throw new Error(`option-result.bench: expected the compiler to transform: ${source}`)
  }
  const noneAlias = result.code.match(/import\s*\{\s*none\s+as\s+([A-Za-z_$][\w$]*)\s*\}/u)?.[1]
  const stripped = result.code
    .replace(/^\s*import\s+.*?from\s+['"][^'"]+['"]\s*;?\s*$/gmu, '')
    .replace(/^\s*export\s*\{[^}]*\}\s*;?\s*$/gmu, '')
  const body = `${stripped}\nreturn run;`
  // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
  const factory = new Function('O', 'R', ...(noneAlias ? [noneAlias] : []), body) as (
    optionModule: typeof O,
    resultModule: typeof R,
    ...rest: unknown[]
  ) => () => unknown
  return factory(O, R, ...(noneAlias ? [O.none] : []))
}

describe('Option.map chain (5 steps)', () => {
  bench('stopcock', () =>
    pipe(
      some(5),
      O.map(double),
      O.map(increment),
      O.filter(greaterThanFive),
      O.getOrElse(() => 0),
    ))

  bench(
    'stopcock (compiled)',
    compileFixture(`return pipe(
      O.some(5),
      O.map((x) => x * 2),
      O.map((x) => x + 1),
      O.filter((x) => x > 5),
      O.getOrElse(() => 0),
    );`),
  )

  bench('ts-belt', () =>
    beltPipe(
      BeltO.Some(5),
      BeltO.map(double),
      BeltO.map(increment),
      BeltO.filter(greaterThanFive),
      BeltO.getWithDefault(0),
    ))
})

describe('Option.flatMap chain', () => {
  bench('stopcock', () =>
    pipe(
      some({ user: { name: 'Tom' } }),
      O.map((x) => x.user),
      O.map((x) => x.name),
    ))

  bench(
    'stopcock (compiled)',
    compileFixture(`return pipe(
      O.some({ user: { name: 'Tom' } }),
      O.map((x) => x.user),
      O.map((x) => x.name),
    );`),
  )

  bench('ts-belt', () =>
    beltPipe(
      BeltO.Some({ user: { name: 'Tom' } }),
      BeltO.map((x) => x.user),
      BeltO.map((x) => x.name),
    ))
})

describe('Result.map chain', () => {
  bench('stopcock', () => pipe(ok(5), R.map(double), R.map(increment)))

  bench(
    'stopcock (compiled)',
    compileFixture(`return pipe(R.ok(5), R.map((x) => x * 2), R.map((x) => x + 1));`),
  )

  bench('ts-belt', () => beltPipe(BeltR.Ok(5), BeltR.map(double), BeltR.map(increment)))
})

describe('Result.tryCatch', () => {
  bench('stopcock', () => R.tryCatch(() => JSON.parse(jsonInput)))

  bench(
    'stopcock (compiled)',
    compileFixture(`return pipe(() => JSON.parse('{"a":1}'), R.fromThrowable);`),
  )

  bench('ts-belt', () => BeltR.fromExecution(() => JSON.parse(jsonInput)))
})
