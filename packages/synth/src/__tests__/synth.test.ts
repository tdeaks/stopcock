import { pipe } from '@stopcock/fp'
import { biquad } from '@stopcock/signal'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  SynthCompileError,
  buffer,
  compileWorklet,
  constant,
  createWavetable,
  defaultFor,
  effects,
  envelope,
  filter,
  fm,
  gain,
  input,
  instrument,
  mix,
  modulate,
  noise,
  operator,
  oscillator,
  pan,
  params,
  render,
  sampler,
  stereo,
  toWav,
  wavetableFromAudio,
  type Node,
  type WorkletModule,
  workletInput,
  workletParam,
} from '../index'
import { renderReference } from '../render/reference'
import {
  isSynthWasmAvailable,
  isSynthWasmBinaryAvailable,
  isSynthWasmRuntimeDirectAvailable,
  isSynthWasmRuntimeAvailable,
  isSynthWasmRuntimeResetAvailable,
  renderWasmForTest,
  renderWasmRuntimeForTest,
  renderWasmTriggeredLegacyForBench,
  renderWasmTriggeredRuntimeForBench,
  triggerRenderFramesForTest,
  triggeredWasmModeForTest,
} from '../render/wasm'

const closeArray = (actual: Float32Array, expected: ArrayLike<number>, digits = 6) => {
  expect(actual.length).toBe(expected.length)
  for (let i = 0; i < actual.length; i++) expect(actual[i]).toBeCloseTo(expected[i], digits)
}

const closeSamples = (actual: ReturnType<typeof render>, expected: ReturnType<typeof render>, digits = 5) => {
  expect(Array.isArray(actual)).toBe(Array.isArray(expected))
  if (Array.isArray(actual) && Array.isArray(expected)) {
    closeArray(actual[0], expected[0], digits)
    closeArray(actual[1], expected[1], digits)
    return
  }
  closeArray(actual as Float32Array, expected as Float32Array, digits)
}

const toneEnergy = (samples: Float32Array, freq: number, sampleRate: number, start = 0): number => {
  let real = 0
  let imag = 0
  for (let i = start; i < samples.length; i++) {
    const phase = 2 * Math.PI * freq * (i - start) / sampleRate
    real += samples[i] * Math.cos(phase)
    imag -= samples[i] * Math.sin(phase)
  }
  return real * real + imag * imag
}

describe('graph construction', () => {
  it('builds structured-clone-safe value graphs and freezes wrappers only at compile', () => {
    const samples = new Float32Array([1, 0, -1])
    const graph = pipe(buffer(samples), gain(0.5), modulate(params.gain.amount, constant(1), 0.25))
    const clone = structuredClone(graph)

    expect(clone.kind).toBe('gain')
    expect(Object.isFrozen(graph)).toBe(false)
    render(graph, { duration: 3 / 48_000, sampleRate: 48_000 })
    expect(Object.isFrozen(graph)).toBe(true)
    expect(Object.isFrozen(samples)).toBe(false)
  })

  it('rejects modulation targets that do not exist on the preceding stage', () => {
    const graph = pipe(noise('white'), modulate('freq', oscillator('sine', 1), 100))

    expect(() => render(graph, { duration: 0.01 })).toThrow(SynthCompileError)
  })

  it('keeps shared graph references deduped by identity', async () => {
    const lfo = oscillator('sine', 5)
    const graph = pipe(
      oscillator('sine', 110),
      modulate(params.osc.freq, lfo, 1),
      gain(0.1),
      modulate(params.gain.amount, lfo, 0.01),
    )
    const ctx = fakeAudioContext()
    const wm = await compileWorklet(ctx, graph)

    expect(new Set(wm.params.filter((handle) => handle.node === lfo).map((handle) => handle.audioParamName)).size).toBe(3)
  })
})

describe('offline render', () => {
  it('renders a sine oscillator matching Math.sin', () => {
    const sampleRate = 48_000
    const freq = 440
    const samples = render(oscillator('sine', freq), { duration: 8 / sampleRate, sampleRate }) as Float32Array
    const expected = new Float32Array(8)
    for (let i = 0; i < expected.length; i++) expected[i] = Math.sin(2 * Math.PI * freq * i / sampleRate)

    closeArray(samples, expected, 6)
  })

  it('renders deterministic noise from the default seed', () => {
    const a = render(noise('white'), { duration: 16 / 48_000, sampleRate: 48_000 }) as Float32Array
    const b = render(noise('white'), { duration: 16 / 48_000, sampleRate: 48_000 }) as Float32Array

    closeArray(a, b, 12)
  })

  it('applies audio-rate modulation as a summed bias over the base param', () => {
    const graph = pipe(
      constant(2),
      gain(3),
      modulate(params.gain.amount, constant(2), 0.5),
    )

    const out = render(graph, { duration: 4 / 48_000, sampleRate: 48_000 }) as Float32Array

    closeArray(out, new Float32Array([8, 8, 8, 8]), 6)
  })

  it('reads input(channel) buffers and validates missing inputs', () => {
    const graph = pipe(input(1), gain(2))
    const samples = [
      new Float32Array([0, 0, 0]),
      new Float32Array([1, 2, 3]),
    ]

    expect(() => render(graph, { duration: 3 / 48_000, sampleRate: 48_000 })).toThrow(SynthCompileError)
    const out = render(graph, { duration: 3 / 48_000, sampleRate: 48_000, inputs: samples }) as Float32Array
    closeArray(out, new Float32Array([2, 4, 6]), 6)
  })

  it('matches @stopcock/signal biquad impulse response for lowpass filters', () => {
    const sampleRate = 48_000
    const impulse = new Float32Array([1, 0, 0, 0, 0, 0])
    const graph = pipe(buffer(impulse), filter.lowpass(4800, 0.7071))
    const out = render(graph, { duration: impulse.length / sampleRate, sampleRate }) as Float32Array
    const expected = new Float32Array(impulse.length)
    biquad.process(impulse, biquad.design({ kind: 'lowpass', freq: 4800, q: 0.7071, sampleRate }), biquad.state(), expected)

    closeArray(out, expected, 6)
  })

  it('applies ADSR phases for triggered voices', () => {
    const graph = pipe(
      constant(1),
      envelope({ attack: 0.002, decay: 0.002, sustain: 0.5, release: 0.002 }),
    )
    const out = render(graph, {
      duration: 0.012,
      sampleRate: 1000,
      triggers: [{ freq: 440, atSec: 0, gateMs: 6 }],
    }) as Float32Array

    expect(out[0]).toBeCloseTo(0)
    expect(out[2]).toBeCloseTo(1)
    expect(out[4]).toBeCloseTo(0.5)
    expect(out[6]).toBeCloseTo(0.5)
    expect(out[8]).toBeCloseTo(0)
  })

  it('supports stereo, panning, and WAV encoding', () => {
    const graph = stereo(pipe(constant(1), pan(-1)), mix([constant(0.25), constant(0.25)]))
    const out = render(graph, { duration: 4 / 48_000, sampleRate: 48_000 })
    expect(Array.isArray(out)).toBe(true)
    const wav = toWav(out, { sampleRate: 48_000 })

    expect(new TextDecoder().decode(wav.subarray(0, 4))).toBe('RIFF')
    expect(new DataView(wav.buffer).getUint16(22, true)).toBe(2)
  })

  it('renders the custom DSP effect surface without throwing', () => {
    const graph = pipe(
      oscillator('saw', 110),
      filter.comb(20, 0.3, 0.2),
      effects.delay(40, 0.2, 0.5),
      effects.chorus(1, 4, 0.3),
      effects.ensembleChorus({ rate: 0.4, depth: 4.44, mix: 0.35, width: 1, tone: 0.84 }),
      effects.spaceEcho({ timeMs: 60, feedback: 0.28, mix: 0.22, reverbMix: 0.04, wow: 0.1, flutter: 0.05, tapeAge: 0.35, drive: 0.12 }),
      effects.tapeDelay({ timeMs: 90, feedback: 0.22, mix: 0.24, wow: 0.08, flutter: 0.04, tapeAge: 0.2, drive: 0.1, tone: 0.8, width: 0.7 }),
      effects.plateReverb({ preDelayMs: 8, decay: 0.48, damping: 0.38, diffusion: 0.72, modulation: 0.12, mix: 0.2, width: 1 }),
      effects.springReverb({ decay: 0.58, damping: 0.34, tension: 0.55, drip: 0.25, mix: 0.18, width: 0.9 }),
      effects.nonlinearReverb({ timeMs: 120, decay: 0.62, damping: 0.32, drive: 0.22, mix: 0.16, width: 0.9 }),
      effects.microPitch({ detune: 12, width: 0.8, delayMs: 10, mix: 0.25 }),
      effects.frequencyShifter({ shiftHz: 12, mix: 0.08 }),
      effects.rotarySpeaker({ rate: 5.8, depth: 0.65, mix: 0.12, drive: 0.08, width: 0.8 }),
      effects.multiTapDelay({ timeMs: 32, feedback: 0.18, mix: 0.25, tone: 0.8, width: 1 }),
      effects.saturator({ drive: 0.45, asymmetry: 0.2, tone: 0.8, mix: 0.7, output: 0.9 }),
      effects.wavefolder({ drive: 0.55, depth: 0.7, asymmetry: 0.1, tone: 0.82, mix: 0.6, output: 0.9 }),
      effects.degrade({ bits: 9, downsample: 2, jitter: 0.05, noise: 0.1, tone: 0.8, mix: 0.5 }),
      effects.distortion(0.2),
      effects.bitcrush(8, 2),
      effects.compressor(),
      effects.reverb({ roomSize: 0.01, decay: 0.05 }, 0.1),
      envelope.ar({ attack: 0.001, release: 0.001 }),
      envelope.exponential({ tau: 0.05 }),
    )

    const out = render(graph, { duration: 0.02, sampleRate: 8_000 })
    const channels = Array.isArray(out) ? out : [out]
    expect(channels[0].length).toBe(160)
    expect(channels.flatMap(channel => Array.from(channel)).every(Number.isFinite)).toBe(true)
  })

  it('renders a multi-head tape echo from one impulse', () => {
    const impulse = new Float32Array(80)
    impulse[0] = 1
    const out = render(pipe(
      buffer(impulse),
      effects.spaceEcho({
        timeMs: 10,
        feedback: 0,
        mix: 1,
        reverbMix: 0,
        wow: 0,
        flutter: 0,
        tapeAge: 0,
        drive: 0,
        mode: 'heads-1-2-3',
      }),
    ), { duration: 80 / 1000, sampleRate: 1000 })

    expect(Array.isArray(out)).toBe(true)
    const [left, right] = out as [Float32Array, Float32Array]
    expect(left[20]).toBeGreaterThan(0)
    expect(left[30]).toBeGreaterThan(0)
    expect(right[40]).toBeGreaterThan(0)
    expect(left[0]).toBeCloseTo(0)
    expect(Array.from(left).every(Number.isFinite)).toBe(true)
    expect(Array.from(right).every(Number.isFinite)).toBe(true)
  })

  it('renders tape delay as a stereo WASM effect', () => {
    const impulse = new Float32Array(80)
    impulse[0] = 1
    const out = render(pipe(
      buffer(impulse),
      effects.tapeDelay({
        timeMs: 20,
        feedback: 0.5,
        mix: 1,
        wow: 0,
        flutter: 0,
        tapeAge: 0,
        drive: 0,
        tone: 1,
        width: 0,
      }),
    ), { duration: 80 / 1000, sampleRate: 1000 })

    expect(Array.isArray(out)).toBe(true)
    const [left, right] = out as [Float32Array, Float32Array]
    expect(left[20]).toBeGreaterThan(0.25)
    expect(left[40]).toBeGreaterThan(0.05)
    expect(left[40]).toBeLessThan(left[20])
    expect(right[20]).toBeCloseTo(left[20], 5)
    expect(Array.from(left).every(Number.isFinite)).toBe(true)
    expect(Array.from(right).every(Number.isFinite)).toBe(true)
  })

  it('renders plate reverb as a stereo WASM effect', () => {
    const impulse = new Float32Array(700)
    impulse[0] = 1
    const out = render(pipe(
      buffer(impulse),
      effects.plateReverb({
        preDelayMs: 0,
        decay: 0.8,
        damping: 0.2,
        diffusion: 0.75,
        modulation: 0,
        mix: 1,
        width: 1,
      }),
    ), { duration: 700 / 1000, sampleRate: 1000 })

    expect(Array.isArray(out)).toBe(true)
    const [left, right] = out as [Float32Array, Float32Array]
    const tailEnergy = Array.from(left.subarray(120)).reduce((sum, sample, index) =>
      sum + Math.abs(sample) + Math.abs(right[index + 120]), 0)
    expect(tailEnergy).toBeGreaterThan(0.01)
    expect(left.some((sample, index) => Math.abs(sample - right[index]) > 1e-5)).toBe(true)
    expect(Array.from(left).every(Number.isFinite)).toBe(true)
    expect(Array.from(right).every(Number.isFinite)).toBe(true)
  })

  it('renders spring reverb as a dispersive stereo WASM effect', () => {
    const impulse = new Float32Array(650)
    impulse[0] = 1
    const out = render(pipe(
      buffer(impulse),
      effects.springReverb({
        decay: 0.82,
        damping: 0.18,
        tension: 0.72,
        drip: 0.35,
        mix: 1,
        width: 1,
      }),
    ), { duration: 650 / 1000, sampleRate: 1000 })

    expect(Array.isArray(out)).toBe(true)
    const [left, right] = out as [Float32Array, Float32Array]
    const tailEnergy = Array.from(left.subarray(120)).reduce((sum, sample, index) =>
      sum + Math.abs(sample) + Math.abs(right[index + 120]), 0)
    expect(tailEnergy).toBeGreaterThan(0.01)
    expect(left.some((sample, index) => Math.abs(sample - right[index]) > 1e-5)).toBe(true)
    expect(Array.from(left).every(Number.isFinite)).toBe(true)
    expect(Array.from(right).every(Number.isFinite)).toBe(true)
  })

  it('renders nonlinear reverb as a gated stereo WASM effect', () => {
    const impulse = new Float32Array(500)
    impulse[0] = 1
    const out = render(pipe(
      buffer(impulse),
      effects.nonlinearReverb({
        timeMs: 140,
        decay: 0.8,
        damping: 0.2,
        drive: 0.4,
        mix: 1,
        width: 1,
      }),
    ), { duration: 500 / 1000, sampleRate: 1000 })

    expect(Array.isArray(out)).toBe(true)
    const [left, right] = out as [Float32Array, Float32Array]
    const openEnergy = Array.from(left.subarray(40, 130)).reduce((sum, sample, index) =>
      sum + Math.abs(sample) + Math.abs(right[index + 40]), 0)
    const closedEnergy = Array.from(left.subarray(220)).reduce((sum, sample, index) =>
      sum + Math.abs(sample) + Math.abs(right[index + 220]), 0)
    expect(openEnergy).toBeGreaterThan(0.01)
    expect(closedEnergy).toBeLessThan(openEnergy * 0.1)
    expect(left.some((sample, index) => Math.abs(sample - right[index]) > 1e-5)).toBe(true)
    expect(Array.from(left).every(Number.isFinite)).toBe(true)
    expect(Array.from(right).every(Number.isFinite)).toBe(true)
  })

  it('renders micro-pitch as a stereo WASM effect', () => {
    const samples = new Float32Array(4096)
    for (let i = 0; i < samples.length; i++) samples[i] = Math.sin(2 * Math.PI * 220 * i / 48_000)
    const out = render(pipe(
      buffer(samples),
      effects.microPitch({ detune: 18, width: 1, delayMs: 12, mix: 1 }),
    ), { duration: samples.length / 48_000, sampleRate: 48_000 })

    expect(Array.isArray(out)).toBe(true)
    const [left, right] = out as [Float32Array, Float32Array]
    expect(left.length).toBe(samples.length)
    expect(right.length).toBe(samples.length)
    expect(Array.from(left).every(Number.isFinite)).toBe(true)
    expect(Array.from(right).every(Number.isFinite)).toBe(true)
    expect(left.some((sample) => Math.abs(sample) > 1e-5)).toBe(true)
    expect(right.some((sample) => Math.abs(sample) > 1e-5)).toBe(true)
    expect(left.some((sample, index) => Math.abs(sample - right[index]) > 1e-5)).toBe(true)
  })

  it('renders multi-tap delay as a panned stereo WASM effect', () => {
    const impulse = new Float32Array(80)
    impulse[0] = 1
    const out = render(pipe(
      buffer(impulse),
      effects.multiTapDelay({
        timeMs: 10,
        feedback: 0,
        mix: 1,
        tone: 1,
        width: 1,
        taps: [
          { ratio: 1, gain: 1, pan: -1 },
          { ratio: 2, gain: 1, pan: 1 },
        ],
      }),
    ), { duration: 80 / 1000, sampleRate: 1000 })

    expect(Array.isArray(out)).toBe(true)
    const [left, right] = out as [Float32Array, Float32Array]
    expect(left[10]).toBeGreaterThan(0.45)
    expect(right[10]).toBeLessThan(1e-5)
    expect(right[20]).toBeGreaterThan(0.45)
    expect(left[20]).toBeLessThan(1e-5)
    expect(Array.from(left).every(Number.isFinite)).toBe(true)
    expect(Array.from(right).every(Number.isFinite)).toBe(true)
  })

  it('renders ensemble chorus as a stereo WASM effect', () => {
    const samples = new Float32Array(4096)
    for (let i = 0; i < samples.length; i++) samples[i] = Math.sin(2 * Math.PI * 220 * i / 48_000)
    const out = render(pipe(
      buffer(samples),
      effects.ensembleChorus({ rate: 0.7, depth: 8, mix: 1, width: 1, tone: 1, noise: 0 }),
    ), { duration: samples.length / 48_000, sampleRate: 48_000 })

    expect(Array.isArray(out)).toBe(true)
    const [left, right] = out as [Float32Array, Float32Array]
    expect(left.length).toBe(samples.length)
    expect(right.length).toBe(samples.length)
    expect(Array.from(left).every(Number.isFinite)).toBe(true)
    expect(Array.from(right).every(Number.isFinite)).toBe(true)
    expect(left.some((sample) => Math.abs(sample) > 1e-5)).toBe(true)
    expect(right.some((sample) => Math.abs(sample) > 1e-5)).toBe(true)
    expect(left.some((sample, index) => Math.abs(sample - right[index]) > 1e-5)).toBe(true)
  })

  it('renders saturator as a WASM-only nonlinear effect', () => {
    const samples = new Float32Array(512)
    for (let i = 0; i < samples.length; i++) samples[i] = Math.sin(2 * Math.PI * 110 * i / 8_000) * 1.25
    const out = render(pipe(
      buffer(samples),
      effects.saturator({ drive: 1, asymmetry: 0.35, tone: 1, mix: 1, output: 1 }),
    ), { duration: samples.length / 8_000, sampleRate: 8_000 }) as Float32Array

    expect(out.length).toBe(samples.length)
    expect(Array.from(out).every(Number.isFinite)).toBe(true)
    expect(Math.max(...out)).toBeLessThan(1.1)
    expect(Math.min(...out)).toBeGreaterThan(-1.1)
    expect(out.some((sample, index) => Math.abs(sample - samples[index]) > 1e-3)).toBe(true)
  })

  it('renders wavefolder as a WASM-only foldback nonlinear effect', () => {
    const sampleRate = 8_000
    const samples = new Float32Array(1024)
    for (let i = 0; i < samples.length; i++) {
      samples[i] = Math.sin(2 * Math.PI * 110 * i / sampleRate) * 0.7
    }
    const graph = pipe(
      buffer(samples),
      effects.wavefolder({ drive: 0.85, depth: 0.9, asymmetry: 0.2, tone: 1, mix: 1, output: 1 }),
    )
    const out = render(graph, { duration: samples.length / sampleRate, sampleRate }) as Float32Array

    expect(() => renderReference(graph, { duration: samples.length / sampleRate, sampleRate })).toThrow(SynthCompileError)
    expect(out.length).toBe(samples.length)
    expect(Array.from(out).every(Number.isFinite)).toBe(true)
    expect(Math.max(...out)).toBeLessThan(1.5)
    expect(Math.min(...out)).toBeGreaterThan(-1.5)
    expect(out.some((sample, index) => Math.abs(sample - samples[index]) > 0.05)).toBe(true)
  })

  it('renders degrade as a WASM-only lofi effect', () => {
    const samples = new Float32Array(512)
    for (let i = 0; i < samples.length; i++) samples[i] = Math.sin(2 * Math.PI * 330 * i / 8_000) * 0.8
    const out = render(pipe(
      buffer(samples),
      effects.degrade({ bits: 4, downsample: 4, jitter: 0, noise: 0, tone: 1, mix: 1 }),
    ), { duration: samples.length / 8_000, sampleRate: 8_000 }) as Float32Array

    expect(out.length).toBe(samples.length)
    expect(Array.from(out).every(Number.isFinite)).toBe(true)
    expect(out[0]).toBeCloseTo(out[1], 1)
    expect(out[0]).toBeCloseTo(out[2], 1)
    expect(out[0]).toBeCloseTo(out[3], 1)
    expect(out.some((sample, index) => Math.abs(sample - samples[index]) > 0.05)).toBe(true)
  })

  it('renders tilt EQ as a WASM-only tone shaping effect', () => {
    const samples = new Float32Array(1024)
    for (let i = 0; i < samples.length; i++) samples[i] = i % 2 === 0 ? 0.35 : -0.35
    const bright = render(pipe(
      buffer(samples),
      effects.tiltEq({ freq: 900, gainDb: 12, mix: 1 }),
    ), { duration: samples.length / 48_000, sampleRate: 48_000 }) as Float32Array
    const dark = render(pipe(
      buffer(samples),
      effects.tiltEq({ freq: 900, gainDb: -12, mix: 1 }),
    ), { duration: samples.length / 48_000, sampleRate: 48_000 }) as Float32Array

    const brightEnergy = Array.from(bright).reduce((sum, sample) => sum + Math.abs(sample), 0)
    const darkEnergy = Array.from(dark).reduce((sum, sample) => sum + Math.abs(sample), 0)
    expect(bright.length).toBe(samples.length)
    expect(Array.from(bright).every(Number.isFinite)).toBe(true)
    expect(brightEnergy).toBeGreaterThan(darkEnergy * 2)
  })

  it('renders stereo spread as a WASM-only Haas widening effect', () => {
    const samples = new Float32Array(256)
    samples[0] = 1
    const out = render(pipe(
      buffer(samples),
      effects.stereoSpread({ width: 1, delayMs: 3, mix: 1 }),
    ), { duration: samples.length / 1_000, sampleRate: 1_000 }) as [Float32Array, Float32Array]

    expect(Array.isArray(out)).toBe(true)
    const [left, right] = out
    expect(left[0]).toBeGreaterThan(0.9)
    expect(right[0]).toBe(0)
    expect(right[3]).toBeGreaterThan(0.9)
    expect(Array.from(left).every(Number.isFinite)).toBe(true)
    expect(Array.from(right).every(Number.isFinite)).toBe(true)
  })

  it('renders frequency shifter as a WASM-only analytic-signal effect', () => {
    const sampleRate = 8_000
    const samples = new Float32Array(4096)
    for (let i = 0; i < samples.length; i++) samples[i] = Math.sin(2 * Math.PI * 440 * i / sampleRate)
    const out = render(pipe(
      buffer(samples),
      effects.frequencyShifter({ shiftHz: 110, mix: 1 }),
    ), { duration: samples.length / sampleRate, sampleRate }) as Float32Array

    expect(out.length).toBe(samples.length)
    expect(Array.from(out).every(Number.isFinite)).toBe(true)
    expect(toneEnergy(out, 550, sampleRate, 512)).toBeGreaterThan(toneEnergy(out, 440, sampleRate, 512) * 4)
  })

  it('renders state variable filters as WASM-only resonant multimode filters', () => {
    const sampleRate = 8_000
    const samples = new Float32Array(4096)
    for (let i = 0; i < samples.length; i++) {
      samples[i] = Math.sin(2 * Math.PI * 220 * i / sampleRate)
        + 0.7 * Math.sin(2 * Math.PI * 2_200 * i / sampleRate)
    }
    const graph = pipe(
      buffer(samples),
      filter.stateVariable('lowpass', 600, { resonance: 0.35, drive: 0.1, mix: 1 }),
    )
    const out = render(graph, { duration: samples.length / sampleRate, sampleRate }) as Float32Array

    expect(() => renderReference(graph, { duration: samples.length / sampleRate, sampleRate })).toThrow(SynthCompileError)
    expect(out.length).toBe(samples.length)
    expect(Array.from(out).every(Number.isFinite)).toBe(true)
    expect(toneEnergy(out, 220, sampleRate, 512)).toBeGreaterThan(toneEnergy(out, 2_200, sampleRate, 512) * 2)
  })

  it('renders rotary speaker as a WASM-only stereo Doppler effect', () => {
    const sampleRate = 8_000
    const samples = new Float32Array(4096)
    for (let i = 0; i < samples.length; i++) samples[i] = Math.sin(2 * Math.PI * 440 * i / sampleRate) * 0.7
    const out = render(pipe(
      buffer(samples),
      effects.rotarySpeaker({ rate: 6, depth: 1, mix: 1, drive: 0.1, width: 1, crossoverHz: 800 }),
    ), { duration: samples.length / sampleRate, sampleRate }) as [Float32Array, Float32Array]

    expect(Array.isArray(out)).toBe(true)
    const [left, right] = out
    const difference = left.reduce((sum, sample, index) => sum + Math.abs(sample - right[index]), 0)
    const energy = left.reduce((sum, sample) => sum + Math.abs(sample), 0)
    expect(left.length).toBe(samples.length)
    expect(Array.from(left).every(Number.isFinite)).toBe(true)
    expect(Array.from(right).every(Number.isFinite)).toBe(true)
    expect(difference).toBeGreaterThan(energy * 0.05)
  })

  it('renders wavetable oscillators from single-cycle and decoded-audio sources', () => {
    const size = 2048
    const cycle = new Float32Array(size)
    for (let i = 0; i < size; i++) cycle[i] = Math.sin(2 * Math.PI * i / size)
    const bank = createWavetable(cycle)
    const imported = wavetableFromAudio({
      sampleRate: 48_000,
      length: size,
      getChannelData: () => cycle,
    })

    const fromCycle = render(oscillator.wavetable(bank, 440), { duration: 16 / 48_000, sampleRate: 48_000 }) as Float32Array
    const fromAudio = render(oscillator.wavetable(imported, 440), { duration: 16 / 48_000, sampleRate: 48_000 }) as Float32Array

    for (let i = 0; i < fromCycle.length; i++) {
      const expected = Math.sin(2 * Math.PI * 440 * i / 48_000)
      expect(fromCycle[i]).toBeCloseTo(expected, 2)
      expect(fromAudio[i]).toBeCloseTo(expected, 2)
    }
  })

  it('renders deterministic six-operator FM patches', () => {
    const patch = fm({
      freq: 220,
      index: 1.7,
      operators: [
        operator.sine({ ratio: 1, level: 1, output: 0 }),
        operator.polyblep('saw', { ratio: 2, level: 0.5, output: 1 }),
        operator.sine({ ratio: 3, level: 0.2, output: 0.2 }),
      ],
      matrix: [
        [0, 1, 0, 0, 0, 0],
        [0, 0, 0.3, 0, 0, 0],
      ],
    })

    const a = render(patch, { duration: 0.02, sampleRate: 48_000 }) as Float32Array
    const b = render(patch, { duration: 0.02, sampleRate: 48_000 }) as Float32Array

    closeArray(a, b, 12)
    expect(Array.from(a).every(Number.isFinite)).toBe(true)
    expect(Array.from(a).some((value) => Math.abs(value) > 1e-6)).toBe(true)
  })

  it('renders sampler instruments with pitch, zone, and trigger velocity in WASM', () => {
    const quiet = new Float32Array([0.25, 0.25, 0.25, 0.25])
    const loud = new Float32Array([1, 1, 1, 1])
    const patch = sampler.instrument({
      freq: 440,
      zones: [
        { samples: quiet, sampleRate: 1_000, rootMidi: 69, velocityHigh: 0.5 },
        { samples: loud, sampleRate: 1_000, rootMidi: 69, velocityLow: 0.5 },
      ],
      release: 0.01,
    })

    const out = render(patch, {
      duration: 4 / 1_000,
      sampleRate: 1_000,
      triggers: [{ freq: 440, velocity: 0.9, atSec: 0, gateMs: 4 }],
    })

    expect(Array.isArray(out)).toBe(true)
    const [left, right] = out as [Float32Array, Float32Array]
    expect(left[0]).toBeGreaterThan(0.6)
    expect(right[0]).toBeGreaterThan(0.6)
    expect(Array.from(left).every(Number.isFinite)).toBe(true)
    expect(Array.from(right).every(Number.isFinite)).toBe(true)
  })

  it('loops sampler zones between loop points', () => {
    const patch = sampler.instrument({
      freq: 440,
      zones: [{
        samples: new Float32Array([0, 1, 0.5, -1]),
        sampleRate: 1_000,
        rootMidi: 69,
        loop: true,
        loopStart: 1,
        loopEnd: 3,
      }],
    })

    const out = render(patch, { duration: 8 / 1_000, sampleRate: 1_000 })

    expect(Array.isArray(out)).toBe(true)
    const [left] = out as [Float32Array, Float32Array]
    expect(left.some((sample) => Math.abs(sample) > 0.1)).toBe(true)
    expect(Array.from(left).every(Number.isFinite)).toBe(true)
  })

  it('renders lo-fi sampler instruments with velocity zones and degradation in WASM', () => {
    const quiet = new Float32Array([0.1, 0.25, 0.4, 0.1])
    const loud = new Float32Array([0.35, 0.8, 1, 0.35])
    const patch = instrument.lofiSampler({
      freq: 440,
      zones: [
        { samples: quiet, sampleRate: 1_000, rootMidi: 69, velocityHigh: 0.5, pan: -0.35 },
        { samples: loud, sampleRate: 1_000, rootMidi: 69, velocityLow: 0.5, pan: 0.35 },
      ],
      bits: 6,
      downsample: 2,
      jitter: 0,
      noise: 0,
      tone: 0.7,
      drive: 0.2,
      mix: 1,
      release: 0.01,
    })
    const quietOut = render(patch, {
      duration: 6 / 1_000,
      sampleRate: 1_000,
      triggers: [{ freq: 440, velocity: 0.25, atSec: 0, gateMs: 6 }],
    })
    const loudOut = render(patch, {
      duration: 6 / 1_000,
      sampleRate: 1_000,
      triggers: [{ freq: 440, velocity: 0.95, atSec: 0, gateMs: 6 }],
    })
    const peak = (values: Float32Array) => values.reduce((max, value) => Math.max(max, Math.abs(value)), 0)

    expect(Array.isArray(quietOut)).toBe(true)
    expect(Array.isArray(loudOut)).toBe(true)
    const [left, right] = loudOut as [Float32Array, Float32Array]
    const [quietLeft] = quietOut as [Float32Array, Float32Array]
    expect(Array.from(left).every(Number.isFinite)).toBe(true)
    expect(Array.from(right).every(Number.isFinite)).toBe(true)
    expect(left.some((sample, index) => Math.abs(sample - right[index]) > 1e-5)).toBe(true)
    expect(peak(left)).toBeGreaterThan(peak(quietLeft) * 1.5)
    expect(peak(left)).toBeGreaterThan(0.1)
  })

  it('renders acid bass with trigger velocity and accent in WASM', () => {
    const patch = instrument.acidBass({
      wave: 'saw',
      freq: 110,
      cutoff: 420,
      resonance: 0.72,
      envMod: 0.8,
      decay: 0.08,
      accent: 1,
      drive: 0.28,
      level: 0.9,
    })
    const quiet = render(patch, {
      duration: 0.025,
      sampleRate: 8_000,
      triggers: [{ freq: 110, velocity: 0.25, atSec: 0, gateMs: 20 }],
    }) as Float32Array
    const loud = render(patch, {
      duration: 0.025,
      sampleRate: 8_000,
      triggers: [{ freq: 110, velocity: 1, atSec: 0, gateMs: 20 }],
    }) as Float32Array
    const peak = (values: Float32Array) => values.reduce((max, value) => Math.max(max, Math.abs(value)), 0)

    expect(Array.from(loud).every(Number.isFinite)).toBe(true)
    expect(peak(loud)).toBeGreaterThan(peak(quiet) * 1.5)
    expect(peak(loud)).toBeGreaterThan(0.02)
  })

  it('renders drum voices with trigger velocity in WASM', () => {
    const kick = instrument.drumVoice({ kind: 'kick', decay: 0.12, snap: 0.7, level: 0.85 })
    const quiet = render(kick, {
      duration: 0.08,
      sampleRate: 8_000,
      triggers: [{ freq: 55, velocity: 0.25, atSec: 0, gateMs: 60 }],
    }) as Float32Array
    const loud = render(kick, {
      duration: 0.08,
      sampleRate: 8_000,
      triggers: [{ freq: 55, velocity: 1, atSec: 0, gateMs: 60 }],
    }) as Float32Array
    const snare = render(instrument.drumVoice({ kind: 'snare', noise: 0.85, snap: 0.7 }), { duration: 0.08, sampleRate: 8_000 }) as Float32Array
    const hat = render(instrument.drumVoice({ kind: 'hat', decay: 0.04, tone: 0.9 }), { duration: 0.04, sampleRate: 8_000 }) as Float32Array
    const peak = (values: Float32Array) => values.reduce((max, value) => Math.max(max, Math.abs(value)), 0)

    expect(Array.from(loud).every(Number.isFinite)).toBe(true)
    expect(Array.from(snare).every(Number.isFinite)).toBe(true)
    expect(Array.from(hat).every(Number.isFinite)).toBe(true)
    expect(peak(loud)).toBeGreaterThan(peak(quiet) * 1.4)
    expect(peak(snare)).toBeGreaterThan(0.01)
    expect(peak(hat)).toBeGreaterThan(0.01)
  })

  it('renders string machine as a stereo Rust instrument in WASM', () => {
    const patch = instrument.stringMachine({
      freq: 220,
      attack: 0.01,
      release: 0.12,
      tone: 0.82,
      depth: 0.9,
      modulation: 0.7,
      width: 1,
      level: 0.8,
    })
    const quiet = render(patch, {
      duration: 0.08,
      sampleRate: 8_000,
      triggers: [{ freq: 220, velocity: 0.25, atSec: 0, gateMs: 40 }],
    })
    const loud = render(patch, {
      duration: 0.08,
      sampleRate: 8_000,
      triggers: [{ freq: 220, velocity: 1, atSec: 0, gateMs: 40 }],
    })
    const peak = (values: Float32Array) => values.reduce((max, value) => Math.max(max, Math.abs(value)), 0)

    expect(Array.isArray(quiet)).toBe(true)
    expect(Array.isArray(loud)).toBe(true)
    const [left, right] = loud as [Float32Array, Float32Array]
    const [quietLeft] = quiet as [Float32Array, Float32Array]
    expect(Array.from(left).every(Number.isFinite)).toBe(true)
    expect(Array.from(right).every(Number.isFinite)).toBe(true)
    expect(left.some((sample, index) => Math.abs(sample - right[index]) > 1e-5)).toBe(true)
    expect(peak(left)).toBeGreaterThan(peak(quietLeft) * 1.4)
    expect(peak(left)).toBeGreaterThan(0.01)
  })

  it('renders poly synth as a stereo Rust instrument in WASM', () => {
    const patch = instrument.polySynth({
      freq: 220,
      detune: 5,
      pulseWidth: 0.42,
      sub: 0.45,
      noise: 0.02,
      cutoff: 1_200,
      resonance: 0.38,
      envMod: 0.45,
      attack: 0.004,
      decay: 0.08,
      sustain: 0.7,
      release: 0.16,
      drive: 0.18,
      chorus: 0.65,
      modulation: 0.45,
      width: 1,
      level: 0.72,
    })
    const quiet = render(patch, {
      duration: 0.08,
      sampleRate: 8_000,
      triggers: [{ freq: 220, velocity: 0.25, atSec: 0, gateMs: 40 }],
    })
    const loud = render(patch, {
      duration: 0.08,
      sampleRate: 8_000,
      triggers: [{ freq: 220, velocity: 1, atSec: 0, gateMs: 40 }],
    })
    const peak = (values: Float32Array) => values.reduce((max, value) => Math.max(max, Math.abs(value)), 0)

    expect(Array.isArray(quiet)).toBe(true)
    expect(Array.isArray(loud)).toBe(true)
    const [left, right] = loud as [Float32Array, Float32Array]
    const [quietLeft] = quiet as [Float32Array, Float32Array]
    expect(Array.from(left).every(Number.isFinite)).toBe(true)
    expect(Array.from(right).every(Number.isFinite)).toBe(true)
    expect(left.some((sample, index) => Math.abs(sample - right[index]) > 1e-5)).toBe(true)
    expect(peak(left)).toBeGreaterThan(peak(quietLeft) * 1.4)
    expect(peak(left)).toBeGreaterThan(0.01)
  })

  it('keeps malformed DSP parameters from leaking NaN or throwing', () => {
    const graph = pipe(
      buffer(new Float32Array([1, 2, 3]), { rate: Number.NaN }),
      effects.reverb(new Float32Array(), 0.5),
      effects.distortion(Number.NaN),
    )

    const out = render(graph, { duration: 4 / 48_000, sampleRate: 48_000 }) as Float32Array
    expect(Array.from(out).every(Number.isFinite)).toBe(true)
  })

  it('rejects invalid wavetable and FM patch inputs', () => {
    expect(() => createWavetable(new Float32Array([0, 1, 0]), { size: 1000 })).toThrow(SynthCompileError)
    expect(() => wavetableFromAudio({
      sampleRate: 48_000,
      length: 0,
      getChannelData: () => new Float32Array(),
    })).toThrow(SynthCompileError)
    expect(() => fm({
      freq: 110,
      operators: [
        operator.sine(), operator.sine(), operator.sine(), operator.sine(),
        operator.sine(), operator.sine(), operator.sine(),
      ],
    })).toThrow(SynthCompileError)
    expect(() => fm({
      freq: 110,
      operators: [operator.sine()],
      matrix: [[0, 0, 0, 0, 0, 0, 0]],
    })).toThrow(SynthCompileError)
  })
})

describe('wasm render acceleration', () => {
  it('loads the embedded WASM engine and matches the JS reference for a modulated mono graph', () => {
    expect(isSynthWasmAvailable()).toBe(true)
    expect(isSynthWasmBinaryAvailable()).toBe(true)
    const graph = pipe(
      mix([
        oscillator('saw', 110),
        pipe(oscillator('triangle', 55), gain(0.35)),
      ]),
      filter.lowpass(1400, 0.9),
      modulate(params.biquad.freq, oscillator('sine', 3), 120),
      effects.distortion(0.08),
      effects.bitcrush(10, 2),
      envelope.exponential({ tau: 0.04 }),
    )
    const opts = { duration: 128 / 48_000, sampleRate: 48_000 }

    closeSamples(renderWasmForTest(graph, opts), renderReference(graph, opts), 4)
  })

  it('matches the JS reference for triggered stereo space echo patches', () => {
    expect(isSynthWasmAvailable()).toBe(true)
    expect(isSynthWasmRuntimeResetAvailable()).toBe(true)
    const graph = pipe(
      mix([
        pipe(oscillator('sine', 110), gain(0.5)),
        pipe(noise('pink', { seed: 42 }), gain(0.03)),
      ]),
      envelope({ attack: 0.001, decay: 0.004, sustain: 0.4, release: 0.01 }),
      effects.spaceEcho({ timeMs: 24, feedback: 0.18, mix: 0.3, reverbMix: 0.03, wow: 0.05, flutter: 0.02, tapeAge: 0.2, drive: 0.08 }),
    )
    const opts = {
      duration: 0.05,
      sampleRate: 8_000,
      triggers: [
        { midi: 45, atSec: 0, gateMs: 20 },
        { midi: 52, atSec: 0.015, gateMs: 18 },
      ],
    }

    closeSamples(renderWasmForTest(graph, opts), renderReference(graph, opts), 4)
  })

  it('exposes a stateful block runtime that matches full-buffer WASM rendering', () => {
    expect(isSynthWasmRuntimeAvailable()).toBe(true)
    expect(isSynthWasmRuntimeDirectAvailable()).toBe(true)
    const graph = pipe(
      oscillator('saw', 123),
      effects.delay(1, 0.2, 0.4),
      effects.distortion(0.05),
    )
    const opts = { duration: 384 / 48_000, sampleRate: 48_000 }

    closeSamples(renderWasmRuntimeForTest(graph, opts, 128), renderWasmForTest(graph, opts), 4)
  })

  it('streams input buffers through partial runtime blocks without stale heap samples', () => {
    expect(isSynthWasmRuntimeAvailable()).toBe(true)
    const sampleRate = 8_000
    const left = new Float32Array(130)
    for (let i = 0; i < left.length; i++) left[i] = i < 128 ? 0.25 : -0.5
    const graph = pipe(input(0), gain(2))
    const opts = { duration: left.length / sampleRate, sampleRate, inputs: [left] }

    closeSamples(renderWasmRuntimeForTest(graph, opts, 128), renderWasmForTest(graph, opts), 6)
  })

  it('bounds gated lo-fi sampler voices without leaving degradation noise behind', () => {
    expect(isSynthWasmRuntimeResetAvailable()).toBe(true)
    expect(isSynthWasmRuntimeDirectAvailable()).toBe(true)
    const graph = instrument.lofiSampler({
      freq: 440,
      zones: [{
        samples: new Float32Array([0.5, 0.45, 0.4, 0.35]),
        sampleRate: 1_000,
        rootMidi: 69,
        loop: true,
        loopStart: 0,
        loopEnd: 4,
      }],
      attack: 0,
      release: 0.01,
      bits: 6,
      downsample: 2,
      jitter: 0,
      noise: 1,
      tone: 0.7,
      drive: 0,
      mix: 1,
      level: 1,
    })
    const opts = {
      duration: 0.05,
      sampleRate: 1_000,
      triggers: [{ freq: 440, atSec: 0, gateMs: 10, velocity: 1 }],
    }
    const runtime = renderWasmTriggeredRuntimeForBench(graph, opts)
    const legacy = renderWasmTriggeredLegacyForBench(graph, opts)
    const [left, right] = runtime as [Float32Array, Float32Array]

    closeSamples(runtime, legacy, 6)
    expect(left.subarray(0, 20).some((value) => Math.abs(value) > 1e-4)).toBe(true)
    expect(right.subarray(0, 20).some((value) => Math.abs(value) > 1e-4)).toBe(true)
    expect(Math.max(...left.subarray(20).map((value) => Math.abs(value)))).toBe(0)
    expect(Math.max(...right.subarray(20).map((value) => Math.abs(value)))).toBe(0)
  })

  it('bounds gated bitcrush and compressor wrappers with exact JS parity', () => {
    expect(isSynthWasmRuntimeResetAvailable()).toBe(true)
    const graph = pipe(
      constant(0.8),
      envelope.ar({ attack: 0, release: 0.01 }),
      effects.bitcrush(6, 8),
      effects.compressor({ threshold: -24, ratio: 6, attack: 0.001, release: 0.05 }),
    )
    const opts = {
      duration: 0.08,
      sampleRate: 1_000,
      triggers: [{ freq: 440, atSec: 0, gateMs: 10 }],
    }
    const wasm = renderWasmForTest(graph, opts)
    const reference = renderReference(graph, opts)

    closeSamples(wasm, reference, 6)
    expect((wasm as Float32Array).subarray(0, 27).some((value) => Math.abs(value) > 1e-4)).toBe(true)
    expect(Math.max(...(wasm as Float32Array).subarray(27).map((value) => Math.abs(value)))).toBe(0)
  })

  it('bounds tilt EQ only when the one-pole split is dry or neutral', () => {
    const neutral = pipe(
      constant(0.8),
      envelope.ar({ attack: 0, release: 0.01 }),
      effects.tiltEq({ gainDb: 0, mix: 1 }),
    )
    const dry = pipe(
      constant(0.8),
      envelope.ar({ attack: 0, release: 0.01 }),
      effects.tiltEq({ gainDb: 12, mix: 0 }),
    )
    const stateful = pipe(
      constant(0.8),
      envelope.ar({ attack: 0, release: 0.01 }),
      effects.tiltEq({ gainDb: 12, mix: 1 }),
    )
    const trigger = { freq: 440, atSec: 0, gateMs: 10 }

    expect(triggerRenderFramesForTest(neutral, 80, 1_000, trigger)).toBe(20)
    expect(triggerRenderFramesForTest(dry, 80, 1_000, trigger)).toBe(20)
    expect(triggerRenderFramesForTest(stateful, 80, 1_000, trigger)).toBe(80)
  })

  it('keeps state variable filter tails conservative unless the effect is dry', () => {
    const graph = pipe(
      constant(0.8),
      envelope.ar({ attack: 0, release: 0.01 }),
      filter.stateVariable('bandpass', 1_000, { resonance: 0.8, mix: 1 }),
    )
    const dry = pipe(
      constant(0.8),
      envelope.ar({ attack: 0, release: 0.01 }),
      filter.stateVariable('bandpass', 1_000, { resonance: 0.8, mix: 0 }),
    )
    const trigger = { freq: 440, atSec: 0, gateMs: 10 }

    expect(triggerRenderFramesForTest(graph, 80, 1_000, trigger)).toBe(80)
    expect(triggerRenderFramesForTest(dry, 80, 1_000, trigger)).toBe(20)
  })

  it('keeps wavefolder tails conservative unless the effect is dry', () => {
    const graph = pipe(
      constant(0.8),
      envelope.ar({ attack: 0, release: 0.01 }),
      effects.wavefolder({ drive: 0.7, depth: 0.8, mix: 1 }),
    )
    const dry = pipe(
      constant(0.8),
      envelope.ar({ attack: 0, release: 0.01 }),
      effects.wavefolder({ drive: 0.7, depth: 0.8, mix: 0 }),
    )
    const trigger = { freq: 440, atSec: 0, gateMs: 10 }

    expect(triggerRenderFramesForTest(graph, 80, 1_000, trigger)).toBe(80)
    expect(triggerRenderFramesForTest(dry, 80, 1_000, trigger)).toBe(20)
  })

  it('bounds stereo spread tails by the Haas delay window', () => {
    const graph = pipe(
      constant(0.8),
      envelope.ar({ attack: 0, release: 0.01 }),
      effects.stereoSpread({ width: 1, delayMs: 7, mix: 1 }),
    )
    const dry = pipe(
      constant(0.8),
      envelope.ar({ attack: 0, release: 0.01 }),
      effects.stereoSpread({ width: 1, delayMs: 7, mix: 0 }),
    )
    const trigger = { freq: 440, atSec: 0, gateMs: 10 }

    expect(triggerRenderFramesForTest(graph, 80, 1_000, trigger)).toBe(27)
    expect(triggerRenderFramesForTest(dry, 80, 1_000, trigger)).toBe(20)
  })

  it('bounds frequency shifter tails by the fixed Hilbert FIR length', () => {
    const graph = pipe(
      constant(0.8),
      envelope.ar({ attack: 0, release: 0.01 }),
      effects.frequencyShifter({ shiftHz: 110, mix: 1 }),
    )
    const dry = pipe(
      constant(0.8),
      envelope.ar({ attack: 0, release: 0.01 }),
      effects.frequencyShifter({ shiftHz: 110, mix: 0 }),
    )
    const neutral = pipe(
      constant(0.8),
      envelope.ar({ attack: 0, release: 0.01 }),
      effects.frequencyShifter({ shiftHz: 0, mix: 1 }),
    )
    const trigger = { freq: 440, atSec: 0, gateMs: 10 }

    expect(triggerRenderFramesForTest(graph, 100, 1_000, trigger)).toBe(82)
    expect(triggerRenderFramesForTest(dry, 100, 1_000, trigger)).toBe(20)
    expect(triggerRenderFramesForTest(neutral, 100, 1_000, trigger)).toBe(20)
  })

  it('keeps rotary speaker tails conservative unless the effect is dry or stopped', () => {
    const graph = pipe(
      constant(0.8),
      envelope.ar({ attack: 0, release: 0.01 }),
      effects.rotarySpeaker({ depth: 1, mix: 1 }),
    )
    const dry = pipe(
      constant(0.8),
      envelope.ar({ attack: 0, release: 0.01 }),
      effects.rotarySpeaker({ depth: 1, mix: 0 }),
    )
    const stopped = pipe(
      constant(0.8),
      envelope.ar({ attack: 0, release: 0.01 }),
      effects.rotarySpeaker({ depth: 0, mix: 1 }),
    )
    const trigger = { freq: 440, atSec: 0, gateMs: 10 }

    expect(triggerRenderFramesForTest(graph, 100, 1_000, trigger)).toBe(100)
    expect(triggerRenderFramesForTest(dry, 100, 1_000, trigger)).toBe(20)
    expect(triggerRenderFramesForTest(stopped, 100, 1_000, trigger)).toBe(20)
  })

  it('bounds zero-feedback delay tails with exact JS parity', () => {
    expect(isSynthWasmRuntimeResetAvailable()).toBe(true)
    const graph = pipe(
      constant(0.8),
      envelope.ar({ attack: 0, release: 0.01 }),
      effects.delay(12, 0, 1),
    )
    const opts = {
      duration: 0.08,
      sampleRate: 1_000,
      triggers: [{ freq: 440, atSec: 0, gateMs: 10 }],
    }
    const wasm = renderWasmForTest(graph, opts)
    const reference = renderReference(graph, opts)

    expect(triggerRenderFramesForTest(graph, 80, 1_000, opts.triggers[0])).toBe(32)
    closeSamples(wasm, reference, 6)
    expect((wasm as Float32Array).subarray(12, 32).some((value) => Math.abs(value) > 1e-4)).toBe(true)
    expect(Math.max(...(wasm as Float32Array).subarray(32).map((value) => Math.abs(value)))).toBe(0)
  })

  it('uses the per-trigger binary WASM path for tiny finite delay tails', () => {
    const delayed = pipe(
      constant(0.8),
      envelope.ar({ attack: 0, release: 0.01 }),
      effects.delay(12, 0, 1),
    )
    const feedback = pipe(
      constant(0.8),
      envelope.ar({ attack: 0, release: 0.01 }),
      effects.delay(12, 0.1, 1),
    )

    expect(triggeredWasmModeForTest(delayed)).toBe('legacy')
    expect(triggeredWasmModeForTest(feedback)).toBe('runtime')
  })

  it('bounds chorus delay tails with exact JS parity', () => {
    expect(isSynthWasmRuntimeResetAvailable()).toBe(true)
    const graph = pipe(
      constant(0.8),
      envelope.ar({ attack: 0, release: 0.01 }),
      effects.chorus(2, 12, 1),
    )
    const opts = {
      duration: 0.08,
      sampleRate: 1_000,
      triggers: [{ freq: 440, atSec: 0, gateMs: 10 }],
    }
    const wasm = renderWasmForTest(graph, opts)
    const reference = renderReference(graph, opts)

    expect(triggerRenderFramesForTest(graph, 80, 1_000, opts.triggers[0])).toBe(40)
    closeSamples(wasm, reference, 6)
    expect((wasm as Float32Array).subarray(8, 40).some((value) => Math.abs(value) > 1e-4)).toBe(true)
    expect(Math.max(...(wasm as Float32Array).subarray(40).map((value) => Math.abs(value)))).toBe(0)
  })

  it('bounds micro-pitch delay tails against an unbounded WASM oracle', () => {
    expect(isSynthWasmRuntimeResetAvailable()).toBe(true)
    const graph = pipe(
      constant(0.8),
      envelope.ar({ attack: 0, release: 0.01 }),
      effects.microPitch({ detune: 12, width: 1, delayMs: 8, mix: 1 }),
    )
    const unboundedGraph = pipe(graph, modulate(params.microPitch.mix, constant(0), 0))
    const opts = {
      duration: 0.12,
      sampleRate: 1_000,
      triggers: [{ freq: 440, atSec: 0, gateMs: 10 }],
    }
    const bounded = renderWasmForTest(graph, opts)
    const unbounded = renderWasmForTest(unboundedGraph, opts)

    expect(triggerRenderFramesForTest(graph, 120, 1_000, opts.triggers[0])).toBe(60)
    closeSamples(bounded, unbounded, 6)
    const [left, right] = bounded as [Float32Array, Float32Array]
    expect(
      left.subarray(8, 60).some((value) => Math.abs(value) > 1e-4)
      || right.subarray(8, 60).some((value) => Math.abs(value) > 1e-4),
    ).toBe(true)
    expect(Math.max(
      ...left.subarray(60).map((value) => Math.abs(value)),
      ...right.subarray(60).map((value) => Math.abs(value)),
    )).toBe(0)
  })

  it('bounds no-feedback multi-tap delay tails when tone is fully open', () => {
    expect(isSynthWasmRuntimeResetAvailable()).toBe(true)
    const graph = pipe(
      constant(0.8),
      envelope.ar({ attack: 0, release: 0.01 }),
      effects.multiTapDelay({
        timeMs: 12,
        feedback: 0,
        mix: 1,
        tone: 1,
        width: 1,
        taps: [
          { ratio: 1, gain: 1, pan: -1 },
          { ratio: 2, gain: 0.5, pan: 1 },
        ],
      }),
    )
    const unboundedGraph = pipe(graph, modulate(params.multiTapDelay.mix, constant(0), 0))
    const opts = {
      duration: 0.1,
      sampleRate: 1_000,
      triggers: [{ freq: 440, atSec: 0, gateMs: 10 }],
    }
    const bounded = renderWasmForTest(graph, opts)
    const unbounded = renderWasmForTest(unboundedGraph, opts)

    expect(triggerRenderFramesForTest(graph, 100, 1_000, opts.triggers[0])).toBe(44)
    closeSamples(bounded, unbounded, 6)
    const [left, right] = bounded as [Float32Array, Float32Array]
    expect(
      left.subarray(12, 44).some((value) => Math.abs(value) > 1e-4)
      || right.subarray(12, 44).some((value) => Math.abs(value) > 1e-4),
    ).toBe(true)
    expect(Math.max(
      ...left.subarray(44).map((value) => Math.abs(value)),
      ...right.subarray(44).map((value) => Math.abs(value)),
    )).toBe(0)
  })

  it('uses the per-trigger binary WASM path for small open-tone multi-tap tails', () => {
    const openTone = pipe(
      constant(0.8),
      envelope.ar({ attack: 0, release: 0.01 }),
      effects.multiTapDelay({
        timeMs: 12,
        feedback: 0,
        mix: 1,
        tone: 1,
        taps: [{ ratio: 1, gain: 1, pan: 0 }],
      }),
    )
    const damped = pipe(
      constant(0.8),
      envelope.ar({ attack: 0, release: 0.01 }),
      effects.multiTapDelay({
        timeMs: 12,
        feedback: 0,
        mix: 1,
        tone: 0.7,
        taps: [{ ratio: 1, gain: 1, pan: 0 }],
      }),
    )

    expect(triggeredWasmModeForTest(openTone)).toBe('legacy')
    expect(triggeredWasmModeForTest(damped)).toBe('runtime')
  })
})

describe('worklet compiler', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns fresh module handles while caching addModule registration by graph shape', async () => {
    let moduleSource = ''
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:stopcock-synth')
      .mockImplementation((blob) => {
        void blob.text().then((source) => {
          moduleSource = source
        })
        return 'blob:stopcock-synth'
      })
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
    const ctx = fakeAudioContext()
    const graphA = pipe(oscillator('sine', 110), effects.distortion(0.1))
    const graphB = pipe(oscillator('sine', 220), effects.distortion(0.7))

    const first = await compileWorklet(ctx, graphA)
    const second = await compileWorklet(ctx, graphB)

    expect(first.processorName).toBe(second.processorName)
    expect(ctx.audioWorklet.addModule).toHaveBeenCalledTimes(1)
    expect(first).not.toBe(second)
    expect(first.processorOptions.wasmBytes).toBeInstanceOf(Uint8Array)
    expect(first.processorOptions.wasmBytes?.byteLength).toBeGreaterThan(1024)
    expect(workletParam(first, graphA, 'amount').node).toBe(graphA)
    expect(workletParam(second, graphB, 'amount').node).toBe(graphB)
    await vi.waitFor(() => expect(moduleSource).toContain('registerProcessor'))
    expect(moduleSource).toContain('stopcock_synth_runtime_process')
    expect(moduleSource).toContain('stopcock_synth_runtime_process_direct')
    expect(moduleSource).toContain('stopcock_synth_runtime_process_mixed')
    expect(moduleSource).toContain('stopcock_synth_runtime_process_mixed_direct')
    expect(moduleSource).toContain('stopcock_synth_runtime_output_left_ptr')
    expect(moduleSource).toContain('stopcock_synth_runtime_output_right_ptr')
    expect(moduleSource).toContain('this.leftPtr = this.hasDirectRuntime ? 0')
    expect(moduleSource).not.toContain('function samplePolyblep')
    expect(() => new Function('AudioWorkletProcessor', 'registerProcessor', 'sampleRate', moduleSource)).not.toThrow()
  })

  it('exposes throwing lookup helpers for params and inputs', async () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:stopcock-synth')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
    const mic = input(7)
    const graph = pipe(mic, gain(0.5))
    const wm = await compileWorklet(fakeAudioContext(), graph)

    expect(workletInput(wm, mic).channel).toBe(7)
    expect(wm.numberOfInputs).toBe(8)
    expect(wm.processorOptions.wasmInputChannels).toBe(1)
    expect(wm.processorOptions.wasmInputMap).toEqual([7])
    expect(workletParam(wm, graph, 'amount').audioParamName).toContain('amount')
    expect(() => workletParam(wm, mic, 'amount')).toThrow(SynthCompileError)
  })

  it('packs sparse worklet inputs before copying into WASM memory', async () => {
    const mic = input(7)
    const graph = pipe(mic, gain(0.5))
    const { wm, source } = await captureWorkletSource(graph)
    let Processor: GeneratedProcessorConstructor | undefined
    const registerProcessor = vi.fn((_name: string, ctor: GeneratedProcessorConstructor) => {
      Processor = ctor
    })

    new Function('AudioWorkletProcessor', 'registerProcessor', 'sampleRate', source)(
      class {},
      registerProcessor,
      48_000,
    )

    expect(wm.numberOfInputs).toBe(8)
    expect(wm.processorOptions.wasmInputChannels).toBe(1)
    expect(wm.processorOptions.wasmInputMap).toEqual([7])
    expect(source).toContain('this.inputMap')
    expect(source).toContain('var hostChannel = this.inputMap ? this.inputMap[channelIndex] : channelIndex')
    expect(Processor).toBeDefined()

    const processor = new Processor!({ processorOptions: wm.processorOptions })
    const parameters = Object.fromEntries(wm.params.map((handle) => [
      handle.audioParamName,
      new Float32Array([defaultFor(handle.node, handle.param)]),
    ])) as Record<string, Float32Array>
    const inputs: Float32Array[][] = Array.from({ length: 8 }, () => [])
    inputs[7] = [new Float32Array(128)]
    inputs[7][0][0] = 0.25
    inputs[7][0][1] = -0.5
    const outputs = [[new Float32Array(128)]]

    expect(processor.process(inputs, outputs, parameters)).toBe(true)
    expect(outputs[0][0][0]).toBeCloseTo(0.125, 6)
    expect(outputs[0][0][1]).toBeCloseTo(-0.25, 6)
  })

  it('skips rewrites for connected silent inputs without leaving stale samples', async () => {
    const mic = input(0)
    const graph = pipe(mic, gain(0.5))
    const { wm, source } = await captureWorkletSource(graph)
    let Processor: GeneratedProcessorConstructor | undefined
    const registerProcessor = vi.fn((_name: string, ctor: GeneratedProcessorConstructor) => {
      Processor = ctor
    })

    new Function('AudioWorkletProcessor', 'registerProcessor', 'sampleRate', source)(
      class {},
      registerProcessor,
      48_000,
    )

    expect(source).toContain('var copiedSignal = false')
    expect(source).toContain('connectedZeroSample')
    expect(Processor).toBeDefined()

    const processor = new Processor!({ processorOptions: wm.processorOptions })
    const parameters = Object.fromEntries(wm.params.map((handle) => [
      handle.audioParamName,
      new Float32Array([defaultFor(handle.node, handle.param)]),
    ])) as Record<string, Float32Array>
    const inputs = [[new Float32Array(128)]]
    const outputs = [[new Float32Array(128)]]

    inputs[0][0][4] = 0.5
    expect(processor.process(inputs, outputs, parameters)).toBe(true)
    expect(outputs[0][0][4]).toBeCloseTo(0.25, 6)

    inputs[0][0].fill(0)
    outputs[0][0].fill(1)
    expect(processor.process(inputs, outputs, parameters)).toBe(true)
    expect(outputs[0][0][4]).toBeCloseTo(0, 6)

    outputs[0][0].fill(1)
    expect(processor.process(inputs, outputs, parameters)).toBe(true)
    expect(outputs[0][0][4]).toBeCloseTo(0, 6)
  })

  it('caches unchanged scalar params while still applying scalar changes', async () => {
    const graph = pipe(constant(1), gain(0.5))
    const { wm, source } = await captureWorkletSource(graph)
    let Processor: GeneratedProcessorConstructor | undefined
    const registerProcessor = vi.fn((_name: string, ctor: GeneratedProcessorConstructor) => {
      Processor = ctor
    })

    new Function('AudioWorkletProcessor', 'registerProcessor', 'sampleRate', source)(
      class {},
      registerProcessor,
      48_000,
    )

    expect(source).toContain('this.scalarParamCache')
    expect(source).toContain('this.scalarParamSet')
    expect(source).toContain('this.scalarParamCache[mixedIndex] !== mixedScalar')
    expect(Processor).toBeDefined()

    const processor = new Processor!({ processorOptions: wm.processorOptions })
    const amount = workletParam(wm, graph, 'amount').audioParamName
    const parameters = Object.fromEntries(wm.params.map((handle) => [
      handle.audioParamName,
      new Float32Array([defaultFor(handle.node, handle.param)]),
    ])) as Record<string, Float32Array>
    parameters[amount] = new Float32Array([0.5])
    const outputs = [[new Float32Array(128)]]

    expect(processor.process([], outputs, parameters)).toBe(true)
    expect(outputs[0][0][0]).toBeCloseTo(0.5, 6)
    outputs[0][0].fill(0)
    expect(processor.process([], outputs, parameters)).toBe(true)
    expect(outputs[0][0][0]).toBeCloseTo(0.5, 6)

    parameters[amount] = new Float32Array([0.25])
    outputs[0][0].fill(0)
    expect(processor.process([], outputs, parameters)).toBe(true)
    expect(outputs[0][0][0]).toBeCloseTo(0.25, 6)
  })

  it('keeps constant full-block params on the scalar ABI and caches repeated a-rate blocks', async () => {
    const graph = pipe(constant(1), gain(0.5))
    const { wm, source } = await captureWorkletSource(graph)
    let Processor: GeneratedProcessorConstructor | undefined
    const registerProcessor = vi.fn((_name: string, ctor: GeneratedProcessorConstructor) => {
      Processor = ctor
    })

    new Function('AudioWorkletProcessor', 'registerProcessor', 'sampleRate', source)(
      class {},
      registerProcessor,
      48_000,
    )

    expect(source).toContain('this.blockParamSet')
    expect(source).toContain('this.blockParamFrames')
    expect(source).toContain('var mixedDetect = 1')
    expect(source).toContain('var mixedChanged = 0')
    expect(Processor).toBeDefined()

    const processor = new Processor!({ processorOptions: wm.processorOptions })
    const processorWithInternals = processor as GeneratedProcessor & {
      exports: Record<string, unknown>
      hasDirectRuntime: boolean
      hasMixedRuntime: boolean
    }
    expect(processorWithInternals.hasDirectRuntime).toBe(true)
    expect(processorWithInternals.hasMixedRuntime).toBe(true)

    const direct = vi.fn(() => 1)
    const mixed = vi.fn(() => 1)
    processorWithInternals.exports = {
      ...processorWithInternals.exports,
      stopcock_synth_runtime_process_direct: direct,
      stopcock_synth_runtime_process_mixed_direct: mixed,
    }

    const amount = workletParam(wm, graph, 'amount').audioParamName
    const parameters = Object.fromEntries(wm.params.map((handle) => [
      handle.audioParamName,
      new Float32Array([defaultFor(handle.node, handle.param)]),
    ])) as Record<string, Float32Array>
    const amountBlock = new Float32Array(128).fill(0.5)
    parameters[amount] = amountBlock
    const outputs = [[new Float32Array(128)]]

    expect(processor.process([], outputs, parameters)).toBe(true)
    expect(direct).toHaveBeenCalledTimes(1)
    expect(mixed).not.toHaveBeenCalled()

    direct.mockClear()
    mixed.mockClear()
    amountBlock[64] = 0.25
    expect(processor.process([], outputs, parameters)).toBe(true)
    expect(direct).not.toHaveBeenCalled()
    expect(mixed).toHaveBeenCalledTimes(1)

    direct.mockClear()
    mixed.mockClear()
    expect(processor.process([], outputs, parameters)).toBe(true)
    expect(direct).not.toHaveBeenCalled()
    expect(mixed).toHaveBeenCalledTimes(1)
  })

  it('keeps the generated audio callback free of per-block allocation patterns', async () => {
    const bank = createWavetable({ partials: [1, 0.5, 0.25] })
    const graph = pipe(
      mix([
        oscillator('saw', 110),
        oscillator.wavetable(bank, 55),
        fm({ freq: 110, operators: [operator.sine({ output: 1 })] }),
        instrument.drumVoice({ kind: 'hat', decay: 0.05, tone: 0.9, level: 0.08 }),
        instrument.stringMachine({ freq: 110, attack: 0.01, depth: 0.4, level: 0.08 }),
        instrument.polySynth({ freq: 82.41, cutoff: 900, chorus: 0.35, level: 0.08 }),
        instrument.lofiSampler({
          freq: 110,
          zones: [{ samples: new Float32Array([0, 0.45, 0.2, 0]), sampleRate: 48_000, rootMidi: 45, loop: true, loopStart: 1, loopEnd: 3 }],
          bits: 10,
          downsample: 2,
          noise: 0.02,
          level: 0.12,
        }),
        sampler.instrument({
          freq: 110,
          zones: [{ samples: new Float32Array([0, 0.4, 0.2, 0]), sampleRate: 48_000, rootMidi: 45, loop: true, loopStart: 1, loopEnd: 3 }],
          level: 0.2,
        }),
      ]),
      filter.lowpass(1200, 0.8),
      filter.comb(20, 0.3, 0.2),
      effects.delay(40, 0.2, 0.5),
      effects.chorus(1, 4, 0.3),
      effects.ensembleChorus({ rate: 0.36, depth: 5.5, mix: 0.22, width: 0.85, tone: 0.82 }),
      effects.spaceEcho({ timeMs: 96, feedback: 0.4, mix: 0.22, reverbMix: 0.08 }),
      effects.tapeDelay({ timeMs: 132, feedback: 0.32, mix: 0.18, wow: 0.12, flutter: 0.06, tapeAge: 0.24, drive: 0.12, tone: 0.78, width: 0.85 }),
      effects.plateReverb({ preDelayMs: 10, decay: 0.5, damping: 0.45, diffusion: 0.72, modulation: 0.14, mix: 0.12, width: 1 }),
      effects.springReverb({ decay: 0.6, damping: 0.34, tension: 0.52, drip: 0.25, mix: 0.1, width: 0.9 }),
      effects.nonlinearReverb({ timeMs: 130, decay: 0.62, damping: 0.35, drive: 0.2, mix: 0.08, width: 0.85 }),
      effects.microPitch({ detune: 8, width: 0.6, delayMs: 14, mix: 0.18 }),
      effects.multiTapDelay({ timeMs: 48, feedback: 0.22, mix: 0.18, tone: 0.74, width: 0.9 }),
      effects.saturator({ drive: 0.35, asymmetry: 0.12, tone: 0.82, mix: 0.7, output: 0.9 }),
      effects.degrade({ bits: 11, downsample: 2, jitter: 0.02, noise: 0.05, tone: 0.85, mix: 0.4 }),
      effects.distortion(0.2),
      effects.bitcrush(8, 2),
      effects.compressor(),
      effects.reverb(new Float32Array([0.4, 0.2, 0.1]), 0.1),
      pan(0.2),
    )

    const { source } = await captureWorkletSource(graph)
    const processStart = source.indexOf('process(inputs, outputs, parameters) {')
    const processEnd = source.indexOf('this.frame += frames;', processStart)
    expect(processStart).toBeGreaterThan(-1)
    expect(processEnd).toBeGreaterThan(processStart)
    const processSource = source.slice(processStart, processEnd)

    expect(processSource).not.toMatch(/\bnew\s+/)
    expect(processSource).not.toContain('Object.create')
    expect(processSource).not.toContain('stateFor')
    expect(processSource).not.toContain('new Float32Array')
    expect(processSource).not.toContain('return [')
    expect(processSource).not.toContain('=>')
    expect(processSource).not.toContain('node.id')
    expect(processSource).not.toMatch(/'op' \+/)
    expect(processSource).not.toMatch(/'m' \+/)
    expect(processSource).not.toContain('.map(')
    expect(processSource).not.toContain('Array.from')
  })

  it('runs the generated processor repeatedly with preallocated state', async () => {
    const bank = createWavetable({ partials: [1, 0.2, 0.15] })
    const graph = pipe(
      mix([
        oscillator.wavetable(bank, 110),
        sampler.instrument({
          freq: 110,
          zones: [{ samples: new Float32Array([0, 0.3, 0.1, 0]), sampleRate: 48_000, rootMidi: 45, loop: true, loopStart: 1, loopEnd: 3 }],
          level: 0.18,
        }),
        instrument.acidBass({
          freq: 55,
          cutoff: 620,
          resonance: 0.62,
          envMod: 0.7,
          decay: 0.12,
          accent: 0.4,
          drive: 0.25,
          level: 0.18,
        }),
        instrument.drumVoice({ kind: 'kick', freq: 55, decay: 0.16, snap: 0.6, level: 0.16 }),
        instrument.stringMachine({ freq: 110, attack: 0.01, release: 0.2, depth: 0.5, level: 0.12 }),
        instrument.polySynth({ freq: 82.41, cutoff: 1_100, resonance: 0.3, chorus: 0.3, level: 0.12 }),
        instrument.lofiSampler({
          freq: 110,
          zones: [{ samples: new Float32Array([0, 0.42, 0.2, 0]), sampleRate: 48_000, rootMidi: 45, loop: true, loopStart: 1, loopEnd: 3 }],
          bits: 11,
          downsample: 2,
          tone: 0.76,
          level: 0.12,
        }),
        fm({
          freq: 55,
          index: 1.2,
          operators: [
            operator.sine({ ratio: 1, level: 1, output: 0 }),
            operator.polyblep('square', { ratio: 2, level: 0.4, output: 1 }),
          ],
          matrix: [[0, 1, 0, 0, 0, 0]],
        }),
      ]),
      filter.highpass(80, 0.707),
      effects.delay(64, 0.22, 0.35),
      effects.chorus(0.4, 10, 0.25),
      effects.ensembleChorus({ rate: 0.4, depth: 4.44, mix: 0.2, width: 1 }),
      effects.spaceEcho({ timeMs: 120, feedback: 0.38, mix: 0.2, reverbMix: 0.04, mode: 'heads-1-3' }),
      effects.tapeDelay({ timeMs: 144, feedback: 0.28, mix: 0.16, wow: 0.1, flutter: 0.05, tapeAge: 0.2, drive: 0.1, tone: 0.72, width: 0.75 }),
      effects.plateReverb({ preDelayMs: 12, decay: 0.46, damping: 0.42, diffusion: 0.7, modulation: 0.12, mix: 0.1, width: 1 }),
      effects.springReverb({ decay: 0.58, damping: 0.32, tension: 0.48, drip: 0.2, mix: 0.08, width: 0.85 }),
      effects.nonlinearReverb({ timeMs: 120, decay: 0.58, damping: 0.36, drive: 0.18, mix: 0.07, width: 0.8 }),
      effects.microPitch({ detune: 7, width: 0.5, delayMs: 16, mix: 0.14 }),
      effects.multiTapDelay({ timeMs: 72, feedback: 0.2, mix: 0.16, tone: 0.7, width: 0.8 }),
      effects.saturator({ drive: 0.22, tone: 0.75, mix: 0.5, output: 0.95 }),
      effects.degrade({ bits: 12, downsample: 2, tone: 0.8, mix: 0.35 }),
      effects.reverb(new Float32Array([0.4, 0.2, 0.1]), 0.1),
      effects.compressor({ threshold: -18, ratio: 2.4, attack: 0.004, release: 0.18 }),
      pan(-0.15),
    )
    const { wm, source } = await captureWorkletSource(graph)
    let Processor: GeneratedProcessorConstructor | undefined
    const registerProcessor = vi.fn((_name: string, ctor: GeneratedProcessorConstructor) => {
      Processor = ctor
    })

    new Function('AudioWorkletProcessor', 'registerProcessor', 'sampleRate', source)(
      class {},
      registerProcessor,
      48_000,
    )

    expect(registerProcessor).toHaveBeenCalledTimes(1)
    expect(Processor).toBeDefined()
    const globalWithCodecs = globalThis as typeof globalThis & { Buffer?: unknown, atob?: unknown }
    const originalBuffer = globalWithCodecs.Buffer
    const originalAtob = globalWithCodecs.atob
    let processor: GeneratedProcessor
    try {
      globalWithCodecs.Buffer = undefined
      globalWithCodecs.atob = undefined
      processor = new Processor!({ processorOptions: wm.processorOptions })
    } finally {
      globalWithCodecs.Buffer = originalBuffer
      globalWithCodecs.atob = originalAtob
    }
    const parameters = Object.fromEntries(wm.params.map((handle) => [
      handle.audioParamName,
      new Float32Array([defaultFor(handle.node, handle.param)]),
    ])) as Record<string, Float32Array>
    const outputs = [[new Float32Array(128), new Float32Array(128)]]

    for (let block = 0; block < 4; block++) {
      expect(processor.process([], outputs, parameters)).toBe(true)
    }

    const automated = wm.params[0]
    if (!automated) throw new Error('expected generated worklet params')
    parameters[automated.audioParamName] = new Float32Array(128).fill(defaultFor(automated.node, automated.param))
    expect(processor.process([], outputs, parameters)).toBe(true)

    const rendered = [...outputs[0][0], ...outputs[0][1]]
    expect(rendered.every(Number.isFinite)).toBe(true)
    expect(rendered.some((value) => Math.abs(value) > 1e-6)).toBe(true)
  })
})

type GeneratedProcessor = {
  process(inputs: Float32Array[][], outputs: Float32Array[][], parameters: Record<string, Float32Array>): boolean
}

type GeneratedProcessorConstructor = new (options?: { processorOptions?: WorkletModule['processorOptions'] }) => GeneratedProcessor

async function captureWorkletSource(graph: Node): Promise<{ wm: WorkletModule, source: string }> {
  let moduleSource = ''
  vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
    void blob.text().then((source) => {
      moduleSource = source
    })
    return 'blob:stopcock-synth'
  })
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
  const wm = await compileWorklet(fakeAudioContext(), graph)

  await vi.waitFor(() => expect(moduleSource).toContain('registerProcessor'))
  return { wm, source: moduleSource }
}

function fakeAudioContext(): AudioContext & { audioWorklet: { addModule: ReturnType<typeof vi.fn> } } {
  return {
    audioWorklet: {
      addModule: vi.fn(() => Promise.resolve()),
    },
  } as unknown as AudioContext & { audioWorklet: { addModule: ReturnType<typeof vi.fn> } }
}
