import { describe, expect, test } from 'vite-plus/test'
import {
  BIGINT_REPLACEMENT_MINIMUM_IMPROVEMENT,
  CONSERVATIVE_STRATEGY,
  covers,
  dispositionFor,
  evaluateDispositions,
  FAMILY_IDS,
  inspectViewKinds,
  keyId,
  makeCorpus,
  noiseFloor,
  OPERATIONS,
  P2_DISPOSITION_RULES,
  P2_DISPOSITIONS,
  evaluateShippedClaims,
  RUNTIME_BANDS,
  SELECTIVITIES,
  SIZE_BANDS,
  type CharacterizationRow,
} from './p2-typed-array-policy-gate'

describe('P2 characterization corpus', () => {
  test('every family, band, operation and selectivity appears exactly once', () => {
    const corpus = makeCorpus()
    const ids = corpus.map(keyId)
    expect(new Set(ids).size).toBe(ids.length)
    expect(corpus.length).toBe(
      FAMILY_IDS.length * SIZE_BANDS.length * (OPERATIONS.length - 1 + SELECTIVITIES.length),
    )
  })

  test('float16 is probed rather than assumed', () => {
    const present = Reflect.get(globalThis, 'Float16Array') !== undefined
    expect(FAMILY_IDS.includes('float16')).toBe(present)
  })
})

describe('P2 dispositions', () => {
  test('every row carries exactly one rule and a non-empty reason', () => {
    expect(evaluateDispositions(P2_DISPOSITIONS, makeCorpus())).toEqual([])
    expect(P2_DISPOSITIONS.length).toBe(makeCorpus().length)
  })

  test('selectivity characterizes but never selects', () => {
    for (const family of FAMILY_IDS) {
      for (const band of SIZE_BANDS) {
        const decisions = new Set(
          SELECTIVITIES.map(
            (selectivity) =>
              dispositionFor({ family, band: band.id, operation: 'filter', selectivity })?.decision,
          ),
        )
        expect(decisions.size).toBe(1)
      }
    }
    for (const rule of P2_DISPOSITION_RULES) {
      expect(Object.hasOwn(rule, 'selectivity')).toBe(false)
    }
  })

  test('the bigint filter target miss is recorded as stopped, not quietly rescoped', () => {
    for (const band of SIZE_BANDS) {
      const row = dispositionFor({
        family: 'bigint64',
        band: band.id,
        operation: 'filter',
        selectivity: 1,
      })
      expect(row?.decision).toBe('stopped')
      expect(row?.reason).toContain('0.85x')
    }
  })

  test('rejects a row no rule covers', () => {
    const failures = evaluateDispositions(
      P2_DISPOSITIONS.filter((row) => !row.id.startsWith('float64/tiny/clone')),
      makeCorpus(),
    )
    expect(failures.some((failure) => failure.includes('no recorded disposition'))).toBe(true)
  })

  test('rejects overlapping rules', () => {
    const overlapping = P2_DISPOSITION_RULES.filter((rule) => rule.operations.includes('sort'))
    expect(overlapping.length).toBe(1)
    const key = { family: 'float64', band: 'tiny', operation: 'sort', selectivity: 0.5 } as const
    expect(P2_DISPOSITION_RULES.filter((rule) => covers(rule, key)).length).toBe(1)
  })
})

describe('P2 shipped claims', () => {
  test('no disposition claims a strategy shipped', () => {
    expect(evaluateShippedClaims()).toEqual([])
    expect(P2_DISPOSITIONS.some((row) => row.decision === 'shipped')).toBe(false)
  })

  test('rejects a shipped claim that nothing backs', () => {
    expect(
      evaluateShippedClaims([
        { id: 'float64/tiny/slice/0.5', decision: 'shipped', reason: 'wishful' },
      ]),
    ).toEqual(['float64/tiny/slice/0.5 claims shipped while no typed-array strategy is enabled'])
  })
})

describe('P2 canonical-view inspection', () => {
  test('only a plain current-realm view is canonical', () => {
    const facts = inspectViewKinds()
    const of = (kind: string) => facts.find((fact) => fact.kind === kind)

    expect(of('canonical')?.canonical).toBe(true)
    // A shared buffer does not change the view's prototype, so it stays
    // canonical and the operations reallocate onto a plain ArrayBuffer.
    expect(of('shared-buffer')?.canonical).toBe(true)
    for (const kind of ['subclass', 'own-constructor', 'cross-realm']) {
      const fact = of(kind)
      if (fact?.available !== true) continue
      expect(fact.canonical).toBe(false)
    }
    for (const fact of facts) expect(fact.note.length).toBeGreaterThan(0)
  })
})

describe('P2 noise floor', () => {
  test('reports the worst self-comparison as the floor', () => {
    const row = (ratio: number): CharacterizationRow => ({
      family: 'float64',
      band: 'tiny',
      operation: 'clone',
      selectivity: 0.5,
      nativeNs: 1,
      best: 'intrinsic-slice',
      strategies: [
        {
          strategy: 'intrinsic-slice',
          ratioToNative: ratio,
          perOperationNs: 1,
          ciLow: 1,
          ciHigh: 1,
        },
      ],
    })
    expect(noiseFloor([row(1.12), row(0.95)])).toBeCloseTo(0.12, 6)
  })

  test('ignores operations with no identity strategy', () => {
    const filterRow: CharacterizationRow = {
      family: 'float64',
      band: 'tiny',
      operation: 'filter',
      selectivity: 0.5,
      nativeNs: 1,
      best: 'array-staging',
      strategies: [
        { strategy: 'array-staging', ratioToNative: 4, perOperationNs: 1, ciLow: 1, ciHigh: 1 },
      ],
    }
    expect(noiseFloor([filterRow])).toBe(0)
  })
})
