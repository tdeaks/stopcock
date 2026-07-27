import { bench, describe } from 'vite-plus/test'
import { pipe } from '@stopcock/fp/fusion'
import * as Obj from '@stopcock/fp/object'
import * as R from 'remeda'
import * as _ from 'lodash-es'
import * as Ra from 'ramda'
import * as Rb from 'rambda'
import { transformStopcockPipelines } from '../../packages/fp-compiler/src/transform'

/**
 * Phase 3: compiles `source` (a `pipe(input, ...)` expression over
 * `@stopcock/fp/fusion`) once at bench setup and returns the generated
 * `(input) => result` function -- same pattern as `option-result.bench.ts`
 * and `dict-ops.bench.ts`. A statically known key array (`pick`/`omit`
 * below) unrolls to a guarded object literal, no function call at all.
 */
function compileFixture(source: string): (input: unknown) => unknown {
  const wrapped = `import { pipe } from '@stopcock/fp/fusion'\nimport * as Obj from '@stopcock/fp/object'\nfunction run(input) {\n${source}\n}\nexport { run };`
  const result = transformStopcockPipelines(wrapped, 'object-ops-bench.ts', { diagnostics: 'error' })
  if (result.code === wrapped) {
    throw new Error(`object-ops.bench: expected the compiler to transform: ${source}`)
  }
  const stripped = result.code
    .replace(/^\s*import\s+.*?from\s+['"][^'"]+['"]\s*;?\s*$/gmu, '')
    .replace(/^\s*export\s*\{[^}]*\}\s*;?\s*$/gmu, '')
  const body = `${stripped}\nreturn run;`
  // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
  const factory = new Function('Obj', body) as (objectModule: typeof Obj) => (input: unknown) => unknown
  return factory(Obj)
}

const obj = { a: 1, b: 2, c: 3, d: 4, e: 5, f: 6, g: 7, h: 8, i: 9, j: 10 }
const nested = { user: { name: 'Alice', address: { city: 'Portland', zip: '97201' } } }

describe('pick', () => {
  const compiled = compileFixture(`return pipe(input, Obj.pick(['a', 'c', 'e']));`)

  bench('stopcock', () => Obj.pick(obj, ['a', 'c', 'e']))
  bench('stopcock (compiled)', () => compiled(obj))
  bench('remeda', () => R.pick(obj, ['a', 'c', 'e']))
  bench('rambda', () => Rb.pick(['a', 'c', 'e'])(obj))
  bench('ramda', () => Ra.pick(['a', 'c', 'e'], obj))
  bench('lodash', () => _.pick(obj, ['a', 'c', 'e']))
})

describe('omit', () => {
  const compiled = compileFixture(`return pipe(input, Obj.omit(['a', 'c', 'e']));`)

  bench('stopcock', () => Obj.omit(obj, ['a', 'c', 'e']))
  bench('stopcock (compiled)', () => compiled(obj))
  bench('remeda', () => R.omit(obj, ['a', 'c', 'e']))
  bench('rambda', () => Rb.omit(['a', 'c', 'e'])(obj))
  bench('ramda', () => Ra.omit(['a', 'c', 'e'], obj))
  bench('lodash', () => _.omit(obj, ['a', 'c', 'e']))
})

describe('path', () => {
  const path = ['user', 'address', 'city'] as const

  bench('stopcock getPathOrUndefined', () => Obj.getPathOrUndefined(nested, path))
  bench('rambda', () => Rb.path(['user', 'address', 'city'])(nested))
  bench('ramda', () => Ra.path(['user', 'address', 'city'], nested))
  bench('lodash', () => _.get(nested, 'user.address.city'))
})

describe('assoc', () => {
  const exactPlainObjectAssoc = (): typeof obj => {
    const output = Object.create(Object.getPrototypeOf(obj)) as typeof obj
    for (const key of Reflect.ownKeys(obj)) {
      if (!Object.prototype.propertyIsEnumerable.call(obj, key)) continue
      Object.defineProperty(output, key, {
        configurable: true,
        enumerable: true,
        writable: true,
        value: Reflect.get(obj, key),
      })
    }
    Object.defineProperty(output, 'a', {
      configurable: true,
      enumerable: true,
      writable: true,
      value: 99,
    })
    return output
  }

  bench('stopcock', () => Obj.assoc(obj, 'a', 99))
  bench('rambda', () => Rb.assoc('a', 99)(obj))
  bench('ramda', () => Ra.assoc('a', 99, obj))
  bench('manual equivalent prototype/symbol-safe clone', exactPlainObjectAssoc)
  bench('native spread (plain string-record subset)', () => ({ ...obj, a: 99 }))
})

describe('dissoc', () => {
  bench('stopcock', () => Obj.dissoc(obj, 'a'))
  bench('rambda', () => Rb.dissoc('a')(obj))
  bench('ramda', () => Ra.dissoc('a', obj))
  bench('lodash', () => _.omit(obj, ['a']))
})

describe('mergeDeep (right-biased)', () => {
  const a = { x: { y: 1, z: 2 }, w: 3 }
  const b = { x: { y: 10 }, v: 4 }

  bench('stopcock', () => Obj.mergeDeep(a, b, { bias: 'right' }))
  bench('ramda', () => Ra.mergeDeepRight(a, b))
  bench('lodash', () => _.merge({}, a, b))
})

describe('evolve', () => {
  const spec = { a: (x: number) => x + 1, b: (x: number) => x * 2 }

  bench('stopcock', () => Obj.evolve(obj, spec))
  bench('rambda', () => Rb.evolve(spec)(obj))
  bench('ramda', () => Ra.evolve(spec, obj))
})
