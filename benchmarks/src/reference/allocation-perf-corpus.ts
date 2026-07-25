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
import * as C from '../../../packages/fp/src/collector'
import * as Iter from '../../../packages/fp/src/iter'
import * as T from '../../../packages/fp/src/transducer'
import * as TA from '../../../packages/fp/src/typed-array'
import { compile } from '../../../packages/fp/src/compile'
import { pipe } from '../../../packages/fp/src/internal/fusion-engine'
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
const mapFilterTransducer = T.compose(T.map(double), T.filter(isEven))

const arrayTarget: number[] = []
const filterTarget: number[] = []
const typedTarget = new Float64Array(SIZE)
const iterTarget: number[] = []
const transducerTarget: number[] = []
const collectorTarget: number[] = []

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
    id: 'collector.array',
    familyId: 'collector-transducer',
    elements: SIZE,
    reusesTarget: false,
    description: 'The array collector over an array source.',
    subject: () => C.collect(input, C.array<number>()),
    reference: () => {
      const out: number[] = []
      for (let i = 0; i < input.length; i++) out.push(input[i])
      return out
    },
  },
  {
    id: 'transducer.intoArray.map-filter',
    familyId: 'collector-transducer',
    elements: SIZE,
    reusesTarget: false,
    description: 'A composed map/filter transducer into a fresh array.',
    subject: () => T.intoArray(input, mapFilterTransducer),
    reference: mapFilterReference,
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
  {
    id: 'transducer.intoArrayInto',
    familyId: 'writable-target',
    elements: SIZE,
    reusesTarget: true,
    description: 'T.intoArrayInto reducing into one caller-owned array.',
    subject: () => {
      transducerTarget.length = 0
      return T.intoArrayInto(input, mapFilterTransducer, transducerTarget)
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
  {
    id: 'collector.arrayInto',
    familyId: 'writable-target',
    elements: SIZE,
    reusesTarget: true,
    description: 'C.arrayInto collecting into one caller-owned array.',
    subject: () => {
      collectorTarget.length = 0
      return C.collect(input, C.arrayInto(collectorTarget))
    },
    reference: () => {
      referenceFilterTarget.length = 0
      for (let i = 0; i < input.length; i++) referenceFilterTarget.push(input[i])
      return referenceFilterTarget
    },
  },
])

export const targetById = (id: string): AllocationTarget => {
  const target = ALLOCATION_TARGETS.find((candidate) => candidate.id === id)
  if (target === undefined) throw new Error(`unknown allocation target ${id}`)
  return target
}
