import { describe, expect, test } from 'vite-plus/test'
import { runRequalification, STABLE_TARBALL_CEILING_BYTES } from './s12p-requalification-gate'

/**
 * S12P is the gate that decides whether S12 may run at all. Its two questions
 * are independent: does the packed product work, and does it fit.
 */
describe('S12P requalification', () => {
  test(
    'every public subpath imports and runs from the packed tarballs',
    () => {
      const report = runRequalification()
      const broken = report.subpaths.filter((entry) => !entry.ok)
      expect(broken).toEqual([])
      expect(report.subpaths.length).toBeGreaterThan(20)
      // Behaviour across the package boundary is part of qualification: the
      // optimizer is a separate install and has to work against the packed FP.
      expect(report.packages.map((entry) => entry.name).sort()).toEqual([
        '@stopcock/fp',
        '@stopcock/fp-optimizer',
      ])
    },
    600_000,
  )

  test(
    'records the tarball decision without waiving it',
    () => {
      const report = runRequalification()
      // Deliberately asserts the derivation, not a green result. S12P's
      // outcome is currently over-ceiling, and a late budget waiver is
      // explicitly not one of its options -- so this test must not be the
      // place that quietly grants one.
      expect(report.ceilingBytes).toBe(STABLE_TARBALL_CEILING_BYTES)
      expect(report.decision).toBe(
        report.fpTarballBytes < STABLE_TARBALL_CEILING_BYTES ? 'under-ceiling' : 'over-ceiling',
      )
    },
    600_000,
  )
})
