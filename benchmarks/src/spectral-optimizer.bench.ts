import { bench, describe } from 'vitest'
import {
  paramsToPatch,
  DEFAULT_PARAMS,
  MODEL_BIN_COUNT,
  TARGET_PRESETS,
  derivePalette,
  differentiableForward,
  forwardModel,
  lossFn,
  normalizeSpectrum,
  runOptimization,
} from '../../apps/docs/src/lib/spectral-optimizer'
import {
  makeFingerprint,
  makeLandscape,
  makePoster,
  type HistoryFrame,
} from '../../apps/docs/src/lib/spectral-optimizer-svg'
import { render as renderSynth } from '@stopcock/synth'
import { buildPatch, renderPatchAudio, triggerForVerification } from '../../apps/docs/src/lib/spectral-optimizer-synth'

const target = TARGET_PRESETS.noisyComet.target
const start = TARGET_PRESETS.noisyComet.params
const model = forwardModel(start, { binCount: MODEL_BIN_COUNT })
const palette = derivePalette(start, normalizeSpectrum(model), lossFn(model, target))
const run = runOptimization(target, start, { steps: 40 })
const patchSpec = paramsToPatch(start)
const patch = buildPatch(patchSpec)
const verificationTrigger = triggerForVerification(patchSpec)
const history: HistoryFrame[] = run.frames.map((frame, step) => ({
  step,
  params: frame.params,
  loss: frame.loss,
}))

function oneAdamStep() {
  const params = Float64Array.from(DEFAULT_PARAMS)
  const m = new Float64Array(params.length)
  const v = new Float64Array(params.length)
  const { gradient } = differentiableForward(params, target)

  for (let i = 0; i < params.length; i++) {
    const grad = Math.max(-8, Math.min(8, Number(gradient[i] ?? 0)))
    m[i] = 0.1 * grad
    v[i] = 0.001 * grad * grad
    params[i] = Math.max(0, Math.min(1, params[i] - 0.05 * m[i] / (Math.sqrt(v[i]) + 1e-8)))
  }

  return params
}

const landscapeBinCount = 32
const landscapeFreqs = new Float32Array(Array.from({ length: landscapeBinCount }, (_, i) => {
  const lo = Math.log(38)
  const hi = Math.log(11_200)
  return Math.exp(lo + (hi - lo) * (i / (landscapeBinCount - 1)))
}))

function landscapeGrid(size = 48) {
  const grid = new Float32Array(size * size)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const params = [...start]
      params[3] = x / Math.max(1, size - 1)
      params[4] = 1 - y / Math.max(1, size - 1)
      grid[y * size + x] = lossFn(
        forwardModel(params, { binCount: landscapeBinCount, freqs: landscapeFreqs }),
        target,
        { binCount: landscapeBinCount },
      )
    }
  }
  return grid
}

describe('spectral optimizer showcase', () => {
  bench('forward model 64 bins', () => forwardModel(start, { binCount: MODEL_BIN_COUNT }))
  bench('one Adam step gradient', () => oneAdamStep())
  bench('40-step optimization preview', () => runOptimization(target, start, { steps: 40 }))
  bench('200-step optimization run', () => runOptimization(target, start, { steps: 200 }))
  bench('verification synth core render', () => renderSynth(patch, { sampleRate: 24_000, duration: 2.05, triggers: verificationTrigger }))
  bench('verification synth render', () => renderPatchAudio(start))
  bench('loss landscape 48x48', () => landscapeGrid())
  bench('fingerprint SVG composition', () => makeFingerprint(history, palette))
  bench('poster SVG composition', () => makePoster({
    finalParams: run.finalParams,
    history,
    audioStats: { centroid: 1280, rolloff: 6400, flatness: 0.34 },
    palette,
    lens: 'none',
  }))
  bench('landscape SVG composition', () => makeLandscape(landscapeGrid(), history.map((frame) => frame.params), palette, { cols: 48, rows: 48 }))
})
