import { PARAMS_BY_KIND } from '../params'
import type { AnyParam, Node, WavetableBank } from '../types'
import {
  BinaryWriter,
  acidWaveCode,
  colorCode,
  drumVoiceKindCode,
  filterCode,
  indexOf,
  kindCode,
  paramCode,
  phaserVoicingCode,
  shapeCode,
  waveCode,
} from './wasm-binary-writer'

export function writeBinaryNode(
  writer: BinaryWriter,
  node: Node,
  indexes: WeakMap<Node, number>,
  paramSlots?: WeakMap<Node, Map<AnyParam, number>>,
  inputSlots?: WeakMap<Node, number>,
): void {
  writer.u8(kindCode(node.kind))
  writer.u8(node.out)

  const inputs: number[] = []
  switch (node.kind) {
    case 'gain':
    case 'pan':
    case 'biquad':
    case 'stateVariableFilter':
    case 'comb':
    case 'adsr':
    case 'ar':
    case 'exponential':
    case 'delay':
    case 'reverb':
    case 'distortion':
    case 'chorus':
    case 'ensembleChorus':
    case 'spaceEcho':
    case 'tapeDelay':
    case 'plateReverb':
    case 'springReverb':
    case 'nonlinearReverb':
    case 'microPitch':
    case 'multiTapDelay':
    case 'saturator':
    case 'wavefolder':
    case 'degrade':
    case 'tiltEq':
    case 'stereoSpread':
    case 'frequencyShifter':
    case 'rotarySpeaker':
    case 'phaser':
    case 'compressor':
    case 'bitcrush':
      inputs.push(indexOf(indexes, node.input))
      break
    case 'mix':
      inputs.push(...node.inputs.map((input) => indexOf(indexes, input)))
      break
    case 'stereo':
      inputs.push(indexOf(indexes, node.left), indexOf(indexes, node.right))
      break
  }
  writer.array(inputs, (input) => writer.u32(input))
  writer.array(node.mods, (edge) => {
    writer.u16(paramCode(edge.param))
    writer.u32(indexOf(indexes, edge.source))
    writer.f64(edge.depth)
    writer.u8(edge.rate === 'control' ? 1 : 0)
  })
  if (paramSlots) {
    const slotsForNode = paramSlots.get(node)
    writer.array(PARAMS_BY_KIND[node.kind], (param) => {
      writer.u16(paramCode(param))
      writer.u32(slotsForNode?.get(param) ?? 0)
    })
  }

  switch (node.kind) {
    case 'osc':
      writer.u8(waveCode(node.wave))
      writer.f64(node.freq)
      writer.f64(node.detune)
      writer.f64(node.phase)
      break
    case 'wavetable':
      writeBinaryWavetable(writer, node.bank)
      writer.f64(node.freq)
      writer.f64(node.detune)
      writer.f64(node.phase)
      writer.f64(node.position)
      break
    case 'fm':
      writer.f64(node.freq)
      writer.f64(node.detune)
      writer.f64(node.index)
      writer.array(node.operators, (operator) => writeBinaryOperator(writer, operator))
      writer.array(node.matrix, (row) => writer.f64Array(row))
      break
    case 'noise':
      writer.u8(colorCode(node.color))
      writer.u32(node.seed >>> 0)
      break
    case 'constant':
      writer.f64(node.value)
      break
    case 'buffer':
      writer.f32Array(node.samples)
      writer.bool(node.loop)
      writer.f64(node.rate)
      break
    case 'samplerInstrument':
      writer.f64(node.freq)
      writer.f64(node.velocity ?? Number.NaN)
      writer.f64(node.attack)
      writer.f64(node.release)
      writer.f64(node.level)
      writer.array(node.zones, (zone) => writeBinarySamplerZone(writer, zone))
      break
    case 'lofiSampler':
      writer.f64(node.freq)
      writer.f64(node.velocity ?? Number.NaN)
      writer.f64(node.attack)
      writer.f64(node.release)
      writer.f64(node.level)
      writer.f64(node.bits)
      writer.f64(node.downsample)
      writer.f64(node.jitter)
      writer.f64(node.noise)
      writer.f64(node.tone)
      writer.f64(node.drive)
      writer.f64(node.mix)
      writer.array(node.zones, (zone) => writeBinarySamplerZone(writer, zone))
      break
    case 'acidBass':
      writer.u8(acidWaveCode(node.wave))
      writer.f64(node.freq)
      writer.f64(node.velocity ?? Number.NaN)
      writer.f64(node.cutoff)
      writer.f64(node.resonance)
      writer.f64(node.envMod)
      writer.f64(node.decay)
      writer.f64(node.accent)
      writer.f64(node.slide)
      writer.f64(node.drive)
      writer.f64(node.level)
      break
    case 'drumVoice':
      writer.u8(drumVoiceKindCode(node.drumKind))
      writer.f64(node.freq)
      writer.f64(node.velocity ?? Number.NaN)
      writer.f64(node.decay)
      writer.f64(node.tone)
      writer.f64(node.snap)
      writer.f64(node.noise)
      writer.f64(node.drive)
      writer.f64(node.level)
      break
    case 'stringMachine':
      writer.f64(node.freq)
      writer.f64(node.velocity ?? Number.NaN)
      writer.f64(node.detune)
      writer.f64(node.attack)
      writer.f64(node.release)
      writer.f64(node.tone)
      writer.f64(node.depth)
      writer.f64(node.modulation)
      writer.f64(node.width)
      writer.f64(node.level)
      break
    case 'polySynth':
      writer.f64(node.freq)
      writer.f64(node.velocity ?? Number.NaN)
      writer.f64(node.detune)
      writer.f64(node.pulseWidth)
      writer.f64(node.sub)
      writer.f64(node.noise)
      writer.f64(node.cutoff)
      writer.f64(node.resonance)
      writer.f64(node.envMod)
      writer.f64(node.attack)
      writer.f64(node.decay)
      writer.f64(node.sustain)
      writer.f64(node.release)
      writer.f64(node.drive)
      writer.f64(node.chorus)
      writer.f64(node.modulation)
      writer.f64(node.width)
      writer.f64(node.level)
      break
    case 'input':
      writer.u32(inputSlots?.get(node) ?? node.channel)
      break
    case 'gain':
      writer.f64(node.amount)
      break
    case 'pan':
      writer.f64(node.position)
      break
    case 'mix':
    case 'stereo':
      break
    case 'biquad':
      writer.u8(filterCode(node.filter))
      writer.f64(node.freq)
      writer.f64(node.q)
      writer.f64(node.gainDb)
      break
    case 'stateVariableFilter':
      writer.u8(filterCode(node.mode))
      writer.f64(node.freq)
      writer.f64(node.resonance)
      writer.f64(node.drive)
      writer.f64(node.mix)
      break
    case 'comb':
      writer.f64(node.delayMs)
      writer.f64(node.feedback)
      writer.f64(node.damp)
      break
    case 'adsr':
      writer.f64(node.attack)
      writer.f64(node.decay)
      writer.f64(node.sustain)
      writer.f64(node.release)
      break
    case 'ar':
      writer.f64(node.attack)
      writer.f64(node.release)
      break
    case 'exponential':
      writer.f64(node.tau)
      break
    case 'delay':
      writer.f64(node.delayMs)
      writer.f64(node.feedback)
      writer.f64(node.mix)
      break
    case 'reverb':
      writer.f32Array(node.ir)
      writer.f64(node.mix)
      break
    case 'distortion':
      writer.f64(node.amount)
      writer.u8(shapeCode(node.shape))
      break
    case 'chorus':
      writer.f64(node.rate)
      writer.f64(node.depth)
      writer.f64(node.mix)
      break
    case 'ensembleChorus':
      writer.f64(node.rate)
      writer.f64(node.depth)
      writer.f64(node.mix)
      writer.f64(node.width)
      writer.f64(node.tone)
      writer.f64(node.noise)
      break
    case 'spaceEcho': {
      const heads = spaceEchoHeads(node.mode)
      writer.f64(node.timeMs)
      writer.f64(node.feedback)
      writer.f64(node.mix)
      writer.f64(node.reverbMix)
      writer.f64(node.wow)
      writer.f64(node.flutter)
      writer.f64(node.tapeAge)
      writer.f64(node.drive)
      writer.bool(heads[0])
      writer.bool(heads[1])
      writer.bool(heads[2])
      writer.f64(heads.filter(Boolean).length)
      break
    }
    case 'tapeDelay':
      writer.f64(node.timeMs)
      writer.f64(node.feedback)
      writer.f64(node.mix)
      writer.f64(node.wow)
      writer.f64(node.flutter)
      writer.f64(node.tapeAge)
      writer.f64(node.drive)
      writer.f64(node.tone)
      writer.f64(node.width)
      break
    case 'plateReverb':
      writer.f64(node.preDelayMs)
      writer.f64(node.decay)
      writer.f64(node.damping)
      writer.f64(node.diffusion)
      writer.f64(node.modulation)
      writer.f64(node.mix)
      writer.f64(node.width)
      break
    case 'springReverb':
      writer.f64(node.decay)
      writer.f64(node.damping)
      writer.f64(node.tension)
      writer.f64(node.drip)
      writer.f64(node.mix)
      writer.f64(node.width)
      break
    case 'nonlinearReverb':
      writer.f64(node.timeMs)
      writer.f64(node.decay)
      writer.f64(node.damping)
      writer.f64(node.drive)
      writer.f64(node.mix)
      writer.f64(node.width)
      break
    case 'microPitch':
      writer.f64(node.detune)
      writer.f64(node.width)
      writer.f64(node.delayMs)
      writer.f64(node.mix)
      break
    case 'multiTapDelay':
      writer.f64(node.timeMs)
      writer.f64(node.feedback)
      writer.f64(node.mix)
      writer.f64(node.tone)
      writer.f64(node.width)
      writer.f64MappedArray(node.taps, (tap) => tap.ratio)
      writer.f64MappedArray(node.taps, (tap) => tap.gain)
      writer.f64MappedArray(node.taps, (tap) => tap.pan)
      break
    case 'saturator':
      writer.f64(node.drive)
      writer.f64(node.asymmetry)
      writer.f64(node.tone)
      writer.f64(node.mix)
      writer.f64(node.output)
      break
    case 'wavefolder':
      writer.f64(node.drive)
      writer.f64(node.depth)
      writer.f64(node.asymmetry)
      writer.f64(node.tone)
      writer.f64(node.mix)
      writer.f64(node.output)
      break
    case 'degrade':
      writer.f64(node.bits)
      writer.f64(node.downsample)
      writer.f64(node.jitter)
      writer.f64(node.noise)
      writer.f64(node.tone)
      writer.f64(node.mix)
      break
    case 'tiltEq':
      writer.f64(node.freq)
      writer.f64(node.gainDb)
      writer.f64(node.mix)
      break
    case 'stereoSpread':
      writer.f64(node.width)
      writer.f64(node.delayMs)
      writer.f64(node.mix)
      break
    case 'frequencyShifter':
      writer.f64(node.shiftHz)
      writer.f64(node.mix)
      break
    case 'rotarySpeaker':
      writer.f64(node.rate)
      writer.f64(node.depth)
      writer.f64(node.mix)
      writer.f64(node.drive)
      writer.f64(node.width)
      writer.f64(node.freq)
      break
    case 'phaser':
      writer.u8(phaserVoicingCode(node.voicing))
      writer.f64(node.rate)
      writer.f64(node.depth)
      writer.f64(node.mix)
      break
    case 'compressor':
      writer.f64(node.threshold)
      writer.f64(node.ratio)
      writer.f64(node.attack)
      writer.f64(node.release)
      writer.f64(node.knee)
      break
    case 'bitcrush':
      writer.f64(node.bits)
      writer.f64(node.downsample)
      break
  }
}

function writeBinaryOperator(writer: BinaryWriter, operator: Extract<Node, { kind: 'fm' }>['operators'][number]): void {
  writer.u8(operator.kind === 'sine' ? 0 : operator.kind === 'polyblep' ? 1 : 2)
  writer.f64(operator.ratio)
  writer.f64(operator.detune)
  writer.f64(operator.level)
  writer.f64(operator.feedback)
  writer.f64(operator.output)
  writer.f64(operator.phase)
  if (operator.kind === 'polyblep') writer.u8(waveCode(operator.wave))
  if (operator.kind === 'wavetable') {
    writeBinaryWavetable(writer, operator.bank)
    writer.f64(operator.position)
  }
}

function writeBinaryWavetable(writer: BinaryWriter, bank: WavetableBank): void {
  writer.u32(bank.size)
  writer.u32(bank.frameCount)
  writer.array(bank.levels, (level) => writer.f32Array(level))
  writer.f64Array(bank.levelMaxHarmonics)
}

function writeBinarySamplerZone(writer: BinaryWriter, zone: Extract<Node, { kind: 'samplerInstrument' }>['zones'][number]): void {
  writer.f32Array(zone.samples)
  writer.f64(zone.sampleRate)
  writer.f64(zone.rootMidi)
  writer.f64(zone.keyLow)
  writer.f64(zone.keyHigh)
  writer.f64(zone.velocityLow)
  writer.f64(zone.velocityHigh)
  writer.bool(zone.loop)
  writer.u32(Math.max(0, Math.floor(zone.loopStart)))
  writer.u32(Math.max(0, Math.floor(zone.loopEnd)))
  writer.f64(zone.gain)
  writer.f64(zone.pan)
}

export function spaceEchoHeads(mode: Extract<Node, { kind: 'spaceEcho' }>['mode']): [boolean, boolean, boolean] {
  return [
    mode === 'head-1' || mode === 'heads-1-2' || mode === 'heads-1-3' || mode === 'heads-1-2-3',
    mode === 'head-2' || mode === 'heads-1-2' || mode === 'heads-2-3' || mode === 'heads-1-2-3',
    mode === 'head-3' || mode === 'heads-1-3' || mode === 'heads-2-3' || mode === 'heads-1-2-3',
  ]
}
