import { bench, describe } from 'vitest'
import { pipe } from '@stopcock/fp'
import {
  createWavetable,
  effects,
  filter,
  fm,
  gain,
  mix,
  modulate,
  operator,
  oscillator,
  pan,
  params,
  render,
  type Node,
  type RenderOptions,
  type Samples,
} from '@stopcock/synth'
import { renderReference } from '../../packages/synth/src/render/offline'
import {
  isSynthWasmBinaryAvailable,
  isSynthWasmRuntimeAvailable,
  renderWasmForTest,
  renderWasmRuntimeForTest,
} from '../../packages/synth/src/render/wasm'

const opts = {
  duration: 0.25,
  sampleRate: 48_000,
} satisfies RenderOptions

let sink = 0

const consume = (samples: Samples): number => {
  const channels = Array.isArray(samples) ? samples : [samples]
  let total = 0
  for (const channel of channels) {
    total += channel[0] ?? 0
    total += channel[channel.length >> 1] ?? 0
    total += channel[channel.length - 1] ?? 0
  }
  sink = total
  return sink
}

const matrix = Array.from({ length: 6 }, (_, row) =>
  Array.from({ length: 6 }, (_, col) => (row < col ? 0.18 / (col + 1) : 0)))

const bank = createWavetable({ partials: [1, 0.42, 0.28, 0.12, 0.06] })
const ir = new Float32Array(256)
for (let i = 0; i < ir.length; i++) ir[i] = Math.sin(i * 0.19) * Math.exp(-i / 48)

const simple = pipe(
  oscillator('saw', 110),
  gain(0.24),
)

const denseFm = fm({
  freq: 82.41,
  index: 2.2,
  operators: [
    operator.sine({ ratio: 1, level: 1, output: 0 }),
    operator.polyblep('saw', { ratio: 2, level: 0.55, output: 0.35, feedback: 0.08 }),
    operator.polyblep('square', { ratio: 3, level: 0.42, output: 0.55 }),
    operator.wavetable(bank, { ratio: 4, level: 0.36, output: 0.2, position: 0.2 }),
    operator.sine({ ratio: 5, level: 0.22, output: 0.15 }),
    operator.polyblep('triangle', { ratio: 7, level: 0.18, output: 0.12 }),
  ],
  matrix,
})

const lfo = oscillator('sine', 5.5)
const modulationHeavy = pipe(
  oscillator('saw', 146.83),
  modulate(params.osc.freq, lfo, 24),
  filter.lowpass(1800, 0.8),
  modulate(params.biquad.freq, lfo, 720),
  effects.delay(74, 0.32, 0.42),
  modulate(params.delay.mix, lfo, 0.16),
  gain(0.3),
)

const effectsChain = pipe(
  mix([
    oscillator('saw', 55),
    oscillator.wavetable(bank, 110, { position: 0.35 }),
    denseFm,
  ]),
  filter.comb(19, 0.26, 0.18),
  effects.delay(58, 0.28, 0.35),
  effects.chorus(0.65, 9, 0.22),
  effects.spaceEcho({
    timeMs: 118,
    feedback: 0.42,
    mix: 0.24,
    reverbMix: 0.08,
    wow: 0.24,
    flutter: 0.08,
    tapeAge: 0.42,
    drive: 0.16,
    mode: 'heads-1-3',
  }),
  effects.distortion(0.22),
  effects.bitcrush(10, 2),
  effects.compressor({ threshold: -20, ratio: 2.8, attack: 0.004, release: 0.18 }),
  effects.reverb(ir, 0.12),
  pan(0.18),
)

const graphs: ReadonlyArray<readonly [string, Node]> = [
  ['simple oscillator/gain', simple],
  ['dense six-operator FM', denseFm],
  ['modulation-heavy effects chain', modulationHeavy],
  ['space-echo/reverb chain', effectsChain],
]

const runtimeBench = isSynthWasmRuntimeAvailable() ? bench : bench.skip
const binaryBench = isSynthWasmBinaryAvailable() ? bench : bench.skip

for (const [name, graph] of graphs) {
  describe(`synth ${name}`, () => {
    runtimeBench('stateful WASM runtime, 128-frame blocks', () => {
      consume(renderWasmRuntimeForTest(graph, opts, 128))
    })

    binaryBench('full-buffer WASM binary render', () => {
      consume(renderWasmForTest(graph, opts))
    })

    bench('public render() path', () => {
      consume(render(graph, opts))
    })

    bench('JS reference renderer', () => {
      consume(renderReference(graph, opts))
    })
  })
}
