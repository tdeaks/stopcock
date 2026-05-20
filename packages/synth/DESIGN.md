# @stopcock/synth

Audio-graph-as-value. Build a synth as a pipe of nodes, then hand it to a renderer (Web Audio, offline buffer, or generated AudioWorklet). The graph is plain data — serializable, snapshottable, comparable.

**synth is where the pipe abstraction lives for audio.** Every effect, filter, envelope, modulation, voice, and mix is a pipe stage that returns a `Node` (plain data). You chain them with `pipe()` exactly like svg shapes or image transforms. The renderer is the only thing that touches stateful DSP kernels in `@stopcock/signal` — you don't.

```ts
const bass = pipe(
  oscillator('saw', 110),
  filter.lowpass(800, 0.7),
  envelope({ attack: 0.01, decay: 0.3, sustain: 0.4, release: 0.5 }),
  effects.distortion(0.3),
)

const voice = synth.voice.poly(bass, { max: 8 })
const handle = voice.play(ctx)
handle.trigger({ midi: 36, velocity: 0.9 })
```

## Layering

```
You:      pipe(oscillator(...), filter.lowpass(...), effects.delay(...))   ← pipe-clean composition
                          │
                          ▼  Node tree (plain data, structuredClone-safe)
                          │
Renderer: walks the graph, allocates state once, calls signal kernels      ← stateful per-block work
                          │
                          ▼  Float32Array out / Web Audio graph / AudioWorklet
```

Users compose Nodes. The renderer materializes them. Three backends share the same Node type: offline (pure-JS sample loop), Web Audio (built-in `AudioNode` graph), and AudioWorklet (codegen'd `AudioWorkletProcessor`). Adding a backend doesn't change user code.

## Decisions

| # | Question | Decision |
|---|----------|----------|
| 1 | Composition model | Pipe. First stage is a source (no audio input). Later stages are transforms with one input. `mix([...])` is the fan-in stage. |
| 2 | Node shape | Discriminated union, `kind` plus structural `Common` (`out`, `mods`). Plain data only — no closures, no class instances. Nodes must round-trip through `structuredClone`. Typed-array fields (IR buffers, sample buffers) are caller-owned and treated as immutable by convention; see Buffer ownership below. |
| 3 | Parameter type | `Param = number` at the API. Constants in, constants out. Modulation is a separate stage: `pipe(filter.lowpass(800), modulate('freq', lfo, 400))`. Each Node kind exposes a fixed, typed set of param names; the graph walker rejects modulations targeting non-existent params at compile time. |
| 4 | Modulation rate | Audio-rate by default. `{ rate: 'control' }` opts into k-rate (one value per block, cheaper). |
| 5 | Modulation summing | All modulations on the same param sum into the base value. Matches Web Audio `AudioParam` semantics. |
| 6 | Voicing | `voice.mono(template)` and `voice.poly(template, { max })` lift a template Node into a triggerable instrument. Templates are values; voices clone them per trigger. |
| 7 | Triggering | Returned `Handle` exposes `trigger(note)`, `release(note?)`, `stop()`. A `Note` carries exactly one of `freq` or `midi` (TS-enforced), plus optional `velocity`, `gateMs`, and `atSec`. Scheduling lives on the Note itself; no separate opts arg. |
| 8 | Channels | Mono first. `stereo(left, right): Node` is a two-input constructor that lifts two mono Nodes into one stereo Node — not a pipe transform. `pan(position)` is the pipe transform from mono to stereo. Channel count lives on `Common.out: 1 \| 2`. |
| 9 | Sample rate | Implicit from runtime. Web Audio backend reads `ctx.sampleRate`. Offline takes `{ sampleRate }`. Internal DSP is sample-rate agnostic; coefficients are computed at compile time per target rate. |
| 10 | Time | No global clock inside synth. `trigger({ midi, atSec })` schedules against the backend's clock (the `atSec` field on `Note`). Sequencing belongs to `@stopcock/seq`. |
| 11 | Backend dispatch | Each backend (`play`, `render`, `compileWorklet`) shares an internal `compile(node, target)` walker in `internal/compile.ts` that produces backend-specific IR. **`compile` is internal**; user-facing API is `play` / `render` / `compileWorklet`. Web Audio backend maps to built-in `AudioNode`s where they exist; falls back to a generated AudioWorklet for stages without a native equivalent (`distortion`, `bitcrush`, `comb`, `chorus`). |
| 12 | Worklet generation | `internal/kernels.ts` ships a kernel template for **every** `NodeKind`, not just custom-DSP ones. `compileWorklet(ctx, node)` therefore handles any graph; the Web Audio backend's native/worklet partitioning is a *performance optimization*, not a correctness boundary. External audio enters a worklet via `input(channel)`, which compiles to a read from the processor's `inputs[channel]` argument. Sample buffers (`buffer.samples`, `reverb.ir`) cross the thread boundary via `processorOptions`. The per-context cache stores only `addModule` registration promises keyed by processor name; the returned `WorkletModule` (with its node references and param map) is **always built fresh per compile call** so it never aliases another graph's Nodes. |
| 13 | Determinism | Offline render is fully deterministic. `noise` carries a required `seed: number`; the convenience constructor `noise(color)` applies `DEFAULT_NOISE_SEED = 0`. Float32Array hashes are stable across runs. Callers who want non-repeating noise pass an explicit non-zero seed (typically `(Math.random() * 2**32) >>> 0`). |
| 14 | Errors | Compile-time errors throw `SynthCompileError`. Runtime DSP never throws; on bad input a stage outputs silence and increments `handle.underruns`. |
| 15 | Reuse | Reference equality. The graph walker dedups by identity, so `const lfo = ...` shared across two `modulate` calls compiles to one source node. |
| 16 | Buffer ownership | `Object.freeze` is applied to Node object wrappers only — never to typed arrays (Bun and most engines throw on `Object.freeze(new Float32Array(...))`). Callers must not mutate typed-array fields after handing a Node to `pipe`. The walker copies typed arrays only when crossing a thread boundary (AudioWorklet transfer). |

## Type system

```ts
import type { BiquadCoeffs } from '@stopcock/signal'

export type Channels = 1 | 2
export type Hz = number
export type Waveform = 'sine' | 'saw' | 'square' | 'triangle'
export type NoiseColor = 'white' | 'pink' | 'brown'
export type FilterKind = 'lowpass' | 'highpass' | 'bandpass' | 'notch' | 'peak' | 'lowshelf' | 'highshelf' | 'allpass'
export type DistortionShape = 'tanh' | 'softclip' | 'hardclip'

// Per-kind modulatable parameter names. Constructors expose these as constants
// under `params.*` so callers get autocomplete and the graph walker can
// validate modulation targets against the preceding stage's kind.
export type OscParam        = 'freq' | 'detune' | 'phase'
export type NoiseParam      = never
export type ConstantParam   = 'value'
export type GainParam       = 'amount'
export type PanParam        = 'position'
export type BiquadParam     = 'freq' | 'q' | 'gainDb'
export type CombParam       = 'delayMs' | 'feedback' | 'damp'
export type AdsrParam       = 'attack' | 'decay' | 'sustain' | 'release'
export type ArParam         = 'attack' | 'release'
export type DelayParam      = 'delayMs' | 'feedback' | 'mix'
export type ReverbParam     = 'mix'
export type DistortionParam = 'amount'
export type ChorusParam     = 'rate' | 'depth' | 'mix'
export type CompressorParam = 'threshold' | 'ratio' | 'attack' | 'release' | 'knee'
export type BitcrushParam   = 'bits' | 'downsample'

export type AnyParam =
  | OscParam | ConstantParam | GainParam | PanParam | BiquadParam | CombParam
  | AdsrParam | ArParam | DelayParam | ReverbParam | DistortionParam
  | ChorusParam | CompressorParam | BitcrushParam

export type ModEdge = {
  param: AnyParam
  source: Node
  depth: number
  rate: 'audio' | 'control'
}

export type Common = {
  out: Channels
  mods: ReadonlyArray<ModEdge>
}

export type Node = Common & (
  | { kind: 'osc',        wave: Waveform, freq: Hz, detune: number, phase: number }
  | { kind: 'noise',      color: NoiseColor, seed: number }
  | { kind: 'constant',   value: number }
  | { kind: 'buffer',     samples: Float32Array, loop: boolean, rate: number }    // samples treated as immutable, see #16
  | { kind: 'input',      channel: number }                                       // mic / external
  | { kind: 'gain',       input: Node, amount: number }
  | { kind: 'pan',        input: Node, position: number }                         // -1 .. 1
  | { kind: 'mix',        inputs: ReadonlyArray<Node> }
  | { kind: 'stereo',     left: Node, right: Node }
  | { kind: 'biquad',     input: Node, filter: FilterKind, freq: Hz, q: number, gainDb: number }
  | { kind: 'comb',       input: Node, delayMs: number, feedback: number, damp: number }
  | { kind: 'adsr',       input: Node, attack: number, decay: number, sustain: number, release: number }
  | { kind: 'ar',         input: Node, attack: number, release: number }
  | { kind: 'delay',      input: Node, delayMs: number, feedback: number, mix: number }
  | { kind: 'reverb',     input: Node, ir: Float32Array, mix: number }            // ir treated as immutable, see #16
  | { kind: 'distortion', input: Node, amount: number, shape: DistortionShape }
  | { kind: 'chorus',     input: Node, rate: Hz, depth: number, mix: number }
  | { kind: 'compressor', input: Node, threshold: number, ratio: number, attack: number, release: number, knee: number }
  | { kind: 'bitcrush',   input: Node, bits: number, downsample: number }
)

// Exactly one of freq or midi must be present. TS-enforced via the `never`
// trick: each variant declares the other field as `never`, so { freq, midi }
// and {} both fail to typecheck.
export type Note =
  & { velocity?: number, gateMs?: number, atSec?: number }
  & (
    | { freq: Hz,        midi?: never }
    | { freq?: never,    midi: number }
  )

// A Trigger is a Note pinned to a specific time. Used by render() to drive an
// offline render with a fixed timeline; equivalent to calling handle.trigger
// repeatedly against the live runtime.
export type Trigger = Note & { atSec: number }

// Base Handle: the runtime-agnostic surface every backend implements.
export type Handle = {
  trigger(note: Note): void
  release(note?: Note): void
  stop(): void
  readonly underruns: number
}

// Web Audio-specific extension. Returned by play(ctx, node) and
// voice.*.play(ctx). Offline handles (from render()) do not carry
// AudioNode-typed methods.
export type WebAudioHandle = Handle & {
  connectInput(channel: number, source: AudioNode): void
}

// One handle per modulatable param of one Node instance. Two distortion nodes
// in the same graph produce two `amount` handles with distinct audioParamName.
// References point at the Nodes from THIS compile call — never reused across
// compiles, see decision #12 and the Worklet backend section.
export type WorkletParamHandle = {
  node: Node                // the Node this param belongs to (reference equality, this-compile)
  param: AnyParam           // the synth-level param name (e.g. 'amount', 'freq')
  audioParamName: string    // the AudioParam name on the generated processor
}

// One handle per input(channel) Node in the graph. Sparse channels are fine:
// a graph with input(0) and input(7) yields two handles with .channel === 0
// and 7, and the AudioWorkletNode needs numberOfInputs === 8.
export type WorkletInputHandle = {
  node: Node                // the input() Node
  channel: number           // synth-level channel value; also the AudioWorkletNode input index
}

export type WorkletModule = {
  processorName: string                             // content-hashed over the processor body; stable across re-compiles of the same source
  params: ReadonlyArray<WorkletParamHandle>         // per-instance, one entry per modulatable param of each node
  inputs: ReadonlyArray<WorkletInputHandle>         // per-instance, one entry per input() Node
  numberOfInputs: number                            // max(inputs.channel) + 1, or 0 if no inputs; pass to AudioWorkletNode
  numberOfOutputs: 1                                // always exactly one output (the root Node)
  outputChannelCount: [Channels]                    // single-element tuple: [root.out]; e.g. [2] for a stereo root. Mutable tuple type so it assigns to AudioWorkletNodeOptions.outputChannelCount (number[]) without a spread.
  processorOptions: {
    readonly buffers: ReadonlyArray<{
      nodeId: string                                // matches the per-instance code's reference
      data: Float32Array                            // a structuredClone-transferable copy of buffer.samples / reverb.ir
      kind: 'buffer' | 'reverb-ir'
    }>
  }
}

// Throwing helpers for wm.params / wm.inputs lookup so callers don't dereference
// a possibly-undefined .find() result. Both throw SynthCompileError with a
// useful message when the (node, param) or (node) pair isn't in the module.
export function workletParam(wm: WorkletModule, node: Node, param: AnyParam): WorkletParamHandle
export function workletInput(wm: WorkletModule, node: Node): WorkletInputHandle
```

### Buffer ownership

Typed-array fields on Node (`buffer.samples`, `reverb.ir`) are caller-owned. The library reads them but never mutates them; callers must not mutate them after handing a Node to `pipe` or `compile`. The graph walker freezes object wrappers via `Object.freeze`; it does not call `Object.freeze` on typed arrays because most JS engines (including Bun) throw on that. When a Node crosses a thread boundary (AudioWorklet), the walker copies typed arrays into the message payload — callers can still safely reuse the originals.

### Param name constants

Per-kind param names are also re-exported as a constants object so callers can use them in `modulate` calls and get autocomplete:

```ts
export const params = {
  osc:        { freq: 'freq', detune: 'detune', phase: 'phase' },
  biquad:     { freq: 'freq', q: 'q', gainDb: 'gainDb' },
  adsr:       { attack: 'attack', decay: 'decay', sustain: 'sustain', release: 'release' },
  // ...
} as const
```

`modulate('freq', lfo, 400)` works; `modulate(params.biquad.freq, lfo, 400)` also works and gives IDE completion. The compile-time validator checks that the param name exists on the preceding stage's kind regardless.

## Operators

Every transform takes a Node as its single piped input. Sources, `mix`, and `stereo` take their inputs as positional args.

### Sources

```
oscillator(wave, freq, opts?: { detune?, phase? })   : Node
noise(color, opts?: { seed? })                       : Node
constant(value)                                      : Node          // DC / control source
buffer(samples, opts?: { loop?, rate? })             : Node
input(channel = 0)                                   : Node
```

`constant` is named in full to avoid the `const` JS keyword. Use it for control-rate biases and as the bias term any modulated param sits on top of.

### Linear

```
gain(amount)                                         : Node => Node
pan(position)                                        : Node => Node          // mono in, stereo out
mix(inputs: ReadonlyArray<Node>)                     : Node                  // fan-in
stereo(left: Node, right: Node)                      : Node                  // two-input constructor
```

`stereo` is **not** a pipe transform. Both channels are equal arguments; piping one in and passing the other would be asymmetric. Use `pan` if you want to take a mono node through a pipe and end up stereo.

### Filters (biquad family, designed via @stopcock/signal)

```
filter.lowpass(freq, q?)                             : Node => Node
filter.highpass(freq, q?)                            : Node => Node
filter.bandpass(freq, q?)                            : Node => Node
filter.notch(freq, q?)                               : Node => Node
filter.peak(freq, q?, gainDb?)                       : Node => Node
filter.lowshelf(freq, gainDb?)                       : Node => Node
filter.highshelf(freq, gainDb?)                      : Node => Node
filter.allpass(freq, q?)                             : Node => Node
filter.comb(delayMs, feedback, damp?)                : Node => Node
```

### Envelopes

```
envelope({ attack, decay, sustain, release })        : Node => Node
envelope.ar({ attack, release })                     : Node => Node
envelope.exponential({ tau })                        : Node => Node
```

Envelopes are applied as multipliers and are gated by the voice that owns them. A bare `pipe(oscillator(...), envelope(...))` outside a voice triggers once on `play()`.

### Effects

```
effects.distortion(amount, shape?)                   : Node => Node     // shape defaults to 'tanh'
effects.delay(delayMs, feedback, mix?)               : Node => Node
effects.reverb(ir | { roomSize, decay }, mix?)       : Node => Node
effects.chorus(rate, depth, mix?)                    : Node => Node
effects.compressor(opts)                             : Node => Node
effects.bitcrush(bits, downsample?)                  : Node => Node
```

### Modulation

```
modulate(param: AnyParam, source: Node, depth: number, opts?: { rate? }) : Node => Node
```

Wires `source` (any Node) into the named parameter of the immediately-preceding stage. The graph walker validates that `param` exists on the preceding stage's kind at compile time; misnamed params throw `SynthCompileError`. Multiple modulations on the same param sum; `depth` is the scaling factor and the param's declared value is the bias.

```ts
const wobble = pipe(
  oscillator('saw', 110),
  filter.lowpass(800, 4),
  modulate('freq', pipe(oscillator('sine', 2), gain(0.5)), 600),
)
```

### Voicing

```
voice.mono(template)                                 : VoiceFactory
voice.poly(template, { max })                        : VoiceFactory
voice.trigger(template)                              : VoiceFactory   // one-shot, freed on envelope end
```

`VoiceFactory.play(ctx)` returns a `WebAudioHandle`. The factory clones `template` per active voice and patches the trigger note into the source `freq`. For offline use, pass the template directly to `render(template, { triggers, ... })` — the renderer treats each trigger as a fresh voice clone and mixes the results.

## Render contract

```ts
play(ctx: AudioContext, node: Node)              : WebAudioHandle
render(node: Node, opts: {
  duration: number,
  sampleRate?: number,
  triggers?: ReadonlyArray<Trigger>,
  inputs?: ReadonlyArray<Float32Array>,    // indexed by input(channel); required if graph contains input() Nodes
})                                                : Float32Array | [Float32Array, Float32Array]
compileWorklet(ctx: AudioContext, node: Node)    : Promise<WorkletModule>
toWav(samples: Float32Array | [Float32Array, Float32Array], opts: {
  sampleRate: number,
})                                                : Uint8Array
```

### Web Audio backend

Walk the Node. For each kind, instantiate the corresponding built-in `AudioNode`:
- `osc` → `OscillatorNode`
- `gain` → `GainNode`
- `constant` → `ConstantSourceNode`
- `biquad` → `BiquadFilterNode`
- `delay` → `DelayNode` (+ `GainNode` feedback)
- `reverb` → `ConvolverNode`
- `compressor` → `DynamicsCompressorNode`
- `pan` → `StereoPannerNode`
- `mix` → `GainNode` summing junction
- `stereo` → `ChannelMergerNode(2)`
- `noise` → generated `AudioBuffer` looped through `AudioBufferSourceNode`
- `adsr` / `ar` → `GainNode` with scheduled `AudioParam` ramps on `trigger()`

Anything without a native equivalent (`distortion`, `bitcrush`, `comb`, `chorus`) routes through a lazily-instantiated `AudioWorkletNode` produced by `compileWorklet`. The compiler partitions the graph at native/worklet boundaries automatically. The partition is performance-driven, not correctness-driven — kernel templates exist for every kind, so any subgraph could be compiled to a worklet; the backend just prefers built-ins where they exist.

`input(channel)` Nodes map to whatever external `AudioNode` the caller wires into the synth handle (typical: a `MediaStreamAudioSourceNode` for mic input). The handle exposes a `connectInput(channel, node)` method for this.

### Offline backend

Topo-sort the DAG. Allocate a Float32Array per node output, sized to `duration * sampleRate`. Compute filter coefficients once per stage at the target rate. Run a block loop (default 128 samples), calling the appropriate `@stopcock/signal` kernel for each kind. Modulation edges are read at block start (control rate) or per-sample (audio rate). `triggers` are sorted by `atSec` and applied as the block loop crosses each timestamp. Returns mono or `[left, right]` stereo per the root node's `out`.

`input(channel)` Nodes read from `opts.inputs[channel]`. If the graph contains any `input(...)` and `opts.inputs` is missing or shorter than the highest referenced channel, `compile` throws `SynthCompileError`. Each input buffer must be `duration * sampleRate` samples long.

### Worklet backend

`internal/kernels.ts` exports a `kernels: Record<NodeKind, KernelTemplate>` map covering **every** `NodeKind` — sources (`osc`, `noise`, `constant`, `buffer`, `input`), linear stages, filters, envelopes, effects, modulation. Each template is a function `(node, paramRef) => string` that returns JS DSP code for that node, parameterized over the node's fields and the `audioParamName` strings the processor exposes for each modulatable param.

`compileWorklet(ctx, node)` runs the following pipeline:

1. Walk the graph, assigning each Node a stable `NodeId` (counter in topo order, scoped to this compile call).
2. For each Node instance, emit per-instance code by invoking the kernel template. Each modulatable param gets a unique `audioParamName = 'n' + nodeId + '_' + paramName` (e.g. `n4_amount`, `n7_freq`). `input(channel)` nodes compile to reads from the processor's `inputs[channel]` block argument. Nodes carrying typed-array payloads (`buffer.samples`, `reverb.ir`) emit references to `this.buffers[nodeId]` — `processorOptions` is only accessible in the constructor, not in `process()`, so the constructor stashes the payloads on `this` and process-time code reads from there.
3. Collect the typed-array payloads. For each `buffer` and `reverb` node, append `{ nodeId, data: samples.slice(), kind }` to a `buffers` array. The `.slice()` is the boundary copy promised by decision #16 — the worklet gets its own typed array, and the original caller-owned buffer remains untouched.
4. Assemble the **processor body**: the `AudioWorkletProcessor` subclass declaration including `static get parameterDescriptors()` (one entry per `audioParamName` with defaults from each Node's declared param), the constructor (`constructor(options) { super(); this.buffers = Object.fromEntries(options.processorOptions.buffers.map(b => [b.nodeId, b.data])); }`), and the `process(inputs, outputs, parameters)` method that runs the concatenated per-instance code. The generated `process` method must `return true` after the per-instance code runs, so the processor keeps receiving blocks — `false` (or fall-through `undefined`) signals "I'm done" to the worklet runtime and the node stops processing. Voices manage their own lifecycle through envelopes and `stop()`; the processor itself runs for the lifetime of the AudioWorkletNode. **Do not** emit the `registerProcessor(...)` call yet — the body must not reference its own future name.
5. Compute `processorName = 'stopcock-' + sha256(processorBody).slice(0, 16)`. The hash covers the body only (not the buffer payloads, not the registerProcessor wrapper), so two graphs whose body is identical but whose IRs differ share a processor name but ship different `processorOptions.buffers`. With the name in hand, emit the final module source by appending `registerProcessor('${processorName}', ${className})` to the body.
6. Look up the name in a module-level `WeakMap<AudioContext, Map<string, Promise<void>>>`. If absent, build a blob URL from the final source, kick off `ctx.audioWorklet.addModule(blobUrl)`, and cache **a single chained promise** that performs both blob revocation and cache eviction-on-failure. Splitting `.catch` and `.finally` off the original promise creates derived promises that can surface as unhandled rejections even when the caller `await`s the original. The chained form bundles all the side effects into one tracked promise:
   ```ts
   const blobUrl = URL.createObjectURL(new Blob([finalSource], { type: 'application/javascript' }))
   const registration = ctx.audioWorklet.addModule(blobUrl).then(
     () => { URL.revokeObjectURL(blobUrl) },
     (err) => {
       URL.revokeObjectURL(blobUrl)
       if (cache.get(processorName) === registration) cache.delete(processorName)
       throw err
     },
   )
   cache.set(processorName, registration)
   await registration
   ```
   If already present (resolved or in-flight), `await` the existing promise — no new blob is created, since `addModule` has already been called for this content. The cache stores **only** the addModule registration — never the `WorkletModule` itself, since `WorkletModule.params[].node` references are scoped to this compile and would alias the wrong graph if shared.
7. Compute `numberOfInputs = max(inputChannel) + 1` over `input(channel)` nodes in the graph (or `0` if none). Build the `inputs` handle array and the `processorOptions` object from earlier steps. Set `outputChannelCount = [rootNode.out]` so a stereo root produces a stereo output (the default AudioWorkletNode behavior is one mono output, which would silently downmix).
8. Return a freshly-constructed `WorkletModule = { processorName, params, inputs, numberOfInputs, numberOfOutputs: 1, outputChannelCount, processorOptions }`.

The caller instantiates the node with everything from the module:

```ts
const node = new AudioWorkletNode(ctx, wm.processorName, {
  numberOfInputs: wm.numberOfInputs,
  numberOfOutputs: wm.numberOfOutputs,
  outputChannelCount: wm.outputChannelCount,    // [2] for stereo root, [1] for mono
  processorOptions: wm.processorOptions,
  parameterData: Object.fromEntries(wm.params.map(p => [p.audioParamName, defaultFor(p.node, p.param)])),
})

// Wire each input() Node via the lookup helper (throws if the node isn't an input
// in this module, rather than dereferencing a possibly-undefined .find() result):
const micHandle = workletInput(wm, myMicInputNode)
micStream.connect(node, 0, micHandle.channel)

// Per-modulatable-param AudioParam access. node.parameters.get() returns
// AudioParam | undefined per DOM types; a small helper makes the example
// safe to copy:
const getParam = (h: WorkletParamHandle): AudioParam => {
  const p = node.parameters.get(h.audioParamName)
  if (!p) throw new Error(`AudioParam not found: ${h.audioParamName}`)
  return p
}
const ampHandle = workletParam(wm, myDistortion, 'amount')
getParam(ampHandle).setValueAtTime(0.8, ctx.currentTime)
```

The Web Audio backend manages this lifecycle automatically when it encounters a worklet-only subgraph during `play()`. Callers only invoke `compileWorklet` directly when they want to use the generated processor outside a synth `play()` call.

**Cache discipline.** Two invariants:
- The content-hashed processor **name** guarantees `registerProcessor` is never called twice with the same name in the same `AudioWorkletGlobalScope`.
- The per-context **promise cache** guarantees `addModule` is never called twice — even under concurrent compile calls — for the same source in the same context.

The `WorkletModule` returned to the caller is always a fresh object containing `Node` references from the current compile only. Param handles never leak across compiles even when the underlying processor source is identical.

## Build order

1. `types.ts`, `internal/graph.ts` (walk, topo, dedup, freeze wrappers only, validate modulation targets).
2. Sources: `oscillator`, `constant`, `gain`, `mix`. No filters yet.
3. `render/offline.ts` for the above. First milestone: render a sine wave to a buffer that matches `Math.sin` to within 1e-6.
4. `render/wav.ts` so we can listen to offline renders.
5. `filter.*` over `@stopcock/signal` biquads. Test against the closed-form biquad impulse response.
6. `envelope` (ADSR) in the offline renderer. Test the four phases produce monotonic-by-segment output.
7. `modulate`. Audio-rate first (cleanest), control-rate as a cheap special case. Tests for compile-time rejection of bad param names.
8. `render/web.ts` for the native-mapped subset. Demo: play the README bass line.
9. Custom-DSP effects: `distortion`, `bitcrush`, `comb`, `chorus`. Implement in the offline backend first.
10. `internal/kernels.ts` + `render/worklet.ts`. Codegen + module registration + native/worklet partition in `render/web.ts`.
11. `voice.mono`, `voice.poly`. Note-to-freq binding.
12. `effects.reverb` with `{ roomSize, decay }` IR generator (exponentially decaying noise) for callers without their own IR.

## Conventions

- Constructors take positional required args, then an optional opts object.
- Every transform is `(opts) => (node) => node`. Pipe-clean.
- Default values live in `defaults.ts`: `DEFAULT_Q = 0.7071`, `DEFAULT_DETUNE = 0`, etc. Constructors apply them.
- No `null` or `undefined` flows through the graph. Optional fields normalize to their defaults at construction.
- The graph is frozen on entry to the internal `compile()` walker (called by `play`, `render`, and `compileWorklet`): every Node object wrapper goes through `Object.freeze`. Typed-array fields are not frozen (engines throw); they're treated as immutable by convention per decision #16.
- Param names are typed per kind. Use string literals or the `params.*` constants; the walker validates at compile time.

## Linear algebra integration (later)

`@stopcock/la` doesn't earn its keep until:
- Per-voice DC-blocking and oversampling stacks want matrix-form filter cascades.
- Spectral effects (formant shifter, vocoder) ship.

Convolution reverb already has its FFT machinery in `signal.convolve` and doesn't need la.

Defer until a feature actually needs it.

## What this commits us to

- One graph type, three backends. Adding a backend doesn't change user code.
- Pure data flows through pipe. No hidden context, no `this`, no class chains.
- Custom DSP lives in `signal` (offline path) and `internal/kernels.ts` (worklet codegen). Web Audio gets it for free wherever a built-in matches.
- Voices are values that hold templates. Polyphony is a runtime concept, not a graph rewrite.
- Param names are typed and validated at compile. Misnamed modulations fail loudly before any audio runs.
- WASM kernels are a future swap: the offline backend's inner loop is already shaped like a kernel call.

## Open questions

These don't block step 1.

- **`voice.note()` as a first-class source.** Replace auto-binding of trigger frequency with an explicit `voice.note()` Node that voices fill in per-trigger. Wired via `modulate('freq', voice.note(), 1)`. Handles FM (modulator at `voice.note()` × ratio), kick drums (only the body osc binds), and detuned stacks (offsets relative to note) uniformly. Decision deferred; current spec says voices auto-patch `osc` `freq`.
- **Cycles / feedback paths.** Comb and delay have implicit one-block feedback. Larger user-defined feedback (e.g. Karplus-Strong with an explicit cycle) needs an explicit `feedback(node, fn)` constructor that establishes a delay-line break. Add when the first user case shows up.
- **Sidechain inputs.** Compressor sidechain is a second input. Either widen the `compressor` Node with an optional `sidechain: Node`, or add a generic `tap()` operator. The first is simpler if sidechain stays compressor-only.
- **MIDI in/out.** Lives in `@stopcock/seq`. Synth exposes `voice.*` triggers; seq drives them.
- **Karplus-Strong, FM, additive helpers.** Compose from primitives in user code first. Promote to library helpers when a pattern repeats.
- **Wavetable oscillator.** `oscillator('wavetable', table)` is a natural addition once a real use case lands. Don't speculate.
- **AudioWorklet messaging cost.** The codegen path assumes one worklet per subgraph. If users build many small worklet-only subgraphs, batching them under a single processor with internal routing may matter. Measure first.
- **Stereo widening operators.** `widen(amount)`, `mid()`, `side()`. Easy additions once `stereo` is in place.
- **Typed pipe inference.** Today `modulate` validates the param name against the *preceding* stage at compile time (runtime walker check). A pipe-aware TS-level inference that knows the upstream stage's kind would catch typos in the editor. Pure ergonomics; doesn't block correctness.
