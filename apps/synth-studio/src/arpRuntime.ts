import { createEffect, onCleanup } from 'solid-js'
import { activeNotes, clearArpNotes, engine, latchedNotes, markArpNotes, state } from './state'
import {
  baseStepDurationMs,
  gateDurationMs,
  intervalDurationMs,
  selectArpNotes,
  snapshotArpSettings,
} from './arp'

/**
 * Runs the app-level arpeggiator clock. DSP still happens inside the existing
 * WASM-backed engine path; this hook only chooses which MIDI notes to trigger.
 */
export function useArpeggiator(): void {
  createEffect(() => {
    const eng = engine()
    const settings = snapshotArpSettings(state.arp)
    const pool = Array.from(settings.latch ? latchedNotes() : activeNotes())

    if (!eng || !settings.enabled || pool.length === 0) {
      clearArpNotes()
      return
    }

    let stepIndex = 0
    let nextAt = performance.now()
    let tickTimer: number | undefined
    let lightTimer: number | undefined
    let lastNotes: readonly number[] = []
    const tickEveryMs = Math.min(20, Math.max(8, baseStepDurationMs(settings) / 8))

    const clearLightsLater = (afterMs: number): void => {
      if (lightTimer !== undefined) window.clearTimeout(lightTimer)
      lightTimer = window.setTimeout(() => {
        clearArpNotes()
        lightTimer = undefined
      }, afterMs)
    }

    const fire = (): void => {
      const now = performance.now()
      if (now < nextAt) return

      const notes = selectArpNotes(pool, stepIndex, settings)
      if (notes.length === 0) {
        clearArpNotes()
        nextAt = now + intervalDurationMs(settings, stepIndex)
        stepIndex += 1
        return
      }

      const gateMs = gateDurationMs(settings)
      for (const midi of notes) eng.noteOn(midi, settings.velocity, gateMs)
      markArpNotes(notes)
      clearLightsLater(gateMs)
      lastNotes = notes

      const intervalMs = intervalDurationMs(settings, stepIndex)
      stepIndex += 1
      nextAt = now + intervalMs
    }

    fire()
    tickTimer = window.setInterval(fire, tickEveryMs)

    onCleanup(() => {
      if (tickTimer !== undefined) window.clearInterval(tickTimer)
      if (lightTimer !== undefined) window.clearTimeout(lightTimer)
      for (const midi of lastNotes) eng.noteOff(midi)
      clearArpNotes()
    })
  })
}
