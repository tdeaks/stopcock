import type { AnyParam, Node } from '../types'

export function defaultFor(node: Node, param: AnyParam): number {
  switch (node.kind) {
    case 'osc':
      if (param === 'freq') return node.freq
      if (param === 'detune') return node.detune
      if (param === 'phase') return node.phase
      break
    case 'wavetable':
      if (param === 'freq') return node.freq
      if (param === 'detune') return node.detune
      if (param === 'phase') return node.phase
      if (param === 'position') return node.position
      break
    case 'fm':
      if (param === 'freq') return node.freq
      if (param === 'detune') return node.detune
      if (param === 'index') return node.index
      if (param.startsWith('op')) return fmOperatorDefault(node, param)
      if (param.startsWith('m')) return fmMatrixDefault(node, param)
      break
    case 'constant':
      if (param === 'value') return node.value
      break
    case 'samplerInstrument':
      if (param === 'freq') return node.freq
      if (param === 'attack') return node.attack
      if (param === 'release') return node.release
      if (param === 'level') return node.level
      break
    case 'lofiSampler':
      if (param === 'freq') return node.freq
      if (param === 'attack') return node.attack
      if (param === 'release') return node.release
      if (param === 'level') return node.level
      if (param === 'bits') return node.bits
      if (param === 'downsample') return node.downsample
      if (param === 'jitter') return node.jitter
      if (param === 'noise') return node.noise
      if (param === 'tone') return node.tone
      if (param === 'drive') return node.drive
      if (param === 'mix') return node.mix
      break
    case 'acidBass':
      if (param === 'freq') return node.freq
      if (param === 'cutoff') return node.cutoff
      if (param === 'resonance') return node.resonance
      if (param === 'envMod') return node.envMod
      if (param === 'decay') return node.decay
      if (param === 'accent') return node.accent
      if (param === 'slide') return node.slide
      if (param === 'drive') return node.drive
      if (param === 'level') return node.level
      break
    case 'drumVoice':
      if (param === 'freq') return node.freq
      if (param === 'decay') return node.decay
      if (param === 'tone') return node.tone
      if (param === 'snap') return node.snap
      if (param === 'noise') return node.noise
      if (param === 'drive') return node.drive
      if (param === 'level') return node.level
      break
    case 'stringMachine':
      if (param === 'freq') return node.freq
      if (param === 'detune') return node.detune
      if (param === 'attack') return node.attack
      if (param === 'release') return node.release
      if (param === 'tone') return node.tone
      if (param === 'depth') return node.depth
      if (param === 'modulation') return node.modulation
      if (param === 'width') return node.width
      if (param === 'level') return node.level
      break
    case 'polySynth':
      if (param === 'freq') return node.freq
      if (param === 'detune') return node.detune
      if (param === 'pulseWidth') return node.pulseWidth
      if (param === 'sub') return node.sub
      if (param === 'noise') return node.noise
      if (param === 'cutoff') return node.cutoff
      if (param === 'resonance') return node.resonance
      if (param === 'envMod') return node.envMod
      if (param === 'attack') return node.attack
      if (param === 'decay') return node.decay
      if (param === 'sustain') return node.sustain
      if (param === 'release') return node.release
      if (param === 'drive') return node.drive
      if (param === 'chorus') return node.chorus
      if (param === 'modulation') return node.modulation
      if (param === 'width') return node.width
      if (param === 'level') return node.level
      break
    case 'gain':
      if (param === 'amount') return node.amount
      break
    case 'pan':
      if (param === 'position') return node.position
      break
    case 'biquad':
      if (param === 'freq') return node.freq
      if (param === 'q') return node.q
      if (param === 'gainDb') return node.gainDb
      break
    case 'stateVariableFilter':
      if (param === 'freq') return node.freq
      if (param === 'resonance') return node.resonance
      if (param === 'drive') return node.drive
      if (param === 'mix') return node.mix
      break
    case 'comb':
      if (param === 'delayMs') return node.delayMs
      if (param === 'feedback') return node.feedback
      if (param === 'damp') return node.damp
      break
    case 'adsr':
      if (param === 'attack') return node.attack
      if (param === 'decay') return node.decay
      if (param === 'sustain') return node.sustain
      if (param === 'release') return node.release
      break
    case 'ar':
      if (param === 'attack') return node.attack
      if (param === 'release') return node.release
      break
    case 'exponential':
      if (param === 'tau') return node.tau
      break
    case 'delay':
      if (param === 'delayMs') return node.delayMs
      if (param === 'feedback') return node.feedback
      if (param === 'mix') return node.mix
      break
    case 'reverb':
      if (param === 'mix') return node.mix
      break
    case 'distortion':
      if (param === 'amount') return node.amount
      break
    case 'chorus':
      if (param === 'rate') return node.rate
      if (param === 'depth') return node.depth
      if (param === 'mix') return node.mix
      break
    case 'ensembleChorus':
      if (param === 'rate') return node.rate
      if (param === 'depth') return node.depth
      if (param === 'mix') return node.mix
      if (param === 'width') return node.width
      if (param === 'tone') return node.tone
      if (param === 'noise') return node.noise
      break
    case 'spaceEcho':
      if (param === 'timeMs') return node.timeMs
      if (param === 'feedback') return node.feedback
      if (param === 'mix') return node.mix
      if (param === 'reverbMix') return node.reverbMix
      if (param === 'wow') return node.wow
      if (param === 'flutter') return node.flutter
      if (param === 'tapeAge') return node.tapeAge
      if (param === 'drive') return node.drive
      break
    case 'tapeDelay':
      if (param === 'timeMs') return node.timeMs
      if (param === 'feedback') return node.feedback
      if (param === 'mix') return node.mix
      if (param === 'wow') return node.wow
      if (param === 'flutter') return node.flutter
      if (param === 'tapeAge') return node.tapeAge
      if (param === 'drive') return node.drive
      if (param === 'tone') return node.tone
      if (param === 'width') return node.width
      break
    case 'plateReverb':
      if (param === 'preDelayMs') return node.preDelayMs
      if (param === 'decay') return node.decay
      if (param === 'damping') return node.damping
      if (param === 'diffusion') return node.diffusion
      if (param === 'modulation') return node.modulation
      if (param === 'mix') return node.mix
      if (param === 'width') return node.width
      break
    case 'springReverb':
      if (param === 'decay') return node.decay
      if (param === 'damping') return node.damping
      if (param === 'tension') return node.tension
      if (param === 'drip') return node.drip
      if (param === 'mix') return node.mix
      if (param === 'width') return node.width
      break
    case 'nonlinearReverb':
      if (param === 'timeMs') return node.timeMs
      if (param === 'decay') return node.decay
      if (param === 'damping') return node.damping
      if (param === 'drive') return node.drive
      if (param === 'mix') return node.mix
      if (param === 'width') return node.width
      break
    case 'microPitch':
      if (param === 'detune') return node.detune
      if (param === 'width') return node.width
      if (param === 'delayMs') return node.delayMs
      if (param === 'mix') return node.mix
      break
    case 'multiTapDelay':
      if (param === 'timeMs') return node.timeMs
      if (param === 'feedback') return node.feedback
      if (param === 'mix') return node.mix
      if (param === 'tone') return node.tone
      if (param === 'width') return node.width
      break
    case 'saturator':
      if (param === 'drive') return node.drive
      if (param === 'asymmetry') return node.asymmetry
      if (param === 'tone') return node.tone
      if (param === 'mix') return node.mix
      if (param === 'output') return node.output
      break
    case 'wavefolder':
      if (param === 'drive') return node.drive
      if (param === 'depth') return node.depth
      if (param === 'asymmetry') return node.asymmetry
      if (param === 'tone') return node.tone
      if (param === 'mix') return node.mix
      if (param === 'output') return node.output
      break
    case 'degrade':
      if (param === 'bits') return node.bits
      if (param === 'downsample') return node.downsample
      if (param === 'jitter') return node.jitter
      if (param === 'noise') return node.noise
      if (param === 'tone') return node.tone
      if (param === 'mix') return node.mix
      break
    case 'tiltEq':
      if (param === 'freq') return node.freq
      if (param === 'gainDb') return node.gainDb
      if (param === 'mix') return node.mix
      break
    case 'stereoSpread':
      if (param === 'width') return node.width
      if (param === 'delayMs') return node.delayMs
      if (param === 'mix') return node.mix
      break
    case 'frequencyShifter':
      if (param === 'shiftHz') return node.shiftHz
      if (param === 'mix') return node.mix
      break
    case 'rotarySpeaker':
      if (param === 'rate') return node.rate
      if (param === 'depth') return node.depth
      if (param === 'mix') return node.mix
      if (param === 'drive') return node.drive
      if (param === 'width') return node.width
      if (param === 'freq') return node.freq
      break
    case 'compressor':
      if (param === 'threshold') return node.threshold
      if (param === 'ratio') return node.ratio
      if (param === 'attack') return node.attack
      if (param === 'release') return node.release
      if (param === 'knee') return node.knee
      break
    case 'bitcrush':
      if (param === 'bits') return node.bits
      if (param === 'downsample') return node.downsample
      break
  }
  return 0
}

function fmOperatorDefault(node: Extract<Node, { kind: 'fm' }>, param: string): number {
  const match = /^op([1-6])\.(ratio|level|feedback|output)$/.exec(param)
  if (!match) return 0
  const operator = node.operators[Number(match[1]) - 1]
  const key = match[2] as 'ratio' | 'level' | 'feedback' | 'output'
  return operator?.[key] ?? 0
}

function fmMatrixDefault(node: Extract<Node, { kind: 'fm' }>, param: string): number {
  const match = /^m([1-6])_([1-6])$/.exec(param)
  if (!match) return 0
  return node.matrix[Number(match[1]) - 1]?.[Number(match[2]) - 1] ?? 0
}
