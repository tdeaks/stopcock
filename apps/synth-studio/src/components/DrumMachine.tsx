import { For, Show, createMemo, onCleanup, onMount, type Component } from 'solid-js'
import { Module } from './Module'
import {
  clearDrumPattern,
  drumEngine,
  drumPattern,
  drumPlayhead,
  setDrumBpm,
  setDrumLevel,
  setDrumPlaying,
  setDrumSwing,
  toggleDrumStep,
} from '../state'
import { DRUM_KIT } from '../drumKit'

export const DrumMachine: Component = () => {
  const ready = createMemo(() => drumEngine() !== null)

  const togglePlay = (): void => {
    if (!ready()) return
    setDrumPlaying(!drumPattern.playing)
  }

  const liveHit = (pieceId: string): void => {
    const d = drumEngine()
    if (!d) return
    d.trigger(pieceId as never, 0.9)
  }

  // Keyboard shortcuts for the live pads. Active whenever no input is focused.
  onMount(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.repeat) return
      const tgt = e.target as HTMLElement | null
      if (tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.isContentEditable)) return
      const piece = DRUM_KIT.find(p => p.key === e.key.toLowerCase())
      if (!piece) return
      e.preventDefault()
      liveHit(piece.id)
    }
    window.addEventListener('keydown', onKey)
    onCleanup(() => window.removeEventListener('keydown', onKey))
  })

  return (
    <Module slotId="DM" name="Drum Machine" class="drum-module">
      <div class="drum-controls">
        <button
          type="button"
          class={'drum-play' + (drumPattern.playing ? ' on' : '')}
          disabled={!ready()}
          onClick={togglePlay}
        >
          {drumPattern.playing ? '◼ STOP' : '▶ PLAY'}
        </button>
        <label class="drum-knob">
          <span>BPM</span>
          <input
            type="number"
            min={20}
            max={300}
            step={1}
            value={drumPattern.bpm}
            onInput={(e) => setDrumBpm(parseInt(e.currentTarget.value, 10) || 0)}
          />
        </label>
        <label class="drum-knob">
          <span>SWING</span>
          <input
            type="range"
            min={0}
            max={0.75}
            step={0.01}
            value={drumPattern.swing}
            onInput={(e) => setDrumSwing(parseFloat(e.currentTarget.value))}
          />
          <em>{Math.round(drumPattern.swing * 100)}%</em>
        </label>
        <label class="drum-knob">
          <span>LEVEL</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={drumPattern.level}
            onInput={(e) => setDrumLevel(parseFloat(e.currentTarget.value))}
          />
          <em>{Math.round(drumPattern.level * 100)}%</em>
        </label>
        <button type="button" class="drum-clear" onClick={() => clearDrumPattern()}>CLEAR</button>
        <Show when={!ready()}>
          <span class="drum-hint">press START to power the engine</span>
        </Show>
      </div>

      <div class="drum-grid">
        <For each={drumPattern.rows}>{(row, rowIndex) => {
          const piece = DRUM_KIT.find(p => p.id === row.pieceId)
          if (!piece) return null
          return (
            <div class="drum-row">
              <button
                type="button"
                class="drum-pad"
                disabled={!ready()}
                onMouseDown={() => liveHit(piece.id)}
              >
                <span class="pad-tag">{piece.tag}</span>
                <span class="pad-label">{piece.label}</span>
                <span class="pad-key">{piece.key.toUpperCase()}</span>
              </button>
              <div class="drum-steps">
                <For each={row.steps}>{(value, stepIndex) => (
                  <button
                    type="button"
                    class={
                      'drum-step'
                      + (value === 0 ? '' : ' on')
                      + (stepIndex() % 4 === 0 ? ' beat' : '')
                      + (drumPlayhead() === stepIndex() ? ' playhead' : '')
                    }
                    onClick={() => toggleDrumStep(rowIndex(), stepIndex())}
                  />
                )}</For>
              </div>
            </div>
          )
        }}</For>
      </div>
    </Module>
  )
}
