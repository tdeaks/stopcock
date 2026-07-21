import { createRoot, createSignal, type Accessor } from 'solid-js'
import { engine } from './state'

/**
 * Singleton visualizer driver. Components register their DOM refs once on mount;
 * the rAF loop mutates them directly. This bypasses Solid reactivity for the
 * 60 Hz hot path — no per-frame allocations, no signal propagation, no JSX
 * re-binding.
 *
 * The cost difference vs. signal-driven rendering: ~50 reactive bindings per
 * frame collapse to ~50 raw DOM writes (and most of those skip when the value
 * is unchanged). At 60 fps that's the difference between visible UI hitching
 * and a steady idle.
 */

export const SPECTRUM_BAR_COUNT = 48
const SCOPE_SAMPLES = 200
const METER_CELL_COUNT = 22

// ─────────────────────────── ref registry

type Registry = {
  spectrumBars: HTMLElement[] | null
  scopePath: SVGPathElement | null
  meterCells: HTMLElement[] | null
  meterDb: HTMLElement | null
}

const refs: Registry = {
  spectrumBars: null,
  scopePath: null,
  meterCells: null,
  meterDb: null,
}

const lastBarHeight = new Int16Array(SPECTRUM_BAR_COUNT)
const lastMeterLitCount = { value: -1 }
let lastDbText = ''

export function registerSpectrum(bars: HTMLElement[]): () => void {
  refs.spectrumBars = bars
  lastBarHeight.fill(-1)
  return () => {
    if (refs.spectrumBars === bars) refs.spectrumBars = null
  }
}

export function registerScope(path: SVGPathElement): () => void {
  refs.scopePath = path
  return () => {
    if (refs.scopePath === path) refs.scopePath = null
  }
}

export function registerMeter(cells: HTMLElement[], db: HTMLElement): () => void {
  refs.meterCells = cells
  refs.meterDb = db
  lastMeterLitCount.value = -1
  return () => {
    if (refs.meterCells === cells) refs.meterCells = null
    if (refs.meterDb === db) refs.meterDb = null
  }
}

// ─────────────────────────── precomputed bin map (per engine lifetime)

type BinRange = { start: number; end: number }
let binMap: BinRange[] | null = null
let binMapForBinCount = 0

const ensureBinMap = (binCount: number): BinRange[] => {
  if (binMap && binMapForBinCount === binCount) return binMap
  binMap = new Array<BinRange>(SPECTRUM_BAR_COUNT)
  for (let i = 0; i < SPECTRUM_BAR_COUNT; i++) {
    const fLow = Math.pow(binCount, i / SPECTRUM_BAR_COUNT)
    const fHigh = Math.pow(binCount, (i + 1) / SPECTRUM_BAR_COUNT)
    binMap[i] = { start: Math.floor(fLow), end: Math.min(binCount, Math.ceil(fHigh)) }
  }
  binMapForBinCount = binCount
  return binMap
}

// ─────────────────────────── persistent frame buffers

const barValues = new Float32Array(SPECTRUM_BAR_COUNT).fill(2)
let meterLevel = 0
let freqBuffer: Uint8Array<ArrayBuffer> | null = null
let timeBuffer: Uint8Array<ArrayBuffer> | null = null
let lastEngineRef: ReturnType<typeof engine> = null
let scopePathBuilder = ''

// ─────────────────────────── frame-time tracker (exposed reactively)
//
// Smoothed milliseconds between consecutive rAF ticks. Useful as a rough
// proxy for "is the page busy?" — at 60 fps this idles near 16.67 ms; under
// load it drifts up. Throttled to one signal update per ~250 ms so it
// doesn't itself cause re-renders every frame.

const { frameTimeMs, setFrameTimeMs } = createRoot<{
  frameTimeMs: Accessor<number>
  setFrameTimeMs: (n: number) => void
}>(() => {
  const [get, set] = createSignal(0)
  return { frameTimeMs: get, setFrameTimeMs: set }
})
export { frameTimeMs }

let smoothedFrameMs = 0
let lastFrameStamp = 0
let lastFrameSignalAt = 0

// ─────────────────────────── main loop

let rafId = 0
let running = false

const formatDb = (level: number): string =>
  level < 0.001 ? '−∞ dB' : (20 * Math.log10(level)).toFixed(1) + ' dB'

const updateSpectrum = (): void => {
  const bars = refs.spectrumBars
  if (!bars) return
  for (let i = 0; i < SPECTRUM_BAR_COUNT; i++) {
    // Round to 0.1% so trivial changes don't dirty the DOM. The Int16Array
    // stores tenths-of-a-percent so we can compare in integer space.
    const rounded = (barValues[i] * 10) | 0
    if (rounded === lastBarHeight[i]) continue
    lastBarHeight[i] = rounded
    bars[i].style.height = Math.max(0.2, rounded / 10).toFixed(1) + '%'
  }
}

const updateScope = (): void => {
  const path = refs.scopePath
  if (!path || !timeBuffer) return
  const step = timeBuffer.length / SCOPE_SAMPLES
  let d = ''
  for (let i = 0; i < SCOPE_SAMPLES; i++) {
    const v = (timeBuffer[Math.floor(i * step)] - 128) / 128
    const yPos = 65 + v * 50
    const x = (i / (SCOPE_SAMPLES - 1)) * 400
    d += (i === 0 ? 'M' : 'L') + x.toFixed(1) + ',' + yPos.toFixed(1) + ' '
  }
  if (d !== scopePathBuilder) {
    scopePathBuilder = d
    path.setAttribute('d', d)
  }
}

const updateMeter = (): void => {
  const cells = refs.meterCells
  const dbEl = refs.meterDb
  const litCount = Math.floor(meterLevel * METER_CELL_COUNT)

  if (cells && litCount !== lastMeterLitCount.value) {
    for (let i = 0; i < METER_CELL_COUNT; i++) {
      let cls = 'meter-cell'
      if (i < litCount) {
        if (i >= METER_CELL_COUNT - 2) cls = 'meter-cell lit hot'
        else if (i >= METER_CELL_COUNT - 5) cls = 'meter-cell lit warm'
        else if (i >= METER_CELL_COUNT - 8) cls = 'meter-cell lit bright'
        else cls = 'meter-cell lit'
      }
      if (cells[i].className !== cls) cells[i].className = cls
    }
    lastMeterLitCount.value = litCount
  }

  if (dbEl) {
    const text = formatDb(meterLevel)
    if (text !== lastDbText) {
      lastDbText = text
      dbEl.textContent = text
    }
  }
}

const tick = (): void => {
  // Frame-time smoothing
  const now = performance.now()
  if (lastFrameStamp > 0) {
    const dt = now - lastFrameStamp
    smoothedFrameMs = smoothedFrameMs === 0 ? dt : smoothedFrameMs * 0.92 + dt * 0.08
    if (now - lastFrameSignalAt > 250) {
      lastFrameSignalAt = now
      setFrameTimeMs(smoothedFrameMs)
    }
  }
  lastFrameStamp = now

  const eng = engine()
  if (eng !== lastEngineRef) {
    if (eng) {
      freqBuffer = new Uint8Array(eng.analyser.frequencyBinCount)
      timeBuffer = new Uint8Array(eng.scopeAnalyser.fftSize)
      ensureBinMap(eng.analyser.frequencyBinCount)
    } else {
      freqBuffer = null
      timeBuffer = null
    }
    lastEngineRef = eng
  }

  if (eng && freqBuffer && timeBuffer) {
    eng.analyser.getByteFrequencyData(freqBuffer)
    eng.scopeAnalyser.getByteTimeDomainData(timeBuffer)

    const map = ensureBinMap(freqBuffer.length)
    for (let i = 0; i < SPECTRUM_BAR_COUNT; i++) {
      const range = map[i]
      let peak = 0
      for (let j = range.start; j < range.end; j++) {
        const v = freqBuffer[j]
        if (v > peak) peak = v
      }
      const target = (peak / 255) * 100
      // 0.45 smoothing — matches the previous behaviour
      barValues[i] += (target - barValues[i]) * 0.45
    }

    let peak = 0
    for (let i = 0; i < timeBuffer.length; i++) {
      const v = Math.abs((timeBuffer[i] - 128) / 128)
      if (v > peak) peak = v
    }
    meterLevel += (peak - meterLevel) * 0.45
  } else {
    // Idle decay
    for (let i = 0; i < SPECTRUM_BAR_COUNT; i++) barValues[i] *= 0.92
    meterLevel *= 0.85
  }

  updateSpectrum()
  updateScope()
  updateMeter()

  rafId = requestAnimationFrame(tick)
}

export function startVisualizerLoop(): () => void {
  if (running) return () => {}
  running = true
  rafId = requestAnimationFrame(tick)
  return () => {
    running = false
    cancelAnimationFrame(rafId)
  }
}
