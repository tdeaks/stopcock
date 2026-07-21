import type { DrumPieceId } from './drumKit'

export const PATTERN_STEPS = 16

/** One step in one row: off (0), normal (1), accent (2). */
export type StepValue = 0 | 1 | 2

export type DrumPatternRow = {
  pieceId: DrumPieceId
  steps: StepValue[]
}

export type DrumPattern = {
  rows: DrumPatternRow[]
  /** Beats per minute. */
  bpm: number
  /** 0 = no swing, 0.5 = full triplet feel. Offsets every odd 8th by swing × (step/2). */
  swing: number
  /** Master drum gain, 0..1. */
  level: number
  /** Whether the sequencer is currently running. */
  playing: boolean
}

const row = (pieceId: DrumPieceId, hits: ReadonlyArray<number>): DrumPatternRow => {
  const steps: StepValue[] = Array.from({ length: PATTERN_STEPS }, () => 0)
  for (const i of hits) if (i >= 0 && i < PATTERN_STEPS) steps[i] = 1
  return { pieceId, steps }
}

export const DEFAULT_PATTERN = (): DrumPattern => ({
  bpm: 110,
  swing: 0,
  level: 0.85,
  playing: false,
  rows: [
    row('kick', [0, 4, 8, 12]),
    row('snare', [4, 12]),
    row('hatClosed', [0, 2, 6, 8, 10, 14]),
    row('hatOpen', [4, 12]),
    row('clap', []),
  ],
})

export function toggleStep(pattern: DrumPattern, rowIndex: number, stepIndex: number): DrumPattern {
  if (rowIndex < 0 || rowIndex >= pattern.rows.length) return pattern
  if (stepIndex < 0 || stepIndex >= PATTERN_STEPS) return pattern
  return {
    ...pattern,
    rows: pattern.rows.map((r, ri) =>
      ri !== rowIndex
        ? r
        : { ...r, steps: r.steps.map((s, si) => (si === stepIndex ? (s === 0 ? 1 : 0) : s)) },
    ),
  }
}

export function clearPattern(pattern: DrumPattern): DrumPattern {
  return {
    ...pattern,
    rows: pattern.rows.map((r) => ({ ...r, steps: r.steps.map(() => 0 as StepValue) })),
  }
}

/**
 * Seconds between successive 16th-note steps for a given BPM.
 * 60s/min ÷ BPM = beat (quarter); divided by 4 for a 16th.
 */
export const sixteenthSeconds = (bpm: number): number => 60 / Math.max(20, Math.min(300, bpm)) / 4

/**
 * Apply swing to even-numbered 16ths (the "off" 16ths of each 8th-note pair).
 * Returns the time offset added to a step's nominal position.
 */
export const swingOffsetSeconds = (stepIndex: number, bpm: number, swing: number): number => {
  if (swing <= 0) return 0
  if (stepIndex % 2 === 0) return 0
  return sixteenthSeconds(bpm) * swing * 0.5
}
