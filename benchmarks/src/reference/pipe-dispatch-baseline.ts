// Frozen snapshot of pipe.ts's bounded identity/front-cache implementation
// before the hot-identity optimization. This is a benchmark fixture only: it
// is not shipped by @stopcock/fp. The dispatch release gate retains it locally
// so current and baseline dispatch can be paired in one Bun/JSC or Node/V8
// process without relying on unstable wall-clock results from separate runs.
//
// The front-cache/shape-entry dispatch path this fixture used to exercise
// lived in the now-deleted specialized fusion engine and has no equivalent
// in the compact tier, which caches a bound plan directly rather than a
// per-shape dispatch entry. This fixture keeps the bounded identity-cache
// dispatch cost it was written to measure and drops the front-cache branch
// that engine alone provided.
import { compile, type Runner } from '../../../packages/fp/src/compile'

interface CacheEntry {
  readonly fns: readonly unknown[]
  readonly runner: Runner
  used: number
}

const CACHE_SIZE = 4
const cache: Array<CacheEntry | undefined> = [undefined, undefined, undefined, undefined]
let clock = 0

const hasOp = (fn: any): boolean => typeof fn._op === 'number' && fn._op > 0

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

function runTagged(input: unknown, args: ArrayLike<unknown>, argc: number): unknown {
  const cached = lookupCache(args, argc)
  if (cached) return cached.runner(input)

  const length = argc - 1
  const fns = new Array(length)
  for (let index = 0; index < length; index++) fns[index] = args[index + 1]

  const runner = compile(...(fns as readonly Runner[]))
  storeRunner(fns, runner)
  return runner(input)
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
