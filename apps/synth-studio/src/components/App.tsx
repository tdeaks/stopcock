import { createEffect, on, onCleanup, onMount, type Component } from 'solid-js'
import { TopBar } from './TopBar'
import { VoiceRack } from './VoiceRack'
import { ArpPanel } from './ArpPanel'
import { PatchBay } from './PatchBay'
import { FxRack } from './FxRack'
import { DrumMachine } from './DrumMachine'
import { Spectrum } from './Spectrum'
import { Scope } from './Scope'
import { Keyboard } from './Keyboard'
import { PerfStrip } from './PerfStrip'
import { Footer } from './Footer'
import { engine, fxSignature, state, voiceSignature } from '../state'
import { startVisualizerLoop } from '../visualizer'
import { useMidiInput, useQwertyInput, midiStatus } from '../inputs'
import { useArpeggiator } from '../arpRuntime'
import { useDrumEngineLifecycle, useDrumSequencer } from '../drumRuntime'

/**
 * Schedules a debounced async callback. Coalesces rapid-fire signal changes
 * (e.g., knob drag) into one rebuild at the end of the burst.
 */
function debouncedRebuild(work: () => Promise<void> | void, delayMs = 80): () => void {
  let timer: number | undefined
  return () => {
    if (timer !== undefined) window.clearTimeout(timer)
    timer = window.setTimeout(() => {
      timer = undefined
      void work()
    }, delayMs)
  }
}

export const App: Component = () => {
  useQwertyInput()
  useMidiInput()
  useArpeggiator()
  useDrumEngineLifecycle()
  useDrumSequencer()

  onMount(() => {
    onCleanup(startVisualizerLoop())
  })

  // Two independent rebuild paths so a delay-knob twist doesn't recompile the
  // voice template (and vice versa).
  const rebuildVoice = debouncedRebuild(() => engine()?.rebuildVoice(state))
  const rebuildFx = debouncedRebuild(() => engine()?.rebuildFx(state))

  createEffect(
    on(
      voiceSignature,
      () => {
        if (engine()) rebuildVoice()
      },
      { defer: true },
    ),
  )
  createEffect(
    on(
      fxSignature,
      () => {
        if (engine()) rebuildFx()
      },
      { defer: true },
    ),
  )

  return (
    <div class="app">
      <TopBar />
      <VoiceRack />
      <ArpPanel />
      <PatchBay />
      <FxRack />
      <DrumMachine />
      <section class="viz-row">
        <Spectrum />
        <Scope />
      </section>
      <Keyboard midiStatus={midiStatus()} />
      <PerfStrip />
      <Footer />
    </div>
  )
}
