import {
  compileWorklet,
  workletParam,
  type WorkletModule,
} from '@stopcock/synth'
import { paramsToPatch, type PatchSpec } from './spectral-optimizer'
import { buildWorkletPatch, type WorkletPatch } from './spectral-optimizer-synth'

export type SpectralWorklet = {
  node: AudioWorkletNode
  analyser: AnalyserNode
  update(params: ArrayLike<number>): void
  stop(): void
}

type ParamBinding = {
  name: string
  value(spec: PatchSpec): number
}

export async function bootWorklet(ctx: AudioContext, initialParams: ArrayLike<number>, destination: AudioNode = ctx.destination): Promise<SpectralWorklet> {
  const patch = buildWorkletPatch(initialParams)
  const wm = await compileWorklet(ctx, patch.root)
  const node = new AudioWorkletNode(ctx, wm.processorName, {
    numberOfInputs: wm.numberOfInputs,
    numberOfOutputs: wm.numberOfOutputs,
    outputChannelCount: wm.outputChannelCount,
    processorOptions: wm.processorOptions,
  })
  const analyser = ctx.createAnalyser()
  analyser.fftSize = 2048
  analyser.smoothingTimeConstant = 0.72
  node.connect(analyser)
  analyser.connect(destination)

  const bindings = makeBindings(wm, patch)
  const set = (params: ArrayLike<number>, timeConstant = 0.005) => {
    const now = ctx.currentTime
    const spec = paramsToPatch(params)
    for (const binding of bindings) {
      const param = node.parameters.get(binding.name)
      if (!param) continue
      const value = binding.value(spec)
      param.cancelScheduledValues(now)
      param.setTargetAtTime(value, now, timeConstant)
    }
  }
  set(initialParams, 0.001)

  return {
    node,
    analyser,
    update(params) {
      set(params)
    },
    stop() {
      node.disconnect()
      analyser.disconnect()
    },
  }
}

function makeBindings(wm: WorkletModule, patch: WorkletPatch): ParamBinding[] {
  const safe = (node: WorkletPatch['root'], param: Parameters<typeof workletParam>[2]) =>
    workletParam(wm, node, param).audioParamName
  return [
    {
      name: safe(patch.controls.baseGain, 'amount'),
      value: () => 0.72,
    },
    {
      name: safe(patch.controls.harmonicGain, 'amount'),
      value: (spec) => spec.harmonicGain,
    },
    {
      name: safe(patch.controls.subGain, 'amount'),
      value: (spec) => spec.harmonicGain * 0.48,
    },
    {
      name: safe(patch.controls.noiseGain, 'amount'),
      value: (spec) => spec.noiseGain,
    },
    {
      name: safe(patch.controls.base, 'freq'),
      value: (spec) => spec.baseHz,
    },
    {
      name: safe(patch.controls.harmonic, 'freq'),
      value: (spec) => spec.baseHz * 2.01,
    },
    {
      name: safe(patch.controls.harmonic, 'detune'),
      value: (spec) => spec.detune,
    },
    {
      name: safe(patch.controls.sub, 'freq'),
      value: (spec) => spec.baseHz * 0.5,
    },
    {
      name: safe(patch.controls.sub, 'detune'),
      value: (spec) => -spec.detune * 0.6,
    },
    {
      name: safe(patch.controls.highpass, 'freq'),
      value: (spec) => 42 + spec.baseHz * 0.22,
    },
    {
      name: safe(patch.controls.highpass, 'q'),
      value: () => 0.7,
    },
    {
      name: safe(patch.controls.lowpass, 'freq'),
      value: (spec) => spec.cutoff,
    },
    {
      name: safe(patch.controls.lowpass, 'q'),
      value: (spec) => spec.q,
    },
    {
      name: safe(patch.controls.peak, 'freq'),
      value: (spec) => Math.max(240, spec.cutoff * 0.42),
    },
    {
      name: safe(patch.controls.peak, 'q'),
      value: (spec) => 0.9 + spec.q * 0.18,
    },
    {
      name: safe(patch.controls.peak, 'gainDb'),
      value: () => 2.2,
    },
    {
      name: safe(patch.controls.distortion, 'amount'),
      value: (spec) => spec.drive * 0.68,
    },
    {
      name: safe(patch.controls.chorus, 'rate'),
      value: (spec) => 0.14 + spec.width * 0.32,
    },
    {
      name: safe(patch.controls.chorus, 'depth'),
      value: (spec) => 4 + spec.width * 9,
    },
    {
      name: safe(patch.controls.chorus, 'mix'),
      value: () => 0.16,
    },
    {
      name: safe(patch.controls.output, 'amount'),
      value: () => 0.45,
    },
  ]
}
