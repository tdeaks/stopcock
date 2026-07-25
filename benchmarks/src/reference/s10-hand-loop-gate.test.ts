import { describe, expect, test } from 'vite-plus/test'
import {
  EARLY_EXIT_FLOOR,
  floorFor,
  LANE_IDS,
  measureLane,
  REDUCE_FLOOR,
  SESSIONS_PER_LANE,
} from './s10-hand-loop-gate'

describe('S10 hand-loop floors', () => {
  test('applies the reduce floor only to the reusable reduce lane', () => {
    expect(floorFor('map-filter-reduce')).toBe(REDUCE_FLOOR)
    for (const lane of LANE_IDS.filter((id) => id !== 'map-filter-reduce')) {
      expect(floorFor(lane)).toBe(EARLY_EXIT_FLOOR)
    }
  })

  test('samples enough sessions to resolve the floor', () => {
    // At 5 and 9 sessions this gate flapped across the 0.90x floor: a single
    // session varies by about +/-30% on this host. Lowering this number
    // silently turns the gate back into a coin toss.
    expect(SESSIONS_PER_LANE).toBeGreaterThanOrEqual(21)
  })

  test.each(LANE_IDS)('%s meets its floor and agrees with the hand loop', (lane) => {
    const result = measureLane(lane)
    expect(result.agrees).toBe(true)
    expect(result.ratio).toBeGreaterThanOrEqual(result.floor)
  }, 600_000)
})
