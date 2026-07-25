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
    ['dist/lower-DbN7wkY0.js', 'optimizer'],
    ['dist/portable-templates-Ab12Cd34.js', 'optimizer'],
    ['dist/fusion/optimized.js', 'optimizer'],
    ['dist/fusion.js', 'compact'],
    ['dist/compile.js', 'compact'],
    ['dist/plan-DHehCDS7.js', 'direct'],
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

      // S10X extracted the optimizer, so zero is the correct answer here and
      // is itself the evidence: FP's tarball carries none of it.
      //
      // Zero used to mean the categorizer was broken -- an early version
      // stripped the wrong path prefix and reported a confident
      // `same-package-feasible` from a measurement of nothing. That guard now
      // lives in the categorizer unit tests above, which pin a known optimizer
      // filename to `optimizer`, so a silently broken categorizer still fails.
      expect(pack.optimizerBytes).toBe(0)
      expect(pack.files.length).toBeGreaterThan(0)
      expect(pack.decision).toBe('same-package-feasible')
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
