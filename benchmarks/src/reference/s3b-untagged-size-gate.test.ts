import { describe, expect, test } from 'vite-plus/test'
import {
  evaluateUntaggedSizes,
  measureUntaggedSizes,
  S3B_SIZE_CASES,
  type UntaggedSizeRow,
} from './s3b-untagged-size-gate'

const rowOf = (id: string, gzipBytes: number, retainsOpcodeTable: boolean): UntaggedSizeRow => ({
  id,
  minifiedBytes: gzipBytes * 2,
  gzipBytes,
  retainsOpcodeTable,
})

describe('S3B size policy', () => {
  test('rejects a flow over its ceiling', () => {
    const rows = S3B_SIZE_CASES.map((testCase) => rowOf(testCase.id, 4096, false))
    const failures = evaluateUntaggedSizes(rows)
    expect(failures.some((failure) => failure.includes('option.flow'))).toBe(true)
  })

  test('rejects a migrated flow that brings the opcode table back', () => {
    const rows = S3B_SIZE_CASES.map((testCase) => rowOf(testCase.id, 100, true))
    expect(evaluateUntaggedSizes(rows)).toContain('option.flow still retains the opcode table')
  })

  test('rejects a missing row', () => {
    expect(evaluateUntaggedSizes([])).toContain('missing size row for option.flow')
  })

  test('reports but does not fail a deferred row', () => {
    const rows = S3B_SIZE_CASES.map((testCase) =>
      rowOf(testCase.id, testCase.enforcement === 'enforced' ? 100 : 100_000, false),
    )
    expect(evaluateUntaggedSizes(rows)).toEqual([])
  })
})

describe('measured bundles', () => {
  test('every enforced flow meets its ceiling with no opcode table', async () => {
    const rows = await measureUntaggedSizes()
    expect(evaluateUntaggedSizes(rows)).toEqual([])
    const option = rows.find((row) => row.id === 'option.flow')
    const result = rows.find((row) => row.id === 'result.flow')
    expect(option?.retainsOpcodeTable).toBe(false)
    expect(result?.retainsOpcodeTable).toBe(false)
  }, 120_000)
})
