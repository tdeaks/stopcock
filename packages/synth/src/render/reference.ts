import { biquad, convolve } from '@stopcock/signal'
import { DEFAULT_BLOCK_SIZE, DEFAULT_SAMPLE_RATE } from '../defaults'
import { defaultFor } from '../params'
import type { AnyParam, Node, RenderOptions, Samples, Trigger } from '../types'
import { cloneForTrigger, compile, SynthCompileError } from '../internal/graph'
import { clamp, mulberry32, safeFinite } from '../internal/util'
import {
  renderFmSample,
  samplePolyblep,
  sampleWavetable,
  TAU,
  wrapPhase,
} from '../internal/oscillator'
import { validateRenderInputs } from './render-inputs'

type Mono = Float32Array
type Stereo = [Float32Array, Float32Array]
type Rendered = Mono | Stereo

type RenderContext = {
  sampleRate: number
  length: number
  inputs?: ReadonlyArray<Float32Array>
  note?: Trigger
  rendered: WeakMap<Node, Rendered>
}

export function renderReference(node: Node, opts: RenderOptions): Samples {
  if (!Number.isFinite(opts.duration) || opts.duration < 0)
    throw new SynthCompileError('render duration must be a non-negative finite number')
  const sampleRate = opts.sampleRate ?? DEFAULT_SAMPLE_RATE
  if (!Number.isFinite(sampleRate) || sampleRate <= 0)
    throw new SynthCompileError('sampleRate must be a positive finite number')
  const length = Math.max(0, Math.floor(opts.duration * sampleRate))

  if (opts.triggers && opts.triggers.length > 0) {
    const compiled = compile(node, 'offline')
    validateRenderInputs(compiled.inputNodes, opts.inputs, length)
    const output: Rendered =
      compiled.root.out === 2
        ? [new Float32Array(length), new Float32Array(length)]
        : new Float32Array(length)
    const triggers = [...opts.triggers].sort((a, b) => a.atSec - b.atSec)

    for (const trigger of triggers) {
      const start = Math.max(0, Math.floor(trigger.atSec * sampleRate))
      if (start >= length) continue
      const localDuration = (length - start) / sampleRate
      const localInputs = opts.inputs?.map((input) => input.subarray(start, length))
      const voice = renderSingle(
        cloneForTrigger(node, trigger),
        {
          duration: localDuration,
          sampleRate,
          inputs: localInputs,
        },
        trigger,
      )
      addInto(output, voice, start)
    }
    return output
  }

  return renderSingle(node, opts)
}

function renderSingle(node: Node, opts: RenderOptions, note?: Trigger): Samples {
  const sampleRate = opts.sampleRate ?? DEFAULT_SAMPLE_RATE
  const length = Math.max(0, Math.floor(opts.duration * sampleRate))
  const compiled = compile(node, 'offline')
  validateRenderInputs(compiled.inputNodes, opts.inputs, length)
  const ctx: RenderContext = {
    sampleRate,
    length,
    inputs: opts.inputs,
    note,
    rendered: new WeakMap(),
  }

  for (const item of compiled.nodes) {
    ctx.rendered.set(item, renderNode(item, ctx))
  }

  const root = ctx.rendered.get(compiled.root)
  if (!root) throw new SynthCompileError('render failed to produce a root output')
  return root
}

function renderNode(node: Node, ctx: RenderContext): Rendered {
  switch (node.kind) {
    case 'osc':
      return renderOsc(node, ctx)
    case 'wavetable':
      return renderWavetable(node, ctx)
    case 'fm':
      return renderFm(node, ctx)
    case 'noise':
      return renderNoise(node, ctx)
    case 'constant':
      return renderConstant(node, ctx)
    case 'buffer':
      return renderBuffer(node, ctx)
    case 'samplerInstrument':
      throw new SynthCompileError('samplerInstrument is available through the WASM renderer')
    case 'lofiSampler':
      throw new SynthCompileError('lofiSampler is available through the WASM renderer')
    case 'acidBass':
      throw new SynthCompileError('acidBass is available through the WASM renderer')
    case 'drumVoice':
      throw new SynthCompileError('drumVoice is available through the WASM renderer')
    case 'stringMachine':
      throw new SynthCompileError('stringMachine is available through the WASM renderer')
    case 'polySynth':
      throw new SynthCompileError('polySynth is available through the WASM renderer')
    case 'input':
      return ctx.inputs?.[node.channel] ?? new Float32Array(ctx.length)
    case 'gain':
      return mapChannels(inputOf(node.input, ctx), (input, out) => {
        if (!hasParamMod(node, 'amount')) {
          const amount = safeFinite(node.amount)
          for (let i = 0; i < ctx.length; i++) out[i] = input[i] * amount
          return
        }
        for (let i = 0; i < ctx.length; i++)
          out[i] = input[i] * paramAt(node, 'amount', node.amount, i, ctx)
      })
    case 'pan':
      return renderPan(node, ctx)
    case 'mix':
      return renderMix(node, ctx)
    case 'stereo':
      return [
        monoOf(inputOf(node.left, ctx), ctx.length),
        monoOf(inputOf(node.right, ctx), ctx.length),
      ]
    case 'biquad':
      return renderBiquad(node, ctx)
    case 'stateVariableFilter':
      throw new SynthCompileError('stateVariableFilter is available through the WASM renderer')
    case 'comb':
      return renderComb(node, ctx)
    case 'adsr':
      return renderAdsr(node, ctx)
    case 'ar':
      return renderAr(node, ctx)
    case 'exponential':
      return mapChannels(inputOf(node.input, ctx), (input, out) => {
        for (let i = 0; i < ctx.length; i++) {
          const tau = Math.max(1e-6, paramAt(node, 'tau', node.tau, i, ctx))
          out[i] = input[i] * Math.exp(-(i / ctx.sampleRate) / tau)
        }
      })
    case 'delay':
      return renderDelay(node, ctx)
    case 'reverb':
      return renderReverb(node, ctx)
    case 'distortion':
      return renderDistortion(node, ctx)
    case 'chorus':
      return renderChorus(node, ctx)
    case 'ensembleChorus':
      throw new SynthCompileError('ensembleChorus is available through the WASM renderer')
    case 'spaceEcho':
      return renderSpaceEcho(node, ctx)
    case 'tapeDelay':
      throw new SynthCompileError('tapeDelay is available through the WASM renderer')
    case 'plateReverb':
      throw new SynthCompileError('plateReverb is available through the WASM renderer')
    case 'springReverb':
      throw new SynthCompileError('springReverb is available through the WASM renderer')
    case 'nonlinearReverb':
      throw new SynthCompileError('nonlinearReverb is available through the WASM renderer')
    case 'microPitch':
      throw new SynthCompileError('microPitch is available through the WASM renderer')
    case 'multiTapDelay':
      throw new SynthCompileError('multiTapDelay is available through the WASM renderer')
    case 'saturator':
      throw new SynthCompileError('saturator is available through the WASM renderer')
    case 'wavefolder':
      throw new SynthCompileError('wavefolder is available through the WASM renderer')
    case 'degrade':
      throw new SynthCompileError('degrade is available through the WASM renderer')
    case 'tiltEq':
      throw new SynthCompileError('tiltEq is available through the WASM renderer')
    case 'stereoSpread':
      throw new SynthCompileError('stereoSpread is available through the WASM renderer')
    case 'frequencyShifter':
      throw new SynthCompileError('frequencyShifter is available through the WASM renderer')
    case 'rotarySpeaker':
      throw new SynthCompileError('rotarySpeaker is available through the WASM renderer')
    case 'phaser':
      throw new SynthCompileError('phaser is available through the WASM renderer')
    case 'compressor':
      return renderCompressor(node, ctx)
    case 'bitcrush':
      return renderBitcrush(node, ctx)
  }
}

function renderOsc(node: Extract<Node, { kind: 'osc' }>, ctx: RenderContext): Mono {
  const out = new Float32Array(ctx.length)
  let phase = wrapPhase(node.phase / TAU)
  const triangleState = { value: 0 }
  if (!hasAnyMod(node)) {
    const adjusted = Math.max(0, safeFinite(node.freq)) * 2 ** (safeFinite(node.detune) / 1200)
    const step = adjusted / ctx.sampleRate
    for (let i = 0; i < ctx.length; i++) {
      out[i] = samplePolyblep(node.wave, phase, step, triangleState)
      phase = wrapPhase(phase + step)
    }
    return out
  }

  for (let i = 0; i < ctx.length; i++) {
    const freq = Math.max(0, paramAt(node, 'freq', node.freq, i, ctx))
    const detune = paramAt(node, 'detune', node.detune, i, ctx)
    const phaseOffset = (paramAt(node, 'phase', node.phase, i, ctx) - node.phase) / TAU
    const adjusted = freq * 2 ** (detune / 1200)
    const step = adjusted / ctx.sampleRate
    out[i] = samplePolyblep(node.wave, phase + phaseOffset, step, triangleState)
    phase = wrapPhase(phase + step)
  }
  return out
}

function renderWavetable(node: Extract<Node, { kind: 'wavetable' }>, ctx: RenderContext): Mono {
  const out = new Float32Array(ctx.length)
  let phase = wrapPhase(node.phase / TAU)
  for (let i = 0; i < ctx.length; i++) {
    const freq = Math.max(0, paramAt(node, 'freq', node.freq, i, ctx))
    const detune = paramAt(node, 'detune', node.detune, i, ctx)
    const phaseOffset = (paramAt(node, 'phase', node.phase, i, ctx) - node.phase) / TAU
    const position = paramAt(node, 'position', node.position, i, ctx)
    const adjusted = freq * 2 ** (detune / 1200)
    out[i] = sampleWavetable(node.bank, phase + phaseOffset, adjusted, ctx.sampleRate, position)
    phase = wrapPhase(phase + adjusted / ctx.sampleRate)
  }
  return out
}

function renderFm(node: Extract<Node, { kind: 'fm' }>, ctx: RenderContext): Mono {
  const out = new Float32Array(ctx.length)
  const phase = new Float64Array(6)
  const previous = new Float64Array(6)
  const current = new Float64Array(6)
  const triangle = new Float64Array(6)
  for (let op = 0; op < 6; op++) phase[op] = wrapPhase(node.operators[op].phase / TAU)
  for (let i = 0; i < ctx.length; i++) {
    out[i] = renderFmSample(
      node,
      ctx.sampleRate,
      i,
      phase,
      previous,
      current,
      triangle,
      (param, base, sample) => paramAt(node, param as AnyParam, base, sample, ctx),
    )
  }
  return out
}

function renderNoise(node: Extract<Node, { kind: 'noise' }>, ctx: RenderContext): Mono {
  const out = new Float32Array(ctx.length)
  const rand = mulberry32(node.seed)
  let pink0 = 0
  let pink1 = 0
  let pink2 = 0
  let brown = 0
  for (let i = 0; i < ctx.length; i++) {
    const white = rand() * 2 - 1
    if (node.color === 'white') {
      out[i] = white
    } else if (node.color === 'pink') {
      pink0 = 0.99765 * pink0 + white * 0.099046
      pink1 = 0.963 * pink1 + white * 0.2965164
      pink2 = 0.57 * pink2 + white * 1.0526913
      out[i] = clamp((pink0 + pink1 + pink2 + white * 0.1848) * 0.14, -1, 1)
    } else {
      brown = clamp((brown + 0.02 * white) / 1.02, -1, 1)
      out[i] = brown * 3.5
    }
  }
  return out
}

function renderConstant(node: Extract<Node, { kind: 'constant' }>, ctx: RenderContext): Mono {
  const out = new Float32Array(ctx.length)
  for (let i = 0; i < ctx.length; i++) out[i] = paramAt(node, 'value', node.value, i, ctx)
  return out
}

function renderBuffer(node: Extract<Node, { kind: 'buffer' }>, ctx: RenderContext): Mono {
  const out = new Float32Array(ctx.length)
  if (node.samples.length === 0) return out
  const rate = Number.isFinite(node.rate) ? node.rate : 0
  for (let i = 0; i < ctx.length; i++) {
    const sourceIndex = i * rate
    if (node.loop) {
      out[i] = sampleLinear(node.samples, sourceIndex % node.samples.length)
    } else if (sourceIndex < node.samples.length) {
      out[i] = sampleLinear(node.samples, sourceIndex)
    }
  }
  return out
}

function renderPan(node: Extract<Node, { kind: 'pan' }>, ctx: RenderContext): Stereo {
  const mono = monoOf(inputOf(node.input, ctx), ctx.length)
  const left = new Float32Array(ctx.length)
  const right = new Float32Array(ctx.length)
  if (!hasParamMod(node, 'position')) {
    const position = clamp(safeFinite(node.position), -1, 1)
    const angle = ((position + 1) * Math.PI) / 4
    const leftGain = Math.cos(angle)
    const rightGain = Math.sin(angle)
    for (let i = 0; i < ctx.length; i++) {
      left[i] = mono[i] * leftGain
      right[i] = mono[i] * rightGain
    }
    return [left, right]
  }

  for (let i = 0; i < ctx.length; i++) {
    const position = clamp(paramAt(node, 'position', node.position, i, ctx), -1, 1)
    const angle = ((position + 1) * Math.PI) / 4
    left[i] = mono[i] * Math.cos(angle)
    right[i] = mono[i] * Math.sin(angle)
  }
  return [left, right]
}

function renderMix(node: Extract<Node, { kind: 'mix' }>, ctx: RenderContext): Rendered {
  if (node.out === 2) {
    const left = new Float32Array(ctx.length)
    const right = new Float32Array(ctx.length)
    for (const input of node.inputs) addChannels([left, right], inputOf(input, ctx))
    return [left, right]
  }
  const out = new Float32Array(ctx.length)
  for (const input of node.inputs) {
    const mono = monoOf(inputOf(input, ctx), ctx.length)
    for (let i = 0; i < ctx.length; i++) out[i] += mono[i]
  }
  return out
}

function renderBiquad(node: Extract<Node, { kind: 'biquad' }>, ctx: RenderContext): Rendered {
  return mapChannels(inputOf(node.input, ctx), (input, out) => {
    let x1 = 0
    let x2 = 0
    let y1 = 0
    let y2 = 0
    const staticParams =
      !hasParamMod(node, 'freq') && !hasParamMod(node, 'q') && !hasParamMod(node, 'gainDb')
    if (staticParams) {
      let coeffs: ReturnType<typeof biquad.design>
      try {
        coeffs = biquad.design({
          kind: node.filter,
          freq: clamp(node.freq, 1e-6, ctx.sampleRate / 2 - 1e-6),
          q: Math.max(1e-6, node.q),
          gainDb: node.gainDb,
          sampleRate: ctx.sampleRate,
        })
      } catch {
        return
      }
      const [b0, b1, b2, a1, a2] = coeffs
      for (let i = 0; i < ctx.length; i++) {
        const x0 = input[i]
        const y0 = b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2
        out[i] = safeFinite(y0)
        x2 = x1
        x1 = x0
        y2 = y1
        y1 = out[i]
      }
      return
    }

    for (let i = 0; i < ctx.length; i++) {
      const freq = clamp(paramAt(node, 'freq', node.freq, i, ctx), 1e-6, ctx.sampleRate / 2 - 1e-6)
      const q = Math.max(1e-6, paramAt(node, 'q', node.q, i, ctx))
      const gainDb = paramAt(node, 'gainDb', node.gainDb, i, ctx)
      let coeffs: ReturnType<typeof biquad.design>
      try {
        coeffs = biquad.design({ kind: node.filter, freq, q, gainDb, sampleRate: ctx.sampleRate })
      } catch {
        out[i] = 0
        continue
      }
      const [b0, b1, b2, a1, a2] = coeffs
      const x0 = input[i]
      const y0 = b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2
      out[i] = safeFinite(y0)
      x2 = x1
      x1 = x0
      y2 = y1
      y1 = out[i]
    }
  })
}

function hasParamMod(node: Node, param: AnyParam): boolean {
  for (const edge of node.mods) {
    if (edge.param === param) return true
  }
  return false
}

function hasAnyMod(node: Node): boolean {
  return node.mods.length > 0
}

function renderComb(node: Extract<Node, { kind: 'comb' }>, ctx: RenderContext): Rendered {
  return mapChannels(inputOf(node.input, ctx), (input, out) => {
    const maxDelay = Math.max(1, Math.ceil(ctx.sampleRate * 2))
    const delayLine = new Float32Array(maxDelay)
    let write = 0
    let dampState = 0
    for (let i = 0; i < ctx.length; i++) {
      const delaySamples = clamp(
        Math.round((paramAt(node, 'delayMs', node.delayMs, i, ctx) * ctx.sampleRate) / 1000),
        1,
        maxDelay - 1,
      )
      const feedback = clamp(paramAt(node, 'feedback', node.feedback, i, ctx), -0.999, 0.999)
      const damp = clamp(paramAt(node, 'damp', node.damp, i, ctx), 0, 1)
      const read = (write - delaySamples + maxDelay) % maxDelay
      dampState = delayLine[read] * (1 - damp) + dampState * damp
      out[i] = input[i] + dampState
      delayLine[write] = input[i] + dampState * feedback
      write = (write + 1) % maxDelay
    }
  })
}

function renderAdsr(node: Extract<Node, { kind: 'adsr' }>, ctx: RenderContext): Rendered {
  return mapChannels(inputOf(node.input, ctx), (input, out) => {
    const gateSec =
      ctx.note?.gateMs !== undefined
        ? Math.max(0, ctx.note.gateMs / 1000)
        : ctx.length / ctx.sampleRate
    const velocity = ctx.note?.velocity ?? 1
    if (!hasAnyMod(node)) {
      const opts = {
        attack: Math.max(0, safeFinite(node.attack)),
        decay: Math.max(0, safeFinite(node.decay)),
        sustain: clamp(safeFinite(node.sustain), 0, 1),
        release: Math.max(0, safeFinite(node.release)),
      }
      for (let i = 0; i < ctx.length; i++) {
        out[i] = input[i] * adsrAt(i / ctx.sampleRate, gateSec, opts) * velocity
      }
      return
    }

    for (let i = 0; i < ctx.length; i++) {
      const t = i / ctx.sampleRate
      const amp = adsrAt(t, gateSec, {
        attack: Math.max(0, paramAt(node, 'attack', node.attack, i, ctx)),
        decay: Math.max(0, paramAt(node, 'decay', node.decay, i, ctx)),
        sustain: clamp(paramAt(node, 'sustain', node.sustain, i, ctx), 0, 1),
        release: Math.max(0, paramAt(node, 'release', node.release, i, ctx)),
      })
      out[i] = input[i] * amp * velocity
    }
  })
}

function renderAr(node: Extract<Node, { kind: 'ar' }>, ctx: RenderContext): Rendered {
  return mapChannels(inputOf(node.input, ctx), (input, out) => {
    for (let i = 0; i < ctx.length; i++) {
      const t = i / ctx.sampleRate
      const gateSec =
        ctx.note?.gateMs !== undefined
          ? Math.max(0, ctx.note.gateMs / 1000)
          : ctx.length / ctx.sampleRate
      const amp = arAt(t, gateSec, {
        attack: Math.max(0, paramAt(node, 'attack', node.attack, i, ctx)),
        release: Math.max(0, paramAt(node, 'release', node.release, i, ctx)),
      })
      out[i] = input[i] * amp * (ctx.note?.velocity ?? 1)
    }
  })
}

function renderDelay(node: Extract<Node, { kind: 'delay' }>, ctx: RenderContext): Rendered {
  return mapChannels(inputOf(node.input, ctx), (input, out) => {
    const maxDelay = Math.max(1, Math.ceil(ctx.sampleRate * 5))
    const delayLine = new Float32Array(maxDelay)
    let write = 0
    if (!hasAnyMod(node)) {
      const delaySamples = clamp(
        Math.round((safeFinite(node.delayMs) * ctx.sampleRate) / 1000),
        1,
        maxDelay - 1,
      )
      const feedback = clamp(safeFinite(node.feedback), -0.999, 0.999)
      const mix = clamp(safeFinite(node.mix), 0, 1)
      const dry = 1 - mix
      for (let i = 0; i < ctx.length; i++) {
        const read = (write - delaySamples + maxDelay) % maxDelay
        const wet = delayLine[read]
        out[i] = input[i] * dry + wet * mix
        delayLine[write] = input[i] + wet * feedback
        write = (write + 1) % maxDelay
      }
      return
    }

    for (let i = 0; i < ctx.length; i++) {
      const delaySamples = clamp(
        Math.round((paramAt(node, 'delayMs', node.delayMs, i, ctx) * ctx.sampleRate) / 1000),
        1,
        maxDelay - 1,
      )
      const feedback = clamp(paramAt(node, 'feedback', node.feedback, i, ctx), -0.999, 0.999)
      const mix = clamp(paramAt(node, 'mix', node.mix, i, ctx), 0, 1)
      const read = (write - delaySamples + maxDelay) % maxDelay
      const wet = delayLine[read]
      out[i] = input[i] * (1 - mix) + wet * mix
      delayLine[write] = input[i] + wet * feedback
      write = (write + 1) % maxDelay
    }
  })
}

function renderReverb(node: Extract<Node, { kind: 'reverb' }>, ctx: RenderContext): Rendered {
  return mapChannels(inputOf(node.input, ctx), (input, out) => {
    if (node.ir.length === 0) {
      out.set(input)
      return
    }
    const wetFull = convolve.direct(input, node.ir)
    for (let i = 0; i < ctx.length; i++) {
      const mix = clamp(paramAt(node, 'mix', node.mix, i, ctx), 0, 1)
      out[i] = input[i] * (1 - mix) + (wetFull[i] ?? 0) * mix
    }
  })
}

function renderDistortion(
  node: Extract<Node, { kind: 'distortion' }>,
  ctx: RenderContext,
): Rendered {
  return mapChannels(inputOf(node.input, ctx), (input, out) => {
    if (!hasParamMod(node, 'amount')) {
      const drive = 1 + Math.max(0, safeFinite(node.amount)) * 24
      if (node.shape === 'hardclip') {
        for (let i = 0; i < ctx.length; i++) out[i] = clamp(input[i] * drive, -1, 1)
      } else if (node.shape === 'softclip') {
        for (let i = 0; i < ctx.length; i++) {
          const x = input[i] * drive
          out[i] = x / (1 + Math.abs(x))
        }
      } else {
        for (let i = 0; i < ctx.length; i++) out[i] = Math.tanh(input[i] * drive)
      }
      return
    }

    for (let i = 0; i < ctx.length; i++) {
      const amount = Math.max(0, paramAt(node, 'amount', node.amount, i, ctx))
      const drive = 1 + amount * 24
      const x = input[i] * drive
      if (node.shape === 'hardclip') out[i] = clamp(x, -1, 1)
      else if (node.shape === 'softclip') out[i] = x / (1 + Math.abs(x))
      else out[i] = Math.tanh(x)
    }
  })
}

function renderChorus(node: Extract<Node, { kind: 'chorus' }>, ctx: RenderContext): Rendered {
  return mapChannels(inputOf(node.input, ctx), (input, out) => {
    const maxDelay = Math.max(1, Math.ceil(ctx.sampleRate * 0.1))
    const delayLine = new Float32Array(maxDelay)
    let write = 0
    if (!hasAnyMod(node)) {
      const rate = Math.max(0, safeFinite(node.rate))
      const depth = Math.max(0, safeFinite(node.depth))
      const mix = clamp(safeFinite(node.mix), 0, 1)
      const dry = 1 - mix
      for (let i = 0; i < ctx.length; i++) {
        const t = i / ctx.sampleRate
        const delayMs = 8 + depth * (0.5 + 0.5 * Math.sin(2 * Math.PI * rate * t))
        const delaySamples = clamp(Math.round((delayMs * ctx.sampleRate) / 1000), 1, maxDelay - 1)
        const read = (write - delaySamples + maxDelay) % maxDelay
        const wet = delayLine[read]
        out[i] = input[i] * dry + wet * mix
        delayLine[write] = input[i]
        write = (write + 1) % maxDelay
      }
      return
    }

    for (let i = 0; i < ctx.length; i++) {
      const t = i / ctx.sampleRate
      const rate = Math.max(0, paramAt(node, 'rate', node.rate, i, ctx))
      const depth = Math.max(0, paramAt(node, 'depth', node.depth, i, ctx))
      const mix = clamp(paramAt(node, 'mix', node.mix, i, ctx), 0, 1)
      const delayMs = 8 + depth * (0.5 + 0.5 * Math.sin(2 * Math.PI * rate * t))
      const delaySamples = clamp(Math.round((delayMs * ctx.sampleRate) / 1000), 1, maxDelay - 1)
      const read = (write - delaySamples + maxDelay) % maxDelay
      const wet = delayLine[read]
      out[i] = input[i] * (1 - mix) + wet * mix
      delayLine[write] = input[i]
      write = (write + 1) % maxDelay
    }
  })
}

function renderSpaceEcho(node: Extract<Node, { kind: 'spaceEcho' }>, ctx: RenderContext): Rendered {
  const input = inputOf(node.input, ctx)
  const inputL = Array.isArray(input) ? input[0] : input
  const inputR = Array.isArray(input) ? input[1] : input
  const left = new Float32Array(ctx.length)
  const right = new Float32Array(ctx.length)
  const maxDelay = Math.max(1, Math.ceil(ctx.sampleRate * 5))
  const delayL = new Float32Array(maxDelay)
  const delayR = new Float32Array(maxDelay)
  const springLength = Math.max(1, Math.ceil(ctx.sampleRate * 0.09))
  const springL = new Float32Array(springLength)
  const springR = new Float32Array(springLength)
  const springTapL = Math.max(1, Math.min(springLength - 1, Math.round(ctx.sampleRate * 0.029)))
  const springTapR = Math.max(1, Math.min(springLength - 1, Math.round(ctx.sampleRate * 0.041)))
  const headCount = spaceEchoHeadCount(node.mode)
  let write = 0
  let springWrite = 0
  let toneL = 0
  let toneR = 0
  let tone2L = 0
  let tone2R = 0
  let dcL = 0
  let dcR = 0
  let bumpL = 0
  let bumpR = 0

  for (let i = 0; i < ctx.length; i++) {
    const t = i / ctx.sampleRate
    const timeMs = clamp(paramAt(node, 'timeMs', node.timeMs, i, ctx), 20, 1500)
    const feedback = clamp(paramAt(node, 'feedback', node.feedback, i, ctx), 0, 0.97)
    const mix = clamp(paramAt(node, 'mix', node.mix, i, ctx), 0, 1)
    const reverbMix = clamp(paramAt(node, 'reverbMix', node.reverbMix, i, ctx), 0, 0.7)
    const wow = clamp(paramAt(node, 'wow', node.wow, i, ctx), 0, 1)
    const flutter = clamp(paramAt(node, 'flutter', node.flutter, i, ctx), 0, 1)
    const tapeAge = clamp(paramAt(node, 'tapeAge', node.tapeAge, i, ctx), 0, 1)
    const drive = Math.max(0, paramAt(node, 'drive', node.drive, i, ctx))
    const modulation =
      1 +
      Math.sin(2 * Math.PI * 0.55 * t) * wow * 0.013 +
      Math.sin(2 * Math.PI * 0.13 * t + 1.1) * wow * 0.006 +
      Math.sin(2 * Math.PI * 7.8 * t + 1.7) * flutter * 0.0035
    const baseDelay = ((timeMs * ctx.sampleRate) / 1000) * modulation
    const headGain = 0.88 / headCount
    let wetL = 0
    let wetR = 0

    if (spaceEchoHasHead(node.mode, 1)) {
      const tap =
        (readDelayLine(delayL, write, baseDelay) + readDelayLine(delayR, write, baseDelay)) * 0.5
      wetL += tap * 0.94 * headGain
      wetR += tap * 0.42 * headGain
    }
    if (spaceEchoHasHead(node.mode, 2)) {
      const tap =
        (readDelayLine(delayL, write, baseDelay * 1.5) +
          readDelayLine(delayR, write, baseDelay * 1.5)) *
        0.5
      wetL += tap * 0.68 * headGain
      wetR += tap * 0.68 * headGain
    }
    if (spaceEchoHasHead(node.mode, 3)) {
      const tap =
        (readDelayLine(delayL, write, baseDelay * 2) +
          readDelayLine(delayR, write, baseDelay * 2)) *
        0.5
      wetL += tap * 0.42 * headGain
      wetR += tap * 0.94 * headGain
    }

    const springReadL = springL[(springWrite - springTapL + springLength) % springLength]
    const springReadR = springR[(springWrite - springTapR + springLength) % springLength]
    const springWetL = springReadL * 0.72 + springReadR * 0.28
    const springWetR = springReadR * 0.72 + springReadL * 0.28
    const springInL = (wetL + inputL[i] * 0.18 + springWetR * 0.32) * 0.55
    const springInR = (wetR + inputR[i] * 0.18 + springWetL * 0.32) * 0.55
    springL[springWrite] = tapeSaturate(springInL, 0.08 + drive * 0.25)
    springR[springWrite] = tapeSaturate(springInR, 0.08 + drive * 0.25)
    springWrite = (springWrite + 1) % springLength

    const lpCoeff = 0.18 + tapeAge * 0.62
    const dcCoeff = 0.002 + tapeAge * 0.006
    const preToneL = wetL + springWetL * 0.18
    const preToneR = wetR + springWetR * 0.18
    toneL = preToneL * (1 - lpCoeff) + toneL * lpCoeff
    toneR = preToneR * (1 - lpCoeff) + toneR * lpCoeff
    tone2L = toneL * (1 - lpCoeff) + tone2L * lpCoeff
    tone2R = toneR * (1 - lpCoeff) + tone2R * lpCoeff
    dcL += (tone2L - dcL) * dcCoeff
    dcR += (tone2R - dcR) * dcCoeff
    const bias = 0.12 + drive * 0.18
    const satDrive = drive + tapeAge * 0.22
    const feedbackL = asymmetricTanh(tone2L - dcL, satDrive, bias)
    const feedbackR = asymmetricTanh(tone2R - dcR, satDrive, -bias)
    const inputDrive = 0.04 + drive * 0.5
    delayL[write] = tapeSaturate(inputL[i], inputDrive) + feedbackL * feedback
    delayR[write] = tapeSaturate(inputR[i], inputDrive) + feedbackR * feedback
    write = (write + 1) % maxDelay

    const bumpCoeff = 0.984
    bumpL = wetL * (1 - bumpCoeff) + bumpL * bumpCoeff
    bumpR = wetR * (1 - bumpCoeff) + bumpR * bumpCoeff
    const bumpedL = wetL + bumpL * 0.42
    const bumpedR = wetR + bumpR * 0.42

    left[i] = inputL[i] * (1 - mix) + bumpedL * mix + springWetL * reverbMix
    right[i] = inputR[i] * (1 - mix) + bumpedR * mix + springWetR * reverbMix
  }

  return [left, right]
}

function renderCompressor(
  node: Extract<Node, { kind: 'compressor' }>,
  ctx: RenderContext,
): Rendered {
  return mapChannels(inputOf(node.input, ctx), (input, out) => {
    let env = 0
    if (!hasAnyMod(node)) {
      const threshold = safeFinite(node.threshold)
      const ratio = Math.max(1, safeFinite(node.ratio, 1))
      const attackCoeff = Math.exp(
        -1 / (Math.max(1e-6, safeFinite(node.attack, 1e-6)) * ctx.sampleRate),
      )
      const releaseCoeff = Math.exp(
        -1 / (Math.max(1e-6, safeFinite(node.release, 1e-6)) * ctx.sampleRate),
      )
      const knee = Math.max(0, safeFinite(node.knee))
      for (let i = 0; i < ctx.length; i++) {
        const x = input[i]
        const level = Math.abs(x)
        const coeff = level > env ? attackCoeff : releaseCoeff
        env = coeff * env + (1 - coeff) * level
        const db = 20 * Math.log10(Math.max(env, 1e-9))
        const over = softKnee(db - threshold, knee)
        const gainDb = over > 0 ? -(over - over / ratio) : 0
        out[i] = x * 10 ** (gainDb / 20)
      }
      return
    }

    for (let i = 0; i < ctx.length; i++) {
      const threshold = paramAt(node, 'threshold', node.threshold, i, ctx)
      const ratio = Math.max(1, paramAt(node, 'ratio', node.ratio, i, ctx))
      const attack = Math.max(1e-6, paramAt(node, 'attack', node.attack, i, ctx))
      const release = Math.max(1e-6, paramAt(node, 'release', node.release, i, ctx))
      const knee = Math.max(0, paramAt(node, 'knee', node.knee, i, ctx))
      const x = input[i]
      const level = Math.abs(x)
      const coeff =
        level > env
          ? Math.exp(-1 / (attack * ctx.sampleRate))
          : Math.exp(-1 / (release * ctx.sampleRate))
      env = coeff * env + (1 - coeff) * level
      const db = 20 * Math.log10(Math.max(env, 1e-9))
      const over = softKnee(db - threshold, knee)
      const gainDb = over > 0 ? -(over - over / ratio) : 0
      out[i] = x * 10 ** (gainDb / 20)
    }
  })
}

function renderBitcrush(node: Extract<Node, { kind: 'bitcrush' }>, ctx: RenderContext): Rendered {
  return mapChannels(inputOf(node.input, ctx), (input, out) => {
    let held = 0
    let countdown = 0
    for (let i = 0; i < ctx.length; i++) {
      const bits = clamp(Math.round(paramAt(node, 'bits', node.bits, i, ctx)), 1, 24)
      const downsample = Math.max(
        1,
        Math.round(paramAt(node, 'downsample', node.downsample, i, ctx)),
      )
      if (countdown <= 0) {
        const levels = 2 ** bits
        held = Math.round(clamp(input[i], -1, 1) * (levels / 2 - 1)) / (levels / 2 - 1)
        countdown = downsample
      }
      out[i] = held
      countdown--
    }
  })
}

function readDelayLine(line: Float32Array, write: number, delaySamples: number): number {
  const length = line.length
  let read = write - clamp(delaySamples, 1, length - 1)
  while (read < 0) read += length
  while (read >= length) read -= length
  const i0 = Math.floor(read)
  const i1 = (i0 + 1) % length
  const frac = read - i0
  return line[i0] * (1 - frac) + line[i1] * frac
}

function tapeSaturate(value: number, drive: number): number {
  const amount = 1 + Math.max(0, safeFinite(drive)) * 8
  return Math.tanh(value * amount) / amount
}

function asymmetricTanh(value: number, drive: number, bias: number): number {
  const driven = value * (1 + Math.max(0, safeFinite(drive)) * 8)
  const offset = Math.tanh(safeFinite(bias))
  return (Math.tanh(driven + safeFinite(bias)) - offset) / Math.max(1e-6, 1 - Math.abs(offset))
}

function spaceEchoHeadCount(mode: Extract<Node, { kind: 'spaceEcho' }>['mode']): number {
  return (
    (spaceEchoHasHead(mode, 1) ? 1 : 0) +
    (spaceEchoHasHead(mode, 2) ? 1 : 0) +
    (spaceEchoHasHead(mode, 3) ? 1 : 0)
  )
}

function spaceEchoHasHead(
  mode: Extract<Node, { kind: 'spaceEcho' }>['mode'],
  head: 1 | 2 | 3,
): boolean {
  return (
    mode === 'heads-1-2-3' ||
    (head === 1 && (mode === 'head-1' || mode === 'heads-1-2' || mode === 'heads-1-3')) ||
    (head === 2 && (mode === 'head-2' || mode === 'heads-1-2' || mode === 'heads-2-3')) ||
    (head === 3 && (mode === 'head-3' || mode === 'heads-1-3' || mode === 'heads-2-3'))
  )
}

function paramAt(
  node: Node,
  param: AnyParam,
  base: number,
  sample: number,
  ctx: RenderContext,
): number {
  let value = base
  for (const edge of node.mods) {
    if (edge.param !== param) continue
    const source = ctx.rendered.get(edge.source)
    if (!source) continue
    const index =
      edge.rate === 'control'
        ? Math.min(ctx.length - 1, Math.floor(sample / DEFAULT_BLOCK_SIZE) * DEFAULT_BLOCK_SIZE)
        : sample
    value += monoSample(source, index) * edge.depth
  }
  return Number.isFinite(value) ? value : safeFinite(base)
}

function inputOf(node: Node, ctx: RenderContext): Rendered {
  const rendered = ctx.rendered.get(node)
  if (!rendered) throw new SynthCompileError(`Input for ${node.kind} has not been rendered`)
  return rendered
}

function mapChannels(input: Rendered, fn: (input: Mono, out: Mono) => void): Rendered {
  if (Array.isArray(input)) {
    const left = new Float32Array(input[0].length)
    const right = new Float32Array(input[1].length)
    fn(input[0], left)
    fn(input[1], right)
    return [left, right]
  }
  const out = new Float32Array(input.length)
  fn(input, out)
  return out
}

function monoOf(input: Rendered, length: number): Mono {
  if (!Array.isArray(input)) return input
  const out = new Float32Array(length)
  for (let i = 0; i < length; i++) out[i] = (input[0][i] + input[1][i]) * 0.5
  return out
}

function monoSample(input: Rendered, index: number): number {
  if (Array.isArray(input)) return (input[0][index] + input[1][index]) * 0.5
  return input[index]
}

function addInto(target: Rendered, source: Rendered, offset: number): void {
  if (Array.isArray(target)) {
    addChannelsAt(target, source, offset)
  } else {
    const mono = Array.isArray(source) ? monoOf(source, source[0].length) : source
    for (let i = 0; i < mono.length && i + offset < target.length; i++)
      target[i + offset] += mono[i]
  }
}

function addChannels(target: Stereo, source: Rendered): void {
  addChannelsAt(target, source, 0)
}

function addChannelsAt(target: Stereo, source: Rendered, offset: number): void {
  if (Array.isArray(source)) {
    for (let i = 0; i < source[0].length && i + offset < target[0].length; i++) {
      target[0][i + offset] += source[0][i]
      target[1][i + offset] += source[1][i]
    }
  } else {
    for (let i = 0; i < source.length && i + offset < target[0].length; i++) {
      target[0][i + offset] += source[i]
      target[1][i + offset] += source[i]
    }
  }
}

function sampleLinear(samples: Float32Array, index: number): number {
  const lo = Math.floor(index)
  const hi = Math.min(samples.length - 1, lo + 1)
  const frac = index - lo
  return samples[lo] * (1 - frac) + samples[hi] * frac
}

function adsrAt(
  t: number,
  gateSec: number,
  opts: { attack: number; decay: number; sustain: number; release: number },
): number {
  if (t < opts.attack) return opts.attack === 0 ? 1 : t / opts.attack
  if (t < opts.attack + opts.decay) {
    const p = opts.decay === 0 ? 1 : (t - opts.attack) / opts.decay
    return 1 + (opts.sustain - 1) * p
  }
  if (t < gateSec) return opts.sustain
  const releaseProgress = opts.release === 0 ? 1 : (t - gateSec) / opts.release
  return clamp(opts.sustain * (1 - releaseProgress), 0, 1)
}

function arAt(t: number, gateSec: number, opts: { attack: number; release: number }): number {
  if (t < opts.attack) return opts.attack === 0 ? 1 : t / opts.attack
  if (t < gateSec) return 1
  const releaseProgress = opts.release === 0 ? 1 : (t - gateSec) / opts.release
  return clamp(1 - releaseProgress, 0, 1)
}

function softKnee(overDb: number, knee: number): number {
  if (knee <= 0) return Math.max(0, overDb)
  if (overDb <= -knee / 2) return 0
  if (overDb >= knee / 2) return overDb
  return (overDb + knee / 2) ** 2 / (2 * knee)
}
