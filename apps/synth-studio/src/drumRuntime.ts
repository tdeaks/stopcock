import { createEffect, onCleanup } from 'solid-js'
import { drumEngine, drumPattern, engine, setDrumEngine, setDrumPlayhead } from './state'
import { PATTERN_STEPS, sixteenthSeconds, swingOffsetSeconds } from './drumPattern'
import { createDrumEngine, type DrumEngineHandle } from './drumEngine'

/**
 * Bring up a drum engine whenever the synth engine starts; tear it down when
 * the synth engine stops. We share the synth engine's AudioContext + masterBus
 * so drums route through the same analyser chain and headroom.
 *
 * Note: we do NOT read drumEngine() inside this effect — doing so would make
 * the effect track its own writes (setDrumEngine), causing it to re-run and
 * destroy the engine it just created. Local closure reference instead.
 */
export function useDrumEngineLifecycle(): void {
  createEffect(() => {
    const eng = engine()
    let local: DrumEngineHandle | null = null
    let cancelled = false

    if (eng) {
      void createDrumEngine(eng.ctx, eng.masterBus).then((d) => {
        if (cancelled) {
          d.destroy()
          return
        }
        local = d
        d.setLevel(drumPattern.level)
        setDrumEngine(d)
      })
    } else {
      setDrumEngine(null)
    }

    onCleanup(() => {
      cancelled = true
      if (local) {
        local.destroy()
        local = null
        setDrumEngine(null)
      }
    })
  })
}

/**
 * Step sequencer clock. Wakes every TICK_MS and fires any step whose scheduled
 * time has just passed. Each fire calls drumEngine.trigger() immediately,
 * which spawns a fresh AudioWorkletNode running the Rust drum kernel — and
 * the kernel's envelope starts from frame 0 of that worklet, so the only way
 * to time a hit correctly is to spawn its worklet at trigger time.
 *
 * Trade-off: we don't get sample-accurate timing (jitter is ±TICK_MS plus
 * worklet load latency, typically <5 ms in practice), but each hit's envelope
 * starts at the right moment instead of mid-decay. For a step sequencer this
 * is the correct trade-off — sample-accurate triggers would require a kernel
 * that accepts a "wait until atSec, then start envelope" message, which the
 * existing drum_voice kernel doesn't.
 */
const TICK_MS = 12

export function useDrumSequencer(): void {
  createEffect(() => {
    const eng = drumEngine()
    if (!eng) return
    if (!drumPattern.playing) {
      setDrumPlayhead(-1)
      return
    }

    const ctx = eng.ctx
    let nextStepIndex = 0
    let nextStepTime = ctx.currentTime + 0.05

    let tickTimer: number | undefined

    const tick = (): void => {
      const now = ctx.currentTime
      const bpm = drumPattern.bpm
      const swing = drumPattern.swing
      const stepSec = sixteenthSeconds(bpm)

      while (true) {
        const wallTime = nextStepTime + swingOffsetSeconds(nextStepIndex, bpm, swing)
        if (wallTime > now) break

        for (const row of drumPattern.rows) {
          const value = row.steps[nextStepIndex]
          if (value === 0) continue
          const velocity = value === 2 ? 1.0 : 0.8
          eng.trigger(row.pieceId, velocity)
        }
        setDrumPlayhead(nextStepIndex)

        nextStepIndex = (nextStepIndex + 1) % PATTERN_STEPS
        nextStepTime += stepSec
      }
    }

    tickTimer = window.setInterval(tick, TICK_MS)

    onCleanup(() => {
      if (tickTimer !== undefined) window.clearInterval(tickTimer)
      setDrumPlayhead(-1)
    })
  })
}
