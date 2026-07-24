import { describe, expect, it } from 'vite-plus/test'
import {
  checkDataFunctionalCaseCorrectness,
  evaluateDataFunctionalCorrectness,
} from './data-functional-perf'

describe('data-functional correctness oracle', () => {
  it('observes the Reader.tap effect even though tap returns the original value', () => {
    expect(checkDataFunctionalCaseCorrectness('reader/tap')).toBe(true)
  })

  it('fails closed when equal return values hide a missing side effect', () => {
    expect(
      evaluateDataFunctionalCorrectness(
        () => 1,
        () => 1,
        () => false,
      ),
    ).toBe(false)
  })
})
