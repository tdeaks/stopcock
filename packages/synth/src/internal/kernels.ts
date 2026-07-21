import type { Node, NodeKind } from '../types'

export type KernelTemplate = (node: Node, paramRef: (param: string) => string) => string

const comment =
  (kind: NodeKind): KernelTemplate =>
  (node) =>
    `/* ${kind} kernel for ${node.kind} */`

export const kernels: Record<NodeKind, KernelTemplate> = {
  osc: comment('osc'),
  wavetable: comment('wavetable'),
  fm: comment('fm'),
  noise: comment('noise'),
  constant: comment('constant'),
  buffer: comment('buffer'),
  samplerInstrument: comment('samplerInstrument'),
  lofiSampler: comment('lofiSampler'),
  acidBass: comment('acidBass'),
  drumVoice: comment('drumVoice'),
  stringMachine: comment('stringMachine'),
  polySynth: comment('polySynth'),
  input: comment('input'),
  gain: comment('gain'),
  pan: comment('pan'),
  mix: comment('mix'),
  stereo: comment('stereo'),
  biquad: comment('biquad'),
  stateVariableFilter: comment('stateVariableFilter'),
  comb: comment('comb'),
  adsr: comment('adsr'),
  ar: comment('ar'),
  exponential: comment('exponential'),
  delay: comment('delay'),
  reverb: comment('reverb'),
  distortion: comment('distortion'),
  chorus: comment('chorus'),
  ensembleChorus: comment('ensembleChorus'),
  spaceEcho: comment('spaceEcho'),
  tapeDelay: comment('tapeDelay'),
  plateReverb: comment('plateReverb'),
  springReverb: comment('springReverb'),
  nonlinearReverb: comment('nonlinearReverb'),
  microPitch: comment('microPitch'),
  multiTapDelay: comment('multiTapDelay'),
  saturator: comment('saturator'),
  wavefolder: comment('wavefolder'),
  degrade: comment('degrade'),
  tiltEq: comment('tiltEq'),
  stereoSpread: comment('stereoSpread'),
  frequencyShifter: comment('frequencyShifter'),
  rotarySpeaker: comment('rotarySpeaker'),
  phaser: comment('phaser'),
  compressor: comment('compressor'),
  bitcrush: comment('bitcrush'),
}
