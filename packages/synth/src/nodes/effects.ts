import {
  DEFAULT_BITCRUSH_DOWNSAMPLE,
  DEFAULT_CHORUS_DEPTH,
  DEFAULT_CHORUS_MIX,
  DEFAULT_CHORUS_RATE,
  DEFAULT_COMPRESSOR_ATTACK,
  DEFAULT_COMPRESSOR_KNEE,
  DEFAULT_COMPRESSOR_RATIO,
  DEFAULT_COMPRESSOR_RELEASE,
  DEFAULT_COMPRESSOR_THRESHOLD,
  DEFAULT_DEGRADE_BITS,
  DEFAULT_DEGRADE_DOWNSAMPLE,
  DEFAULT_DEGRADE_JITTER,
  DEFAULT_DEGRADE_MIX,
  DEFAULT_DEGRADE_NOISE,
  DEFAULT_DEGRADE_TONE,
  DEFAULT_DELAY_MIX,
  DEFAULT_DISTORTION_SHAPE,
  DEFAULT_ENSEMBLE_CHORUS_DEPTH,
  DEFAULT_ENSEMBLE_CHORUS_MIX,
  DEFAULT_ENSEMBLE_CHORUS_NOISE,
  DEFAULT_ENSEMBLE_CHORUS_RATE,
  DEFAULT_ENSEMBLE_CHORUS_TONE,
  DEFAULT_ENSEMBLE_CHORUS_WIDTH,
  DEFAULT_FREQUENCY_SHIFTER_MIX,
  DEFAULT_FREQUENCY_SHIFTER_SHIFT_HZ,
  DEFAULT_MICRO_PITCH_DELAY_MS,
  DEFAULT_MICRO_PITCH_DETUNE,
  DEFAULT_MICRO_PITCH_MIX,
  DEFAULT_MICRO_PITCH_WIDTH,
  DEFAULT_MULTI_TAP_DELAY_FEEDBACK,
  DEFAULT_MULTI_TAP_DELAY_MIX,
  DEFAULT_MULTI_TAP_DELAY_TIME_MS,
  DEFAULT_MULTI_TAP_DELAY_TONE,
  DEFAULT_MULTI_TAP_DELAY_WIDTH,
  DEFAULT_NONLINEAR_REVERB_DAMPING,
  DEFAULT_NONLINEAR_REVERB_DECAY,
  DEFAULT_NONLINEAR_REVERB_DRIVE,
  DEFAULT_NONLINEAR_REVERB_MIX,
  DEFAULT_NONLINEAR_REVERB_TIME_MS,
  DEFAULT_NONLINEAR_REVERB_WIDTH,
  DEFAULT_PLATE_REVERB_DAMPING,
  DEFAULT_PLATE_REVERB_DECAY,
  DEFAULT_PLATE_REVERB_DIFFUSION,
  DEFAULT_PLATE_REVERB_MIX,
  DEFAULT_PLATE_REVERB_MODULATION,
  DEFAULT_PLATE_REVERB_PRE_DELAY_MS,
  DEFAULT_PLATE_REVERB_WIDTH,
  DEFAULT_REVERB_MIX,
  DEFAULT_ROOM_DECAY,
  DEFAULT_ROOM_SIZE,
  DEFAULT_ROTARY_SPEAKER_CROSSOVER_HZ,
  DEFAULT_ROTARY_SPEAKER_DEPTH,
  DEFAULT_ROTARY_SPEAKER_DRIVE,
  DEFAULT_ROTARY_SPEAKER_MIX,
  DEFAULT_ROTARY_SPEAKER_RATE,
  DEFAULT_ROTARY_SPEAKER_WIDTH,
  DEFAULT_SAMPLE_RATE,
  DEFAULT_SATURATOR_ASYMMETRY,
  DEFAULT_SATURATOR_DRIVE,
  DEFAULT_SATURATOR_MIX,
  DEFAULT_SATURATOR_OUTPUT,
  DEFAULT_SATURATOR_TONE,
  DEFAULT_SPACE_ECHO_DRIVE,
  DEFAULT_SPACE_ECHO_FEEDBACK,
  DEFAULT_SPACE_ECHO_FLUTTER,
  DEFAULT_SPACE_ECHO_MIX,
  DEFAULT_SPACE_ECHO_REVERB_MIX,
  DEFAULT_SPACE_ECHO_TAPE_AGE,
  DEFAULT_SPACE_ECHO_TIME_MS,
  DEFAULT_SPACE_ECHO_WOW,
  DEFAULT_SPRING_REVERB_DAMPING,
  DEFAULT_SPRING_REVERB_DECAY,
  DEFAULT_SPRING_REVERB_DRIP,
  DEFAULT_SPRING_REVERB_MIX,
  DEFAULT_SPRING_REVERB_TENSION,
  DEFAULT_SPRING_REVERB_WIDTH,
  DEFAULT_STEREO_SPREAD_DELAY_MS,
  DEFAULT_STEREO_SPREAD_MIX,
  DEFAULT_STEREO_SPREAD_WIDTH,
  DEFAULT_TAPE_DELAY_DRIVE,
  DEFAULT_TAPE_DELAY_FEEDBACK,
  DEFAULT_TAPE_DELAY_FLUTTER,
  DEFAULT_TAPE_DELAY_MIX,
  DEFAULT_TAPE_DELAY_TAPE_AGE,
  DEFAULT_TAPE_DELAY_TIME_MS,
  DEFAULT_TAPE_DELAY_TONE,
  DEFAULT_TAPE_DELAY_WIDTH,
  DEFAULT_TAPE_DELAY_WOW,
  DEFAULT_TILT_EQ_FREQ,
  DEFAULT_TILT_EQ_GAIN_DB,
  DEFAULT_TILT_EQ_MIX,
  DEFAULT_WAVEFOLDER_ASYMMETRY,
  DEFAULT_WAVEFOLDER_DEPTH,
  DEFAULT_WAVEFOLDER_DRIVE,
  DEFAULT_WAVEFOLDER_MIX,
  DEFAULT_WAVEFOLDER_OUTPUT,
  DEFAULT_WAVEFOLDER_TONE,
} from '../defaults'
import { mulberry32 } from '../internal/util'
import type {
  DistortionShape,
  MultiTapDelayTap,
  PhaserVoicing,
  SpaceEchoMode,
  Transform,
} from '../types'
import { common } from './shared'

const DEFAULT_MULTI_TAP_DELAY_TAPS: ReadonlyArray<Required<MultiTapDelayTap>> = [
  { ratio: 1, gain: 0.85, pan: -0.65 },
  { ratio: 1.618, gain: 0.62, pan: 0.35 },
  { ratio: 2.618, gain: 0.42, pan: 0.85 },
]

type SpaceEchoOpts = {
  timeMs?: number
  feedback?: number
  mix?: number
  reverbMix?: number
  wow?: number
  flutter?: number
  tapeAge?: number
  drive?: number
  mode?: SpaceEchoMode
}
type TapeDelayOpts = {
  timeMs?: number
  feedback?: number
  mix?: number
  wow?: number
  flutter?: number
  tapeAge?: number
  drive?: number
  tone?: number
  width?: number
}
type PlateReverbOpts = {
  preDelayMs?: number
  decay?: number
  damping?: number
  diffusion?: number
  modulation?: number
  mix?: number
  width?: number
}
type SpringReverbOpts = {
  decay?: number
  damping?: number
  tension?: number
  drip?: number
  mix?: number
  width?: number
}
type NonlinearReverbOpts = {
  timeMs?: number
  decay?: number
  damping?: number
  drive?: number
  mix?: number
  width?: number
}
type MicroPitchOpts = {
  detune?: number
  width?: number
  delayMs?: number
  mix?: number
}
type MultiTapDelayOpts = {
  timeMs?: number
  feedback?: number
  mix?: number
  tone?: number
  width?: number
  taps?: ReadonlyArray<MultiTapDelayTap>
}
type SaturatorOpts = {
  drive?: number
  asymmetry?: number
  tone?: number
  mix?: number
  output?: number
}
type WavefolderOpts = {
  drive?: number
  depth?: number
  asymmetry?: number
  tone?: number
  mix?: number
  output?: number
}
type EnsembleChorusOpts = {
  rate?: number
  depth?: number
  mix?: number
  width?: number
  tone?: number
  noise?: number
}
type DegradeOpts = {
  bits?: number
  downsample?: number
  jitter?: number
  noise?: number
  tone?: number
  mix?: number
}
type TiltEqOpts = {
  freq?: number
  gainDb?: number
  mix?: number
}
type StereoSpreadOpts = {
  width?: number
  delayMs?: number
  mix?: number
}
type FrequencyShifterOpts = {
  shiftHz?: number
  mix?: number
}
type RotarySpeakerOpts = {
  rate?: number
  depth?: number
  mix?: number
  drive?: number
  width?: number
  crossoverHz?: number
}

type PhaserOpts = {
  voicing?: PhaserVoicing
  rate?: number
  depth?: number
  mix?: number
}

export const effects = {
  distortion:
    (amount: number, shape: DistortionShape = DEFAULT_DISTORTION_SHAPE): Transform =>
    (node) => ({ kind: 'distortion', input: node, amount, shape, ...common(node.out) }),
  delay:
    (delayMs: number, feedback: number, mixAmount = DEFAULT_DELAY_MIX): Transform =>
    (node) => ({
      kind: 'delay',
      input: node,
      delayMs,
      feedback,
      mix: mixAmount,
      ...common(node.out),
    }),
  reverb:
    (
      irOrOpts: Float32Array | { roomSize?: number; decay?: number },
      mixAmount = DEFAULT_REVERB_MIX,
    ): Transform =>
    (node) => ({
      kind: 'reverb',
      input: node,
      ir: irOrOpts instanceof Float32Array ? irOrOpts : generatedIr(irOrOpts),
      mix: mixAmount,
      ...common(node.out),
    }),
  chorus:
    (
      rate = DEFAULT_CHORUS_RATE,
      depth = DEFAULT_CHORUS_DEPTH,
      mixAmount = DEFAULT_CHORUS_MIX,
    ): Transform =>
    (node) => ({ kind: 'chorus', input: node, rate, depth, mix: mixAmount, ...common(node.out) }),
  ensembleChorus:
    (opts: EnsembleChorusOpts = {}): Transform =>
    (node) => ({
      kind: 'ensembleChorus',
      input: node,
      rate: opts.rate ?? DEFAULT_ENSEMBLE_CHORUS_RATE,
      depth: opts.depth ?? DEFAULT_ENSEMBLE_CHORUS_DEPTH,
      mix: opts.mix ?? DEFAULT_ENSEMBLE_CHORUS_MIX,
      width: opts.width ?? DEFAULT_ENSEMBLE_CHORUS_WIDTH,
      tone: opts.tone ?? DEFAULT_ENSEMBLE_CHORUS_TONE,
      noise: opts.noise ?? DEFAULT_ENSEMBLE_CHORUS_NOISE,
      ...common(2),
    }),
  spaceEcho:
    (opts: SpaceEchoOpts = {}): Transform =>
    (node) => ({
      kind: 'spaceEcho',
      input: node,
      timeMs: opts.timeMs ?? DEFAULT_SPACE_ECHO_TIME_MS,
      feedback: opts.feedback ?? DEFAULT_SPACE_ECHO_FEEDBACK,
      mix: opts.mix ?? DEFAULT_SPACE_ECHO_MIX,
      reverbMix: opts.reverbMix ?? DEFAULT_SPACE_ECHO_REVERB_MIX,
      wow: opts.wow ?? DEFAULT_SPACE_ECHO_WOW,
      flutter: opts.flutter ?? DEFAULT_SPACE_ECHO_FLUTTER,
      tapeAge: opts.tapeAge ?? DEFAULT_SPACE_ECHO_TAPE_AGE,
      drive: opts.drive ?? DEFAULT_SPACE_ECHO_DRIVE,
      mode: opts.mode ?? 'heads-1-2-3',
      ...common(2),
    }),
  tapeDelay:
    (opts: TapeDelayOpts = {}): Transform =>
    (node) => ({
      kind: 'tapeDelay',
      input: node,
      timeMs: opts.timeMs ?? DEFAULT_TAPE_DELAY_TIME_MS,
      feedback: opts.feedback ?? DEFAULT_TAPE_DELAY_FEEDBACK,
      mix: opts.mix ?? DEFAULT_TAPE_DELAY_MIX,
      wow: opts.wow ?? DEFAULT_TAPE_DELAY_WOW,
      flutter: opts.flutter ?? DEFAULT_TAPE_DELAY_FLUTTER,
      tapeAge: opts.tapeAge ?? DEFAULT_TAPE_DELAY_TAPE_AGE,
      drive: opts.drive ?? DEFAULT_TAPE_DELAY_DRIVE,
      tone: opts.tone ?? DEFAULT_TAPE_DELAY_TONE,
      width: opts.width ?? DEFAULT_TAPE_DELAY_WIDTH,
      ...common(2),
    }),
  plateReverb:
    (opts: PlateReverbOpts = {}): Transform =>
    (node) => ({
      kind: 'plateReverb',
      input: node,
      preDelayMs: opts.preDelayMs ?? DEFAULT_PLATE_REVERB_PRE_DELAY_MS,
      decay: opts.decay ?? DEFAULT_PLATE_REVERB_DECAY,
      damping: opts.damping ?? DEFAULT_PLATE_REVERB_DAMPING,
      diffusion: opts.diffusion ?? DEFAULT_PLATE_REVERB_DIFFUSION,
      modulation: opts.modulation ?? DEFAULT_PLATE_REVERB_MODULATION,
      mix: opts.mix ?? DEFAULT_PLATE_REVERB_MIX,
      width: opts.width ?? DEFAULT_PLATE_REVERB_WIDTH,
      ...common(2),
    }),
  springReverb:
    (opts: SpringReverbOpts = {}): Transform =>
    (node) => ({
      kind: 'springReverb',
      input: node,
      decay: opts.decay ?? DEFAULT_SPRING_REVERB_DECAY,
      damping: opts.damping ?? DEFAULT_SPRING_REVERB_DAMPING,
      tension: opts.tension ?? DEFAULT_SPRING_REVERB_TENSION,
      drip: opts.drip ?? DEFAULT_SPRING_REVERB_DRIP,
      mix: opts.mix ?? DEFAULT_SPRING_REVERB_MIX,
      width: opts.width ?? DEFAULT_SPRING_REVERB_WIDTH,
      ...common(2),
    }),
  nonlinearReverb:
    (opts: NonlinearReverbOpts = {}): Transform =>
    (node) => ({
      kind: 'nonlinearReverb',
      input: node,
      timeMs: opts.timeMs ?? DEFAULT_NONLINEAR_REVERB_TIME_MS,
      decay: opts.decay ?? DEFAULT_NONLINEAR_REVERB_DECAY,
      damping: opts.damping ?? DEFAULT_NONLINEAR_REVERB_DAMPING,
      drive: opts.drive ?? DEFAULT_NONLINEAR_REVERB_DRIVE,
      mix: opts.mix ?? DEFAULT_NONLINEAR_REVERB_MIX,
      width: opts.width ?? DEFAULT_NONLINEAR_REVERB_WIDTH,
      ...common(2),
    }),
  microPitch:
    (opts: MicroPitchOpts = {}): Transform =>
    (node) => ({
      kind: 'microPitch',
      input: node,
      detune: opts.detune ?? DEFAULT_MICRO_PITCH_DETUNE,
      width: opts.width ?? DEFAULT_MICRO_PITCH_WIDTH,
      delayMs: opts.delayMs ?? DEFAULT_MICRO_PITCH_DELAY_MS,
      mix: opts.mix ?? DEFAULT_MICRO_PITCH_MIX,
      ...common(2),
    }),
  multiTapDelay:
    (opts: MultiTapDelayOpts = {}): Transform =>
    (node) => ({
      kind: 'multiTapDelay',
      input: node,
      timeMs: opts.timeMs ?? DEFAULT_MULTI_TAP_DELAY_TIME_MS,
      feedback: opts.feedback ?? DEFAULT_MULTI_TAP_DELAY_FEEDBACK,
      mix: opts.mix ?? DEFAULT_MULTI_TAP_DELAY_MIX,
      tone: opts.tone ?? DEFAULT_MULTI_TAP_DELAY_TONE,
      width: opts.width ?? DEFAULT_MULTI_TAP_DELAY_WIDTH,
      taps: normalizeMultiTapDelayTaps(opts.taps),
      ...common(2),
    }),
  saturator:
    (opts: SaturatorOpts = {}): Transform =>
    (node) => ({
      kind: 'saturator',
      input: node,
      drive: opts.drive ?? DEFAULT_SATURATOR_DRIVE,
      asymmetry: opts.asymmetry ?? DEFAULT_SATURATOR_ASYMMETRY,
      tone: opts.tone ?? DEFAULT_SATURATOR_TONE,
      mix: opts.mix ?? DEFAULT_SATURATOR_MIX,
      output: opts.output ?? DEFAULT_SATURATOR_OUTPUT,
      ...common(node.out),
    }),
  wavefolder:
    (opts: WavefolderOpts = {}): Transform =>
    (node) => ({
      kind: 'wavefolder',
      input: node,
      drive: opts.drive ?? DEFAULT_WAVEFOLDER_DRIVE,
      depth: opts.depth ?? DEFAULT_WAVEFOLDER_DEPTH,
      asymmetry: opts.asymmetry ?? DEFAULT_WAVEFOLDER_ASYMMETRY,
      tone: opts.tone ?? DEFAULT_WAVEFOLDER_TONE,
      mix: opts.mix ?? DEFAULT_WAVEFOLDER_MIX,
      output: opts.output ?? DEFAULT_WAVEFOLDER_OUTPUT,
      ...common(node.out),
    }),
  degrade:
    (opts: DegradeOpts = {}): Transform =>
    (node) => ({
      kind: 'degrade',
      input: node,
      bits: opts.bits ?? DEFAULT_DEGRADE_BITS,
      downsample: opts.downsample ?? DEFAULT_DEGRADE_DOWNSAMPLE,
      jitter: opts.jitter ?? DEFAULT_DEGRADE_JITTER,
      noise: opts.noise ?? DEFAULT_DEGRADE_NOISE,
      tone: opts.tone ?? DEFAULT_DEGRADE_TONE,
      mix: opts.mix ?? DEFAULT_DEGRADE_MIX,
      ...common(node.out),
    }),
  tiltEq:
    (opts: TiltEqOpts = {}): Transform =>
    (node) => ({
      kind: 'tiltEq',
      input: node,
      freq: opts.freq ?? DEFAULT_TILT_EQ_FREQ,
      gainDb: opts.gainDb ?? DEFAULT_TILT_EQ_GAIN_DB,
      mix: opts.mix ?? DEFAULT_TILT_EQ_MIX,
      ...common(node.out),
    }),
  stereoSpread:
    (opts: StereoSpreadOpts = {}): Transform =>
    (node) => ({
      kind: 'stereoSpread',
      input: node,
      width: opts.width ?? DEFAULT_STEREO_SPREAD_WIDTH,
      delayMs: opts.delayMs ?? DEFAULT_STEREO_SPREAD_DELAY_MS,
      mix: opts.mix ?? DEFAULT_STEREO_SPREAD_MIX,
      ...common(2),
    }),
  frequencyShifter:
    (opts: FrequencyShifterOpts = {}): Transform =>
    (node) => ({
      kind: 'frequencyShifter',
      input: node,
      shiftHz: opts.shiftHz ?? DEFAULT_FREQUENCY_SHIFTER_SHIFT_HZ,
      mix: opts.mix ?? DEFAULT_FREQUENCY_SHIFTER_MIX,
      ...common(node.out),
    }),
  rotarySpeaker:
    (opts: RotarySpeakerOpts = {}): Transform =>
    (node) => ({
      kind: 'rotarySpeaker',
      input: node,
      rate: opts.rate ?? DEFAULT_ROTARY_SPEAKER_RATE,
      depth: opts.depth ?? DEFAULT_ROTARY_SPEAKER_DEPTH,
      mix: opts.mix ?? DEFAULT_ROTARY_SPEAKER_MIX,
      drive: opts.drive ?? DEFAULT_ROTARY_SPEAKER_DRIVE,
      width: opts.width ?? DEFAULT_ROTARY_SPEAKER_WIDTH,
      freq: opts.crossoverHz ?? DEFAULT_ROTARY_SPEAKER_CROSSOVER_HZ,
      ...common(2),
    }),
  phaser:
    (opts: PhaserOpts = {}): Transform =>
    (node) => ({
      kind: 'phaser',
      input: node,
      voicing: opts.voicing ?? 'phase90',
      rate: opts.rate ?? 0.5,
      depth: opts.depth ?? 0.7,
      mix: opts.mix ?? 0.5,
      ...common(node.out),
    }),
  compressor:
    (
      opts: {
        threshold?: number
        ratio?: number
        attack?: number
        release?: number
        knee?: number
      } = {},
    ): Transform =>
    (node) => ({
      kind: 'compressor',
      input: node,
      threshold: opts.threshold ?? DEFAULT_COMPRESSOR_THRESHOLD,
      ratio: opts.ratio ?? DEFAULT_COMPRESSOR_RATIO,
      attack: opts.attack ?? DEFAULT_COMPRESSOR_ATTACK,
      release: opts.release ?? DEFAULT_COMPRESSOR_RELEASE,
      knee: opts.knee ?? DEFAULT_COMPRESSOR_KNEE,
      ...common(node.out),
    }),
  bitcrush:
    (bits: number, downsample = DEFAULT_BITCRUSH_DOWNSAMPLE): Transform =>
    (node) => ({ kind: 'bitcrush', input: node, bits, downsample, ...common(node.out) }),
} as const

function generatedIr(opts: { roomSize?: number; decay?: number }): Float32Array {
  const roomSize = opts.roomSize ?? DEFAULT_ROOM_SIZE
  const decay = opts.decay ?? DEFAULT_ROOM_DECAY
  const length = Math.max(1, Math.floor(DEFAULT_SAMPLE_RATE * Math.max(0.02, roomSize * decay)))
  const rand = mulberry32(0x51a7e5)
  const ir = new Float32Array(length)
  for (let i = 0; i < length; i++) {
    const t = i / DEFAULT_SAMPLE_RATE
    ir[i] = (rand() * 2 - 1) * Math.exp(-t / Math.max(0.001, decay))
  }
  return ir
}

function normalizeMultiTapDelayTaps(
  input: MultiTapDelayOpts['taps'],
): ReadonlyArray<Required<MultiTapDelayTap>> {
  const source = input?.length ? input : DEFAULT_MULTI_TAP_DELAY_TAPS
  return source.slice(0, 16).map((tap) => ({
    ratio: tap.ratio,
    gain: tap.gain ?? 1,
    pan: tap.pan ?? 0,
  }))
}
