import { describe, expect, test } from 'vite-plus/test'
import {
  evaluateRootSizes,
  measureRootSizes,
  ROOT_FORBIDDEN_MARKERS,
  S8_ROOT_SIZE_CASES,
  type RootSizeRow,
} from './s8-root-size-gate'

const rows = (gzipBytes: number, forbidden: readonly string[] = []): RootSizeRow[] =>
  S8_ROOT_SIZE_CASES.map((testCase) => ({ id: testCase.id, gzipBytes, forbidden }))

describe('S8 root size policy', () => {
  test('accepts sizes under every ceiling', () => {
    expect(evaluateRootSizes(rows(100))).toEqual([])
  })

  test('rejects a root entry over its ceiling', () => {
    const failures = evaluateRootSizes(rows(9000))
    expect(failures.some((failure) => failure.startsWith('root.pipe'))).toBe(true)
  })

  test('rejects a root entry that dragged the planner in', () => {
    const failures = evaluateRootSizes(rows(100, ['planAndLowerFast']))
    expect(failures.some((failure) => failure.includes('planAndLowerFast'))).toBe(true)
  })

  test('rejects a missing row', () => {
    expect(evaluateRootSizes([])).toHaveLength(S8_ROOT_SIZE_CASES.length)
  })

  test('permits operator identity, which S8 explicitly allows', () => {
    // `_op` is the minimal machinery a reachable data-last wrapper needs. Only
    // the planner, lowerer, registry, caches, and templates are forbidden.
    expect(ROOT_FORBIDDEN_MARKERS).not.toContain('_op')
  })
})

describe('measured root entries', () => {
  test('every entry is under its ceiling with no engine', async () => {
    expect(evaluateRootSizes(await measureRootSizes())).toEqual([])
  }, 180_000)
})
