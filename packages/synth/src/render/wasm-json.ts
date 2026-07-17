import { compile } from '../internal/graph'
import type { AnyParam, Node, RenderOptions, Trigger, WavetableBank } from '../types'
import { spaceEchoHeads } from './wasm-binary-node'
import { indexOf } from './wasm-binary-writer'
import { validateRenderInputs } from './render-inputs'

type SerializedNode = {
  kind: Node['kind']
  out: 1 | 2
  inputs: number[]
  mods: Array<{ param: AnyParam, source: number, depth: number, rate: 'audio' | 'control' }>
  fields: Record<string, unknown>
}

type RenderRequest = {
  sampleRate: number
  length: number
  root: number
  gateSec?: number
  velocity?: number
  triggerFreq?: number
  inputs: number[][]
  nodes: SerializedNode[]
}

export function serializeWasmJsonRenderRequest(
  node: Node,
  opts: RenderOptions,
  sampleRate: number,
  length: number,
  note?: Trigger,
): RenderRequest {
  const compiled = compile(node, 'offline')
  validateRenderInputs(compiled.inputNodes, opts.inputs, length)
  const indexes = new WeakMap<Node, number>()
  compiled.nodes.forEach((item, index) => indexes.set(item, index))
  return {
    sampleRate,
    length,
    root: indexOf(indexes, compiled.root),
    gateSec: note?.gateMs !== undefined ? Math.max(0, note.gateMs / 1000) : undefined,
    velocity: note?.velocity,
    inputs: opts.inputs?.map((input) => Array.from(input)) ?? [],
    nodes: compiled.nodes.map((item) => serializeNode(item, indexes)),
  }
}

function serializeNode(node: Node, indexes: WeakMap<Node, number>): SerializedNode {
  const inputs: number[] = []
  const fields: Record<string, unknown> = {}

  switch (node.kind) {
    case 'osc':
      Object.assign(fields, { wave: node.wave, freq: node.freq, detune: node.detune, phase: node.phase })
      break
    case 'wavetable':
      Object.assign(fields, { bank: serializeWavetable(node.bank), freq: node.freq, detune: node.detune, phase: node.phase, position: node.position })
      break
    case 'fm':
      Object.assign(fields, {
        freq: node.freq,
        detune: node.detune,
        index: node.index,
        operators: node.operators.map(serializeOperator),
        matrix: node.matrix,
      })
      break
    case 'noise':
      Object.assign(fields, { color: node.color, seed: node.seed })
      break
    case 'constant':
      fields.value = node.value
      break
    case 'buffer':
      Object.assign(fields, { samples: Array.from(node.samples), looped: node.loop, rate: node.rate })
      break
    case 'samplerInstrument':
      Object.assign(fields, {
        zones: node.zones.map(serializeSamplerZone),
        freq: node.freq,
        value: node.velocity ?? Number.NaN,
        attack: node.attack,
        release: node.release,
        amount: node.level,
      })
      break
    case 'lofiSampler':
      Object.assign(fields, {
        zones: node.zones.map(serializeSamplerZone),
        freq: node.freq,
        value: node.velocity ?? Number.NaN,
        attack: node.attack,
        release: node.release,
        amount: node.level,
        bits: node.bits,
        downsample: node.downsample,
        jitter: node.jitter,
        noise: node.noise,
        tone: node.tone,
        drive: node.drive,
        mix: node.mix,
      })
      break
    case 'acidBass':
      Object.assign(fields, {
        wave: node.wave,
        freq: node.freq,
        value: node.velocity ?? Number.NaN,
        cutoff: node.cutoff,
        resonance: node.resonance,
        envMod: node.envMod,
        decay: node.decay,
        accent: node.accent,
        slide: node.slide,
        drive: node.drive,
        level: node.level,
      })
      break
    case 'drumVoice':
      Object.assign(fields, {
        drumKind: node.drumKind,
        freq: node.freq,
        value: node.velocity ?? Number.NaN,
        decay: node.decay,
        tone: node.tone,
        snap: node.snap,
        noise: node.noise,
        drive: node.drive,
        level: node.level,
      })
      break
    case 'stringMachine':
      Object.assign(fields, {
        freq: node.freq,
        value: node.velocity ?? Number.NaN,
        detune: node.detune,
        attack: node.attack,
        release: node.release,
        tone: node.tone,
        depth: node.depth,
        modulation: node.modulation,
        width: node.width,
        level: node.level,
      })
      break
    case 'polySynth':
      Object.assign(fields, {
        freq: node.freq,
        value: node.velocity ?? Number.NaN,
        detune: node.detune,
        pulseWidth: node.pulseWidth,
        sub: node.sub,
        noise: node.noise,
        cutoff: node.cutoff,
        resonance: node.resonance,
        envMod: node.envMod,
        attack: node.attack,
        decay: node.decay,
        sustain: node.sustain,
        release: node.release,
        drive: node.drive,
        chorus: node.chorus,
        modulation: node.modulation,
        width: node.width,
        level: node.level,
      })
      break
    case 'input':
      fields.channel = node.channel
      break
    case 'gain':
      fields.amount = node.amount
      inputs.push(indexOf(indexes, node.input))
      break
    case 'pan':
      fields.position = node.position
      inputs.push(indexOf(indexes, node.input))
      break
    case 'mix':
      inputs.push(...node.inputs.map((input) => indexOf(indexes, input)))
      break
    case 'stereo':
      inputs.push(indexOf(indexes, node.left), indexOf(indexes, node.right))
      break
    case 'biquad':
      Object.assign(fields, { filter: node.filter, freq: node.freq, q: node.q, gainDb: node.gainDb })
      inputs.push(indexOf(indexes, node.input))
      break
    case 'stateVariableFilter':
      Object.assign(fields, {
        filter: node.mode,
        freq: node.freq,
        resonance: node.resonance,
        drive: node.drive,
        mix: node.mix,
      })
      inputs.push(indexOf(indexes, node.input))
      break
    case 'comb':
      Object.assign(fields, { delayMs: node.delayMs, feedback: node.feedback, damp: node.damp })
      inputs.push(indexOf(indexes, node.input))
      break
    case 'adsr':
      Object.assign(fields, { attack: node.attack, decay: node.decay, sustain: node.sustain, release: node.release })
      inputs.push(indexOf(indexes, node.input))
      break
    case 'ar':
      Object.assign(fields, { attack: node.attack, release: node.release })
      inputs.push(indexOf(indexes, node.input))
      break
    case 'exponential':
      fields.tau = node.tau
      inputs.push(indexOf(indexes, node.input))
      break
    case 'delay':
      Object.assign(fields, { delayMs: node.delayMs, feedback: node.feedback, mix: node.mix })
      inputs.push(indexOf(indexes, node.input))
      break
    case 'reverb':
      Object.assign(fields, { ir: Array.from(node.ir), mix: node.mix })
      inputs.push(indexOf(indexes, node.input))
      break
    case 'distortion':
      Object.assign(fields, { amount: node.amount, shape: node.shape })
      inputs.push(indexOf(indexes, node.input))
      break
    case 'chorus':
      Object.assign(fields, { rate: node.rate, depth: node.depth, mix: node.mix })
      inputs.push(indexOf(indexes, node.input))
      break
    case 'ensembleChorus':
      Object.assign(fields, {
        rate: node.rate,
        depth: node.depth,
        mix: node.mix,
        width: node.width,
        tone: node.tone,
        noise: node.noise,
      })
      inputs.push(indexOf(indexes, node.input))
      break
    case 'spaceEcho': {
      const heads = spaceEchoHeads(node.mode)
      Object.assign(fields, {
        timeMs: node.timeMs,
        feedback: node.feedback,
        mix: node.mix,
        reverbMix: node.reverbMix,
        wow: node.wow,
        flutter: node.flutter,
        tapeAge: node.tapeAge,
        drive: node.drive,
        head1: heads[0],
        head2: heads[1],
        head3: heads[2],
        headCount: heads.filter(Boolean).length,
      })
      inputs.push(indexOf(indexes, node.input))
      break
    }
    case 'tapeDelay':
      Object.assign(fields, {
        timeMs: node.timeMs,
        feedback: node.feedback,
        mix: node.mix,
        wow: node.wow,
        flutter: node.flutter,
        tapeAge: node.tapeAge,
        drive: node.drive,
        tone: node.tone,
        width: node.width,
      })
      inputs.push(indexOf(indexes, node.input))
      break
    case 'plateReverb':
      Object.assign(fields, {
        preDelayMs: node.preDelayMs,
        decay: node.decay,
        damping: node.damping,
        diffusion: node.diffusion,
        modulation: node.modulation,
        mix: node.mix,
        width: node.width,
      })
      inputs.push(indexOf(indexes, node.input))
      break
    case 'springReverb':
      Object.assign(fields, {
        decay: node.decay,
        damping: node.damping,
        tension: node.tension,
        drip: node.drip,
        mix: node.mix,
        width: node.width,
      })
      inputs.push(indexOf(indexes, node.input))
      break
    case 'nonlinearReverb':
      Object.assign(fields, {
        timeMs: node.timeMs,
        decay: node.decay,
        damping: node.damping,
        drive: node.drive,
        mix: node.mix,
        width: node.width,
      })
      inputs.push(indexOf(indexes, node.input))
      break
    case 'microPitch':
      Object.assign(fields, { detune: node.detune, width: node.width, delayMs: node.delayMs, mix: node.mix })
      inputs.push(indexOf(indexes, node.input))
      break
    case 'multiTapDelay':
      Object.assign(fields, {
        timeMs: node.timeMs,
        feedback: node.feedback,
        mix: node.mix,
        tone: node.tone,
        width: node.width,
        tapRatios: node.taps.map((tap) => tap.ratio),
        tapGains: node.taps.map((tap) => tap.gain),
        tapPans: node.taps.map((tap) => tap.pan),
      })
      inputs.push(indexOf(indexes, node.input))
      break
    case 'saturator':
      Object.assign(fields, { drive: node.drive, asymmetry: node.asymmetry, tone: node.tone, mix: node.mix, output: node.output })
      inputs.push(indexOf(indexes, node.input))
      break
    case 'wavefolder':
      Object.assign(fields, {
        drive: node.drive,
        depth: node.depth,
        asymmetry: node.asymmetry,
        tone: node.tone,
        mix: node.mix,
        output: node.output,
      })
      inputs.push(indexOf(indexes, node.input))
      break
    case 'degrade':
      Object.assign(fields, {
        bits: node.bits,
        downsample: node.downsample,
        jitter: node.jitter,
        noise: node.noise,
        tone: node.tone,
        mix: node.mix,
      })
      inputs.push(indexOf(indexes, node.input))
      break
    case 'tiltEq':
      Object.assign(fields, { freq: node.freq, gainDb: node.gainDb, mix: node.mix })
      inputs.push(indexOf(indexes, node.input))
      break
    case 'stereoSpread':
      Object.assign(fields, { width: node.width, delayMs: node.delayMs, mix: node.mix })
      inputs.push(indexOf(indexes, node.input))
      break
    case 'frequencyShifter':
      Object.assign(fields, { shiftHz: node.shiftHz, mix: node.mix })
      inputs.push(indexOf(indexes, node.input))
      break
    case 'rotarySpeaker':
      Object.assign(fields, {
        rate: node.rate,
        depth: node.depth,
        mix: node.mix,
        drive: node.drive,
        width: node.width,
        freq: node.freq,
      })
      inputs.push(indexOf(indexes, node.input))
      break
    case 'compressor':
      Object.assign(fields, { threshold: node.threshold, ratio: node.ratio, attack: node.attack, release: node.release, knee: node.knee })
      inputs.push(indexOf(indexes, node.input))
      break
    case 'bitcrush':
      Object.assign(fields, { bits: node.bits, downsample: node.downsample })
      inputs.push(indexOf(indexes, node.input))
      break
  }

  return {
    kind: node.kind,
    out: node.out,
    inputs,
    fields,
    mods: node.mods.map((edge) => ({
      param: edge.param,
      source: indexOf(indexes, edge.source),
      depth: edge.depth,
      rate: edge.rate,
    })),
  }
}

function serializeOperator(operator: Extract<Node, { kind: 'fm' }>['operators'][number]): Record<string, unknown> {
  const base = {
    kind: operator.kind,
    ratio: operator.ratio,
    detune: operator.detune,
    level: operator.level,
    feedback: operator.feedback,
    output: operator.output,
    phase: operator.phase,
  }
  if (operator.kind === 'polyblep') return { ...base, wave: operator.wave }
  if (operator.kind === 'wavetable') return { ...base, bank: serializeWavetable(operator.bank), position: operator.position }
  return base
}

function serializeWavetable(bank: WavetableBank): Record<string, unknown> {
  return {
    size: bank.size,
    frameCount: bank.frameCount,
    levels: bank.levels.map((level) => Array.from(level)),
    levelMaxHarmonics: Array.from(bank.levelMaxHarmonics),
  }
}

function serializeSamplerZone(zone: Extract<Node, { kind: 'samplerInstrument' }>['zones'][number]): Record<string, unknown> {
  return {
    samples: Array.from(zone.samples),
    sampleRate: zone.sampleRate,
    rootMidi: zone.rootMidi,
    keyLow: zone.keyLow,
    keyHigh: zone.keyHigh,
    velocityLow: zone.velocityLow,
    velocityHigh: zone.velocityHigh,
    looped: zone.loop,
    loopStart: zone.loopStart,
    loopEnd: zone.loopEnd,
    gain: zone.gain,
    pan: zone.pan,
  }
}
