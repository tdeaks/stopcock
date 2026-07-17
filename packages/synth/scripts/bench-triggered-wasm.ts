import { pipe } from '@stopcock/fp'
import { constant, effects, envelope, gain, instrument, mix, noise, oscillator } from '../src/nodes'
import type { Node, RenderOptions, Samples, Trigger } from '../src/types'
import {
  isSynthWasmRuntimeResetAvailable,
  renderWasmForTest,
  renderWasmTriggeredLegacyForBench,
  renderWasmTriggeredRuntimeForBench,
  triggeredWasmModeForTest,
} from '../src/render/wasm'

type BenchCase = {
  readonly name: string
  readonly graph: Node
  readonly opts: RenderOptions
  readonly iterations: number
}

type BenchResult = {
  readonly checksum: number
  readonly avgMs: number
  readonly minMs: number
  readonly maxMs: number
}

const SAMPLE_RATE = 48_000

if (!isSynthWasmRuntimeResetAvailable()) {
  throw new Error('embedded synth WASM does not expose stopcock_synth_runtime_reset_event; run bun run build:wasm first')
}

const cases: BenchCase[] = [
  {
    name: 'dense triggered effect stack',
    graph: pipe(
      mix([
        pipe(oscillator('saw', 110), gain(0.55)),
        pipe(oscillator('triangle', 55), gain(0.25)),
        pipe(noise('pink', { seed: 0xBEEF }), gain(0.035)),
      ]),
      envelope({ attack: 0.002, decay: 0.08, sustain: 0.45, release: 0.18 }),
      effects.spaceEcho({ timeMs: 92, feedback: 0.34, mix: 0.32, reverbMix: 0.08, wow: 0.12, flutter: 0.05, tapeAge: 0.32, drive: 0.12 }),
      effects.plateReverb({ preDelayMs: 8, decay: 0.45, damping: 0.45, diffusion: 0.7, modulation: 0.14, mix: 0.18, width: 0.95 }),
      effects.saturator({ drive: 0.18, asymmetry: 0.08, tone: 0.76, mix: 0.42, output: 0.9 }),
    ),
    opts: {
      duration: 1.4,
      sampleRate: SAMPLE_RATE,
      triggers: chromaticStack(72, 0.012, 42, 0.18),
    },
    iterations: 12,
  },
  {
    name: 'sample-heavy lo-fi sampler',
    graph: instrument.lofiSampler({
      zones: samplerZones(),
      bits: 10,
      downsample: 3,
      jitter: 0.05,
      noise: 0.04,
      tone: 0.58,
      drive: 0.18,
      mix: 0.92,
      attack: 0.001,
      release: 0.12,
      level: 0.82,
    }),
    opts: {
      duration: 1.25,
      sampleRate: SAMPLE_RATE,
      triggers: chromaticStack(64, 0.01, 36, 0.14),
    },
    iterations: 10,
  },
  {
    name: 'gated wrapper tail bounds',
    graph: pipe(
      constant(0.8),
      envelope.ar({ attack: 0.001, release: 0.08 }),
      effects.bitcrush(6, 12),
      effects.compressor({ threshold: -24, ratio: 6, attack: 0.001, release: 0.05 }),
    ),
    opts: {
      duration: 1.2,
      sampleRate: SAMPLE_RATE,
      triggers: chromaticStack(96, 0.007, 48, 0.09),
    },
    iterations: 20,
  },
  {
    name: 'zero-feedback delay tail bound',
    graph: pipe(
      constant(0.8),
      envelope.ar({ attack: 0.001, release: 0.08 }),
      effects.delay(18, 0, 1),
    ),
    opts: {
      duration: 1.2,
      sampleRate: SAMPLE_RATE,
      triggers: chromaticStack(96, 0.007, 48, 0.09),
    },
    iterations: 20,
  },
  {
    name: 'chorus tail bound',
    graph: pipe(
      constant(0.8),
      envelope.ar({ attack: 0.001, release: 0.08 }),
      effects.chorus(1.4, 18, 1),
    ),
    opts: {
      duration: 1.2,
      sampleRate: SAMPLE_RATE,
      triggers: chromaticStack(96, 0.007, 48, 0.09),
    },
    iterations: 20,
  },
  {
    name: 'micro-pitch tail bound',
    graph: pipe(
      constant(0.8),
      envelope.ar({ attack: 0.001, release: 0.08 }),
      effects.microPitch({ detune: 14, width: 1, delayMs: 10, mix: 1 }),
    ),
    opts: {
      duration: 1.2,
      sampleRate: SAMPLE_RATE,
      triggers: chromaticStack(96, 0.007, 48, 0.09),
    },
    iterations: 20,
  },
  {
    name: 'stereo spread tail bound',
    graph: pipe(
      constant(0.8),
      envelope.ar({ attack: 0.001, release: 0.08 }),
      effects.stereoSpread({ width: 1, delayMs: 12, mix: 1 }),
    ),
    opts: {
      duration: 1.2,
      sampleRate: SAMPLE_RATE,
      triggers: chromaticStack(96, 0.007, 48, 0.09),
    },
    iterations: 20,
  },
  {
    name: 'frequency shifter tail bound',
    graph: pipe(
      constant(0.8),
      envelope.ar({ attack: 0.001, release: 0.08 }),
      effects.frequencyShifter({ shiftHz: 110, mix: 1 }),
    ),
    opts: {
      duration: 1.2,
      sampleRate: SAMPLE_RATE,
      triggers: chromaticStack(96, 0.007, 48, 0.09),
    },
    iterations: 20,
  },
  {
    name: 'rotary speaker conservative tail',
    graph: pipe(
      constant(0.8),
      envelope.ar({ attack: 0.001, release: 0.08 }),
      effects.rotarySpeaker({ rate: 6.4, depth: 1, mix: 1, drive: 0.1, width: 1 }),
    ),
    opts: {
      duration: 1.2,
      sampleRate: SAMPLE_RATE,
      triggers: chromaticStack(96, 0.007, 48, 0.09),
    },
    iterations: 12,
  },
  {
    name: 'no-feedback multi-tap delay tail bound',
    graph: pipe(
      constant(0.8),
      envelope.ar({ attack: 0.001, release: 0.08 }),
      effects.multiTapDelay({
        timeMs: 18,
        feedback: 0,
        mix: 1,
        tone: 1,
        width: 1,
        taps: [
          { ratio: 1, gain: 1, pan: -1 },
          { ratio: 1.5, gain: 0.65, pan: 1 },
        ],
      }),
    ),
    opts: {
      duration: 1.2,
      sampleRate: SAMPLE_RATE,
      triggers: chromaticStack(96, 0.007, 48, 0.09),
    },
    iterations: 20,
  },
]

for (const bench of cases) {
  const selectedMode = triggeredWasmModeForTest(bench.graph)
  const selected = measure(() => renderWasmForTest(bench.graph, bench.opts), bench.iterations)
  const runtime = measure(() => renderWasmTriggeredRuntimeForBench(bench.graph, bench.opts), bench.iterations)
  const legacy = measure(() => renderWasmTriggeredLegacyForBench(bench.graph, bench.opts), bench.iterations)
  const selectedDiff = maxAbsDiff(
    renderWasmForTest(bench.graph, bench.opts),
    selectedMode === 'runtime'
      ? renderWasmTriggeredRuntimeForBench(bench.graph, bench.opts)
      : renderWasmTriggeredLegacyForBench(bench.graph, bench.opts),
  )
  const maxDiff = maxAbsDiff(
    renderWasmTriggeredRuntimeForBench(bench.graph, bench.opts),
    renderWasmTriggeredLegacyForBench(bench.graph, bench.opts),
  )
  const selectedVsLegacy = legacy.avgMs / selected.avgMs
  const speedup = legacy.avgMs / runtime.avgMs
  const diff = Math.abs(runtime.checksum - legacy.checksum)

  if (selectedDiff > 1e-4) {
    throw new Error(`${bench.name}: selected ${selectedMode} renderer diverged by max ${selectedDiff}`)
  }
  if (maxDiff > 1e-4) {
    throw new Error(`${bench.name}: runtime and legacy samples diverged by max ${maxDiff} (checksum delta ${diff})`)
  }

  console.log(`${bench.name}`)
  console.log(`  selected ${selectedMode}: ${formatMs(selected.avgMs)} avg (${formatMs(selected.minMs)} min, ${formatMs(selected.maxMs)} max), ${selectedVsLegacy.toFixed(2)}x vs legacy`)
  console.log(`  runtime reset: ${formatMs(runtime.avgMs)} avg (${formatMs(runtime.minMs)} min, ${formatMs(runtime.maxMs)} max)`)
  console.log(`  legacy render: ${formatMs(legacy.avgMs)} avg (${formatMs(legacy.minMs)} min, ${formatMs(legacy.maxMs)} max)`)
  console.log(`  speedup: ${speedup.toFixed(2)}x`)
  console.log(`  max diff: ${maxDiff.toExponential(2)}; checksum: ${runtime.checksum.toFixed(6)}`)
}

function measure(render: () => Samples, iterations: number): BenchResult {
  let checksum = 0
  for (let i = 0; i < 3; i++) checksum = checksumSamples(render())

  const times: number[] = []
  for (let i = 0; i < iterations; i++) {
    const start = performance.now()
    const samples = render()
    times.push(performance.now() - start)
    checksum = checksumSamples(samples)
  }

  const total = times.reduce((sum, time) => sum + time, 0)
  return {
    checksum,
    avgMs: total / times.length,
    minMs: Math.min(...times),
    maxMs: Math.max(...times),
  }
}

function checksumSamples(samples: Samples): number {
  if (Array.isArray(samples)) return checksumChannel(samples[0]) * 0.67 + checksumChannel(samples[1]) * 0.33
  return checksumChannel(samples)
}

function checksumChannel(samples: Float32Array): number {
  let sum = 0
  for (let i = 0; i < samples.length; i++) sum += samples[i] * ((i % 257) + 1)
  return sum
}

function maxAbsDiff(a: Samples, b: Samples): number {
  if (Array.isArray(a) !== Array.isArray(b)) return Number.POSITIVE_INFINITY
  if (Array.isArray(a) && Array.isArray(b)) return Math.max(maxAbsDiffChannel(a[0], b[0]), maxAbsDiffChannel(a[1], b[1]))
  return maxAbsDiffChannel(a as Float32Array, b as Float32Array)
}

function maxAbsDiffChannel(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) return Number.POSITIVE_INFINITY
  let max = 0
  for (let i = 0; i < a.length; i++) max = Math.max(max, Math.abs(a[i] - b[i]))
  return max
}

function chromaticStack(count: number, spacingSec: number, baseMidi: number, gateSec: number): Trigger[] {
  return Array.from({ length: count }, (_, index) => ({
    midi: baseMidi + (index % 24),
    atSec: index * spacingSec,
    gateMs: gateSec * 1_000,
    velocity: 0.55 + (index % 5) * 0.08,
  }))
}

function samplerZones() {
  return Array.from({ length: 8 }, (_, zone) => {
    const rootMidi = 36 + zone * 6
    const samples = new Float32Array(4096)
    const base = 55 * 2 ** (zone / 12)
    for (let i = 0; i < samples.length; i++) {
      const t = i / SAMPLE_RATE
      const env = Math.exp(-i / (samples.length * 0.72))
      samples[i] = (
        Math.sin(2 * Math.PI * base * t)
        + Math.sin(2 * Math.PI * base * 2.01 * t) * 0.38
        + Math.sin(2 * Math.PI * base * 3.02 * t) * 0.16
      ) * env * 0.55
    }

    return {
      samples,
      sampleRate: SAMPLE_RATE,
      rootMidi,
      keyLow: Math.max(0, rootMidi - 3),
      keyHigh: Math.min(127, rootMidi + 3),
      velocityLow: 0,
      velocityHigh: 1,
      loop: true,
      loopStart: 1024,
      loopEnd: 3584,
      gain: 1,
      pan: (zone / 7) * 1.2 - 0.6,
    }
  })
}

function formatMs(value: number): string {
  return `${value.toFixed(2)} ms`
}
