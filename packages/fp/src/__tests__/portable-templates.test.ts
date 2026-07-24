import { describe, it, expect } from 'vite-plus/test'
import * as A from '../array'
import { buildPlan } from '../plan'
import { interpret } from '../interpret'
import { compile, explain, planAndLowerFast } from '../compile'
import { ARRAY_TEMPLATES, SINK_TEMPLATES } from '../portable-templates'
import {
  OP_MAP,
  OP_FILTER,
  OP_REJECT,
  OP_FILTER_MAP,
  OP_FLAT_MAP,
  OP_TAKE,
  OP_REDUCE,
  OP_EVERY,
  OP_SOME,
  OP_FIND,
  OP_FIND_INDEX,
  OP_NONE,
  OP_COUNT,
  OP_FIND_MAP,
  OP_SUM,
} from '../opcodes'

function tracked<F extends (...args: any[]) => any>(fn: F): F & { calls: unknown[][] } {
  const calls: unknown[][] = []
  const wrapped = ((...args: unknown[]) => {
    calls.push(args)
    return fn(...(args as Parameters<F>))
  }) as F & { calls: unknown[][] }
  wrapped.calls = calls
  return wrapped
}

class Boom extends Error {}

/** Builds one step for a chain-stage opcode, using a deterministic callback so results are comparable across inputs. */
function stageStep(op: number, track: <F extends (...a: any[]) => any>(fn: F) => F, throwAt?: unknown) {
  switch (op) {
    case OP_MAP:
      return A.map(
        track((x: number) => {
          if (x === throwAt) throw new Boom('map')
          return x + 1
        }),
      )
    case OP_FILTER:
      return A.filter(
        track((x: number) => {
          if (x === throwAt) throw new Boom('filter')
          return x % 2 === 0
        }),
      )
    case OP_REJECT:
      return A.reject(
        track((x: number) => {
          if (x === throwAt) throw new Boom('reject')
          return x % 3 === 0
        }),
      )
    case OP_FILTER_MAP:
      return A.filterMap(
        track((x: number) => {
          if (x === throwAt) throw new Boom('filterMap')
          return x % 2 === 0 ? x * 10 : null
        }),
      )
    case OP_FLAT_MAP:
      return A.flatMap(
        track((x: number) => {
          if (x === throwAt) throw new Boom('flatMap')
          return [x, x + 1]
        }),
      )
    default:
      throw new Error(`stageStep: unsupported op ${op}`)
  }
}

interface BuiltSteps {
  readonly steps: unknown[]
  readonly tracks: (F: unknown) => unknown
  readonly trackedFns: (F<any> & { calls: unknown[][] })[]
}

function buildStepsForOpcodes(
  opcodes: readonly number[],
  track: <F extends (...a: any[]) => any>(fn: F) => F,
  throwAt?: unknown,
): unknown[] {
  const steps: unknown[] = []
  for (const op of opcodes) {
    if (op === OP_TAKE) {
      steps.push(A.take(3))
    } else if (op === OP_REDUCE) {
      steps.push(
        A.reduce(
          track((acc: number, x: number) => {
            if (x === throwAt) throw new Boom('reduce')
            return acc + x
          }),
          0,
        ),
      )
    } else if (op === OP_COUNT) {
      steps.push(
        A.count(
          track((x: number) => {
            if (x === throwAt) throw new Boom('count')
            return x % 2 === 0
          }),
        ),
      )
    } else if (op === OP_EVERY) {
      steps.push(
        A.every(
          track((x: number) => {
            if (x === throwAt) throw new Boom('every')
            return true
          }),
        ),
      )
    } else if (op === OP_SOME) {
      steps.push(
        A.some(
          track((x: number) => {
            if (x === throwAt) throw new Boom('some')
            return false
          }),
        ),
      )
    } else if (op === OP_FIND) {
      steps.push(
        A.find(
          track((x: number) => {
            if (x === throwAt) throw new Boom('find')
            return false
          }),
        ),
      )
    } else if (op === OP_FIND_INDEX) {
      steps.push(
        A.findIndex(
          track((x: number) => {
            if (x === throwAt) throw new Boom('findIndex')
            return false
          }),
        ),
      )
    } else if (op === OP_NONE) {
      steps.push(
        A.none(
          track((x: number) => {
            if (x === throwAt) throw new Boom('none')
            return false
          }),
        ),
      )
    } else if (op === OP_FIND_MAP) {
      steps.push(
        A.findMap(
          track((x: number) => {
            if (x === throwAt) throw new Boom('findMap')
            return null
          }),
        ),
      )
    } else if (op === OP_SUM) {
      steps.push(A.sum)
    } else {
      steps.push(stageStep(op, track, throwAt))
    }
  }
  return steps
}

const INPUTS: readonly (readonly number[])[] = [
  [],
  [5, 3, 8, 1, 9],
  [5, 3, 8, 1, 9, 2, 7, 4, 6, 0, 11, 12, 13, 14, 15],
]

function runDifferential(name: string, opcodes: readonly number[]): void {
  describe(name, () => {
    for (const input of INPUTS) {
      it(`matches interpret() on input of length ${input.length}`, () => {
        const track1 = tracked
        const trackedFns: (unknown & { calls: unknown[][] })[] = []
        const trackAndCollect = <F extends (...a: any[]) => any>(fn: F): F => {
          const t = track1(fn)
          trackedFns.push(t)
          return t
        }
        const steps = buildStepsForOpcodes(opcodes, trackAndCollect)
        const plan = buildPlan(steps)

        const expected = interpret(plan, input)
        const expectedCalls = trackedFns.map((f) => (f as any).calls.length)

        // Rebuild fresh tracked callbacks for the actual-under-test run so call
        // counts aren't polluted by the oracle run above.
        const trackedFns2: (unknown & { calls: unknown[][] })[] = []
        const trackAndCollect2 = <F extends (...a: any[]) => any>(fn: F): F => {
          const t = track1(fn)
          trackedFns2.push(t)
          return t
        }
        const steps2 = buildStepsForOpcodes(opcodes, trackAndCollect2)
        const runner = compile(...steps2)
        const actual = runner(input)
        const actualCalls = trackedFns2.map((f) => (f as any).calls.length)

        expect(actual).toEqual(expected)
        expect(actualCalls).toEqual(expectedCalls)
      })
    }

    it('early-exits mid-stream identically when a take limit is present', () => {
      if (!opcodes.includes(OP_TAKE)) return
      const input = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
      const trackedFns: (unknown & { calls: unknown[][] })[] = []
      const track = <F extends (...a: any[]) => any>(fn: F): F => {
        const t = tracked(fn)
        trackedFns.push(t)
        return t
      }
      const steps = buildStepsForOpcodes(opcodes, track)
      const plan = buildPlan(steps)
      const expected = interpret(plan, input)
      const expectedCalls = trackedFns.map((f) => (f as any).calls.length)

      const trackedFns2: (unknown & { calls: unknown[][] })[] = []
      const track2 = <F extends (...a: any[]) => any>(fn: F): F => {
        const t = tracked(fn)
        trackedFns2.push(t)
        return t
      }
      const steps2 = buildStepsForOpcodes(opcodes, track2)
      const actual = compile(...steps2)(input)
      const actualCalls = trackedFns2.map((f) => (f as any).calls.length)

      expect(actual).toEqual(expected)
      expect(actualCalls).toEqual(expectedCalls)
    })

    it('propagates the first thrown error identically', () => {
      const input = [1, 2, 3, 4, 5, 6, 7, 8]
      const throwAt = 4
      const stepsOracle = buildStepsForOpcodes(opcodes, tracked, throwAt)
      const planOracle = buildPlan(stepsOracle)
      let oracleErr: unknown
      try {
        interpret(planOracle, input)
      } catch (e) {
        oracleErr = e
      }

      const stepsActual = buildStepsForOpcodes(opcodes, tracked, throwAt)
      let actualErr: unknown
      try {
        compile(...stepsActual)(input)
      } catch (e) {
        actualErr = e
      }

      expect(oracleErr).toBeInstanceOf(Boom)
      expect(actualErr).toBeInstanceOf(Boom)
      expect((actualErr as Boom).message).toEqual((oracleErr as Boom).message)
    })
  })
}

describe('portable templates: systematic differential against interpret()', () => {
  for (const t of ARRAY_TEMPLATES) runDifferential(`array template [${t.key}]`, t.opcodes)
  for (const t of SINK_TEMPLATES) {
    if (t.kind === 'sum') continue // cross-segment fusion: exercised separately below (crosses a materializer boundary interpret() also models as two segments).
    runDifferential(`sink template [${t.key}] (${t.kind})`, t.opcodes)
  }
})

describe('portable templates: sum fusion (stream chain -> SUM boundary)', () => {
  const sumTemplates = SINK_TEMPLATES.filter((t) => t.kind === 'sum')
  for (const t of sumTemplates) {
    const baseOp = t.opcodes[0]
    describe(`[${t.key}]`, () => {
      for (const input of INPUTS) {
        it(`matches interpret() on input of length ${input.length}`, () => {
          const steps = buildStepsForOpcodes([baseOp, OP_SUM], tracked)
          const plan = buildPlan(steps)
          const expected = interpret(plan, input)
          const actual = compile(...steps)(input)
          expect(actual).toEqual(expected)
        })
      }

      it('propagates the first thrown error identically', () => {
        const input = [1, 2, 3, 4, 5, 6]
        const stepsOracle = buildStepsForOpcodes([baseOp, OP_SUM], tracked, 3)
        let oracleErr: unknown
        try {
          interpret(buildPlan(stepsOracle), input)
        } catch (e) {
          oracleErr = e
        }
        const stepsActual = buildStepsForOpcodes([baseOp, OP_SUM], tracked, 3)
        let actualErr: unknown
        try {
          compile(...stepsActual)(input)
        } catch (e) {
          actualErr = e
        }
        expect(oracleErr).toBeInstanceOf(Boom)
        expect(actualErr).toBeInstanceOf(Boom)
      })

      it('reports the fused pair as executor kind "template"', () => {
        const steps = buildStepsForOpcodes([baseOp, OP_SUM], tracked)
        const explanation = explain(...steps)
        expect(explanation.segmentExecutors).toEqual(['template', 'template'])
      })
    })
  }
})

describe('portable templates: fallback correctness for a shape with no template', () => {
  it('a 4-op map chain (beyond the length-3 template grammar) still executes correctly via the generic path', () => {
    const input = [1, 2, 3, 4, 5]
    const steps = [
      A.map(tracked((x: number) => x + 1)),
      A.map(tracked((x: number) => x * 2)),
      A.map(tracked((x: number) => x - 1)),
      A.map(tracked((x: number) => x + 3)),
    ]
    const plan = buildPlan(steps)
    const expected = interpret(plan, input)
    const actual = compile(...steps)(input)
    expect(actual).toEqual(expected)

    const explanation = explain(...steps)
    expect(explanation.segmentExecutors).toEqual(['generic'])
  })

  it('drop is not part of the template grammar and still executes correctly', () => {
    const input = [1, 2, 3, 4, 5, 6]
    const steps = [A.filter(tracked((x: number) => x % 2 === 0)), A.drop(1)]
    const plan = buildPlan(steps)
    const expected = interpret(plan, input)
    const actual = compile(...steps)(input)
    expect(actual).toEqual(expected)

    const explanation = explain(...steps)
    expect(explanation.segmentExecutors).toEqual(['generic'])
  })
})

describe('portable templates: targeted reducing, short-circuit, and flatMap coverage', () => {
  it('selects templates for the measured map/filter sinks and long flatMap shapes', () => {
    expect(
      explain(
        A.map((x: number) => x + 1),
        A.filter((x: number) => x % 2 === 0),
        A.reduce((acc: number, x: number) => acc + x, 0),
      ).segmentExecutors,
    ).toEqual(['template'])

    expect(
      explain(
        A.map((x: number) => x + 1),
        A.filter((x: number) => x % 2 === 0),
        A.find((x: number) => x > 10),
      ).segmentExecutors,
    ).toEqual(['template'])

    expect(
      explain(
        A.map((x: number) => x + 1),
        A.flatMap((x: number) => [x, x + 1]),
        A.filter((x: number) => x % 2 === 0),
        A.filterMap((x: number) => (x > 0 ? x * 2 : null)),
        A.reduce((acc: number, x: number) => acc + x, 0),
      ).segmentExecutors,
    ).toEqual(['template'])
  })

  it('reports the exact source consumption for an early short-circuit template', () => {
    const { entry, bindings } = planAndLowerFast([
      A.map((x: number) => x + 1),
      A.filter((x: number) => x % 2 === 0),
      A.find((x: number) => x === 4),
    ])
    const meta = { consumed: 0 }

    expect(entry.run([1, 2, 3, 4, 5], bindings, meta)).toEqual({ _tag: 1, value: 4 })
    expect(meta.consumed).toBe(3)
  })

  it('closes a flatMap iterable when a long find template exits early', () => {
    let closed = false
    function* expand(x: number): Generator<number> {
      try {
        yield x
        yield x + 1
      } finally {
        closed = true
      }
    }
    const runner = compile(
      A.map((x: number) => x),
      A.flatMap(expand),
      A.filter((x: number) => x >= 0),
      A.filterMap((x: number) => x),
      A.find((x: number) => x === 1),
    )

    expect(runner([0, 10])).toEqual({ _tag: 1, value: 1 })
    expect(closed).toBe(true)
  })
})

describe('portable templates: reentrancy on a template execution path', () => {
  it('isolates more callback binding sets than the bounded lane count', () => {
    const input = Array.from({ length: 200 }, (_, index) => index - 100)
    const pipelines = Array.from({ length: 12 }, (_, index) => {
      const multiplier = index + 1
      const offset = index - 5
      const modulus = (index % 5) + 2
      const remainder = index % modulus
      const runner = compile(
        A.map((value: number) => value * multiplier + offset),
        A.filter((value: number) => value % modulus === remainder),
        A.reduce((acc: number, value: number) => acc + value, index),
      )
      const expected = input
        .map((value) => value * multiplier + offset)
        .filter((value) => value % modulus === remainder)
        .reduce((acc, value) => acc + value, index)
      return { runner, expected }
    })

    for (let round = 0; round < 5; round++) {
      for (const pipeline of pipelines) {
        expect(pipeline.runner(input)).toBe(pipeline.expected)
      }
    }
  })

  it('a template-executed pipe nested inside another template-executed pipe does not corrupt state', () => {
    const inner = compile(
      A.map((x: number) => x * 2),
      A.filter((x: number) => x % 3 !== 0),
    )
    const outer = compile(
      A.map((row: number[]) => inner(row)),
      A.filterMap((rows: number[]) => (rows.length > 0 ? rows : null)),
    )

    const explanationInner = explain(
      A.map((x: number) => x * 2),
      A.filter((x: number) => x % 3 !== 0),
    )
    expect(explanationInner.segmentExecutors).toEqual(['template'])

    const batches = [
      [1, 2, 3],
      [4, 5, 6],
      [],
      [7, 8, 9, 10],
    ]
    const result = outer(batches)
    const expected = batches.map((b) => inner(b)).filter((rows) => rows.length > 0)
    expect(result).toEqual(expected)

    // Run the same compiled runners concurrently-in-sequence again to make sure
    // no module-level mutable state leaked between calls.
    const result2 = outer(batches)
    expect(result2).toEqual(expected)
  })
})
