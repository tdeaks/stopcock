import { createStore, produce, type SetStoreFunction } from 'solid-js/store'
import { createMemo, createRoot, createSignal, type Accessor } from 'solid-js'
import { defaultState, type EngineHandle, type RackState } from './engine'
import { createSlot, type FxKind, type FxSlot } from './fx'
import {
  DEFAULT_PATTERN,
  toggleStep as toggleStepPure,
  clearPattern as clearPatternPure,
  type DrumPattern,
  type StepValue,
} from './drumPattern'
import type { DrumEngineHandle } from './drumEngine'
import type { DrumPieceId } from './drumKit'

// ─────────────────────────── store

const [state, setStateInternal] = createStore<RackState>(defaultState())
export { state }
export const setState: SetStoreFunction<RackState> = setStateInternal

// ─────────────────────────── derived signatures (allocation-free)
//
// These memos track every audio-relevant field by reading it (which establishes
// reactive subscriptions in Solid's store proxy), then return a stable integer.
// Touching fields without producing a string lets us avoid the JSON.stringify
// allocation that fires on every knob-drag tick.
//
// They are SPLIT so that twiddling an FX knob recompiles only the FX bus and
// twiddling a voice knob recompiles only the voice template — not both.

const trackValue = (v: unknown): void => {
  if (v === null || v === undefined) return
  const t = typeof v
  if (t !== 'object') return
  if (Array.isArray(v)) {
    for (let i = 0; i < v.length; i++) trackValue(v[i])
    return
  }
  for (const k in v as Record<string, unknown>) trackValue((v as Record<string, unknown>)[k])
}

let voiceVersion = 0
let fxVersion = 0

// Module-level memos need an explicit root so Solid doesn't warn about
// undisposed computations. The root lives for the lifetime of the page.
const { voiceSignature, fxSignature } = createRoot<{
  voiceSignature: Accessor<number>
  fxSignature: Accessor<number>
}>(() => ({
  voiceSignature: createMemo<number>(() => {
    trackValue(state.osc)
    trackValue(state.flt)
    trackValue(state.env)
    trackValue(state.lfo)
    trackValue(state.routing)
    return ++voiceVersion
  }),
  fxSignature: createMemo<number>(() => {
    trackValue(state.fx)
    return ++fxVersion
  }),
}))

export { voiceSignature, fxSignature }

// ─────────────────────────── engine handle (lifecycle-bound)

const [engine, setEngine] = createSignal<EngineHandle | null>(null)
export { engine, setEngine }

const [drumEngine, setDrumEngine] = createSignal<DrumEngineHandle | null>(null)
export { drumEngine, setDrumEngine }

// ─────────────────────────── drum pattern store

const [drumPattern, setDrumPattern] = createStore<DrumPattern>(DEFAULT_PATTERN())
export { drumPattern }

export function setDrumBpm(bpm: number): void {
  setDrumPattern('bpm', Math.max(20, Math.min(300, bpm)))
}
export function setDrumSwing(swing: number): void {
  setDrumPattern('swing', Math.max(0, Math.min(0.75, swing)))
}
export function setDrumLevel(level: number): void {
  const v = Math.max(0, Math.min(1, level))
  setDrumPattern('level', v)
  drumEngine()?.setLevel(v)
}
export function setDrumPlaying(playing: boolean): void {
  setDrumPattern('playing', playing)
}
export function toggleDrumStep(rowIndex: number, stepIndex: number): void {
  setDrumPattern(
    produce<DrumPattern>((draft) => {
      const next = toggleStepPure(draft, rowIndex, stepIndex)
      draft.rows = next.rows
    }),
  )
}
export function clearDrumPattern(): void {
  setDrumPattern(
    produce<DrumPattern>((draft) => {
      const next = clearPatternPure(draft)
      draft.rows = next.rows
    }),
  )
}

const [drumPlayhead, setDrumPlayhead] = createSignal<number>(-1)
export { drumPlayhead, setDrumPlayhead }

export type { DrumPattern, StepValue, DrumPieceId }

// ─────────────────────────── actions

/**
 * Replace the contents of one FX slot with a fresh slot of the given kind.
 * Resets that slot's params to defaults.
 */
export function swapFxKind(index: number, kind: FxKind): void {
  setState('fx', index, createSlot(kind))
}

/**
 * Update one params field of an FX slot.
 */
export function setFxParam(index: number, paramId: string, value: number): void {
  setState('fx', index, 'params', paramId, value)
}

/**
 * Toggle bypass on an FX slot (no-op for empty slots).
 */
export function toggleFxBypass(index: number): void {
  if (state.fx[index].kind === 'none') return
  setState('fx', index, 'enabled', (prev) => !prev)
}

/**
 * Move slot[from] to position [to], shifting the others. Insert semantics.
 */
export function moveFxSlot(from: number, to: number): void {
  if (from === to || from < 0 || to < 0) return
  setState(
    produce<RackState>((draft) => {
      const [moved] = draft.fx.splice(from, 1)
      if (moved) draft.fx.splice(to, 0, moved)
    }),
  )
}

export function setRouting<K extends keyof RackState['routing']>(key: K, value: boolean): void {
  setState('routing', key, value)
}

// ─────────────────────────── preset application

export type PresetState = {
  osc?: Partial<RackState['osc']>
  flt?: Partial<RackState['flt']>
  env?: Partial<RackState['env']>
  lfo?: Partial<RackState['lfo']>
  arp?: Partial<RackState['arp']>
  fx?: FxSlot[]
}

export type Preset = {
  num: string
  name: string
  state: PresetState
}

export function applyPreset(preset: Preset): void {
  setState(
    produce<RackState>((draft) => {
      if (preset.state.osc) Object.assign(draft.osc, preset.state.osc)
      if (preset.state.flt) Object.assign(draft.flt, preset.state.flt)
      if (preset.state.env) Object.assign(draft.env, preset.state.env)
      if (preset.state.lfo) Object.assign(draft.lfo, preset.state.lfo)
      if (preset.state.arp) Object.assign(draft.arp, preset.state.arp)
      if (preset.state.fx) {
        // Ensure we always have 4 slots
        const slots = [...preset.state.fx]
        while (slots.length < 4) slots.push(createSlot('none'))
        draft.fx = slots.slice(0, 4)
      }
    }),
  )
}

// ─────────────────────────── note tracking (active midi set)

const [activeNotes, setActiveNotes] = createSignal<ReadonlySet<number>>(new Set())
export { activeNotes }

const [latchedNotes, setLatchedNotes] = createSignal<ReadonlySet<number>>(new Set())
export { latchedNotes }

const [activeArpNotes, setActiveArpNotes] = createSignal<ReadonlySet<number>>(new Set())
export { activeArpNotes }

export function markArpNotes(notes: readonly number[]): void {
  setActiveArpNotes(new Set<number>(notes))
}

export function clearArpNotes(): void {
  setActiveArpNotes((prev) => (prev.size === 0 ? prev : new Set<number>()))
}

const releaseNotes = (notes: Iterable<number>): void => {
  const eng = engine()
  if (!eng) return
  for (const midi of notes) eng.noteOff(midi)
}

export function setArpEnabled(enabled: boolean): void {
  if (state.arp.enabled === enabled) return
  if (enabled) {
    releaseNotes(activeNotes())
  } else {
    releaseNotes(activeArpNotes())
    clearArpNotes()
  }
  setState('arp', 'enabled', enabled)
}

export function setArpParam<K extends keyof RackState['arp']>(
  key: K,
  value: RackState['arp'][K],
): void {
  if (key === 'enabled') {
    setArpEnabled(Boolean(value))
    return
  }
  if (key === 'latch') {
    const latch = Boolean(value)
    if (latch && latchedNotes().size === 0 && activeNotes().size > 0)
      setLatchedNotes(new Set<number>(activeNotes()))
    if (!latch) setLatchedNotes(new Set<number>())
  }
  setState('arp', key, value)
}

const toggleLatchedNote = (midi: number): void => {
  setLatchedNotes((prev) => {
    const next = new Set(prev)
    if (next.has(midi)) next.delete(midi)
    else next.add(midi)
    return next
  })
}

export function noteOn(midi: number, velocity = 0.9): void {
  setActiveNotes((prev) => {
    if (prev.has(midi)) return prev
    const next = new Set(prev)
    next.add(midi)
    return next
  })
  if (state.arp.enabled) {
    if (state.arp.latch) toggleLatchedNote(midi)
    return
  }
  engine()?.noteOn(midi, velocity)
}

export function noteOff(midi: number): void {
  setActiveNotes((prev) => {
    if (!prev.has(midi)) return prev
    const next = new Set(prev)
    next.delete(midi)
    return next
  })
  if (state.arp.enabled) return
  engine()?.noteOff(midi)
}
