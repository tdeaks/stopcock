export type Channels = 1 | 2
export type Hz = number
export type Waveform = 'sine' | 'saw' | 'square' | 'triangle'
export type AcidBassWaveform = 'saw' | 'square'
export type DrumVoiceKind = 'kick' | 'snare' | 'hat'
export type NoiseColor = 'white' | 'pink' | 'brown'
export type FilterKind =
  | 'lowpass'
  | 'highpass'
  | 'bandpass'
  | 'notch'
  | 'peak'
  | 'lowshelf'
  | 'highshelf'
  | 'allpass'
export type StateVariableFilterMode = 'lowpass' | 'highpass' | 'bandpass' | 'notch'
export type DistortionShape = 'tanh' | 'softclip' | 'hardclip'
export type SpaceEchoMode =
  | 'head-1'
  | 'head-2'
  | 'head-3'
  | 'heads-1-2'
  | 'heads-2-3'
  | 'heads-1-3'
  | 'heads-1-2-3'
export type WavetablePartial = number | { harmonic: number; amplitude: number; phase?: number }
export type WavetableSource =
  | Float32Array
  | ReadonlyArray<Float32Array>
  | { partials: ReadonlyArray<WavetablePartial> }
export type WavetableOptions = {
  size?: number
  normalize?: boolean
}
export type MultiTapDelayTap = {
  ratio: number
  gain?: number
  pan?: number
}
export type SamplerZoneInput = {
  samples: Float32Array
  sampleRate?: number
  rootMidi?: number
  keyLow?: number
  keyHigh?: number
  velocityLow?: number
  velocityHigh?: number
  loop?: boolean
  loopStart?: number
  loopEnd?: number
  gain?: number
  pan?: number
}
export type SamplerZone = Required<SamplerZoneInput> & {
  loop: boolean
}
export type AudioBufferLike = {
  readonly sampleRate: number
  readonly length: number
  getChannelData(channel: number): Float32Array
}
export type WavetableAudioOptions = WavetableOptions & {
  channel?: number
  startSec?: number
  fundamentalHz?: number
  frameCount?: number
}
export type WavetableBank = {
  readonly kind: 'wavetable-bank'
  readonly size: number
  readonly frameCount: number
  readonly levels: ReadonlyArray<Float32Array>
  readonly levelMaxHarmonics: ReadonlyArray<number>
}
export type FmOperatorIndex = 1 | 2 | 3 | 4 | 5 | 6
export type FmOperatorParamName = 'ratio' | 'level' | 'feedback' | 'output'
export type FmOperatorParam = `op${FmOperatorIndex}.${FmOperatorParamName}`
export type FmMatrixParam = `m${FmOperatorIndex}_${FmOperatorIndex}`

export type OscParam = 'freq' | 'detune' | 'phase'
export type WavetableParam = 'freq' | 'detune' | 'phase' | 'position'
export type NoiseParam = never
export type ConstantParam = 'value'
export type SamplerInstrumentParam = 'freq' | 'attack' | 'release' | 'level'
export type LofiSamplerParam =
  | 'freq'
  | 'attack'
  | 'release'
  | 'level'
  | 'bits'
  | 'downsample'
  | 'jitter'
  | 'noise'
  | 'tone'
  | 'drive'
  | 'mix'
export type AcidBassParam =
  | 'freq'
  | 'cutoff'
  | 'resonance'
  | 'envMod'
  | 'decay'
  | 'accent'
  | 'slide'
  | 'drive'
  | 'level'
export type DrumVoiceParam = 'freq' | 'decay' | 'tone' | 'snap' | 'noise' | 'drive' | 'level'
export type StringMachineParam =
  | 'freq'
  | 'detune'
  | 'attack'
  | 'release'
  | 'tone'
  | 'depth'
  | 'modulation'
  | 'width'
  | 'level'
export type PolySynthParam =
  | 'freq'
  | 'detune'
  | 'pulseWidth'
  | 'sub'
  | 'noise'
  | 'cutoff'
  | 'resonance'
  | 'envMod'
  | 'attack'
  | 'decay'
  | 'sustain'
  | 'release'
  | 'drive'
  | 'chorus'
  | 'modulation'
  | 'width'
  | 'level'
export type GainParam = 'amount'
export type PanParam = 'position'
export type BiquadParam = 'freq' | 'q' | 'gainDb'
export type StateVariableFilterParam = 'freq' | 'resonance' | 'drive' | 'mix'
export type CombParam = 'delayMs' | 'feedback' | 'damp'
export type AdsrParam = 'attack' | 'decay' | 'sustain' | 'release'
export type ArParam = 'attack' | 'release'
export type ExponentialParam = 'tau'
export type DelayParam = 'delayMs' | 'feedback' | 'mix'
export type ReverbParam = 'mix'
export type DistortionParam = 'amount'
export type ChorusParam = 'rate' | 'depth' | 'mix'
export type EnsembleChorusParam = 'rate' | 'depth' | 'mix' | 'width' | 'tone' | 'noise'
export type SpaceEchoParam =
  | 'timeMs'
  | 'feedback'
  | 'mix'
  | 'reverbMix'
  | 'wow'
  | 'flutter'
  | 'tapeAge'
  | 'drive'
export type TapeDelayParam =
  | 'timeMs'
  | 'feedback'
  | 'mix'
  | 'wow'
  | 'flutter'
  | 'tapeAge'
  | 'drive'
  | 'tone'
  | 'width'
export type PlateReverbParam =
  | 'preDelayMs'
  | 'decay'
  | 'damping'
  | 'diffusion'
  | 'modulation'
  | 'mix'
  | 'width'
export type SpringReverbParam = 'decay' | 'damping' | 'tension' | 'drip' | 'mix' | 'width'
export type NonlinearReverbParam = 'timeMs' | 'decay' | 'damping' | 'drive' | 'mix' | 'width'
export type MicroPitchParam = 'detune' | 'width' | 'delayMs' | 'mix'
export type MultiTapDelayParam = 'timeMs' | 'feedback' | 'mix' | 'tone' | 'width'
export type SaturatorParam = 'drive' | 'asymmetry' | 'tone' | 'mix' | 'output'
export type WavefolderParam = 'drive' | 'depth' | 'asymmetry' | 'tone' | 'mix' | 'output'
export type DegradeParam = 'bits' | 'downsample' | 'jitter' | 'noise' | 'tone' | 'mix'
export type TiltEqParam = 'freq' | 'gainDb' | 'mix'
export type StereoSpreadParam = 'width' | 'delayMs' | 'mix'
export type FrequencyShifterParam = 'shiftHz' | 'mix'
export type RotarySpeakerParam = 'rate' | 'depth' | 'mix' | 'drive' | 'width' | 'freq'
export type PhaserParam = 'rate' | 'depth' | 'mix'
export type PhaserVoicing = 'phase90' | 'smallStone' | 'uniVibe' | 'uniVibeVibrato'
export type CompressorParam = 'threshold' | 'ratio' | 'attack' | 'release' | 'knee'
export type BitcrushParam = 'bits' | 'downsample'
export type FmParam = 'freq' | 'detune' | 'index' | FmOperatorParam | FmMatrixParam

export type AnyParam =
  | OscParam
  | WavetableParam
  | ConstantParam
  | GainParam
  | PanParam
  | BiquadParam
  | StateVariableFilterParam
  | CombParam
  | SamplerInstrumentParam
  | LofiSamplerParam
  | AcidBassParam
  | DrumVoiceParam
  | StringMachineParam
  | PolySynthParam
  | AdsrParam
  | ArParam
  | ExponentialParam
  | DelayParam
  | ReverbParam
  | ChorusParam
  | EnsembleChorusParam
  | SpaceEchoParam
  | TapeDelayParam
  | PlateReverbParam
  | SpringReverbParam
  | NonlinearReverbParam
  | MicroPitchParam
  | MultiTapDelayParam
  | SaturatorParam
  | WavefolderParam
  | DegradeParam
  | TiltEqParam
  | StereoSpreadParam
  | FrequencyShifterParam
  | RotarySpeakerParam
  | PhaserParam
  | CompressorParam
  | BitcrushParam
  | FmParam

export type ModRate = 'audio' | 'control'

export type ModEdge = {
  param: AnyParam
  source: Node
  depth: number
  rate: ModRate
}

export type Common = {
  out: Channels
  mods: ReadonlyArray<ModEdge>
}

export type OperatorSource =
  | { kind: 'sine' }
  | { kind: 'polyblep'; wave: Waveform }
  | { kind: 'wavetable'; bank: WavetableBank; position: number }

export type OperatorInputSource =
  | { kind: 'sine' }
  | { kind: 'polyblep'; wave: Waveform }
  | { kind: 'wavetable'; bank: WavetableBank; position?: number }

export type FmOperator = OperatorSource & {
  ratio: number
  detune: number
  level: number
  feedback: number
  output: number
  phase: number
}

export type FmOperatorInput = OperatorInputSource &
  Partial<Pick<FmOperator, 'ratio' | 'detune' | 'level' | 'feedback' | 'output' | 'phase'>>

export type FmPatch = {
  freq: Hz
  detune?: number
  index?: number
  operators: ReadonlyArray<FmOperatorInput>
  matrix?: ReadonlyArray<ReadonlyArray<number>>
}

export type Node = Common &
  (
    | { kind: 'osc'; wave: Waveform; freq: Hz; detune: number; phase: number }
    | {
        kind: 'wavetable'
        bank: WavetableBank
        freq: Hz
        detune: number
        phase: number
        position: number
      }
    | {
        kind: 'fm'
        freq: Hz
        detune: number
        index: number
        operators: ReadonlyArray<FmOperator>
        matrix: ReadonlyArray<ReadonlyArray<number>>
      }
    | { kind: 'noise'; color: NoiseColor; seed: number }
    | { kind: 'constant'; value: number }
    | { kind: 'buffer'; samples: Float32Array; loop: boolean; rate: number }
    | {
        kind: 'samplerInstrument'
        zones: ReadonlyArray<SamplerZone>
        freq: Hz
        attack: number
        release: number
        level: number
        velocity?: number
      }
    | {
        kind: 'lofiSampler'
        zones: ReadonlyArray<SamplerZone>
        freq: Hz
        attack: number
        release: number
        level: number
        bits: number
        downsample: number
        jitter: number
        noise: number
        tone: number
        drive: number
        mix: number
        velocity?: number
      }
    | {
        kind: 'acidBass'
        wave: AcidBassWaveform
        freq: Hz
        cutoff: Hz
        resonance: number
        envMod: number
        decay: number
        accent: number
        slide: number
        drive: number
        level: number
        velocity?: number
      }
    | {
        kind: 'drumVoice'
        drumKind: DrumVoiceKind
        freq: Hz
        decay: number
        tone: number
        snap: number
        noise: number
        drive: number
        level: number
        velocity?: number
      }
    | {
        kind: 'stringMachine'
        freq: Hz
        detune: number
        attack: number
        release: number
        tone: number
        depth: number
        modulation: number
        width: number
        level: number
        velocity?: number
      }
    | {
        kind: 'polySynth'
        freq: Hz
        detune: number
        pulseWidth: number
        sub: number
        noise: number
        cutoff: Hz
        resonance: number
        envMod: number
        attack: number
        decay: number
        sustain: number
        release: number
        drive: number
        chorus: number
        modulation: number
        width: number
        level: number
        velocity?: number
      }
    | { kind: 'input'; channel: number }
    | { kind: 'gain'; input: Node; amount: number }
    | { kind: 'pan'; input: Node; position: number }
    | { kind: 'mix'; inputs: ReadonlyArray<Node> }
    | { kind: 'stereo'; left: Node; right: Node }
    | { kind: 'biquad'; input: Node; filter: FilterKind; freq: Hz; q: number; gainDb: number }
    | {
        kind: 'stateVariableFilter'
        input: Node
        mode: StateVariableFilterMode
        freq: Hz
        resonance: number
        drive: number
        mix: number
      }
    | { kind: 'comb'; input: Node; delayMs: number; feedback: number; damp: number }
    | { kind: 'adsr'; input: Node; attack: number; decay: number; sustain: number; release: number }
    | { kind: 'ar'; input: Node; attack: number; release: number }
    | { kind: 'exponential'; input: Node; tau: number }
    | { kind: 'delay'; input: Node; delayMs: number; feedback: number; mix: number }
    | { kind: 'reverb'; input: Node; ir: Float32Array; mix: number }
    | { kind: 'distortion'; input: Node; amount: number; shape: DistortionShape }
    | { kind: 'chorus'; input: Node; rate: Hz; depth: number; mix: number }
    | {
        kind: 'ensembleChorus'
        input: Node
        rate: Hz
        depth: number
        mix: number
        width: number
        tone: number
        noise: number
      }
    | {
        kind: 'spaceEcho'
        input: Node
        timeMs: number
        feedback: number
        mix: number
        reverbMix: number
        wow: number
        flutter: number
        tapeAge: number
        drive: number
        mode: SpaceEchoMode
      }
    | {
        kind: 'tapeDelay'
        input: Node
        timeMs: number
        feedback: number
        mix: number
        wow: number
        flutter: number
        tapeAge: number
        drive: number
        tone: number
        width: number
      }
    | {
        kind: 'plateReverb'
        input: Node
        preDelayMs: number
        decay: number
        damping: number
        diffusion: number
        modulation: number
        mix: number
        width: number
      }
    | {
        kind: 'springReverb'
        input: Node
        decay: number
        damping: number
        tension: number
        drip: number
        mix: number
        width: number
      }
    | {
        kind: 'nonlinearReverb'
        input: Node
        timeMs: number
        decay: number
        damping: number
        drive: number
        mix: number
        width: number
      }
    | {
        kind: 'microPitch'
        input: Node
        detune: number
        width: number
        delayMs: number
        mix: number
      }
    | {
        kind: 'multiTapDelay'
        input: Node
        timeMs: number
        feedback: number
        mix: number
        tone: number
        width: number
        taps: ReadonlyArray<Required<MultiTapDelayTap>>
      }
    | {
        kind: 'saturator'
        input: Node
        drive: number
        asymmetry: number
        tone: number
        mix: number
        output: number
      }
    | {
        kind: 'wavefolder'
        input: Node
        drive: number
        depth: number
        asymmetry: number
        tone: number
        mix: number
        output: number
      }
    | {
        kind: 'degrade'
        input: Node
        bits: number
        downsample: number
        jitter: number
        noise: number
        tone: number
        mix: number
      }
    | { kind: 'tiltEq'; input: Node; freq: Hz; gainDb: number; mix: number }
    | { kind: 'stereoSpread'; input: Node; width: number; delayMs: number; mix: number }
    | { kind: 'frequencyShifter'; input: Node; shiftHz: number; mix: number }
    | {
        kind: 'rotarySpeaker'
        input: Node
        rate: Hz
        depth: number
        mix: number
        drive: number
        width: number
        freq: Hz
      }
    | { kind: 'phaser'; input: Node; voicing: PhaserVoicing; rate: Hz; depth: number; mix: number }
    | {
        kind: 'compressor'
        input: Node
        threshold: number
        ratio: number
        attack: number
        release: number
        knee: number
      }
    | { kind: 'bitcrush'; input: Node; bits: number; downsample: number }
  )

export type NodeKind = Node['kind']
export type Transform = (input: Node) => Node

export type Note = { velocity?: number; gateMs?: number; atSec?: number } & (
  | { freq: Hz; midi?: never }
  | { freq?: never; midi: number }
)

export type Trigger = Note & { atSec: number }

export type Handle = {
  trigger(note: Note): void
  release(note?: Note): void
  stop(): void
  readonly underruns: number
}

export type WebAudioHandle = Handle & {
  connectInput(channel: number, source: AudioNode): void
}

export type WebAudioPlayOptions = {
  destination?: AudioNode | null
}

export type WorkletParamHandle = {
  node: Node
  param: AnyParam
  audioParamName: string
}

export type WorkletInputHandle = {
  node: Node
  channel: number
}

export type WorkletModule = {
  processorName: string
  params: ReadonlyArray<WorkletParamHandle>
  inputs: ReadonlyArray<WorkletInputHandle>
  numberOfInputs: number
  numberOfOutputs: 1
  outputChannelCount: [Channels]
  processorOptions: {
    readonly buffers: ReadonlyArray<{
      nodeId: string
      data: Float32Array
      kind: 'buffer' | 'reverb-ir'
    }>
    readonly wavetables?: ReadonlyArray<WavetableBank>
    readonly wasmBase64?: string
    readonly wasmBytes?: Uint8Array
    readonly wasmGraph?: Uint8Array
    readonly wasmParamNames?: ReadonlyArray<string>
    readonly wasmInputChannels?: number
    readonly wasmInputMap?: ReadonlyArray<number>
  }
}

export type RenderOptions = {
  duration: number
  sampleRate?: number
  triggers?: ReadonlyArray<Trigger>
  inputs?: ReadonlyArray<Float32Array>
}

export type Samples = Float32Array | [Float32Array, Float32Array]

export type VoiceFactory = {
  readonly template: Node
  play(ctx: AudioContext, opts?: WebAudioPlayOptions): WebAudioHandle
}
