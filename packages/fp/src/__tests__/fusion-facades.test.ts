import { describe, expect, it } from 'vite-plus/test'
import * as A from '../array'
import { compile, explain, getOptimizerStats } from '../compile'
import * as fusion from '../fusion'
import * as fusionDebug from '../fusion-debug'
import * as fusionOptimized from '../fusion-optimized'
import { pipe as enginePipe } from '../internal/fusion-engine'
import { flow as engineFlow } from '../internal/fusion-flow'
import { sequentialFlow, sequentialPipe } from '../internal/sequential'
import { PUBLIC_MODULES } from '../../module-manifest'
import { flow } from '../flow'
import { pipe } from '../pipe'

const double = (x: number) => x * 2
const big = (x: number) => x > 2

/** Order in which a two-step pipeline invokes its callbacks over two elements. */
const traceCallbacks = (run: typeof fusion.pipe): string[] => {
  const order: string[] = []
  run(
    [1, 2],
    A.map((x: number) => {
      order.push('map')
      return x * 2
    }),
    A.filter((x: number) => {
      order.push('filter')
      return x > 0
    }),
  )
  return order
}

describe('explicit fusion facades', () => {
  it('delegates to the engine module, not to the root symbols', () => {
    // The exit gate that matters: S8 makes root pipe sequential, and a facade
    // pointed at that symbol would silently change meaning when it does.
    expect(fusion.pipe).toBe(enginePipe)
    expect(fusion.flow).toBe(engineFlow)
    expect(fusionOptimized.pipe).toBe(enginePipe)
    expect(fusionOptimized.flow).toBe(engineFlow)
  })

  it('is the same implementation as optimized fusion for now', () => {
    expect(fusionOptimized.pipe).toBe(fusion.pipe)
    expect(fusionOptimized.flow).toBe(fusion.flow)
    expect(fusionOptimized.compile).toBe(fusion.compile)
  })

  it('matches current fused semantics', () => {
    const viaFacade = fusion.pipe([1, 2, 3], A.map(double), A.filter(big))
    const viaRoot = pipe([1, 2, 3], A.map(double), A.filter(big))
    const viaCompile = compile(A.map(double), A.filter(big))([1, 2, 3])
    expect(viaFacade).toEqual([2, 4, 6].filter((x) => x > 2))
    expect(viaFacade).toEqual(viaRoot)
    expect(viaFacade).toEqual(viaCompile)
  })

  it('interleaves callbacks, which is what fusing means here', () => {
    // The executor-kind diagnostic that lets a later slice prove root and
    // explicit fusion are intentionally different: a fused pipeline runs the
    // predicate right after the mapper for each element, a sequential one runs
    // every mapper first.
    expect(traceCallbacks(fusion.pipe)).toEqual(['map', 'filter', 'map', 'filter'])
  })

  it('exposes named aliases so a call site can say which it means', () => {
    expect(fusion.fusedPipe).toBe(fusion.pipe)
    expect(fusion.fusedFlow).toBe(fusion.flow)
  })

  it('keeps root exports unchanged in this slice', () => {
    expect(pipe([1, 2, 3], A.map(double), A.filter(big))).toEqual([4, 6])
    expect(flow(A.map(double), A.filter(big))([1, 2, 3])).toEqual([4, 6])
  })
})

describe('fusion debug facade', () => {
  it('re-exports the pinned explanation and statistics surface', () => {
    expect(fusionDebug.explain).toBe(explain)
    expect(fusionDebug.getOptimizerStats).toBe(getOptimizerStats)
    expect(Object.keys(fusionDebug).sort()).toEqual([
      'explain',
      'explainPure',
      'explainRunner',
      'getOptimizerStats',
      'resetOptimizerStats',
    ])
  })

  it('explains a facade pipeline', () => {
    const explanation = fusionDebug.explain(A.map(double), A.filter(big))
    expect(explanation.version).toBe(1)
    expect(explanation.segments.length).toBeGreaterThan(0)
    expect(explanation.executor).toBe('portable')
  })
})

describe('internal sequential core', () => {
  it('is not connected to root yet', () => {
    expect(pipe).not.toBe(sequentialPipe)
    expect(flow).not.toBe(sequentialFlow)
  })

  it('applies steps left to right', () => {
    expect(
      sequentialPipe(
        1,
        (x: number) => x + 1,
        (x: number) => x * 10,
      ),
    ).toBe(20)
    expect(sequentialPipe(1)).toBe(1)
    expect(
      sequentialFlow(
        (x: number) => x + 1,
        (x: number) => x * 10,
      )(1),
    ).toBe(20)
  })

  it('steps rather than fusing, whatever the operators are', () => {
    expect(sequentialPipe([1, 2, 3], A.map(double), A.filter(big))).toEqual([4, 6])
    expect(traceCallbacks(sequentialPipe as never)).toEqual(['map', 'map', 'filter', 'filter'])
  })

  it('agrees with the fused engine on the same pipeline', () => {
    const steps = [A.map(double), A.filter(big), A.take(1)] as never[]
    expect(sequentialPipe([1, 2, 3, 4], ...steps)).toEqual(
      fusion.pipe([1, 2, 3, 4], ...(steps as [never, never, never])),
    )
  })

  it('imports nothing', async () => {
    const source = await import('node:fs/promises').then((fs) =>
      fs.readFile(new URL('../internal/sequential.ts', import.meta.url), 'utf8'),
    )
    expect(source).not.toMatch(/^\s*import\s/mu)
  })
})

describe('public manifest', () => {
  it('publishes the three additive fusion entries', () => {
    const subpaths = PUBLIC_MODULES.map((module) => module.subpath)
    expect(subpaths).toContain('./fusion')
    expect(subpaths).toContain('./fusion/optimized')
    expect(subpaths).toContain('./fusion/debug')
  })

  it('keeps the engine and sequential core private', () => {
    const entries = PUBLIC_MODULES.map((module) => module.entry)
    expect(entries.every((entry) => !entry.includes('internal/'))).toBe(true)
  })
})
