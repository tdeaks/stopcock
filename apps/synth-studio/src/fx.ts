import { effects, filter, type Node, type PhaserVoicing, type SpaceEchoMode } from '@stopcock/synth'

export type FxKind =
  | 'none'
  // Distortion family
  | 'drive'
  | 'saturator'
  | 'wavefolder'
  // Lo-fi family
  | 'bitcrush'
  | 'degrade'
  | 'frequencyShifter'
  // Modulation family
  | 'chorus'
  | 'ensembleChorus'
  | 'microPitch'
  | 'rotarySpeaker'
  | 'phaserPhase90'
  | 'phaserSmallStone'
  | 'uniVibe'
  // Delay family
  | 'delay'
  | 'tapeDelay'
  | 'multiTapDelay'
  | 'spaceEcho'
  // Reverb family
  | 'reverb'
  | 'plateReverb'
  | 'springReverb'
  | 'nonlinearReverb'
  // Filter/EQ family
  | 'comb'
  | 'tiltEq'
  // Utility
  | 'compressor'
  | 'stereoSpread'

export type FxCategory = 'distortion' | 'lofi' | 'modulation' | 'delay' | 'reverb' | 'filter' | 'utility' | 'empty'

export type FxNumericSpec = {
  id: string
  label: string
  min: number
  max: number
  value: number
  unit?: string
  log?: boolean
}

export type FxEnumSpec<T extends string = string> = {
  id: string
  label: string
  value: number
  options: ReadonlyArray<{ value: T; label: string }>
}

export type FxParamSpec = FxNumericSpec | FxEnumSpec

export const isEnumSpec = (spec: FxParamSpec): spec is FxEnumSpec =>
  Array.isArray((spec as FxEnumSpec).options)

export type FxDef = {
  label: string
  tag: string
  category: FxCategory
  params: FxParamSpec[]
  build(params: Record<string, number>): (node: Node) => Node
}

const passthrough = (node: Node): Node => node
const round = (n: number) => Math.round(n)

// RE-201-style head/mode selector. Index order matches the rotary on the
// hardware mode selector — single heads first, then combinations.
const SPACE_ECHO_MODES: ReadonlyArray<{ value: SpaceEchoMode; label: string }> = [
  { value: 'head-1', label: '1 · SHORT' },
  { value: 'head-2', label: '2 · MED' },
  { value: 'head-3', label: '3 · LONG' },
  { value: 'heads-1-2', label: '4 · 1+2' },
  { value: 'heads-2-3', label: '5 · 2+3' },
  { value: 'heads-1-3', label: '6 · 1+3' },
  { value: 'heads-1-2-3', label: '7 · ALL' },
]

// ───────────────────────── catalog

export const fxCatalog: Record<FxKind, FxDef> = {
  none: {
    label: 'Empty Slot', tag: 'FX', category: 'empty', params: [],
    build: () => passthrough,
  },

  // Distortion
  drive: {
    label: 'Drive', tag: 'DRV', category: 'distortion',
    params: [
      { id: 'amount', label: 'AMOUNT', min: 0, max: 0.95, value: 0.3, unit: '%' },
    ],
    build: (p) => effects.distortion(p.amount, 'tanh'),
  },
  saturator: {
    label: 'Saturator', tag: 'SAT', category: 'distortion',
    params: [
      { id: 'drive', label: 'DRIVE', min: 0, max: 1, value: 0.35, unit: '%' },
      { id: 'asymmetry', label: 'ASYM', min: -1, max: 1, value: 0, unit: '%' },
      { id: 'tone', label: 'TONE', min: 0, max: 1, value: 0.75, unit: '%' },
      { id: 'mix', label: 'MIX', min: 0, max: 1, value: 1, unit: '%' },
      { id: 'output', label: 'OUT', min: 0, max: 1.5, value: 1, unit: '%' },
    ],
    build: (p) => effects.saturator({ drive: p.drive, asymmetry: p.asymmetry, tone: p.tone, mix: p.mix, output: p.output }),
  },
  wavefolder: {
    label: 'Wavefolder', tag: 'FLD', category: 'distortion',
    params: [
      { id: 'drive', label: 'DRIVE', min: 0, max: 1, value: 0.32, unit: '%' },
      { id: 'depth', label: 'DEPTH', min: 0, max: 1, value: 0.58, unit: '%' },
      { id: 'asymmetry', label: 'ASYM', min: -1, max: 1, value: 0, unit: '%' },
      { id: 'tone', label: 'TONE', min: 0, max: 1, value: 0.78, unit: '%' },
      { id: 'mix', label: 'MIX', min: 0, max: 1, value: 1, unit: '%' },
    ],
    build: (p) => effects.wavefolder({ drive: p.drive, depth: p.depth, asymmetry: p.asymmetry, tone: p.tone, mix: p.mix }),
  },

  // Lo-fi
  bitcrush: {
    label: 'Bitcrush', tag: 'CRH', category: 'lofi',
    params: [
      { id: 'bits', label: 'BITS', min: 2, max: 16, value: 10 },
      { id: 'down', label: 'DOWN', min: 1, max: 16, value: 2, unit: 'x' },
    ],
    build: (p) => effects.bitcrush(round(p.bits), round(p.down)),
  },
  degrade: {
    label: 'Degrade', tag: 'DEG', category: 'lofi',
    params: [
      { id: 'bits', label: 'BITS', min: 2, max: 16, value: 10 },
      { id: 'down', label: 'DOWN', min: 1, max: 16, value: 3, unit: 'x' },
      { id: 'jitter', label: 'JITR', min: 0, max: 1, value: 0.1, unit: '%' },
      { id: 'noise', label: 'NOISE', min: 0, max: 1, value: 0.1, unit: '%' },
      { id: 'tone', label: 'TONE', min: 0, max: 1, value: 0.72, unit: '%' },
      { id: 'mix', label: 'MIX', min: 0, max: 1, value: 0.65, unit: '%' },
    ],
    build: (p) => effects.degrade({
      bits: round(p.bits), downsample: round(p.down), jitter: p.jitter,
      noise: p.noise, tone: p.tone, mix: p.mix,
    }),
  },
  frequencyShifter: {
    label: 'Freq Shift', tag: 'SHF', category: 'lofi',
    params: [
      { id: 'shift', label: 'SHIFT', min: -500, max: 500, value: 0, unit: 'Hz' },
      { id: 'mix', label: 'MIX', min: 0, max: 1, value: 0.5, unit: '%' },
    ],
    build: (p) => effects.frequencyShifter({ shiftHz: p.shift, mix: p.mix }),
  },

  // Modulation
  chorus: {
    label: 'Chorus', tag: 'CHR', category: 'modulation',
    params: [
      { id: 'rate', label: 'RATE', min: 0.05, max: 4, value: 0.6, unit: 'Hz', log: true },
      { id: 'depth', label: 'DEPTH', min: 0, max: 16, value: 6, unit: 'ms' },
      { id: 'mix', label: 'MIX', min: 0, max: 1, value: 0.32, unit: '%' },
    ],
    build: (p) => effects.chorus(p.rate, p.depth, p.mix),
  },
  ensembleChorus: {
    label: 'Ensemble', tag: 'ENS', category: 'modulation',
    params: [
      { id: 'rate', label: 'RATE', min: 0.05, max: 4, value: 0.4, unit: 'Hz', log: true },
      { id: 'depth', label: 'DEPTH', min: 0, max: 16, value: 4.44, unit: 'ms' },
      { id: 'mix', label: 'MIX', min: 0, max: 1, value: 0.5, unit: '%' },
      { id: 'width', label: 'WIDTH', min: 0, max: 1, value: 1, unit: '%' },
      { id: 'tone', label: 'TONE', min: 0, max: 1, value: 0.82, unit: '%' },
      { id: 'noise', label: 'NOISE', min: 0, max: 1, value: 0, unit: '%' },
    ],
    build: (p) => effects.ensembleChorus({ rate: p.rate, depth: p.depth, mix: p.mix, width: p.width, tone: p.tone, noise: p.noise }),
  },
  microPitch: {
    label: 'Micro Pitch', tag: 'MPC', category: 'modulation',
    params: [
      { id: 'detune', label: 'DETN', min: 0, max: 50, value: 9, unit: '¢' },
      { id: 'width', label: 'WIDTH', min: 0, max: 1, value: 1, unit: '%' },
      { id: 'delay', label: 'DELAY', min: 0, max: 50, value: 12, unit: 'ms' },
      { id: 'mix', label: 'MIX', min: 0, max: 1, value: 0.35, unit: '%' },
    ],
    build: (p) => effects.microPitch({ detune: p.detune, width: p.width, delayMs: p.delay, mix: p.mix }),
  },
  rotarySpeaker: {
    label: 'Rotary', tag: 'ROT', category: 'modulation',
    params: [
      { id: 'rate', label: 'RATE', min: 0.1, max: 12, value: 6.4, unit: 'Hz', log: true },
      { id: 'depth', label: 'DEPTH', min: 0, max: 1, value: 0.72, unit: '%' },
      { id: 'mix', label: 'MIX', min: 0, max: 1, value: 0.5, unit: '%' },
      { id: 'drive', label: 'DRIVE', min: 0, max: 1, value: 0, unit: '%' },
      { id: 'crossover', label: 'XOVR', min: 200, max: 2000, value: 800, unit: 'Hz', log: true },
    ],
    build: (p) => effects.rotarySpeaker({ rate: p.rate, depth: p.depth, mix: p.mix, drive: p.drive, crossoverHz: p.crossover }),
  },
  phaserPhase90: {
    label: 'Phase 90', tag: 'P90', category: 'modulation',
    params: [
      { id: 'rate', label: 'RATE', min: 0.05, max: 8, value: 0.5, unit: 'Hz', log: true },
      { id: 'depth', label: 'DEPTH', min: 0, max: 1, value: 0.7, unit: '%' },
      { id: 'mix', label: 'MIX', min: 0, max: 1, value: 0.5, unit: '%' },
    ],
    build: (p) => effects.phaser({ voicing: 'phase90', rate: p.rate, depth: p.depth, mix: p.mix }),
  },
  phaserSmallStone: {
    label: 'Small Stone', tag: 'SS', category: 'modulation',
    params: [
      { id: 'rate', label: 'RATE', min: 0.05, max: 8, value: 0.4, unit: 'Hz', log: true },
      { id: 'depth', label: 'DEPTH', min: 0, max: 1, value: 0.85, unit: '%' },
      { id: 'mix', label: 'MIX', min: 0, max: 1, value: 0.6, unit: '%' },
    ],
    build: (p) => effects.phaser({ voicing: 'smallStone', rate: p.rate, depth: p.depth, mix: p.mix }),
  },
  uniVibe: {
    label: 'Uni-Vibe', tag: 'VIB', category: 'modulation',
    params: [
      { id: 'mode', label: 'MODE', value: 0, options: [
        { value: 'uniVibe' as PhaserVoicing, label: 'CHORUS' },
        { value: 'uniVibeVibrato' as PhaserVoicing, label: 'VIBRATO' },
      ] },
      { id: 'rate', label: 'RATE', min: 0.1, max: 10, value: 4.5, unit: 'Hz', log: true },
      { id: 'depth', label: 'DEPTH', min: 0, max: 1, value: 0.8, unit: '%' },
      { id: 'mix', label: 'MIX', min: 0, max: 1, value: 0.55, unit: '%' },
    ],
    build: (p) => {
      const voicing: PhaserVoicing = round(p.mode) === 1 ? 'uniVibeVibrato' : 'uniVibe'
      return effects.phaser({ voicing, rate: p.rate, depth: p.depth, mix: p.mix })
    },
  },

  // Delay
  delay: {
    label: 'Delay', tag: 'DLY', category: 'delay',
    params: [
      { id: 'time', label: 'TIME', min: 20, max: 1500, value: 360, unit: 'ms', log: true },
      { id: 'fbk', label: 'FBK', min: 0, max: 0.88, value: 0.42, unit: '%' },
      { id: 'mix', label: 'MIX', min: 0, max: 1, value: 0.32, unit: '%' },
    ],
    build: (p) => effects.delay(p.time, p.fbk, p.mix),
  },
  tapeDelay: {
    label: 'Tape Delay', tag: 'TAP', category: 'delay',
    params: [
      { id: 'time', label: 'TIME', min: 20, max: 1500, value: 150, unit: 'ms', log: true },
      { id: 'fbk', label: 'FBK', min: 0, max: 0.88, value: 0.45, unit: '%' },
      { id: 'mix', label: 'MIX', min: 0, max: 1, value: 0.32, unit: '%' },
      { id: 'wow', label: 'WOW', min: 0, max: 1, value: 0.28, unit: '%' },
      { id: 'flutter', label: 'FLUT', min: 0, max: 1, value: 0.16, unit: '%' },
      { id: 'age', label: 'AGE', min: 0, max: 1, value: 0.42, unit: '%' },
      { id: 'drive', label: 'DRV', min: 0, max: 1, value: 0.22, unit: '%' },
      { id: 'tone', label: 'TONE', min: 0, max: 1, value: 0.62, unit: '%' },
    ],
    build: (p) => effects.tapeDelay({ timeMs: p.time, feedback: p.fbk, mix: p.mix, wow: p.wow, flutter: p.flutter, tapeAge: p.age, drive: p.drive, tone: p.tone }),
  },
  multiTapDelay: {
    label: 'Multi Tap', tag: 'MTP', category: 'delay',
    params: [
      { id: 'time', label: 'TIME', min: 20, max: 1000, value: 96, unit: 'ms', log: true },
      { id: 'fbk', label: 'FBK', min: 0, max: 0.85, value: 0.28, unit: '%' },
      { id: 'mix', label: 'MIX', min: 0, max: 1, value: 0.35, unit: '%' },
      { id: 'tone', label: 'TONE', min: 0, max: 1, value: 0.72, unit: '%' },
      { id: 'width', label: 'WIDTH', min: 0, max: 1, value: 1, unit: '%' },
    ],
    build: (p) => effects.multiTapDelay({ timeMs: p.time, feedback: p.fbk, mix: p.mix, tone: p.tone, width: p.width }),
  },
  spaceEcho: {
    label: 'Space Echo', tag: 'SPC', category: 'delay',
    params: [
      { id: 'mode', label: 'MODE', value: 3, options: SPACE_ECHO_MODES },
      { id: 'time', label: 'TIME', min: 20, max: 1200, value: 150, unit: 'ms', log: true },
      { id: 'fbk', label: 'FBK', min: 0, max: 0.88, value: 0.45, unit: '%' },
      { id: 'mix', label: 'MIX', min: 0, max: 1, value: 0.32, unit: '%' },
      { id: 'rev', label: 'REV', min: 0, max: 1, value: 0.18, unit: '%' },
      { id: 'wow', label: 'WOW', min: 0, max: 1, value: 0.28, unit: '%' },
      { id: 'flutter', label: 'FLUT', min: 0, max: 1, value: 0.16, unit: '%' },
      { id: 'age', label: 'AGE', min: 0, max: 1, value: 0.45, unit: '%' },
      { id: 'drive', label: 'DRV', min: 0, max: 1, value: 0.22, unit: '%' },
    ],
    build: (p) => effects.spaceEcho({
      timeMs: p.time, feedback: p.fbk, mix: p.mix, reverbMix: p.rev,
      wow: p.wow, flutter: p.flutter, tapeAge: p.age, drive: p.drive,
      mode: SPACE_ECHO_MODES[round(p.mode)]?.value ?? 'head-3',
    }),
  },

  // Reverb
  reverb: {
    label: 'Reverb', tag: 'RVB', category: 'reverb',
    params: [
      { id: 'room', label: 'ROOM', min: 0.02, max: 0.5, value: 0.1, log: true },
      { id: 'decay', label: 'DECAY', min: 0.05, max: 1.2, value: 0.32, unit: 's' },
      { id: 'mix', label: 'MIX', min: 0, max: 1, value: 0.32, unit: '%' },
    ],
    build: (p) => effects.reverb({ roomSize: p.room, decay: p.decay }, p.mix),
  },
  plateReverb: {
    label: 'Plate', tag: 'PLT', category: 'reverb',
    params: [
      { id: 'predelay', label: 'PRE', min: 0, max: 80, value: 12, unit: 'ms' },
      { id: 'decay', label: 'DECAY', min: 0, max: 1, value: 0.55, unit: '%' },
      { id: 'damping', label: 'DAMP', min: 0, max: 1, value: 0.42, unit: '%' },
      { id: 'diffusion', label: 'DIFF', min: 0, max: 1, value: 0.72, unit: '%' },
      { id: 'modulation', label: 'MOD', min: 0, max: 1, value: 0.18, unit: '%' },
      { id: 'mix', label: 'MIX', min: 0, max: 1, value: 0.28, unit: '%' },
    ],
    build: (p) => effects.plateReverb({ preDelayMs: p.predelay, decay: p.decay, damping: p.damping, diffusion: p.diffusion, modulation: p.modulation, mix: p.mix }),
  },
  springReverb: {
    label: 'Spring', tag: 'SPR', category: 'reverb',
    params: [
      { id: 'decay', label: 'DECAY', min: 0, max: 1, value: 0.62, unit: '%' },
      { id: 'damping', label: 'DAMP', min: 0, max: 1, value: 0.36, unit: '%' },
      { id: 'tension', label: 'TENS', min: 0, max: 1, value: 0.52, unit: '%' },
      { id: 'drip', label: 'DRIP', min: 0, max: 1, value: 0.28, unit: '%' },
      { id: 'mix', label: 'MIX', min: 0, max: 1, value: 0.25, unit: '%' },
    ],
    build: (p) => effects.springReverb({ decay: p.decay, damping: p.damping, tension: p.tension, drip: p.drip, mix: p.mix }),
  },
  nonlinearReverb: {
    label: 'Nonlinear', tag: 'NLR', category: 'reverb',
    params: [
      { id: 'time', label: 'TIME', min: 20, max: 1000, value: 180, unit: 'ms', log: true },
      { id: 'decay', label: 'DECAY', min: 0, max: 1, value: 0.68, unit: '%' },
      { id: 'damping', label: 'DAMP', min: 0, max: 1, value: 0.38, unit: '%' },
      { id: 'drive', label: 'DRV', min: 0, max: 1, value: 0.18, unit: '%' },
      { id: 'mix', label: 'MIX', min: 0, max: 1, value: 0.24, unit: '%' },
    ],
    build: (p) => effects.nonlinearReverb({ timeMs: p.time, decay: p.decay, damping: p.damping, drive: p.drive, mix: p.mix }),
  },

  // Filter / EQ
  comb: {
    label: 'Comb', tag: 'CMB', category: 'filter',
    params: [
      { id: 'time', label: 'TIME', min: 1, max: 80, value: 22, unit: 'ms' },
      { id: 'fbk', label: 'FBK', min: -0.88, max: 0.88, value: 0.4, unit: '%' },
      { id: 'damp', label: 'DAMP', min: 0, max: 1, value: 0.45, unit: '%' },
    ],
    build: (p) => filter.comb(p.time, p.fbk, p.damp),
  },
  tiltEq: {
    label: 'Tilt EQ', tag: 'TLT', category: 'filter',
    params: [
      { id: 'freq', label: 'FREQ', min: 100, max: 8000, value: 1000, unit: 'Hz', log: true },
      { id: 'gain', label: 'GAIN', min: -12, max: 12, value: 0, unit: 'dB' },
      { id: 'mix', label: 'MIX', min: 0, max: 1, value: 1, unit: '%' },
    ],
    build: (p) => effects.tiltEq({ freq: p.freq, gainDb: p.gain, mix: p.mix }),
  },

  // Utility
  compressor: {
    label: 'Compressor', tag: 'CMP', category: 'utility',
    params: [
      { id: 'threshold', label: 'THR', min: -60, max: 0, value: -24, unit: 'dB' },
      { id: 'ratio', label: 'RATIO', min: 1, max: 20, value: 4, unit: ':1' },
      { id: 'attack', label: 'ATK', min: 0.5, max: 200, value: 3, unit: 'ms', log: true },
      { id: 'release', label: 'REL', min: 5, max: 2000, value: 250, unit: 'ms', log: true },
      { id: 'knee', label: 'KNEE', min: 0, max: 40, value: 30, unit: 'dB' },
    ],
    build: (p) => effects.compressor({
      threshold: p.threshold,
      ratio: p.ratio,
      attack: p.attack / 1000, // ms → s
      release: p.release / 1000,
      knee: p.knee,
    }),
  },
  stereoSpread: {
    label: 'Stereo Spread', tag: 'STR', category: 'utility',
    params: [
      { id: 'width', label: 'WIDTH', min: 0, max: 1.5, value: 1, unit: '%' },
      { id: 'delay', label: 'DELAY', min: 0, max: 50, value: 9, unit: 'ms' },
      { id: 'mix', label: 'MIX', min: 0, max: 1, value: 1, unit: '%' },
    ],
    build: (p) => effects.stereoSpread({ width: p.width, delayMs: p.delay, mix: p.mix }),
  },
}

export const fxKinds = Object.keys(fxCatalog) as FxKind[]

// Order categories for the swap menu
export const fxCategories: { key: FxCategory; label: string }[] = [
  { key: 'empty', label: 'Empty' },
  { key: 'distortion', label: 'Distortion' },
  { key: 'lofi', label: 'Lo-Fi' },
  { key: 'modulation', label: 'Modulation' },
  { key: 'delay', label: 'Delay' },
  { key: 'reverb', label: 'Reverb' },
  { key: 'filter', label: 'Filter / EQ' },
  { key: 'utility', label: 'Utility' },
]

export type FxSlot = {
  kind: FxKind
  enabled: boolean
  params: Record<string, number>
}

export const defaultParamsFor = (kind: FxKind): Record<string, number> => {
  const out: Record<string, number> = {}
  for (const p of fxCatalog[kind].params) out[p.id] = p.value
  return out
}

export const createSlot = (kind: FxKind = 'none'): FxSlot => ({
  kind,
  enabled: kind !== 'none',
  params: defaultParamsFor(kind),
})
