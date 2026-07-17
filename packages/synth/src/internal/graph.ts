import { hasParam } from '../params'
import type { Node, NodeKind, Trigger } from '../types'
import { isTypedArray, noteToFreq } from './util'

export class SynthCompileError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SynthCompileError'
  }
}

export type CompileTarget = 'offline' | 'web' | 'worklet'

export type CompiledGraph = {
  root: Node
  nodes: ReadonlyArray<Node>
  nodeIds: WeakMap<Node, string>
  inputNodes: ReadonlyArray<Extract<Node, { kind: 'input' }>>
}

const NODE_KINDS: ReadonlySet<NodeKind> = new Set([
  'osc',
  'wavetable',
  'fm',
  'noise',
  'constant',
  'buffer',
  'samplerInstrument',
  'lofiSampler',
  'acidBass',
  'drumVoice',
  'stringMachine',
  'polySynth',
  'input',
  'gain',
  'pan',
  'mix',
  'stereo',
  'biquad',
  'stateVariableFilter',
  'comb',
  'adsr',
  'ar',
  'exponential',
  'delay',
  'reverb',
  'distortion',
  'chorus',
  'ensembleChorus',
  'spaceEcho',
  'tapeDelay',
  'plateReverb',
  'springReverb',
  'nonlinearReverb',
  'microPitch',
  'multiTapDelay',
  'saturator',
  'wavefolder',
  'degrade',
  'tiltEq',
  'stereoSpread',
  'frequencyShifter',
  'rotarySpeaker',
  'phaser',
  'compressor',
  'bitcrush',
])

export function compile(root: Node, _target: CompileTarget): CompiledGraph {
  const seen = new WeakSet<Node>()
  const nodes: Node[] = []
  const inputNodes: Array<Extract<Node, { kind: 'input' }>> = []
  const nodeIds = new WeakMap<Node, string>()

  const visit = (node: Node): void => {
    if (!node || typeof node !== 'object') throw new SynthCompileError('Graph contains a non-object node')
    if (!NODE_KINDS.has(node.kind)) throw new SynthCompileError(`Unsupported node kind: ${(node as { kind?: string }).kind}`)
    if (seen.has(node)) return
    seen.add(node)

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
        visit(node.input)
        break
      case 'mix':
        for (const input of node.inputs) visit(input)
        break
      case 'stereo':
        visit(node.left)
        visit(node.right)
        break
    }

    for (const edge of node.mods) {
      if (!hasParam(node.kind, edge.param)) {
        throw new SynthCompileError(`Cannot modulate "${edge.param}" on ${node.kind}; the parameter does not exist`)
      }
      visit(edge.source)
    }

    if (node.kind === 'input') inputNodes.push(node)
    nodeIds.set(node, `n${nodes.length}`)
    nodes.push(node)
  }

  visit(root)
  freezeGraph(nodes)
  return { root, nodes, nodeIds, inputNodes }
}

function freezeGraph(nodes: ReadonlyArray<Node>): void {
  for (const node of nodes) {
    for (const edge of node.mods) Object.freeze(edge)
    Object.freeze(node.mods)
    if (node.kind === 'mix') Object.freeze(node.inputs)
    Object.freeze(node)
  }
}

export function cloneGraph(root: Node, patch?: (node: Node) => Node): Node {
  const seen = new WeakMap<Node, Node>()

  const clone = (node: Node): Node => {
    const cached = seen.get(node)
    if (cached) return cached

    const mods = node.mods.map((edge) => ({ ...edge, source: clone(edge.source) }))
    let next: Node
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
        next = { ...node, input: clone(node.input), mods } as Node
        break
      case 'mix':
        next = { ...node, inputs: node.inputs.map(clone), mods } as Node
        break
      case 'stereo':
        next = { ...node, left: clone(node.left), right: clone(node.right), mods } as Node
        break
      default:
        next = { ...node, mods } as Node
    }
    if (patch) next = patch(next)
    seen.set(node, next)
    return next
  }

  return clone(root)
}

export function cloneForTrigger(root: Node, trigger: Trigger): Node {
  const freq = noteToFreq(trigger)
  return cloneGraph(root, (node) =>
    node.kind === 'osc' || node.kind === 'wavetable' || node.kind === 'fm'
      ? { ...node, freq } as Node
      : node.kind === 'samplerInstrument'
        ? { ...node, freq, velocity: trigger.velocity } as Node
      : node.kind === 'lofiSampler'
        ? { ...node, freq, velocity: trigger.velocity } as Node
      : node.kind === 'acidBass'
        ? { ...node, freq, velocity: trigger.velocity } as Node
      : node.kind === 'drumVoice'
        ? { ...node, freq, velocity: trigger.velocity } as Node
      : node.kind === 'stringMachine'
        ? { ...node, freq, velocity: trigger.velocity } as Node
      : node.kind === 'polySynth'
        ? { ...node, freq, velocity: trigger.velocity } as Node
      : node)
}

export function structuredCloneSafe(root: Node): Node {
  return cloneGraph(root, (node) => {
    if (node.kind === 'buffer') return { ...node, samples: node.samples }
    if (node.kind === 'reverb') return { ...node, ir: node.ir }
    return node
  })
}

export function assertNoFrozenTypedArrays(root: Node): void {
  const compiled = compile(root, 'offline')
  for (const node of compiled.nodes) {
    if (node.kind === 'buffer' && Object.isFrozen(node.samples)) throw new SynthCompileError('buffer.samples must not be frozen')
    if (node.kind === 'samplerInstrument') {
      for (const zone of node.zones) {
        if (Object.isFrozen(zone.samples)) throw new SynthCompileError('sampler zone samples must not be frozen')
      }
    }
    if (node.kind === 'lofiSampler') {
      for (const zone of node.zones) {
        if (Object.isFrozen(zone.samples)) throw new SynthCompileError('lofi sampler zone samples must not be frozen')
      }
    }
    if (node.kind === 'reverb' && Object.isFrozen(node.ir)) throw new SynthCompileError('reverb.ir must not be frozen')
    if (node.kind === 'wavetable') assertWavetableArrays(node.bank.levels)
    if (node.kind === 'fm') {
      for (const operator of node.operators) {
        if (operator.kind === 'wavetable') assertWavetableArrays(operator.bank.levels)
      }
    }
    for (const value of Object.values(node)) {
      if (isTypedArray(value) && Object.isFrozen(value)) throw new SynthCompileError('typed-array fields must not be frozen')
    }
  }
}

function assertWavetableArrays(levels: ReadonlyArray<Float32Array>): void {
  for (const level of levels) {
    if (Object.isFrozen(level)) throw new SynthCompileError('wavetable levels must not be frozen')
  }
}
