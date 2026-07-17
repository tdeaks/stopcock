import type { Node, Note, WebAudioHandle, WebAudioPlayOptions } from '../types'
import { defaultFor } from '../params'
import { cloneForTrigger, compile, SynthCompileError } from '../internal/graph'
import { noteToFreq } from '../internal/util'
import { compileWorklet } from './worklet'

export function play(ctx: AudioContext, node: Node, opts: WebAudioPlayOptions = {}): WebAudioHandle {
  const compiled = compile(node, 'web')
  let underruns = 0
  const output = ctx.createGain()
  output.gain.value = 1
  const workletBindings = new Map<number, Array<{ node: AudioWorkletNode, inputIndex: number }>>()
  const pendingInputs = new Map<number, AudioNode[]>()
  const workletNodes: AudioWorkletNode[] = []
  const childHandles: WebAudioHandle[] = []
  let stopped = false

  try {
    void compileWorklet(ctx, node).then((wm) => {
      if (stopped) return
      const worklet = new AudioWorkletNode(ctx, wm.processorName, {
        numberOfInputs: wm.numberOfInputs,
        numberOfOutputs: wm.numberOfOutputs,
        outputChannelCount: wm.outputChannelCount,
        processorOptions: wm.processorOptions,
        parameterData: Object.fromEntries(wm.params.map((item) => [item.audioParamName, defaultFor(item.node, item.param)])),
      })
      if (stopped) {
        worklet.disconnect()
        return
      }
      workletNodes.push(worklet)
      for (const inputHandle of wm.inputs) {
        const list = workletBindings.get(inputHandle.channel) ?? []
        list.push({ node: worklet, inputIndex: inputHandle.channel })
        workletBindings.set(inputHandle.channel, list)
        for (const source of pendingInputs.get(inputHandle.channel) ?? []) source.connect(worklet, 0, inputHandle.channel)
      }
      worklet.connect(output)
    }).catch(() => {
      underruns++
    })
  } catch {
    underruns++
  }

  const destination = opts.destination === undefined ? ctx.destination : opts.destination
  if (destination) output.connect(destination)

  return {
    trigger(note: Note) {
      if (stopped) return
      const freq = noteToFreq(note)
      const triggered = cloneForTrigger(node, { ...note, atSec: note.atSec ?? ctx.currentTime })
      if (triggered.kind === 'osc') triggered.freq = freq
      const handle = play(ctx, triggered, opts)
      childHandles.push(handle)
      const forget = () => {
        const index = childHandles.indexOf(handle)
        if (index >= 0) childHandles.splice(index, 1)
      }
      if (note.gateMs !== undefined) {
        const timeout = setTimeout(() => {
          handle.release(note)
          const stopTimeout = setTimeout(() => {
            handle.stop()
            forget()
          }, 1200)
          if (typeof stopTimeout === 'object' && 'unref' in stopTimeout) stopTimeout.unref()
        }, note.gateMs)
        if (typeof timeout === 'object' && 'unref' in timeout) timeout.unref()
      }
    },
    release() {
      output.gain.cancelScheduledValues(ctx.currentTime)
      output.gain.setTargetAtTime(0, ctx.currentTime, 0.02)
    },
    stop() {
      if (stopped) return
      stopped = true
      for (const handle of childHandles.splice(0)) handle.stop()
      for (const item of workletNodes) {
        // Tell the processor to return false from process() so Web Audio can
        // GC it. Without this the AudioWorkletProcessor keeps running forever
        // even after disconnect — a slow leak that saturates the worklet
        // thread after enough notes.
        try { item.port.postMessage({ type: 'terminate' }) } catch { /* port closed */ }
        item.disconnect()
      }
      try {
        output.disconnect()
      } catch {
        // Already disconnected.
      }
    },
    connectInput(channel: number, source: AudioNode) {
      const bindings = workletBindings.get(channel)
      if (bindings) {
        for (const binding of bindings) source.connect(binding.node, 0, binding.inputIndex)
        return
      }
      if (compiled.inputNodes.some((item) => item.channel === channel)) {
        const pending = pendingInputs.get(channel) ?? []
        pending.push(source)
        pendingInputs.set(channel, pending)
        return
      }
      throw new SynthCompileError(`input(${channel}) is not present in this graph`)
    },
    get underruns() {
      return underruns
    },
  }
}
