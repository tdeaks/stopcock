import {
  SPECTRAL_BIN_COUNT,
  createSpectralObjective,
  forwardModel,
  lossFn,
  normalizeSpectrum,
  resampleSpectrum,
  spectralBinFrequencies,
} from './spectral-optimizer'

type RunMessage = {
  type: 'run'
  target: Float32Array
  params: Float32Array
  steps?: number
  lrInit?: number
  lrMin?: number
}

type LandscapeMessage = {
  type: 'landscape'
  target: Float32Array
  center: Float32Array
  axes?: [number, number]
  size?: number
}

type WorkerMessage = RunMessage | LandscapeMessage

const ctx: DedicatedWorkerGlobalScope = self as any
const LANDSCAPE_BIN_COUNT = 32
const landscapeFreqs = spectralBinFrequencies({ binCount: LANDSCAPE_BIN_COUNT })

ctx.addEventListener('message', (event: MessageEvent<WorkerMessage>) => {
  const message = event.data
  if (message.type === 'run') run(message)
  else if (message.type === 'landscape') landscape(message)
})

function run(message: RunMessage) {
  const started = performance.now()
  const steps = message.steps ?? 200
  const lrInit = message.lrInit ?? 0.05
  const lrMin = message.lrMin ?? 0.005
  const params = Array.from(message.params)
  const target = Array.from(message.target)
  const objective = createSpectralObjective(target)
  const m = new Float64Array(params.length)
  const v = new Float64Array(params.length)

  for (let step = 0; step <= steps; step++) {
    const { value, gradient, modelMag } = objective.valueAndGradient(params)
    const model = Float32Array.from(normalizeSpectrum(resampleSpectrum(modelMag, SPECTRAL_BIN_COUNT), SPECTRAL_BIN_COUNT))
    const paramsOut = Float32Array.from(params)
    const gradMag = Float32Array.from(Array.from(gradient, (item) => Math.abs(Number(item) || 0)))
    ctx.postMessage({
      type: 'frame',
      step,
      loss: value,
      params: paramsOut,
      model,
      modelMag,
      gradMag,
    }, [paramsOut.buffer, model.buffer, modelMag.buffer, gradMag.buffer])
    if (step === steps) break

    const progress = step / Math.max(1, steps - 1)
    const lr = lrMin + (lrInit - lrMin) * 0.5 * (1 + Math.cos(Math.PI * progress))
    const beta1 = 0.9
    const beta2 = 0.999
    for (let i = 0; i < params.length; i++) {
      const grad = Math.max(-8, Math.min(8, Number(gradient[i] ?? 0)))
      m[i] = beta1 * m[i] + (1 - beta1) * grad
      v[i] = beta2 * v[i] + (1 - beta2) * grad * grad
      const mHat = m[i] / (1 - beta1 ** (step + 1))
      const vHat = v[i] / (1 - beta2 ** (step + 1))
      params[i] = Math.max(0, Math.min(1, params[i] - (lr * mHat) / (Math.sqrt(vHat) + 1e-8)))
    }
  }

  ctx.postMessage({ type: 'done', durationMs: performance.now() - started })
}

function landscape(message: LandscapeMessage) {
  const started = performance.now()
  const size = message.size ?? 48
  const [xAxis, yAxis] = message.axes ?? [3, 4]
  const target = Array.from(message.target)
  const center = Array.from(message.center)
  const grid = new Float32Array(size * size)

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const params = [...center]
      params[xAxis] = x / Math.max(1, size - 1)
      params[yAxis] = 1 - y / Math.max(1, size - 1)
      grid[y * size + x] = lossFn(
        forwardModel(params, { binCount: LANDSCAPE_BIN_COUNT, freqs: landscapeFreqs }),
        target,
        { binCount: LANDSCAPE_BIN_COUNT },
      )
    }
  }

  ctx.postMessage({ type: 'landscape', grid, size, durationMs: performance.now() - started }, [grid.buffer])
}
