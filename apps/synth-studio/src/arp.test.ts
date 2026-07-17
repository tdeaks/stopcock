import { describe, expect, it } from 'vitest'
import {
  DEFAULT_ARP_SETTINGS,
  arpRateToBeats,
  baseStepDurationMs,
  buildArpPattern,
  gateDurationMs,
  intervalDurationMs,
  midiNoteName,
  normalizeMidiNotes,
  selectArpNotes,
  type ArpSettings,
} from './arp'

const settings = (patch: Partial<ArpSettings> = {}): ArpSettings => ({
  ...DEFAULT_ARP_SETTINGS,
  ...patch,
})

describe('arpeggiator primitives', () => {
  it('normalizes midi notes without duplicates while preserving played order', () => {
    expect(normalizeMidiNotes([64, 60.2, 64, Number.NaN, 200, -4])).toEqual([64, 60, 127, 0])
  })

  it('builds up, down, up-down, and as-played patterns across octaves', () => {
    const notes = [67, 60, 64]
    expect(buildArpPattern(notes, settings({ mode: 'up', octaves: 2 }))).toEqual([60, 64, 67, 72, 76, 79])
    expect(buildArpPattern(notes, settings({ mode: 'down', octaves: 2 }))).toEqual([79, 76, 72, 67, 64, 60])
    expect(buildArpPattern(notes, settings({ mode: 'upDown' }))).toEqual([60, 64, 67, 64])
    expect(buildArpPattern(notes, settings({ mode: 'asPlayed', octaves: 2 }))).toEqual([67, 60, 64, 79, 72, 76])
  })

  it('selects chord notes together and limits them to the engine voice budget', () => {
    const notes = selectArpNotes([60, 64, 67, 71], 0, settings({ mode: 'chord', octaves: 3 }))
    expect(notes).toEqual([60, 64, 67, 71, 72, 76, 79, 83])
  })

  it('keeps random mode deterministic for a seed', () => {
    const a = Array.from({ length: 8 }, (_, i) => selectArpNotes([60, 64, 67], i, settings({ mode: 'random', seed: 9 }))[0])
    const b = Array.from({ length: 8 }, (_, i) => selectArpNotes([60, 64, 67], i, settings({ mode: 'random', seed: 9 }))[0])
    const c = Array.from({ length: 8 }, (_, i) => selectArpNotes([60, 64, 67], i, settings({ mode: 'random', seed: 10 }))[0])
    expect(a).toEqual(b)
    expect(c).not.toEqual(a)
  })

  it('converts musical rates and gate/swing into stable millisecond timings', () => {
    const s = settings({ bpm: 120, rate: '1/16', gate: 0.5, swing: 0.4 })
    expect(arpRateToBeats('1/8t')).toBeCloseTo(1 / 3)
    expect(baseStepDurationMs(s)).toBeCloseTo(125)
    expect(gateDurationMs(s)).toBeCloseTo(62.5)
    expect(intervalDurationMs(s, 0) + intervalDurationMs(s, 1)).toBeCloseTo(250)
  })

  it('formats midi note names', () => {
    expect(midiNoteName(60)).toBe('C4')
    expect(midiNoteName(61)).toBe('C#4')
    expect(midiNoteName(21)).toBe('A0')
  })
})
