# @stopcock/synth

Audio graphs as plain values. Compose oscillators, filters, envelopes,
modulators, and effects with `pipe()`, then hand the graph to a renderer.

```bash
bun add @stopcock/synth
```

```ts
import { pipe } from '@stopcock/fp'
import {
  effects,
  envelope,
  filter,
  instrument,
  oscillator,
  render,
  sampler,
  toWav,
} from '@stopcock/synth'

const bass = pipe(
  oscillator('saw', 110),
  filter.lowpass(800, 0.7),
  envelope({ attack: 0.01, decay: 0.3, sustain: 0.4, release: 0.5 }),
  effects.distortion(0.3),
  effects.ensembleChorus({ rate: 0.4, depth: 4.44, mix: 0.35 }),
  effects.tapeDelay({ timeMs: 180, feedback: 0.42, mix: 0.22, tone: 0.72 }),
  effects.plateReverb({ decay: 0.52, damping: 0.4, mix: 0.18 }),
  effects.springReverb({ decay: 0.58, damping: 0.34, tension: 0.5, drip: 0.24, mix: 0.14 }),
  effects.nonlinearReverb({ timeMs: 140, decay: 0.66, drive: 0.22, mix: 0.12 }),
  effects.spaceEcho({ timeMs: 140, feedback: 0.55, mix: 0.28, reverbMix: 0.08 }),
)

const samples = render(bass, { duration: 1, sampleRate: 48_000 })
const wav = toWav(samples, { sampleRate: 48_000 })

const sampled = sampler.instrument({
  zones: [
    {
      samples: new Float32Array([0, 0.7, 0.2, -0.2, 0]),
      sampleRate: 48_000,
      rootMidi: 60,
      keyLow: 48,
      keyHigh: 72,
      velocityLow: 0,
      velocityHigh: 1,
      loop: true,
      loopStart: 1,
      loopEnd: 4,
    },
  ],
})

const lofi = instrument.lofiSampler({
  zones: [
    {
      samples: new Float32Array([0, 0.9, 0.4, -0.15, 0]),
      sampleRate: 48_000,
      rootMidi: 60,
      keyLow: 48,
      keyHigh: 72,
    },
  ],
  bits: 12,
  downsample: 2,
  tone: 0.62,
  drive: 0.18,
})

const acid = instrument.acidBass({
  wave: 'saw',
  cutoff: 720,
  resonance: 0.7,
  envMod: 0.8,
  decay: 0.12,
  accent: 0.4,
  drive: 0.25,
})

const snare = instrument.drumVoice({
  kind: 'snare',
  decay: 0.32,
  snap: 0.7,
  noise: 0.85,
})

const strings = instrument.stringMachine({
  attack: 0.2,
  release: 1.1,
  tone: 0.78,
  depth: 0.8,
  modulation: 0.5,
})

const poly = instrument.polySynth({
  pulseWidth: 0.42,
  sub: 0.4,
  cutoff: 1400,
  resonance: 0.35,
  envMod: 0.45,
  chorus: 0.55,
})
```

Graphs are serializable node trees. The offline renderer is deterministic,
`noise()` is seeded, typed-array buffers stay caller-owned, and modulation is
represented as explicit graph edges. Public `render()` uses the embedded
Rust/WASM DSP engine, while the TypeScript DSP path is kept as an internal
reference oracle for tests and parity checks. Live playback also routes through
the WASM AudioWorklet runtime.
