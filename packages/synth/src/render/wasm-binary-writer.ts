import type { AnyParam, Node } from '../types'
import { SynthCompileError } from '../internal/graph'

export class BinaryWriter {
  private buffer = new Uint8Array(4096)
  private view = new DataView(this.buffer.buffer)
  private offset = 0

  finish(): Uint8Array {
    return this.buffer.slice(0, this.offset)
  }

  ascii(value: string): void {
    this.ensure(value.length)
    for (let i = 0; i < value.length; i++) this.buffer[this.offset++] = value.charCodeAt(i)
  }

  bool(value: boolean): void {
    this.u8(value ? 1 : 0)
  }

  u8(value: number): void {
    this.ensure(1)
    this.view.setUint8(this.offset, value)
    this.offset += 1
  }

  u16(value: number): void {
    this.ensure(2)
    this.view.setUint16(this.offset, value, true)
    this.offset += 2
  }

  u32(value: number): void {
    if (!Number.isFinite(value) || value < 0 || value > 0xFFFF_FFFF) throw new SynthCompileError('WASM binary graph value exceeds u32 range')
    this.ensure(4)
    this.view.setUint32(this.offset, value >>> 0, true)
    this.offset += 4
  }

  f64(value: number): void {
    this.ensure(8)
    this.view.setFloat64(this.offset, value, true)
    this.offset += 8
  }

  f32Array(values: Float32Array): void {
    this.u32(values.length)
    const bytes = new Uint8Array(values.buffer, values.byteOffset, values.byteLength)
    this.raw(bytes)
  }

  f64Array(values: ReadonlyArray<number>): void {
    this.u32(values.length)
    for (const value of values) this.f64(value)
  }

  f64MappedArray<T>(values: ReadonlyArray<T>, select: (value: T) => number): void {
    this.u32(values.length)
    for (const value of values) this.f64(select(value))
  }

  array<T>(values: ReadonlyArray<T>, write: (value: T) => void): void {
    this.u32(values.length)
    for (const value of values) write(value)
  }

  raw(bytes: Uint8Array): void {
    this.ensure(bytes.length)
    this.buffer.set(bytes, this.offset)
    this.offset += bytes.length
  }

  private ensure(extra: number): void {
    const needed = this.offset + extra
    if (needed <= this.buffer.length) return
    let size = this.buffer.length
    while (size < needed) size *= 2
    const next = new Uint8Array(size)
    next.set(this.buffer)
    this.buffer = next
    this.view = new DataView(next.buffer)
  }
}

export function indexOf(indexes: WeakMap<Node, number>, node: Node): number {
  const index = indexes.get(node)
  if (index === undefined) throw new SynthCompileError(`Node index missing for ${node.kind}`)
  return index
}

export function kindCode(kind: Node['kind']): number {
  switch (kind) {
    case 'osc': return 0
    case 'wavetable': return 1
    case 'fm': return 2
    case 'noise': return 3
    case 'constant': return 4
    case 'buffer': return 5
    case 'samplerInstrument': return 32
    case 'lofiSampler': return 37
    case 'acidBass': return 33
    case 'drumVoice': return 34
    case 'stringMachine': return 35
    case 'polySynth': return 36
    case 'tiltEq': return 38
    case 'stereoSpread': return 39
    case 'frequencyShifter': return 40
    case 'rotarySpeaker': return 41
    case 'stateVariableFilter': return 42
    case 'wavefolder': return 43
    case 'input': return 6
    case 'gain': return 7
    case 'pan': return 8
    case 'mix': return 9
    case 'stereo': return 10
    case 'biquad': return 11
    case 'comb': return 12
    case 'adsr': return 13
    case 'ar': return 14
    case 'exponential': return 15
    case 'delay': return 16
    case 'reverb': return 17
    case 'distortion': return 18
    case 'chorus': return 19
    case 'spaceEcho': return 20
    case 'tapeDelay': return 28
    case 'plateReverb': return 29
    case 'springReverb': return 30
    case 'nonlinearReverb': return 31
    case 'compressor': return 21
    case 'bitcrush': return 22
    case 'microPitch': return 23
    case 'multiTapDelay': return 24
    case 'saturator': return 25
    case 'degrade': return 26
    case 'ensembleChorus': return 27
    case 'phaser': return 44
  }
}

export function waveCode(wave: 'sine' | 'saw' | 'square' | 'triangle'): number {
  if (wave === 'sine') return 0
  if (wave === 'saw') return 1
  if (wave === 'square') return 2
  return 3
}

export function acidWaveCode(wave: 'saw' | 'square'): number {
  return wave === 'square' ? 1 : 0
}

export function drumVoiceKindCode(kind: 'kick' | 'snare' | 'hat'): number {
  if (kind === 'snare') return 1
  if (kind === 'hat') return 2
  return 0
}

export function colorCode(color: 'white' | 'pink' | 'brown'): number {
  if (color === 'white') return 0
  if (color === 'pink') return 1
  return 2
}

export function filterCode(filter: Extract<Node, { kind: 'biquad' }>['filter']): number {
  switch (filter) {
    case 'lowpass': return 0
    case 'highpass': return 1
    case 'bandpass': return 2
    case 'notch': return 3
    case 'peak': return 4
    case 'lowshelf': return 5
    case 'highshelf': return 6
    case 'allpass': return 7
  }
}

export function shapeCode(shape: Extract<Node, { kind: 'distortion' }>['shape']): number {
  if (shape === 'tanh') return 0
  if (shape === 'softclip') return 1
  return 2
}

export function phaserVoicingCode(voicing: Extract<Node, { kind: 'phaser' }>['voicing']): number {
  switch (voicing) {
    case 'phase90': return 0
    case 'smallStone': return 1
    case 'uniVibe': return 2
    case 'uniVibeVibrato': return 3
  }
}

export function paramCode(param: AnyParam): number {
  switch (param) {
    case 'freq': return 0
    case 'detune': return 1
    case 'phase': return 2
    case 'position': return 3
    case 'index': return 4
    case 'value': return 5
    case 'amount': return 6
    case 'q': return 7
    case 'gainDb': return 8
    case 'delayMs': return 9
    case 'feedback': return 10
    case 'damp': return 11
    case 'attack': return 12
    case 'decay': return 13
    case 'sustain': return 14
    case 'release': return 15
    case 'tau': return 16
    case 'mix': return 17
    case 'depth': return 18
    case 'rate': return 19
    case 'reverbMix': return 20
    case 'wow': return 21
    case 'flutter': return 22
    case 'tapeAge': return 23
    case 'drive': return 24
    case 'threshold': return 25
    case 'ratio': return 26
    case 'knee': return 27
    case 'bits': return 28
    case 'downsample': return 29
    case 'timeMs': return 30
    case 'width': return 31
    case 'tone': return 32
    case 'asymmetry': return 33
    case 'output': return 34
    case 'jitter': return 35
    case 'noise': return 36
    case 'damping': return 37
    case 'preDelayMs': return 38
    case 'diffusion': return 39
    case 'modulation': return 40
    case 'tension': return 41
    case 'drip': return 42
    case 'level': return 43
    case 'cutoff': return 44
    case 'resonance': return 45
    case 'envMod': return 46
    case 'accent': return 47
    case 'slide': return 48
    case 'snap': return 49
    case 'pulseWidth': return 50
    case 'sub': return 51
    case 'chorus': return 52
    case 'shiftHz': return 53
  }

  const op = /^op([1-6])\.(ratio|level|feedback|output)$/.exec(param)
  if (op) {
    const offset = { ratio: 0, level: 1, feedback: 2, output: 3 }[op[2] as 'ratio' | 'level' | 'feedback' | 'output']
    return 100 + (Number(op[1]) - 1) * 4 + offset
  }

  const matrix = /^m([1-6])_([1-6])$/.exec(param)
  if (matrix) return 200 + (Number(matrix[1]) - 1) * 6 + (Number(matrix[2]) - 1)

  throw new SynthCompileError(`Unsupported WASM binary param: ${param}`)
}
