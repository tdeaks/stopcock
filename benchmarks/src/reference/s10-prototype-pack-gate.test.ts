import { describe, expect, test } from 'vite-plus/test'
import {
  buildPrototypePack,
  categorize,
  SAME_PACKAGE_CEILING_BYTES,
} from './s10-prototype-pack-gate'

/**
 * The S10 exit gate produces an immutable decision input, not the final
 * topology. This checks that the input is real: that the categorizer actually
 * attributes bytes, and that the verdict follows from the measurement.
 */
describe('S10 prototype pack categorizer', () => {
  test.each([
    ['dist/compile-DbN7wkY0.js', 'optimizer'],
    ['dist/plan-DHehCDS7.js', 'optimizer'],
    ['dist/fusion/optimized.js', 'optimizer'],
    ['dist/fusion.js', 'compact'],
    ['dist/array-D-NykSoV.js', 'direct'],
    ['dist/array.d.ts', 'types'],
    ['package.json', 'metadata'],
    ['README.md', 'metadata'],
  ])('%s is %s', (path, expected) => {
    expect(categorize(path)).toBe(expected)
  })
})

describe('S10 prototype pack', () => {
  test(
    'attributes bytes and derives the topology decision from them',
    () => {
      const pack = buildPrototypePack()

      // An earlier version of the categorizer stripped the wrong path prefix
      // and attributed 0 B to the optimizer, which produced a confident
      // `same-package-feasible` from a measurement of nothing.
      expect(pack.optimizerBytes).toBeGreaterThan(0)
      expect(pack.files.length).toBeGreaterThan(0)
      expect(pack.totalBytes).toBe(pack.files.reduce((sum, file) => sum + file.bytes, 0))
      expect(Object.values(pack.categoryBytes).reduce((a, b) => a + b, 0)).toBe(pack.totalBytes)

      const expected =
        pack.optimizerBytes < SAME_PACKAGE_CEILING_BYTES
          ? 'same-package-feasible'
          : 'externalization-required'
      expect(pack.decision).toBe(expected)
      expect(pack.inventoryHash).toMatch(/^sha256:[0-9a-f]{64}$/u)
    },
    180_000,
  )
})
