import { createMemo, createSignal, onCleanup, onMount, type Component } from 'solid-js'
import { engine, state } from '../state'
import { frameTimeMs } from '../visualizer'

/**
 * Compact telemetry row. Each cell is a snapshot of one performance-relevant
 * number, updated 4× per second so the values are readable rather than
 * blurring at frame rate.
 */
export const PerfStrip: Component = () => {
  // Pull engine.voiceCount() and engine.underruns() reactively-but-throttled.
  // They're not Solid signals (they read from a Map / cumulative counter), so
  // we sample them on a slow interval and surface the latest value.
  const [voicesNow, setVoicesNow] = createSignal(0)
  const [underrunsNow, setUnderrunsNow] = createSignal(0)
  const [audioElapsed, setAudioElapsed] = createSignal(0)

  let timer: number | undefined
  onMount(() => {
    timer = window.setInterval(() => {
      const eng = engine()
      if (!eng) {
        setVoicesNow(0)
        setUnderrunsNow(0)
        setAudioElapsed(0)
        return
      }
      setVoicesNow(eng.voiceCount())
      setUnderrunsNow(eng.underruns())
      setAudioElapsed(eng.ctx.currentTime)
    }, 250)
  })
  onCleanup(() => {
    if (timer !== undefined) window.clearInterval(timer)
  })

  const sampleRateKHz = createMemo(() => {
    const eng = engine()
    return eng ? (eng.ctx.sampleRate / 1000).toFixed(1) : '—'
  })
  const bufferSize = createMemo(() => {
    const eng = engine()
    return eng ? Math.round(eng.ctx.baseLatency * eng.ctx.sampleRate) : '—'
  })
  const latencyMs = createMemo(() => {
    const eng = engine()
    return eng ? (eng.ctx.baseLatency * 1000).toFixed(2) : '—'
  })
  const activeFx = createMemo(() => state.fx.filter((f) => f.enabled && f.kind !== 'none').length)
  const frameMs = createMemo(() => frameTimeMs())
  const fps = createMemo(() => {
    const t = frameTimeMs()
    return t > 0 ? Math.round(1000 / t) : 0
  })
  const uptime = createMemo(() => {
    const s = audioElapsed()
    if (s <= 0) return '—'
    const minutes = Math.floor(s / 60)
    const seconds = Math.floor(s % 60)
    return `${minutes}:${seconds.toString().padStart(2, '0')}`
  })
  const underrunsClass = createMemo(() =>
    underrunsNow() > 0 ? 'perf-cell perf-warn' : 'perf-cell',
  )

  return (
    <div class="perf-strip" aria-label="Engine telemetry">
      <span class="perf-label">Engine</span>
      <span class="perf-cell">
        <em>state</em>
        <b>{engine() ? 'running' : 'idle'}</b>
      </span>
      <span class="perf-cell">
        <em>sample</em>
        <b>{sampleRateKHz()} kHz</b>
      </span>
      <span class="perf-cell">
        <em>buffer</em>
        <b>{bufferSize()} fr</b>
      </span>
      <span class="perf-cell">
        <em>latency</em>
        <b>{latencyMs()} ms</b>
      </span>
      <span class="perf-cell">
        <em>voices</em>
        <b>{voicesNow()} / 8</b>
      </span>
      <span class="perf-cell">
        <em>fx</em>
        <b>{activeFx()} / 4</b>
      </span>
      <span class="perf-cell">
        <em>frame</em>
        <b>{frameMs() > 0 ? frameMs().toFixed(1) : '—'} ms</b>
      </span>
      <span class="perf-cell">
        <em>fps</em>
        <b>{fps() || '—'}</b>
      </span>
      <span class={underrunsClass()}>
        <em>underrun</em>
        <b>{underrunsNow()}</b>
      </span>
      <span class="perf-cell">
        <em>uptime</em>
        <b>{uptime()}</b>
      </span>
    </div>
  )
}
