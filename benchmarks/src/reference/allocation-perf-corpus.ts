/**
 * The P3A allocation corpus.
 *
 * One module, imported by both workers, so the throughput lane and the memory
 * lane provably observe the same subject. Every target also carries a
 * hand-written reference producing the same result and a checksum both lanes
 * compute independently: a report whose two lanes disagree on a checksum has
 * had a row substituted, and the gate says so rather than averaging them.
 *
 * `*Into` targets deliberately reuse one caller-owned buffer across calls.
 * That is the point of the row: the memory lane holds every output, so a
 * reusing target retains one buffer where an allocating target retains N.
 */

import * as A from '../../../packages/fp/src/array'
import * as AX from '../../../packages/fp/src/array-extra'
import * as Iter from '../../../packages/fp/src/iter'
import * as O from '../../../packages/fp/src/option'
import * as TA from '../../../packages/fp/src/typed-array'
import { compile } from '../../../packages/fp/src/compile'
import { pipe } from '../../../packages/fp/src/fusion'
import { transformStopcockPipelines } from '../../../packages/fp-compiler/src/transform'
import type { AllocationFamilyId } from './allocation-perf-contract'

export const CORPUS_ID = 'stopcock-p3a-allocation-corpus-v1'
export const SIZE = 50_000

const input: readonly number[] = Object.freeze(Array.from({ length: SIZE }, (_, i) => i % 1000))
const typedInput = Float64Array.from(input)

const double = (x: number) => x * 2
const isEven = (x: number) => (x & 1) === 0

/**
 * Structural fold, integer-only so two engines cannot disagree on it. Used to
 * bind a row to the shape of the value it actually produced.
 */
export const checksumOf = (value: unknown): string => {
  let count = 0
  let hash = 0
  const mix = (x: number): void => {
    hash = (Math.imul(hash, 31) + (x | 0)) | 0
    count++
  }
  if (Array.isArray(value) || ArrayBuffer.isView(value)) {
    const values = value as ArrayLike<number>
    for (let i = 0; i < values.length; i++) mix(values[i])
  } else if (value instanceof Set) {
    for (const item of value) mix(item as number)
  } else if (value instanceof Map) {
    for (const [key, item] of value) {
      mix(key as number)
      mix(item as number)
    }
  } else {
    throw new Error(`allocation corpus produced an unhashable value: ${typeof value}`)
  }
  return `${count}:${hash >>> 0}`
}

export interface AllocationTarget {
  readonly id: string
  readonly familyId: AllocationFamilyId
  /** Elements traversed per call, the denominator for per-element allocation. */
  readonly elements: number
  /** True when the target writes into a caller-owned buffer instead of allocating. */
  readonly reusesTarget: boolean
  readonly description: string
  readonly subject: () => unknown
  readonly reference: () => unknown
}

const compiledMapFilter = compile(A.map(double), A.filter(isEven))

const arrayTarget: number[] = []
const filterTarget: number[] = []
const typedTarget = new Float64Array(SIZE)
const iterTarget: number[] = []

const referenceArrayTarget: number[] = []
const referenceFilterTarget: number[] = []
const referenceTypedTarget = new Float64Array(SIZE)

const mapReference = (): number[] => {
  const out = new Array<number>(input.length)
  for (let i = 0; i < input.length; i++) out[i] = input[i] * 2
  return out
}

const mapFilterReference = (): number[] => {
  const out: number[] = []
  for (let i = 0; i < input.length; i++) {
    const value = input[i] * 2
    if ((value & 1) === 0) out.push(value)
  }
  return out
}

/**
 * A compiled Option chain (fromNullable/map/filter/getOrElse), applied to
 * every element. `transformStopcockPipelines` runs once here, at corpus
 * load, over a source string shaped exactly like a real call site
 * (`packages/fp-compiler/src/__tests__` and `benchmarks/src/reference/
 * compiler-diff.test.ts` use the same new-Function-from-transformed-text
 * pattern): the memory and throughput workers then measure the real
 * generated code, not a hand-written stand-in for it. Phase 2's lowering
 * (`_ok`/`_v` locals) never constructs a Some/None object for this chain --
 * `fromNullable` only reads `!= null`, `getOrElse` reads `_ok`/`_v` directly
 * -- so this target is the allocation gate's honesty check on that claim.
 */
const compiledOptionChain: (x: number) => number = (() => {
  const source = `
import { pipe } from '@stopcock/fp'
import * as O from '@stopcock/fp/option'
function runOptionChain(x) {
  return pipe(
    x,
    O.fromNullable,
    O.map((v) => v * 2),
    O.filter((v) => v % 3 !== 0),
    O.getOrElse(() => -1),
  );
}
export { runOptionChain };
`
  const result = transformStopcockPipelines(source, 'allocation-option-chain.ts', {
    diagnostics: 'error',
  })
  if (result.code === source) {
    throw new Error('allocation corpus: expected the compiler to transform the Option chain')
  }
  const noneAlias = result.code.match(/import\s*\{\s*none\s+as\s+([A-Za-z_$][\w$]*)\s*\}/u)?.[1]
  const stripped = result.code
    .replace(/^\s*import\s+.*?from\s+['"][^'"]+['"]\s*;?\s*$/gmu, '')
    .replace(/^\s*export\s*\{[^}]*\}\s*;?\s*$/gmu, '')
  const body = `${stripped}\nreturn runOptionChain;`
  // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
  const factory = new Function('O', ...(noneAlias ? [noneAlias] : []), body) as (
    optionModule: typeof O,
    ...rest: unknown[]
  ) => (x: number) => number
  return factory(O, ...(noneAlias ? [O.none] : []))
})()

const optionChainReference = (x: number): number => {
  if (x == null) return -1
  const doubled = x * 2
  return doubled % 3 !== 0 ? doubled : -1
}

export const ALLOCATION_TARGETS: readonly AllocationTarget[] = Object.freeze([
  {
    id: 'array.map',
    familyId: 'array-direct',
    elements: SIZE,
    reusesTarget: false,
    description: 'A.map allocating a fresh dense output.',
    subject: () => A.map(input, double),
    reference: mapReference,
  },
  {
    id: 'array.filter',
    familyId: 'array-direct',
    elements: SIZE,
    reusesTarget: false,
    description: 'A.filter growing a fresh output.',
    subject: () => A.filter(input, isEven),
    reference: () => {
      const out: number[] = []
      for (let i = 0; i < input.length; i++) if ((input[i] & 1) === 0) out.push(input[i])
      return out
    },
  },
  {
    id: 'pipe.map-filter',
    familyId: 'root-fusion',
    elements: SIZE,
    reusesTarget: false,
    description: 'Current-root pipe() fusion over map then filter.',
    subject: () => pipe(input, A.map(double), A.filter(isEven)),
    reference: mapFilterReference,
  },
  {
    id: 'compile.map-filter',
    familyId: 'compiled-pipeline',
    elements: SIZE,
    reusesTarget: false,
    description: 'A pipeline compiled once and executed per call.',
    subject: () => compiledMapFilter(input),
    reference: mapFilterReference,
  },
  {
    id: 'option.compiled-chain',
    familyId: 'compiled-option',
    elements: SIZE,
    reusesTarget: false,
    description:
      'A compiled Option chain (fromNullable/map/filter/getOrElse) applied per element; only the output array should allocate.',
    subject: () => {
      const out = new Array<number>(input.length)
      for (let i = 0; i < input.length; i++) out[i] = compiledOptionChain(input[i])
      return out
    },
    reference: () => {
      const out = new Array<number>(input.length)
      for (let i = 0; i < input.length; i++) out[i] = optionChainReference(input[i])
      return out
    },
  },
  {
    id: 'iter.map-filter-toArray',
    familyId: 'iter-terminal',
    elements: SIZE,
    reusesTarget: false,
    description: 'Iter map/filter drained through the array terminal.',
    subject: () => Iter.toArray(Iter.filter(Iter.map(Iter.from(input), double), isEven)),
    reference: mapFilterReference,
  },
  {
    id: 'typed-array.map',
    familyId: 'typed-array',
    elements: SIZE,
    reusesTarget: false,
    description: 'TA.map allocating a fresh Float64Array.',
    subject: () => TA.map(typedInput, double),
    reference: () => {
      const out = new Float64Array(typedInput.length)
      for (let i = 0; i < typedInput.length; i++) out[i] = typedInput[i] * 2
      return out
    },
  },
  {
    id: 'array.mapInto',
    familyId: 'writable-target',
    elements: SIZE,
    reusesTarget: true,
    description: 'AX.mapInto writing into one caller-owned array across every call.',
    subject: () => AX.mapInto(input, arrayTarget, double),
    reference: () => {
      referenceArrayTarget.length = input.length
      for (let i = 0; i < input.length; i++) referenceArrayTarget[i] = input[i] * 2
      return referenceArrayTarget
    },
  },
  {
    id: 'array.filterInto',
    familyId: 'writable-target',
    elements: SIZE,
    reusesTarget: true,
    description: 'AX.filterInto writing into one caller-owned array across every call.',
    subject: () => AX.filterInto(input, filterTarget, isEven),
    reference: () => {
      referenceFilterTarget.length = 0
      for (let i = 0; i < input.length; i++) {
        if ((input[i] & 1) === 0) referenceFilterTarget.push(input[i])
      }
      return referenceFilterTarget
    },
  },
  {
    id: 'typed-array.mapInto',
    familyId: 'writable-target',
    elements: SIZE,
    reusesTarget: true,
    description: 'TA.mapInto writing into one caller-owned Float64Array.',
    subject: () => TA.mapInto(typedInput, typedTarget, double),
    reference: () => {
      for (let i = 0; i < typedInput.length; i++) referenceTypedTarget[i] = typedInput[i] * 2
      return referenceTypedTarget
    },
  },
  {
    id: 'iter.toArrayInto',
    familyId: 'writable-target',
    elements: SIZE,
    reusesTarget: true,
    description: 'Iter.toArrayInto draining a pipeline into one caller-owned array.',
    subject: () => {
      iterTarget.length = 0
      // Annotated deliberately. `toArrayInto` does not infer its element type
      // from a mapped `Iter`: the target-capacity constraint resolves against
      // an uninferred element and rejects a call that is plainly well typed.
      // Reported as a P1A/P1B typing defect; nothing here works around it at
      // runtime.
      const source: Iterable<number> = Iter.filter(Iter.map(Iter.from(input), double), isEven)
      return Iter.toArrayInto(source, iterTarget)
    },
    reference: () => {
      referenceFilterTarget.length = 0
      for (let i = 0; i < input.length; i++) {
        const value = input[i] * 2
        if ((value & 1) === 0) referenceFilterTarget.push(value)
      }
      return referenceFilterTarget
    },
  },
])

export const targetById = (id: string): AllocationTarget => {
  const target = ALLOCATION_TARGETS.find((candidate) => candidate.id === id)
  if (target === undefined) throw new Error(`unknown allocation target ${id}`)
  return target
}
