import { describe, expect, test } from 'vite-plus/test'
import {
  COMPACT_CEILING_BYTES,
  DEBUG_MARKERS,
  evaluateCompactSize,
  measureCompactClosure,
} from './s9-compact-size-gate'

describe('S9 compact size policy', () => {
  test('accepts a small closure with no debug and no registry', () => {
    expect(evaluateCompactSize({ gzipBytes: 3000, debugMarkers: [], operationNames: [] })).toEqual(
      [],
    )
  })

  test('rejects a closure over the hard gate', () => {
    const failures = evaluateCompactSize({
      gzipBytes: COMPACT_CEILING_BYTES + 1,
      debugMarkers: [],
      operationNames: [],
    })
    expect(failures.some((failure) => failure.includes('hard'))).toBe(true)
  })

  test('rejects debug surface in production', () => {
    const failures = evaluateCompactSize({
      gzipBytes: 3000,
      debugMarkers: ['plansBuilt'],
      operationNames: [],
    })
    expect(failures.some((failure) => failure.includes('debug surface'))).toBe(true)
  })

  test('rejects the name registry coming back', () => {
    const failures = evaluateCompactSize({
      gzipBytes: 3000,
      debugMarkers: [],
      operationNames: ['filterMap'],
    })
    expect(failures.some((failure) => failure.includes('name registry'))).toBe(true)
  })

  test('keeps the gate at 5.5 KiB', () => {
    expect(COMPACT_CEILING_BYTES).toBe(5632)
    expect(DEBUG_MARKERS.length).toBeGreaterThan(0)
  })
})

describe('measured compact closure', () => {
  test('is under the hard gate with no debug and no registry', async () => {
    const report = await measureCompactClosure()
    expect({ bytes: report.gzipBytes, failures: evaluateCompactSize(report) }).toEqual({
      bytes: report.gzipBytes,
      failures: [],
    })
  }, 180_000)
})
