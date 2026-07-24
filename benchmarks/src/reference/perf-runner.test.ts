import { describe, expect, it } from 'vitest'
import {
  combineSymmetricPairedSamples,
  consumedItemsMicroBatchIterations,
  INTERLEAVED_PAIRED_SAMPLER_ID,
  runInterleavedPaired,
  SYMMETRIC_PAIRED_SAMPLER_ID,
} from './perf-runner'

describe('runInterleavedPaired', () => {
  it('preserves exact per-side work and alternates AB/BA micro-batches', () => {
    const order: string[] = []
    const measured = runInterleavedPaired(
      () => order.push('A'),
      () => order.push('B'),
      {
        rounds: 2,
        warmupRounds: 0,
        batchIterations: 5,
        microBatchIterations: 2,
      },
    )

    expect(order).toEqual([
      'A',
      'A',
      'B',
      'B',
      'B',
      'B',
      'A',
      'A',
      'A',
      'B',
      'B',
      'B',
      'A',
      'A',
      'A',
      'A',
      'B',
      'B',
      'B',
      'A',
    ])
    expect(order.filter((which) => which === 'A')).toHaveLength(10)
    expect(order.filter((which) => which === 'B')).toHaveLength(10)
    expect(measured.aSamples).toHaveLength(2)
    expect(measured.bSamples).toHaveLength(2)
    expect(measured.pairedRatios).toHaveLength(2)
    expect(measured.sampling).toEqual({
      id: INTERLEAVED_PAIRED_SAMPLER_ID,
      order: 'AB/BA alternating by micro-batch pair and paired sample',
      batchIterationsPerSide: 5,
      microBatchIterations: 2,
      microBatchesPerSide: 3,
    })
  })

  it('includes warmup work without changing measured sample counts', () => {
    let aCalls = 0
    let bCalls = 0
    const observed: Array<readonly [unknown, unknown]> = []
    const measured = runInterleavedPaired(
      () => {
        aCalls++
        return `a-${aCalls}`
      },
      () => {
        bCalls++
        return `b-${bCalls}`
      },
      {
        rounds: 3,
        warmupRounds: 2,
        batchIterations: 7,
        microBatchIterations: 3,
        observe: (aLast, bLast) => observed.push([aLast, bLast]),
      },
    )

    expect(aCalls).toBe(35)
    expect(bCalls).toBe(35)
    expect(observed).toHaveLength(5)
    expect(observed.at(-1)).toEqual(['a-35', 'b-35'])
    expect(measured.aSamples).toHaveLength(3)
    expect(measured.bSamples).toHaveLength(3)
    expect(measured.pairedRatios).toHaveLength(3)
  })

  it.each([
    ['rounds', { rounds: 0, batchIterations: 1, microBatchIterations: 1 }],
    ['batchIterations', { rounds: 1, batchIterations: 0, microBatchIterations: 1 }],
    ['microBatchIterations', { rounds: 1, batchIterations: 1, microBatchIterations: 0 }],
  ] as const)('rejects invalid %s', (field, options) => {
    expect(() =>
      runInterleavedPaired(
        () => undefined,
        () => undefined,
        { ...options, warmupRounds: 0 },
      ),
    ).toThrow(field)
  })
})

describe('combineSymmetricPairedSamples', () => {
  it('exactly cancels multiplicative call-site bias and preserves a real delta', () => {
    const measured = combineSymmetricPairedSamples(
      {
        candidateAtA: {
          candidateSamples: [200, 200, 200],
          referenceSamples: [60, 60, 60],
        },
        candidateAtB: {
          candidateSamples: [50, 50, 50],
          referenceSamples: [240, 240, 240],
        },
      },
      { batchIterations: 7, microBatchIterations: 3 },
    )

    for (const sample of measured.aSamples) expect(sample).toBeCloseTo(100)
    for (const sample of measured.bSamples) expect(sample).toBeCloseTo(120)
    for (const ratio of measured.pairedRatios) expect(ratio).toBeCloseTo(1.2)
    expect(measured.medianRatio).toBeCloseTo(1.2)
    expect(measured.sampling).toMatchObject({
      id: SYMMETRIC_PAIRED_SAMPLER_ID,
      baseSamplerId: INTERLEAVED_PAIRED_SAMPLER_ID,
      orientationIsolation: 'fresh-process',
      orientations: 2,
      batchIterationsPerSide: 7,
      microBatchIterations: 3,
      microBatchesPerSide: 3,
    })
  })

  it('rejects incomplete and invalid raw orientation arrays', () => {
    expect(() =>
      combineSymmetricPairedSamples(
        {
          candidateAtA: {
            candidateSamples: [100],
            referenceSamples: [100],
          },
          candidateAtB: {
            candidateSamples: [],
            referenceSamples: [100],
          },
        },
        { batchIterations: 1, microBatchIterations: 1 },
      ),
    ).toThrow('same positive sample count')
    expect(() =>
      combineSymmetricPairedSamples(
        {
          candidateAtA: {
            candidateSamples: [100],
            referenceSamples: [100],
          },
          candidateAtB: {
            candidateSamples: [Number.NaN],
            referenceSamples: [100],
          },
        },
        { batchIterations: 1, microBatchIterations: 1 },
      ),
    ).toThrow('finite and positive')
  })
})

describe('consumedItemsMicroBatchIterations', () => {
  it.each([
    [1, 100_000, 10_000],
    [1_000, 50, 10],
    [10_000, 50, 1],
    [100_000, 1, 1],
    [20_000, 50, 1],
  ])('uses roughly 10k consumed items for consumed=%i batch=%i', (consumed, batch, expected) => {
    expect(consumedItemsMicroBatchIterations(consumed, batch)).toBe(expected)
  })

  it('never exceeds the total batch', () => {
    expect(consumedItemsMicroBatchIterations(1, 7)).toBe(7)
  })

  it('fails closed for invalid inputs', () => {
    expect(consumedItemsMicroBatchIterations(0, 1)).toBe(0)
    expect(consumedItemsMicroBatchIterations(1, 0)).toBe(0)
    expect(consumedItemsMicroBatchIterations(1, 1, 0)).toBe(0)
  })
})
