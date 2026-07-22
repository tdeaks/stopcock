import { describe, it, expect } from 'vite-plus/test'
import { pipe } from '../pipe'
import * as A from '../array'
import { compile, compilePure, __shapeEntryForSteps } from '../compile'
import { __clearEntries, __lookupEntry, executionIdentityKey } from '../shape-entry'
import { buildPlan, planShapeKey } from '../plan'

const data = [5, 3, 8, 1, 9, 2, 7, 4, 6, 0]

describe('ShapeEntry ownership model', () => {
  it('an identity-cache hit observes a tier swap written to entry.run', () => {
    const double = (x: number) => x * 2
    const even = (x: number) => x % 2 === 0

    // Two calls with the SAME callback references: the second is an
    // identity-cache hit in pipe.ts.
    pipe(data, A.map(double), A.filter(even))
    pipe(data, A.map(double), A.filter(even))

    const entry = __shapeEntryForSteps([A.map(double), A.filter(even)])
    const spy: unknown[] = []
    const original = entry.run
    entry.run = (input, bindings) => {
      spy.push(input)
      return original(input, bindings)
    }

    const result = pipe(data, A.map(double), A.filter(even))

    expect(spy.length).toBe(1)
    expect(result).toEqual(data.map(double).filter(even))

    entry.run = original
  })

  it('a front-cache hit (fresh closures, same opcode sequence) also observes a swap', () => {
    const entry = __shapeEntryForSteps([A.map((x: number) => x + 1), A.filter((x: number) => x > 0)])
    const original = entry.run
    let seen = 0
    entry.run = (input, bindings) => {
      seen++
      return original(input, bindings)
    }

    // Fresh arrow functions each call: misses the 4-entry identity cache,
    // hits the opcode-keyed front cache instead, which must hold the
    // ShapeEntry itself, not a bound runner captured at front-cache-fill time.
    for (let i = 0; i < 3; i++) {
      pipe(data, A.map((x: number) => x + 1), A.filter((x: number) => x > 0))
    }

    expect(seen).toBe(3)
    entry.run = original
  })

  it('exact and pure never share an entry for the same shape', () => {
    const isEven = (x: number) => x % 2 === 0
    const steps = [A.filter(isEven)]
    // compile()/compilePure() go through the single-op collapse for
    // one-step pipelines, so use a two-step shape to exercise buildPortable.
    const twoStep = [A.map((x: number) => x), A.filter(isEven)]

    const exactRunner = compile(...twoStep)
    const pureRunner = compilePure(...twoStep)
    exactRunner(data)
    pureRunner(data)

    const plan = buildPlan(twoStep)
    const shapeKey = planShapeKey(plan.shape)
    const exactEntry = __lookupEntry(shapeKey, 'exact', 'none')
    const pureEntry = __lookupEntry(shapeKey, 'pure', 'none')

    expect(exactEntry).toBeDefined()
    expect(pureEntry).toBeDefined()
    expect(exactEntry).not.toBe(pureEntry)
    expect(executionIdentityKey(shapeKey, 'exact', 'none')).not.toBe(executionIdentityKey(shapeKey, 'pure', 'none'))
  })

  it('eviction reverts entry.run to portableRun and drops the entry from the registry', () => {
    const entry = __shapeEntryForSteps([A.map((x: number) => x * 3), A.reverse])
    const spy = () => 'promoted'
    entry.run = spy as unknown as typeof entry.run
    expect(entry.run).not.toBe(entry.portableRun)

    __clearEntries()

    expect(entry.run).toBe(entry.portableRun)

    const plan = buildPlan([A.map((x: number) => x * 3), A.reverse])
    const shapeKey = planShapeKey(plan.shape)
    expect(__lookupEntry(shapeKey, 'exact', 'none')).toBeUndefined()
  })
})
