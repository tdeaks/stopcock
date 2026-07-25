// Frozen snapshot of pipe.ts's bounded identity/front-cache implementation
// before the hot-identity optimization. This is a benchmark fixture only: it
// is not shipped by @stopcock/fp. The dispatch release gate retains it locally
// so current and baseline dispatch can be paired in one Bun/JSC or Node/V8
// process without relying on unstable wall-clock results from separate runs.
import {
  compile,
  dispatchAndTrack,
  planAndLowerFast,
  type Runner,
} from '../../../packages/fp/src/compile'
import type { StepBinding } from '../../../packages/fp/src/plan'
import type { ShapeEntry } from '../../../packages/fp/src/shape-entry'

/**
 * The frozen implementation read its bindings straight off the operator's
 * public fields. S5A moved live binding authority into a private table, but
 * this fixture must keep costing what it cost then: importing the current
 * extractBinding would both break (it now takes a provenance entry, not a
 * function) and change the denominator every ratio is measured against.
 */
const baselineExtractBinding = (step: {
  _fn?: unknown
  _a1?: unknown
  _a2?: unknown
}): StepBinding => {
  const binding: { fn?: unknown; a1?: unknown; a2?: unknown } = {}
  if (step._fn !== undefined) binding.fn = step._fn
  if (step._a1 !== undefined) binding.a1 = step._a1
  if (step._a2 !== undefined) binding.a2 = step._a2
  return binding
}

interface CacheEntry {
  readonly fns: readonly unknown[]
  readonly runner?: Runner
  readonly entry?: ShapeEntry
  readonly bindings?: readonly StepBinding[]
  used: number
}

const CACHE_SIZE = 4
const FRONT_CACHE_LIMIT = 256
const NUM_KEY_BASE = 128
const NUM_KEY_MAX_LEN = 5
const cache: Array<CacheEntry | undefined> = [undefined, undefined, undefined, undefined]
const frontCacheNum = new Map<number, ShapeEntry>()
const frontCacheStr = new Map<string, ShapeEntry>()
let clock = 0

const hasOp = (fn: any): boolean => typeof fn._op === 'number' && fn._op > 0

function frontCacheSet<K>(target: Map<K, ShapeEntry>, key: K, entry: ShapeEntry): void {
  target.set(key, entry)
  if (target.size > FRONT_CACHE_LIMIT) {
    const oldest = target.keys().next().value
    if (oldest !== undefined) target.delete(oldest)
  }
}

function matchesArgs(fns: readonly unknown[], args: ArrayLike<unknown>, argc: number): boolean {
  if (fns.length !== argc - 1) return false
  for (let index = 0; index < fns.length; index++) {
    if (fns[index] !== args[index + 1]) return false
  }
  return true
}

function lookupCache(args: ArrayLike<unknown>, argc: number): CacheEntry | undefined {
  for (let index = 0; index < CACHE_SIZE; index++) {
    const entry = cache[index]
    if (entry && matchesArgs(entry.fns, args, argc)) {
      entry.used = ++clock
      return entry
    }
  }
  return undefined
}

function cacheSlot(): number {
  let slot = 0
  let oldest = Infinity
  for (let index = 0; index < CACHE_SIZE; index++) {
    const entry = cache[index]
    if (!entry) return index
    if (entry.used < oldest) {
      oldest = entry.used
      slot = index
    }
  }
  return slot
}

function storeRunner(fns: readonly unknown[], runner: Runner): void {
  cache[cacheSlot()] = { fns, runner, used: ++clock }
}

function storeTagged(
  fns: readonly unknown[],
  entry: ShapeEntry,
  bindings: readonly StepBinding[],
): void {
  cache[cacheSlot()] = { fns, entry, bindings, used: ++clock }
}

function runTagged(input: unknown, args: ArrayLike<unknown>, argc: number): unknown {
  const cached = lookupCache(args, argc)
  if (cached) {
    if (cached.entry) return dispatchAndTrack(cached.entry, input, cached.bindings!)
    return cached.runner!(input)
  }

  const length = argc - 1
  const fns = new Array(length)
  const useNumberKey = length <= NUM_KEY_MAX_LEN
  let numberKey = 0
  let stringKey = ''
  let allTagged = true
  for (let index = 0; index < length; index++) {
    const step = args[index + 1]
    fns[index] = step
    if (!allTagged) continue
    const opcode = (step as any)._op
    if (typeof opcode !== 'number' || opcode <= 0) {
      allTagged = false
    } else if (useNumberKey) {
      numberKey = numberKey * NUM_KEY_BASE + opcode
    } else {
      stringKey += `${opcode},`
    }
  }

  if (!allTagged) {
    const runner = compile(...fns)
    storeRunner(fns, runner)
    return runner(input)
  }

  let entry: ShapeEntry
  let bindings: readonly StepBinding[]
  const cachedEntry = useNumberKey ? frontCacheNum.get(numberKey) : frontCacheStr.get(stringKey)
  if (cachedEntry) {
    entry = cachedEntry
    const bound = new Array(length)
    for (let index = 0; index < length; index++) {
      bound[index] = baselineExtractBinding(fns[index] as never)
    }
    bindings = bound
  } else {
    const built = planAndLowerFast(fns)
    entry = built.entry
    bindings = built.bindings
    if (useNumberKey) frontCacheSet(frontCacheNum, numberKey, entry)
    else frontCacheSet(frontCacheStr, stringKey, entry)
  }

  storeTagged(fns, entry, bindings)
  return dispatchAndTrack(entry, input, bindings)
}

export function baselinePipe(input: unknown, ...steps: readonly ((value: any) => any)[]): unknown
export function baselinePipe(
  input?: unknown,
  f1?: any,
  f2?: any,
  f3?: any,
  f4?: any,
  f5?: any,
): unknown {
  const argc = arguments.length
  if (argc <= 1) return input
  if (argc === 2) return f1(input)
  if (argc === 3) {
    if (!hasOp(f1) && !hasOp(f2)) return f2(f1(input))
    return runTagged(input, arguments, 3)
  }
  if (argc === 4) {
    if (!hasOp(f1) && !hasOp(f2) && !hasOp(f3)) return f3(f2(f1(input)))
    return runTagged(input, arguments, 4)
  }
  if (argc === 5) {
    if (!hasOp(f1) && !hasOp(f2) && !hasOp(f3) && !hasOp(f4)) return f4(f3(f2(f1(input))))
    return runTagged(input, arguments, 5)
  }
  if (argc === 6) {
    if (!hasOp(f1) && !hasOp(f2) && !hasOp(f3) && !hasOp(f4) && !hasOp(f5))
      return f5(f4(f3(f2(f1(input)))))
    return runTagged(input, arguments, 6)
  }

  let anyTagged = false
  for (let index = 1; index < argc; index++) {
    if (hasOp(arguments[index])) {
      anyTagged = true
      break
    }
  }
  if (!anyTagged) {
    let result = input
    for (let index = 1; index < argc; index++) result = arguments[index](result)
    return result
  }
  return runTagged(input, arguments, argc)
}
