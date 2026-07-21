import { pipe } from '@stopcock/fp'
import {
  cloneForTrigger,
  compileWorklet,
  constant,
  createWavetable,
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
  play,
  type DistortionShape,
  type FilterKind,
  type Node,
  type WebAudioHandle,
  type Waveform,
} from '@stopcock/synth'
import { DEFAULT_ARP_SETTINGS, type ArpSettings } from './arp'
import { fxCatalog, createSlot, type FxSlot } from './fx'

export type OscEngine = 'wavetable' | 'fm' | 'noise' | 'acid' | 'poly' | 'epiano'
export type FltEngine = 'ladder' | 'svf' | 'comb' | 'formant'
export type EnvEngine = 'adsr' | 'ar' | 'looping'
export type LfoEngine = 'sine' | 'tri' | 'sh' | 'square'
export type FltMode = 'lp' | 'hp' | 'bp' | 'notch'

export type RackState = {
  osc: {
    engine: OscEngine
    wave: Waveform | 'noise'
    tune: number
    fine: number
    level: number
    detune: number
  }
  flt: {
    engine: FltEngine
    mode: FltMode
    cutoff: number
    res: number
    drive: number
    key: number
    envAmt: number
  }
  env: {
    engine: EnvEngine
    atk: number
    dec: number
    sus: number
    rel: number
  }
  lfo: {
    engine: LfoEngine
    rate: number
    depth: number
    phase: number
  }
  routing: {
    'osc-flt': boolean
    'env-amp': boolean
    'env-flt': boolean
    'lfo-pitch': boolean
    'lfo-flt': boolean
    'lfo-amp': boolean
    master: boolean
  }
  arp: ArpSettings
  fx: FxSlot[]
}

export const defaultState = (): RackState => ({
  osc: { engine: 'wavetable', wave: 'saw', tune: 0, fine: 0, level: 0.78, detune: 0.2 },
  flt: { engine: 'ladder', mode: 'lp', cutoff: 2400, res: 0.38, drive: 0.18, key: 0.6, envAmt: 0 },
  env: { engine: 'adsr', atk: 0.012, dec: 0.36, sus: 0.58, rel: 0.42 },
  lfo: { engine: 'sine', rate: 1.2, depth: 0.4, phase: 0 },
  routing: {
    'osc-flt': true,
    'env-amp': true,
    'env-flt': false,
    'lfo-pitch': false,
    'lfo-flt': false,
    'lfo-amp': false,
    master: true,
  },
  arp: { ...DEFAULT_ARP_SETTINGS },
  fx: [createSlot('none'), createSlot('none'), createSlot('none'), createSlot('none')],
})

const glassWavetable = createWavetable({ partials: [1, 0.72, 0.38, 0.18, 0.08, 0.03] })

const lfoWaveform = (engine: LfoEngine): Waveform => {
  switch (engine) {
    case 'tri':
      return 'triangle'
    case 'square':
      return 'square'
    case 'sh':
      return 'square' // No S&H primitive; square is the closest stepped feel
    case 'sine':
    default:
      return 'sine'
  }
}

// Fresh LFO source per modulation edge. Three instances at identical rate/phase
// emit the same signal — cloning at compile-time would happen anyway.
const makeLfo = (state: RackState): Node =>
  oscillator(lfoWaveform(state.lfo.engine), state.lfo.rate, { phase: state.lfo.phase })

const oscLayers = (state: RackState): Node => {
  const { osc, routing, lfo } = state
  const baseFreq = 110
  const detuneCents = osc.fine + osc.tune * 100

  // LFO → pitch attaches to primitive oscillator and instrument nodes that
  // expose a 'detune' param. acid + noise are skipped (no such param).
  const pitchModOn = routing['lfo-pitch'] && lfo.depth > 0.001
  const pitchDepthCents = lfo.depth * 100
  const vibrato = (n: Node): Node =>
    pitchModOn ? modulate('detune', makeLfo(state), pitchDepthCents)(n) : n

  switch (osc.engine) {
    case 'noise':
      return pipe(noise('pink', { seed: 1138 }), gain(osc.level))

    case 'fm':
      return pipe(
        vibrato(
          fm({
            freq: baseFreq,
            index: 1.4 + osc.detune * 2.4,
            operators: [
              operator.sine({ ratio: 1, level: 1, output: 0 }),
              operator.polyblep('square', { ratio: 2, level: 0.46, output: 1 }),
              operator.sine({ ratio: 3, level: 0.2, output: 0.18 }),
            ],
            matrix: [
              [0, 1, 0],
              [0, 0, 0.4],
              [0, 0, 0],
            ],
          }),
        ),
        gain(osc.level),
      )

    case 'epiano': {
      // DX7-style E.Piano. The biquad cutoff is static in this codebase, so
      // we can't envelope the filter to make the tine decay faster than the
      // body — instead we layer two FM nodes with independent envelopes,
      // which is what the DX7 itself did with per-operator EGs.
      // osc.detune drives tine brightness (modulator feedback), since the
      // Detune knob has no natural meaning for an FM patch.
      const tineBrightness = Math.max(0, Math.min(1, osc.detune))
      const tine = envelope({ attack: 0.001, decay: 0.35, sustain: 0, release: 0.25 })(
        vibrato(
          fm({
            freq: baseFreq,
            index: 1,
            operators: [
              operator.sine({ ratio: 1, level: 1, output: 1 }),
              operator.sine({
                ratio: 14,
                level: 0.9,
                output: 0,
                feedback: 0.25 + tineBrightness * 0.5,
              }),
            ],
            matrix: [
              [0, 0],
              [1, 0],
            ],
          }),
        ),
      )
      const body = vibrato(
        fm({
          freq: baseFreq,
          index: 1,
          operators: [
            operator.sine({ ratio: 1, level: 1, output: 1 }),
            operator.sine({ ratio: 1, level: 0.35, output: 0 }),
          ],
          matrix: [
            [0, 0],
            [1, 0],
          ],
        }),
      )
      return pipe(mix([pipe(tine, gain(0.7)), pipe(body, gain(0.55))]), gain(osc.level))
    }

    case 'acid':
      return instrument.acidBass({
        wave: osc.wave === 'square' ? 'square' : 'saw',
        freq: baseFreq,
        cutoff: 1400,
        resonance: 0.6,
        envMod: 0.7,
        decay: 0.2,
        accent: 0.6,
        slide: 0.2,
        drive: 0.4,
        level: osc.level,
      })

    case 'poly':
      return vibrato(
        instrument.polySynth({
          freq: baseFreq,
          detune: osc.detune * 24,
          pulseWidth: 0.5,
          sub: 0.22,
          noise: 0.02,
          cutoff: 4200,
          resonance: 0.2,
          envMod: 0.3,
          attack: 0.008,
          decay: 0.22,
          sustain: 0.4,
          release: 0.4,
          drive: 0.1,
          chorus: 0.3,
          modulation: 0.18,
          width: 1,
          level: osc.level,
        }),
      )

    case 'wavetable':
    default: {
      const wave: Waveform = osc.wave === 'noise' ? 'saw' : (osc.wave as Waveform)
      const unisonStrength = osc.detune
      const layers: Node[] = [
        pipe(vibrato(oscillator(wave, baseFreq, { detune: detuneCents })), gain(osc.level)),
      ]
      if (unisonStrength > 0.05) {
        layers.push(
          pipe(
            vibrato(oscillator(wave, baseFreq, { detune: detuneCents + unisonStrength * 18 })),
            gain(osc.level * 0.55),
          ),
          pipe(
            vibrato(oscillator(wave, baseFreq, { detune: detuneCents - unisonStrength * 18 })),
            gain(osc.level * 0.55),
          ),
        )
      }
      if (osc.wave === 'noise') {
        layers.push(pipe(noise('pink', { seed: 1138 }), gain(osc.level * 0.3)))
      }
      // Wavetable component for character; placed at low mix so unison saw still dominates
      layers.push(
        pipe(
          vibrato(oscillator.wavetable(glassWavetable, baseFreq, { position: 0.3 })),
          gain(osc.level * 0.18),
        ),
      )
      return mix(layers)
    }
  }
}

const fltKind = (mode: FltMode): FilterKind => {
  switch (mode) {
    case 'hp':
      return 'highpass'
    case 'bp':
      return 'bandpass'
    case 'notch':
      return 'notch'
    case 'lp':
    default:
      return 'lowpass'
  }
}

const buildFilter = (state: RackState): ((node: Node) => Node) => {
  const { flt, env, routing } = state
  const cutoff = Math.max(40, Math.min(18_000, flt.cutoff))
  const q = 0.4 + flt.res * 10
  const kind = fltKind(flt.mode)
  // Per-note ADSR shaped as a control signal (0..1) driving the biquad cutoff
  // when ENV → FLT routing is on. Depth in Hz is scaled by envAmt so presets
  // can dial the sweep from "subtle pad" (small) to "Atlas pluck" (large).
  const envToFilt = routing['env-flt'] && flt.envAmt > 0.001
  const envDepthHz = flt.envAmt * 8000
  const envSource = envToFilt
    ? envelope({ attack: env.atk, decay: env.dec, sustain: env.sus, release: env.rel })(constant(1))
    : null
  const lfoToFilt = routing['lfo-flt'] && state.lfo.depth > 0.001
  const lfoFltDepthHz = state.lfo.depth * 3000
  return (node: Node): Node => {
    let next = node
    switch (kind) {
      case 'highpass':
        next = filter.highpass(cutoff, q)(next)
        break
      case 'bandpass':
        next = filter.bandpass(cutoff, q)(next)
        break
      case 'notch':
        next = filter.notch(cutoff, q)(next)
        break
      case 'lowpass':
      default:
        next = filter.lowpass(cutoff, q)(next)
    }
    if (envSource) next = modulate('freq', envSource, envDepthHz)(next)
    if (lfoToFilt) next = modulate('freq', makeLfo(state), lfoFltDepthHz)(next)
    if (flt.engine === 'comb') {
      next = filter.comb(28, 0.4, 0.5)(next)
    }
    if (flt.engine === 'formant') {
      next = filter.peak(820, 1.4, 6)(next)
      next = filter.peak(2200, 1.2, 4)(next)
    }
    if (flt.drive > 0.02) {
      const shape: DistortionShape = flt.engine === 'ladder' ? 'tanh' : 'softclip'
      next = effects.distortion(flt.drive, shape)(next)
    }
    return next
  }
}

const buildEnvelope = (state: RackState): ((node: Node) => Node) => {
  const { env } = state
  return (node: Node): Node =>
    envelope({
      attack: env.engine === 'ar' ? Math.min(env.atk, 0.05) : env.atk,
      decay: env.dec,
      sustain: env.engine === 'ar' ? 0 : env.sus,
      release: env.rel,
    })(node)
}

const buildVoiceGraph = (state: RackState): Node => {
  let g: Node = oscLayers(state)
  if (state.routing['osc-flt']) {
    g = buildFilter(state)(g)
  }
  if (state.routing['env-amp']) {
    g = buildEnvelope(state)(g)
  }
  // LFO → amp (tremolo). gain(1) sits in the path so the LFO has an 'amount'
  // to modulate; the FX-bus tanh wall catches any momentary peaks above unity.
  if (state.routing['lfo-amp'] && state.lfo.depth > 0.001) {
    g = modulate('amount', makeLfo(state), state.lfo.depth * 0.5)(gain(1)(g))
  }
  // Master output enable. Off = silent voice template (graph still compiles
  // so the patch bay toggle works at any point, including mid-note).
  if (!state.routing.master) g = gain(0)(g)
  return g
}

/**
 * Build the persistent FX bus graph. Starts with an external input so voice
 * audio can stream in via `connectInput(0, …)`. Ends with a compressor +
 * tanh wall so summed polyphony can't blow past 0 dBFS no matter what.
 */
const buildFxBusGraph = (state: RackState): Node => {
  const userChain = state.fx
    .filter((s) => s.enabled && s.kind !== 'none')
    .map((s) => fxCatalog[s.kind].build(s.params))
  const masterCompress = (node: Node): Node =>
    effects.compressor({
      threshold: -14,
      ratio: 6,
      attack: 0.005,
      release: 0.12,
      knee: 8,
    })(node)
  const masterWall = (node: Node): Node => effects.distortion(0.5, 'tanh')(node)
  return [...userChain, masterCompress, masterWall].reduce<Node>((acc, fn) => fn(acc), input(0))
}

export type EngineHandle = {
  ctx: AudioContext
  analyser: AnalyserNode
  scopeAnalyser: AnalyserNode
  /** Master bus — drums and other sources can `.connect()` here to share analysers + headroom. */
  masterBus: GainNode
  /** Recompile the per-note voice template (osc/filter/env/lfo changes). */
  rebuildVoice(state: RackState): Promise<void>
  /** Recompile the persistent FX bus worklet (state.fx changes). */
  rebuildFx(state: RackState): Promise<void>
  noteOn(midi: number, velocity?: number, gateMs?: number): void
  noteOff(midi: number): void
  stop(): void
  state: RackState
  destroy(): void
  /** Number of voice slots currently active (held + releasing). */
  voiceCount(): number
  /**
   * Cumulative audio worklet underrun count summed across all voice handles
   * plus the FX bus. Increments any time a worklet failed to compile or load
   * — a useful proxy for "something went audibly wrong".
   */
  underruns(): number
}

const MAX_VOICES = 8
const STOP_TAIL_MS = 200 // extra grace after the gain ramp before disconnecting

type VoiceEntry = {
  handle: WebAudioHandle
  gain: GainNode
  startedAt: number
  stopTimer: number
}

export async function createEngine(initial: RackState): Promise<EngineHandle> {
  const ctx = new AudioContext({ latencyHint: 'interactive' })
  await ctx.resume()

  // ── Master bus + analyser taps ─────────────────────────────
  // 0.45 leaves ~7 dB of headroom under digital full-scale; the FX-bus compressor
  // + tanh wall does the rest, so the worst case (8 voices at velocity 1) lands
  // comfortably below clipping.
  const masterGain = ctx.createGain()
  masterGain.gain.value = 0.45
  const analyser = ctx.createAnalyser()
  analyser.fftSize = 2048
  analyser.smoothingTimeConstant = 0.62
  const scopeAnalyser = ctx.createAnalyser()
  scopeAnalyser.fftSize = 1024
  scopeAnalyser.smoothingTimeConstant = 0
  masterGain.connect(analyser)
  masterGain.connect(scopeAnalyser)
  masterGain.connect(ctx.destination)

  // ── FX bus (one shared worklet, persistent across notes) ────
  const fxBusInput = ctx.createGain()
  fxBusInput.gain.value = 1
  let fxBusHandle: WebAudioHandle | null = null

  const installFxBus = async (state: RackState): Promise<void> => {
    const graph = buildFxBusGraph(state)
    await compileWorklet(ctx, graph)
    const previous = fxBusHandle
    fxBusHandle = play(ctx, graph, { destination: masterGain })
    fxBusHandle.connectInput(0, fxBusInput)
    // Brief overlap while the new worklet ramps in, then drop the old to avoid leak
    if (previous) setTimeout(() => previous.stop(), 60)
  }

  await installFxBus(initial)

  // ── Voice template (rebuilt on osc/filter/env/lfo changes) ─
  let currentState: RackState = initial
  let voiceTemplate: Node = buildVoiceGraph(initial)
  await compileWorklet(ctx, voiceTemplate)

  // ── Per-note voice registry ────────────────────────────────
  const voices = new Map<number, VoiceEntry>()
  let retiredUnderruns = 0 // underruns from handles that have been stopped

  /**
   * Hard-stop a voice and remove it from the registry. Idempotent: calling
   * twice is safe. Underrun count is rolled into the engine total before the
   * handle is dropped so it survives in the perf readout.
   */
  const hardStop = (entry: VoiceEntry): void => {
    clearTimeout(entry.stopTimer)
    retiredUnderruns += entry.handle.underruns
    try {
      entry.handle.stop()
    } catch {
      /* already stopped */
    }
    try {
      entry.gain.disconnect()
    } catch {
      /* already disconnected */
    }
  }

  /**
   * Ramp a voice's gain to silence over the patch's release time, then stop
   * the worklet. Cleans up the registry once disconnected.
   */
  const fadeAndStop = (midi: number, entry: VoiceEntry): void => {
    clearTimeout(entry.stopTimer)
    const releaseSec = Math.max(0.05, currentState.env.rel)
    const now = ctx.currentTime
    const param = entry.gain.gain
    param.cancelScheduledValues(now)
    param.setValueAtTime(param.value, now)
    param.linearRampToValueAtTime(0.0001, now + releaseSec)
    entry.stopTimer = window.setTimeout(
      () => {
        hardStop(entry)
      },
      releaseSec * 1000 + STOP_TAIL_MS,
    )
  }

  const stealOldest = (): void => {
    let oldest: { midi: number; entry: VoiceEntry } | null = null
    for (const [midi, entry] of voices) {
      if (!oldest || entry.startedAt < oldest.entry.startedAt) oldest = { midi, entry }
    }
    if (oldest) {
      voices.delete(oldest.midi)
      hardStop(oldest.entry)
    }
  }

  const noteOn = (midi: number, velocity = 0.85, gateMs?: number): void => {
    // Retrigger: if the same key is already down, stop the old voice first
    const existing = voices.get(midi)
    if (existing) {
      voices.delete(midi)
      hardStop(existing)
    }
    if (voices.size >= MAX_VOICES) stealOldest()

    // Per-voice gain stages low so summed polyphony stays in the linear range
    // of the master compressor. Voice header `velocity` is preserved as the
    // relative loudness between notes within the same patch.
    const PER_VOICE_TRIM = 0.28
    const voiceGain = ctx.createGain()
    voiceGain.gain.value = velocity * PER_VOICE_TRIM
    voiceGain.connect(fxBusInput)

    const triggered = cloneForTrigger(voiceTemplate, {
      midi,
      velocity,
      atSec: ctx.currentTime,
    })
    const handle = play(ctx, triggered, { destination: voiceGain })

    const entry: VoiceEntry = {
      handle,
      gain: voiceGain,
      startedAt: ctx.currentTime,
      stopTimer: 0,
    }
    voices.set(midi, entry)

    if (gateMs !== undefined && Number.isFinite(gateMs) && gateMs > 0) {
      entry.stopTimer = window.setTimeout(
        () => {
          if (voices.get(midi) !== entry) return
          voices.delete(midi)
          fadeAndStop(midi, entry)
        },
        Math.max(12, gateMs),
      )
    }
  }

  const noteOff = (midi: number): void => {
    const entry = voices.get(midi)
    if (!entry) return
    voices.delete(midi)
    fadeAndStop(midi, entry)
  }

  /**
   * Re-compile the voice template when osc/filter/env/lfo/routing changes.
   * New notes use the new template immediately; in-flight notes finish on
   * their old template — pragmatic since recompiling held voices would glitch.
   */
  const rebuildVoice = async (next: RackState): Promise<void> => {
    currentState = next
    voiceTemplate = buildVoiceGraph(next)
    await compileWorklet(ctx, voiceTemplate)
  }

  /**
   * Re-compile the persistent FX bus worklet when state.fx changes. Keeps the
   * voice template untouched.
   */
  const rebuildFx = async (next: RackState): Promise<void> => {
    currentState = next
    await installFxBus(next)
  }

  return {
    ctx,
    analyser,
    scopeAnalyser,
    masterBus: masterGain,
    rebuildVoice,
    rebuildFx,
    noteOn,
    noteOff,
    voiceCount: () => voices.size,
    underruns: () => {
      let sum = retiredUnderruns + (fxBusHandle?.underruns ?? 0)
      for (const entry of voices.values()) sum += entry.handle.underruns
      return sum
    },
    stop() {
      for (const entry of voices.values()) hardStop(entry)
      voices.clear()
    },
    destroy() {
      for (const entry of voices.values()) hardStop(entry)
      voices.clear()
      fxBusHandle?.stop()
      try {
        fxBusInput.disconnect()
      } catch {
        /* already disconnected */
      }
      void ctx.close()
    },
    get state() {
      return currentState
    },
  }
}
