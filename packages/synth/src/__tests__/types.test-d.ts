import { describe, expectTypeOf, it } from 'vite-plus/test'
import {
  constant,
  createWavetable,
  effects,
  filter,
  fm,
  gain,
  input,
  instrument,
  modulate,
  operator,
  oscillator,
  params,
  render,
  sampler,
  voice,
  workletParam,
  type Node,
  type Note,
  type Trigger,
  type WebAudioHandle,
  type WorkletModule,
} from '../index'

describe('synth types', () => {
  it('requires exactly one note pitch representation', () => {
    expectTypeOf<{ freq: number }>().toExtend<Note>()
    expectTypeOf<{ midi: number }>().toExtend<Note>()
    expectTypeOf<{ freq: number; midi: number }>().not.toExtend<Note>()
    expectTypeOf<{}>().not.toExtend<Note>()
    expectTypeOf<{ midi: number; atSec: number }>().toExtend<Trigger>()
  })

  it('keeps pipe transforms node-shaped', () => {
    expectTypeOf(oscillator('sine', 440)).toExtend<Node>()
    expectTypeOf(oscillator.polyblep('saw', 440)).toExtend<Node>()
    expectTypeOf(
      oscillator.wavetable(createWavetable({ partials: [1, 0.5] }), 440),
    ).toExtend<Node>()
    expectTypeOf(
      sampler.instrument({ zones: [{ samples: new Float32Array([0, 1]), rootMidi: 69 }] }),
    ).toExtend<Node>()
    expectTypeOf(
      instrument.lofiSampler({
        zones: [{ samples: new Float32Array([0, 1]), rootMidi: 69 }],
        bits: 12,
        downsample: 2,
      }),
    ).toExtend<Node>()
    expectTypeOf(
      instrument.acidBass({ wave: 'square', resonance: 0.7, accent: 0.5 }),
    ).toExtend<Node>()
    expectTypeOf(instrument.drumVoice({ kind: 'snare', snap: 0.8, noise: 0.9 })).toExtend<Node>()
    expectTypeOf(instrument.stringMachine({ attack: 0.2, depth: 0.8, width: 1 })).toExtend<Node>()
    expectTypeOf(instrument.polySynth({ pulseWidth: 0.42, sub: 0.5, chorus: 0.7 })).toExtend<Node>()
    expectTypeOf(fm({ freq: 110, operators: [operator.sine({ output: 1 })] })).toExtend<Node>()
    expectTypeOf(
      fm({
        freq: 110,
        operators: [{ kind: 'wavetable', bank: createWavetable({ partials: [1] }) }],
      }),
    ).toExtend<Node>()
    expectTypeOf(gain(0.5)).returns.toExtend<Node>()
    expectTypeOf(modulate(params.gain.amount, constant(1), 0.1)).returns.toExtend<Node>()
    expectTypeOf(modulate(params.lofiSampler.bits, constant(1), 1)).returns.toExtend<Node>()
    expectTypeOf(modulate(params.lofiSampler.tone, constant(1), 0.1)).returns.toExtend<Node>()
    expectTypeOf(modulate(params.drumVoice.snap, constant(1), 0.1)).returns.toExtend<Node>()
    expectTypeOf(
      modulate(params.stringMachine.modulation, constant(1), 0.1),
    ).returns.toExtend<Node>()
    expectTypeOf(modulate(params.polySynth.chorus, constant(1), 0.1)).returns.toExtend<Node>()
    expectTypeOf(modulate(params.fm.matrix(1, 2), constant(1), 0.1)).returns.toExtend<Node>()
    expectTypeOf(effects.distortion(0.2)).returns.toExtend<Node>()
    expectTypeOf(effects.spaceEcho({ mode: 'heads-1-2-3' })).returns.toExtend<Node>()
    expectTypeOf(
      effects.tapeDelay({ timeMs: 180, wow: 0.2, tone: 0.7, width: 0.8 }),
    ).returns.toExtend<Node>()
    expectTypeOf(
      effects.plateReverb({ preDelayMs: 12, decay: 0.6, damping: 0.4 }),
    ).returns.toExtend<Node>()
    expectTypeOf(
      effects.springReverb({ decay: 0.6, tension: 0.5, drip: 0.2 }),
    ).returns.toExtend<Node>()
    expectTypeOf(
      effects.nonlinearReverb({ timeMs: 160, decay: 0.7, drive: 0.3 }),
    ).returns.toExtend<Node>()
    expectTypeOf(
      effects.ensembleChorus({ rate: 0.4, depth: 4.44, width: 1 }),
    ).returns.toExtend<Node>()
    expectTypeOf(effects.microPitch({ detune: 9, width: 1 })).returns.toExtend<Node>()
    expectTypeOf(effects.multiTapDelay({ taps: [{ ratio: 1, pan: -1 }] })).returns.toExtend<Node>()
    expectTypeOf(effects.saturator({ drive: 0.4, asymmetry: 0.1 })).returns.toExtend<Node>()
    expectTypeOf(
      effects.wavefolder({ drive: 0.6, depth: 0.8, asymmetry: 0.2 }),
    ).returns.toExtend<Node>()
    expectTypeOf(effects.degrade({ bits: 8, downsample: 4, noise: 0.1 })).returns.toExtend<Node>()
    expectTypeOf(effects.tiltEq({ freq: 1_200, gainDb: 4.5, mix: 0.8 })).returns.toExtend<Node>()
    expectTypeOf(effects.stereoSpread({ width: 0.8, delayMs: 12, mix: 1 })).returns.toExtend<Node>()
    expectTypeOf(effects.frequencyShifter({ shiftHz: 110, mix: 0.75 })).returns.toExtend<Node>()
    expectTypeOf(
      effects.rotarySpeaker({ rate: 6.4, depth: 0.8, crossoverHz: 800 }),
    ).returns.toExtend<Node>()
    expectTypeOf(
      filter.stateVariable('bandpass', 1_200, { resonance: 0.7, drive: 0.2 }),
    ).returns.toExtend<Node>()
  })

  it('separates offline and web handle surfaces', () => {
    expectTypeOf(render(oscillator('sine', 440), { duration: 1 })).toEqualTypeOf<
      Float32Array | [Float32Array, Float32Array]
    >()
    expectTypeOf(
      voice.poly(input(0), { max: 4 }).play({} as AudioContext),
    ).toExtend<WebAudioHandle>()
  })

  it('types worklet helpers as non-optional lookups', () => {
    const wm = {} as WorkletModule
    const node = oscillator('sine', 440)
    expectTypeOf(workletParam(wm, node, params.osc.freq).audioParamName).toEqualTypeOf<string>()
  })
})
