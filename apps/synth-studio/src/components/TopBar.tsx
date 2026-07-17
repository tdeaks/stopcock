import { createMemo, createSignal, onCleanup, onMount, type Component } from 'solid-js'
import { applyPreset, engine, setEngine, state } from '../state'
import { createEngine } from '../engine'
import { presets } from '../presets'
import { registerMeter } from '../visualizer'

const METER_CELL_COUNT = 22

/**
 * Top bar. The output meter's bars + dB readout are registered with the
 * visualizer singleton on mount, so the rAF loop can mutate them directly
 * without going through Solid reactivity.
 */
export const TopBar: Component = () => {
  const [patchIndex, setPatchIndex] = createSignal(0)
  const [booting, setBooting] = createSignal(false)

  const currentPreset = createMemo(() => presets[patchIndex()])

  const goPatch = (delta: number): void => {
    const next = (patchIndex() + delta + presets.length) % presets.length
    setPatchIndex(next)
    applyPreset(presets[next])
  }

  const togglePower = async (): Promise<void> => {
    const current = engine()
    if (current) {
      current.destroy()
      setEngine(null)
      return
    }
    setBooting(true)
    try {
      const fresh = await createEngine(state)
      setEngine(fresh)
    } finally {
      setBooting(false)
    }
  }

  return (
    <header class="topbar">
      <div class="brand"><span class="brand-mark">PHASE.01</span></div>

      <div class="patch">
        <button class="patch-nav" onClick={() => goPatch(-1)}>‹</button>
        <div class="patch-info">
          <span class="patch-num">{currentPreset().num}</span>
          <span class="patch-name">{currentPreset().name}</span>
          <span class="patch-bank">USER · A</span>
        </div>
        <button class="patch-nav" onClick={() => goPatch(1)}>›</button>
      </div>

      <div class="header-right">
        <OutputMeter />
        <div class="status-compact">
          <span class="stat-cell">{
            engine() ? (engine()!.ctx.sampleRate / 1000).toFixed(1) : '—'
          } <em>kHz</em></span>
          <span class="stat-cell">{
            engine() ? Math.round(engine()!.ctx.baseLatency * engine()!.ctx.sampleRate) : '—'
          } <em>buf</em></span>
          <span class="stat-cell">{state.fx.filter(f => f.enabled && f.kind !== 'none').length} <em>fx</em></span>
        </div>
        <button
          class={'power-btn' + (engine() ? ' engaged' : '')}
          onClick={togglePower}
        >
          {booting() ? 'BOOTING…' : engine() ? 'STOP' : 'START'}
        </button>
      </div>
    </header>
  )
}

const OutputMeter: Component = () => {
  const cells: HTMLElement[] = new Array(METER_CELL_COUNT)
  let dbEl!: HTMLElement

  onMount(() => {
    onCleanup(registerMeter(cells, dbEl))
  })

  return (
    <div class="output-meter">
      <span class="meter-label">OUT</span>
      <div class="meter-bars">
        {Array.from({ length: METER_CELL_COUNT }, (_, i) => (
          <div class="meter-cell" ref={(el) => { cells[i] = el }} />
        ))}
      </div>
      <span class="meter-db" ref={dbEl}>−∞ dB</span>
    </div>
  )
}
