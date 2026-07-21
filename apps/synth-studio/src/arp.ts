export type ArpMode = 'up' | 'down' | 'upDown' | 'asPlayed' | 'random' | 'chord'
export type ArpRate = '1/4' | '1/8' | '1/8t' | '1/16' | '1/16t' | '1/32'

export type ArpSettings = {
  enabled: boolean
  latch: boolean
  mode: ArpMode
  rate: ArpRate
  bpm: number
  octaves: number
  gate: number
  swing: number
  velocity: number
  seed: number
}

export const DEFAULT_ARP_SETTINGS: ArpSettings = {
  enabled: false,
  latch: false,
  mode: 'up',
  rate: '1/16',
  bpm: 124,
  octaves: 1,
  gate: 0.55,
  swing: 0,
  velocity: 0.88,
  seed: 0x5a17,
}

const RATE_TO_BEATS: Record<ArpRate, number> = {
  '1/4': 1,
  '1/8': 0.5,
  '1/8t': 1 / 3,
  '1/16': 0.25,
  '1/16t': 1 / 6,
  '1/32': 0.125,
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const
const MAX_CHORD_NOTES = 8

const clamp = (n: number, min: number, max: number): number => Math.max(min, Math.min(max, n))
const clampInt = (n: number, min: number, max: number): number => Math.round(clamp(n, min, max))

export const normalizeMidiNotes = (notes: Iterable<number>): number[] => {
  const out: number[] = []
  const seen = new Set<number>()
  for (const note of notes) {
    if (!Number.isFinite(note)) continue
    const midi = clampInt(note, 0, 127)
    if (seen.has(midi)) continue
    seen.add(midi)
    out.push(midi)
  }
  return out
}

export const snapshotArpSettings = (settings: ArpSettings): ArpSettings => ({
  enabled: Boolean(settings.enabled),
  latch: Boolean(settings.latch),
  mode: settings.mode,
  rate: settings.rate,
  bpm: clamp(settings.bpm, 30, 300),
  octaves: clampInt(settings.octaves, 1, 4),
  gate: clamp(settings.gate, 0.05, 1),
  swing: clamp(settings.swing, 0, 0.75),
  velocity: clamp(settings.velocity, 0.05, 1),
  seed: settings.seed | 0,
})

export const arpRateToBeats = (rate: ArpRate): number =>
  RATE_TO_BEATS[rate] ?? RATE_TO_BEATS['1/16']

export const baseStepDurationMs = (settings: ArpSettings): number => {
  const safe = snapshotArpSettings(settings)
  return (60_000 / safe.bpm) * arpRateToBeats(safe.rate)
}

export const intervalDurationMs = (settings: ArpSettings, stepIndex: number): number => {
  const safe = snapshotArpSettings(settings)
  const base = baseStepDurationMs(safe)
  if (safe.swing <= 0) return base
  const spread = safe.swing * 0.5
  return base * (stepIndex % 2 === 0 ? 1 + spread : 1 - spread)
}

export const gateDurationMs = (settings: ArpSettings): number =>
  Math.max(12, baseStepDurationMs(settings) * snapshotArpSettings(settings).gate)

const expandOctaves = (
  notes: readonly number[],
  settings: ArpSettings,
  preserveOrder: boolean,
): number[] => {
  const safe = snapshotArpSettings(settings)
  const base = preserveOrder ? [...notes] : [...notes].sort((a, b) => a - b)
  const out: number[] = []
  for (let octave = 0; octave < safe.octaves; octave++) {
    const offset = octave * 12
    for (const note of base) {
      const midi = note + offset
      if (midi <= 127) out.push(midi)
    }
  }
  return out
}

export const buildArpPattern = (notes: Iterable<number>, settings: ArpSettings): number[] => {
  const safe = snapshotArpSettings(settings)
  const clean = normalizeMidiNotes(notes)
  if (clean.length === 0) return []

  switch (safe.mode) {
    case 'asPlayed':
      return expandOctaves(clean, safe, true)
    case 'down':
      return expandOctaves(clean, safe, false).sort((a, b) => b - a)
    case 'upDown': {
      const up = expandOctaves(clean, safe, false)
      if (up.length <= 2) return up
      return up.concat(up.slice(1, -1).reverse())
    }
    case 'random':
    case 'chord':
    case 'up':
    default:
      return expandOctaves(clean, safe, false)
  }
}

const hashStep = (seed: number, stepIndex: number): number => {
  let x = (seed | 0) ^ Math.imul(stepIndex + 1, 0x9e3779b9)
  x ^= x >>> 16
  x = Math.imul(x, 0x7feb352d)
  x ^= x >>> 15
  x = Math.imul(x, 0x846ca68b)
  x ^= x >>> 16
  return x >>> 0
}

export const selectArpNotes = (
  notes: Iterable<number>,
  stepIndex: number,
  settings: ArpSettings,
): number[] => {
  const safe = snapshotArpSettings(settings)
  const pattern = buildArpPattern(notes, safe)
  if (pattern.length === 0) return []
  if (safe.mode === 'chord') return pattern.slice(0, MAX_CHORD_NOTES)
  if (safe.mode === 'random') return [pattern[hashStep(safe.seed, stepIndex) % pattern.length]]
  return [pattern[((stepIndex % pattern.length) + pattern.length) % pattern.length]]
}

export const midiNoteName = (midi: number): string => {
  const safe = clampInt(midi, 0, 127)
  const name = NOTE_NAMES[safe % 12]
  const octave = Math.floor(safe / 12) - 1
  return `${name}${octave}`
}
