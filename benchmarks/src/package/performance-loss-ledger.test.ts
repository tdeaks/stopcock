import { describe, expect, test } from 'vitest'

import {
  classifyBenchmarkRow,
  parseVitestJsonOutput,
  summarizeLossLedger,
  type Suite,
} from '../../generate-report'

const result = (name: string, hz: number) => ({
  name,
  hz,
  rme: '0.50%',
  samples: 100,
})

describe('performance loss ledger', () => {
  test('classifies benchmark rows by baseline semantics', () => {
    expect(classifyBenchmarkRow('stopcock fused map -> takeUntil')).toBe('stopcock')
    expect(classifyBenchmarkRow('native chain map -> filter')).toBe('native-chain')
    expect(classifyBenchmarkRow('native loop map -> takeUntil')).toBe('native-loop')
    expect(classifyBenchmarkRow('manual hasOwnProperty loop')).toBe('manual-js')
    expect(classifyBenchmarkRow('native immutable spread baseline')).toBe('manual-js')
    expect(classifyBenchmarkRow('rambda path')).toBe('library')
  })

  test('reports library-only and all-baseline win rates separately', () => {
    const suites: Suite[] = [
      {
        title: 'Obj.assoc — n=100',
        results: [
          result('stopcock assoc', 100),
          result('native immutable spread baseline', 250),
          result('Ramda assoc', 103),
        ],
      },
      {
        title: 'Obj.path — string path',
        results: [
          result('stopcock path', 100),
          result('rambda path', 108),
        ],
      },
      {
        title: 'large array map — n=100000',
        results: [
          result('stopcock map', 120),
          result('ts-belt map', 100),
          result('native loop map', 220),
        ],
      },
      {
        title: 'array chain comparison',
        results: [
          result('stopcock pipeline', 300),
          result('native chain map -> filter', 500),
        ],
      },
    ]

    const summary = summarizeLossLedger(suites)

    expect(summary.winRates.libraryOnly).toEqual({
      wins: 1,
      total: 3,
      percentage: 33,
    })
    expect(summary.winRates.allBaselines).toEqual({
      wins: 0,
      total: 4,
      percentage: 0,
    })

    expect(summary.actionableLosses.map(loss => loss.baselineName)).toEqual([
      'native immutable spread baseline',
      'rambda path',
    ])
    expect(summary.actionableLosses[0]).toMatchObject({
      suiteTitle: 'Obj.assoc — n=100',
      baselineKind: 'manual-js',
      ratio: 2.5,
      reason: 'stopcock is more than 2x behind a native-loop/manual-js baseline',
    })
    expect(summary.actionableLosses[1]).toMatchObject({
      suiteTitle: 'Obj.path — string path',
      baselineKind: 'library',
      ratio: 1.08,
      reason: 'stopcock is more than 5% behind a library peer',
    })
  })

  test('skips Vitest JSON benchmark rows without numeric hz', () => {
    const suites = parseVitestJsonOutput(JSON.stringify({
      files: [
        {
          filepath: '/repo/benchmarks/src/object-ops.bench.ts',
          groups: [
            {
              fullName: 'src/object-ops.bench.ts > assoc',
              benchmarks: [
                { name: 'stopcock', hz: 10_000, rme: 0.5, sampleCount: 100 },
                { name: 'rambda' },
                { name: 'native immutable spread baseline', hz: 30_000, rme: 0.5, sampleCount: 100 },
              ],
            },
          ],
        },
      ],
    }))

    expect(suites).toEqual([
      {
        title: 'assoc',
        results: [
          { name: 'stopcock', hz: 10_000, rme: '±0.50%', samples: 100 },
          { name: 'native immutable spread baseline', hz: 30_000, rme: '±0.50%', samples: 100 },
        ],
      },
    ])
  })
})
