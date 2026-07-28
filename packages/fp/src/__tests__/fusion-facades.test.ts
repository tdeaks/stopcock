import { describe, expect, it } from 'vite-plus/test'
import * as A from '../array'
import { compile, compilePure } from '../compile'
import { explain, explainPure } from '../internal/explain'
import * as fusion from '../fusion'
import * as fusionDebug from '../fusion-debug'
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
  it('ships no optimized facade at all', () => {
    // S10X moved the optimizer out. This package must not expose it under any
    // name, or the extraction would be a rename rather than a removal, and the
    // bytes would still be in the tarball.
    expect(PUBLIC_MODULES.some((module) => module.subpath.includes('optimized'))).toBe(false)
  })

  it('resolves the deprecated compile subpath the same as fusion and root', () => {
    // An FP-only install has to stay complete. This specifier must not become
    // a hidden forwarder to a package that may not be installed.
    const viaCompile = compile(A.map(double), A.filter(big))([1, 2, 3])
    expect(viaCompile).toEqual(fusion.pipe([1, 2, 3], A.map(double), A.filter(big)))
  })

  it('matches current sequential semantics', () => {
    const viaFacade = fusion.pipe([1, 2, 3], A.map(double), A.filter(big))
    const viaRoot = pipe([1, 2, 3], A.map(double), A.filter(big))
    const viaCompile = compile(A.map(double), A.filter(big))([1, 2, 3])
    const viaCompilePure = compilePure(A.map(double), A.filter(big))([1, 2, 3])
    expect(viaFacade).toEqual([2, 4, 6].filter((x) => x > 2))
    expect(viaFacade).toEqual(viaRoot)
    expect(viaFacade).toEqual(viaCompile)
    expect(viaFacade).toEqual(viaCompilePure)
  })

  it('runs every step to completion before the next, same as root pipe', () => {
    // There is no runtime fusion engine any more (see the one-runtime-path
    // plan): `@stopcock/fp/fusion`'s `pipe` is the same sequential function
    // as root `pipe`. Callback interleaving is unspecified across tiers (D1);
    // the only tier left here is sequential, so every mapper runs before any
    // filter, the same as root.
    expect(traceCallbacks(fusion.pipe)).toEqual(['map', 'map', 'filter', 'filter'])
    expect(traceCallbacks(fusion.pipe)).toEqual(traceCallbacks(pipe))
  })

  it('exposes named aliases so a call site can say which it means', () => {
    expect(fusion.fusedPipe).toBe(fusion.pipe)
    expect(fusion.fusedFlow).toBe(fusion.flow)
    expect(fusion.pipe).toBe(pipe)
    expect(fusion.flow).toBe(flow)
  })

  it('keeps root exports unchanged in this slice', () => {
    expect(pipe([1, 2, 3], A.map(double), A.filter(big))).toEqual([4, 6])
    expect(flow(A.map(double), A.filter(big))([1, 2, 3])).toEqual([4, 6])
  })
})

describe('fusion debug facade', () => {
  it('exposes only the static explanation surface', () => {
    // S10 moved explainRunner and the optimizer statistics to
    // `/fusion/optimized`. Re-exporting them here put the engine's chunk back
    // into every consumer of this entry, which is what the whole move was for.
    expect(fusionDebug.explain).toBe(explain)
    expect(Object.keys(fusionDebug).sort()).toEqual(['explain', 'explainPure'])
  })

  it('keeps engine-bound diagnostics out of this package entirely', () => {
    // There is no fusion engine, specialized runner bank, or plan/registry
    // left to produce them.
    for (const name of [
      'explainRunner',
      'getOptimizerStats',
      'resetOptimizerStats',
      'PureRewrite',
    ]) {
      expect(Object.keys(fusionDebug)).not.toContain(name)
      expect(Object.keys(fusion)).not.toContain(name)
    }
  })

  it('reports sequential for any pipeline, truthfully: there is nothing left to fuse at runtime', () => {
    expect(explain(A.map(double), A.filter(big))).toBe('sequential')
    expect(explainPure(A.map(double), A.filter(big))).toBe('sequential')
    expect(fusionDebug.explain(A.sort, A.take(2))).toBe('sequential')
    expect(fusionDebug.explainPure()).toBe('sequential')
  })
})

describe('internal sequential core', () => {
  it('root pipe and flow delegate straight to it', () => {
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

  it('applies steps left to right, whatever the operators are', () => {
    expect(sequentialPipe([1, 2, 3], A.map(double), A.filter(big))).toEqual([4, 6])
    expect(traceCallbacks(sequentialPipe as never)).toEqual(['map', 'map', 'filter', 'filter'])
  })

  it('agrees with every public facade on the same pipeline', () => {
    const steps = [A.map(double), A.filter(big), A.take(1)] as never[]
    const expected = sequentialPipe([1, 2, 3, 4], ...steps)
    expect(expected).toEqual(fusion.pipe([1, 2, 3, 4], ...(steps as [never, never, never])))
    expect(expected).toEqual(pipe([1, 2, 3, 4], ...(steps as [never, never, never])))
    expect(expected).toEqual(compile(...steps)([1, 2, 3, 4]))
  })

  it('imports nothing', async () => {
    const source = await import('node:fs/promises').then((fs) =>
      fs.readFile(new URL('../internal/sequential.ts', import.meta.url), 'utf8'),
    )
    expect(source).not.toMatch(/^\s*import\s/mu)
  })
})

describe('public manifest', () => {
  it('publishes the fusion entries that survived extraction', () => {
    const subpaths = PUBLIC_MODULES.map((module) => module.subpath)
    expect(subpaths).toContain('./fusion')
    expect(subpaths).toContain('./fusion/debug')
    expect(PUBLIC_MODULES.find((module) => module.subpath === './fusion/debug')).toMatchObject({
      entry: 'src/fusion-debug.ts',
      typesOutput: 'fusion-debug',
    })
    // `./fusion/optimized` was removed by S10X rather than left as a shim.
    expect(subpaths).not.toContain('./fusion/optimized')
  })

  it('keeps the engine and sequential core private', () => {
    const entries = PUBLIC_MODULES.map((module) => module.entry)
    expect(entries.every((entry) => !entry.includes('internal/'))).toBe(true)
  })
})
