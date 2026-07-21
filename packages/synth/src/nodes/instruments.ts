import {
  DEFAULT_ACID_BASS_ACCENT,
  DEFAULT_ACID_BASS_CUTOFF,
  DEFAULT_ACID_BASS_DECAY,
  DEFAULT_ACID_BASS_DRIVE,
  DEFAULT_ACID_BASS_ENV_MOD,
  DEFAULT_ACID_BASS_FREQ,
  DEFAULT_ACID_BASS_LEVEL,
  DEFAULT_ACID_BASS_RESONANCE,
  DEFAULT_ACID_BASS_SLIDE,
  DEFAULT_ACID_BASS_WAVE,
  DEFAULT_DRUM_VOICE_DRIVE,
  DEFAULT_DRUM_VOICE_HAT_DECAY,
  DEFAULT_DRUM_VOICE_HAT_FREQ,
  DEFAULT_DRUM_VOICE_HAT_NOISE,
  DEFAULT_DRUM_VOICE_HAT_SNAP,
  DEFAULT_DRUM_VOICE_HAT_TONE,
  DEFAULT_DRUM_VOICE_KICK_DECAY,
  DEFAULT_DRUM_VOICE_KICK_FREQ,
  DEFAULT_DRUM_VOICE_KICK_NOISE,
  DEFAULT_DRUM_VOICE_KICK_SNAP,
  DEFAULT_DRUM_VOICE_KICK_TONE,
  DEFAULT_DRUM_VOICE_KIND,
  DEFAULT_DRUM_VOICE_LEVEL,
  DEFAULT_DRUM_VOICE_SNARE_DECAY,
  DEFAULT_DRUM_VOICE_SNARE_FREQ,
  DEFAULT_DRUM_VOICE_SNARE_NOISE,
  DEFAULT_DRUM_VOICE_SNARE_SNAP,
  DEFAULT_DRUM_VOICE_SNARE_TONE,
  DEFAULT_LOFI_SAMPLER_BITS,
  DEFAULT_LOFI_SAMPLER_DOWNSAMPLE,
  DEFAULT_LOFI_SAMPLER_DRIVE,
  DEFAULT_LOFI_SAMPLER_JITTER,
  DEFAULT_LOFI_SAMPLER_MIX,
  DEFAULT_LOFI_SAMPLER_NOISE,
  DEFAULT_LOFI_SAMPLER_TONE,
  DEFAULT_POLY_SYNTH_ATTACK,
  DEFAULT_POLY_SYNTH_CHORUS,
  DEFAULT_POLY_SYNTH_CUTOFF,
  DEFAULT_POLY_SYNTH_DECAY,
  DEFAULT_POLY_SYNTH_DETUNE,
  DEFAULT_POLY_SYNTH_DRIVE,
  DEFAULT_POLY_SYNTH_ENV_MOD,
  DEFAULT_POLY_SYNTH_FREQ,
  DEFAULT_POLY_SYNTH_LEVEL,
  DEFAULT_POLY_SYNTH_MODULATION,
  DEFAULT_POLY_SYNTH_NOISE,
  DEFAULT_POLY_SYNTH_PULSE_WIDTH,
  DEFAULT_POLY_SYNTH_RELEASE,
  DEFAULT_POLY_SYNTH_RESONANCE,
  DEFAULT_POLY_SYNTH_SUB,
  DEFAULT_POLY_SYNTH_SUSTAIN,
  DEFAULT_POLY_SYNTH_WIDTH,
  DEFAULT_SAMPLE_RATE,
  DEFAULT_SAMPLER_ATTACK,
  DEFAULT_SAMPLER_FREQ,
  DEFAULT_SAMPLER_LEVEL,
  DEFAULT_SAMPLER_RELEASE,
  DEFAULT_SAMPLER_ROOT_MIDI,
  DEFAULT_STRING_MACHINE_ATTACK,
  DEFAULT_STRING_MACHINE_DEPTH,
  DEFAULT_STRING_MACHINE_DETUNE,
  DEFAULT_STRING_MACHINE_FREQ,
  DEFAULT_STRING_MACHINE_LEVEL,
  DEFAULT_STRING_MACHINE_MODULATION,
  DEFAULT_STRING_MACHINE_RELEASE,
  DEFAULT_STRING_MACHINE_TONE,
  DEFAULT_STRING_MACHINE_WIDTH,
} from '../defaults'
import { SynthCompileError } from '../internal/graph'
import type { AcidBassWaveform, DrumVoiceKind, Node, SamplerZone, SamplerZoneInput } from '../types'
import { common } from './shared'

type SamplerInstrumentOpts = {
  zones: ReadonlyArray<SamplerZoneInput>
  freq?: number
  attack?: number
  release?: number
  level?: number
}

type LofiSamplerOpts = SamplerInstrumentOpts & {
  bits?: number
  downsample?: number
  jitter?: number
  noise?: number
  tone?: number
  drive?: number
  mix?: number
}

type AcidBassOpts = {
  wave?: AcidBassWaveform
  freq?: number
  cutoff?: number
  resonance?: number
  envMod?: number
  decay?: number
  accent?: number
  slide?: number
  drive?: number
  level?: number
}

type DrumVoiceOpts = {
  kind?: DrumVoiceKind
  freq?: number
  decay?: number
  tone?: number
  snap?: number
  noise?: number
  drive?: number
  level?: number
}

type StringMachineOpts = {
  freq?: number
  detune?: number
  attack?: number
  release?: number
  tone?: number
  depth?: number
  modulation?: number
  width?: number
  level?: number
}

type PolySynthOpts = {
  freq?: number
  detune?: number
  pulseWidth?: number
  sub?: number
  noise?: number
  cutoff?: number
  resonance?: number
  envMod?: number
  attack?: number
  decay?: number
  sustain?: number
  release?: number
  drive?: number
  chorus?: number
  modulation?: number
  width?: number
  level?: number
}

export const sampler = {
  instrument: (opts: SamplerInstrumentOpts): Node => ({
    kind: 'samplerInstrument',
    zones: normalizeSamplerZones(opts.zones),
    freq: opts.freq ?? DEFAULT_SAMPLER_FREQ,
    attack: opts.attack ?? DEFAULT_SAMPLER_ATTACK,
    release: opts.release ?? DEFAULT_SAMPLER_RELEASE,
    level: opts.level ?? DEFAULT_SAMPLER_LEVEL,
    ...common(2),
  }),
} as const

export const instrument = {
  lofiSampler: (opts: LofiSamplerOpts): Node => ({
    kind: 'lofiSampler',
    zones: normalizeSamplerZones(opts.zones),
    freq: opts.freq ?? DEFAULT_SAMPLER_FREQ,
    attack: opts.attack ?? DEFAULT_SAMPLER_ATTACK,
    release: opts.release ?? DEFAULT_SAMPLER_RELEASE,
    level: opts.level ?? DEFAULT_SAMPLER_LEVEL,
    bits: opts.bits ?? DEFAULT_LOFI_SAMPLER_BITS,
    downsample: opts.downsample ?? DEFAULT_LOFI_SAMPLER_DOWNSAMPLE,
    jitter: opts.jitter ?? DEFAULT_LOFI_SAMPLER_JITTER,
    noise: opts.noise ?? DEFAULT_LOFI_SAMPLER_NOISE,
    tone: opts.tone ?? DEFAULT_LOFI_SAMPLER_TONE,
    drive: opts.drive ?? DEFAULT_LOFI_SAMPLER_DRIVE,
    mix: opts.mix ?? DEFAULT_LOFI_SAMPLER_MIX,
    ...common(2),
  }),
  acidBass: (opts: AcidBassOpts = {}): Node => ({
    kind: 'acidBass',
    wave: opts.wave ?? DEFAULT_ACID_BASS_WAVE,
    freq: opts.freq ?? DEFAULT_ACID_BASS_FREQ,
    cutoff: opts.cutoff ?? DEFAULT_ACID_BASS_CUTOFF,
    resonance: opts.resonance ?? DEFAULT_ACID_BASS_RESONANCE,
    envMod: opts.envMod ?? DEFAULT_ACID_BASS_ENV_MOD,
    decay: opts.decay ?? DEFAULT_ACID_BASS_DECAY,
    accent: opts.accent ?? DEFAULT_ACID_BASS_ACCENT,
    slide: opts.slide ?? DEFAULT_ACID_BASS_SLIDE,
    drive: opts.drive ?? DEFAULT_ACID_BASS_DRIVE,
    level: opts.level ?? DEFAULT_ACID_BASS_LEVEL,
    ...common(1),
  }),
  drumVoice: (opts: DrumVoiceOpts = {}): Node => {
    const drumKind = opts.kind ?? DEFAULT_DRUM_VOICE_KIND
    return {
      kind: 'drumVoice',
      drumKind,
      freq: opts.freq ?? defaultDrumVoiceFreq(drumKind),
      decay: opts.decay ?? defaultDrumVoiceDecay(drumKind),
      tone: opts.tone ?? defaultDrumVoiceTone(drumKind),
      snap: opts.snap ?? defaultDrumVoiceSnap(drumKind),
      noise: opts.noise ?? defaultDrumVoiceNoise(drumKind),
      drive: opts.drive ?? DEFAULT_DRUM_VOICE_DRIVE,
      level: opts.level ?? DEFAULT_DRUM_VOICE_LEVEL,
      ...common(1),
    }
  },
  stringMachine: (opts: StringMachineOpts = {}): Node => ({
    kind: 'stringMachine',
    freq: opts.freq ?? DEFAULT_STRING_MACHINE_FREQ,
    detune: opts.detune ?? DEFAULT_STRING_MACHINE_DETUNE,
    attack: opts.attack ?? DEFAULT_STRING_MACHINE_ATTACK,
    release: opts.release ?? DEFAULT_STRING_MACHINE_RELEASE,
    tone: opts.tone ?? DEFAULT_STRING_MACHINE_TONE,
    depth: opts.depth ?? DEFAULT_STRING_MACHINE_DEPTH,
    modulation: opts.modulation ?? DEFAULT_STRING_MACHINE_MODULATION,
    width: opts.width ?? DEFAULT_STRING_MACHINE_WIDTH,
    level: opts.level ?? DEFAULT_STRING_MACHINE_LEVEL,
    ...common(2),
  }),
  polySynth: (opts: PolySynthOpts = {}): Node => ({
    kind: 'polySynth',
    freq: opts.freq ?? DEFAULT_POLY_SYNTH_FREQ,
    detune: opts.detune ?? DEFAULT_POLY_SYNTH_DETUNE,
    pulseWidth: opts.pulseWidth ?? DEFAULT_POLY_SYNTH_PULSE_WIDTH,
    sub: opts.sub ?? DEFAULT_POLY_SYNTH_SUB,
    noise: opts.noise ?? DEFAULT_POLY_SYNTH_NOISE,
    cutoff: opts.cutoff ?? DEFAULT_POLY_SYNTH_CUTOFF,
    resonance: opts.resonance ?? DEFAULT_POLY_SYNTH_RESONANCE,
    envMod: opts.envMod ?? DEFAULT_POLY_SYNTH_ENV_MOD,
    attack: opts.attack ?? DEFAULT_POLY_SYNTH_ATTACK,
    decay: opts.decay ?? DEFAULT_POLY_SYNTH_DECAY,
    sustain: opts.sustain ?? DEFAULT_POLY_SYNTH_SUSTAIN,
    release: opts.release ?? DEFAULT_POLY_SYNTH_RELEASE,
    drive: opts.drive ?? DEFAULT_POLY_SYNTH_DRIVE,
    chorus: opts.chorus ?? DEFAULT_POLY_SYNTH_CHORUS,
    modulation: opts.modulation ?? DEFAULT_POLY_SYNTH_MODULATION,
    width: opts.width ?? DEFAULT_POLY_SYNTH_WIDTH,
    level: opts.level ?? DEFAULT_POLY_SYNTH_LEVEL,
    ...common(2),
  }),
} as const

function defaultDrumVoiceFreq(kind: DrumVoiceKind): number {
  if (kind === 'snare') return DEFAULT_DRUM_VOICE_SNARE_FREQ
  if (kind === 'hat') return DEFAULT_DRUM_VOICE_HAT_FREQ
  return DEFAULT_DRUM_VOICE_KICK_FREQ
}

function defaultDrumVoiceDecay(kind: DrumVoiceKind): number {
  if (kind === 'snare') return DEFAULT_DRUM_VOICE_SNARE_DECAY
  if (kind === 'hat') return DEFAULT_DRUM_VOICE_HAT_DECAY
  return DEFAULT_DRUM_VOICE_KICK_DECAY
}

function defaultDrumVoiceTone(kind: DrumVoiceKind): number {
  if (kind === 'snare') return DEFAULT_DRUM_VOICE_SNARE_TONE
  if (kind === 'hat') return DEFAULT_DRUM_VOICE_HAT_TONE
  return DEFAULT_DRUM_VOICE_KICK_TONE
}

function defaultDrumVoiceSnap(kind: DrumVoiceKind): number {
  if (kind === 'snare') return DEFAULT_DRUM_VOICE_SNARE_SNAP
  if (kind === 'hat') return DEFAULT_DRUM_VOICE_HAT_SNAP
  return DEFAULT_DRUM_VOICE_KICK_SNAP
}

function defaultDrumVoiceNoise(kind: DrumVoiceKind): number {
  if (kind === 'snare') return DEFAULT_DRUM_VOICE_SNARE_NOISE
  if (kind === 'hat') return DEFAULT_DRUM_VOICE_HAT_NOISE
  return DEFAULT_DRUM_VOICE_KICK_NOISE
}

function normalizeSamplerZones(input: ReadonlyArray<SamplerZoneInput>): ReadonlyArray<SamplerZone> {
  if (input.length === 0) {
    throw new SynthCompileError('sampler.instrument() requires at least one zone')
  }
  return input.slice(0, 128).map((zone) => ({
    samples: zone.samples,
    sampleRate: zone.sampleRate ?? DEFAULT_SAMPLE_RATE,
    rootMidi: zone.rootMidi ?? DEFAULT_SAMPLER_ROOT_MIDI,
    keyLow: zone.keyLow ?? 0,
    keyHigh: zone.keyHigh ?? 127,
    velocityLow: zone.velocityLow ?? 0,
    velocityHigh: zone.velocityHigh ?? 1,
    loop: zone.loop ?? false,
    loopStart: zone.loopStart ?? 0,
    loopEnd: zone.loopEnd ?? 0,
    gain: zone.gain ?? 1,
    pan: zone.pan ?? 0,
  }))
}
