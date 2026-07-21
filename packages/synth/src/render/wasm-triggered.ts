import type { Node, RenderOptions, Samples, Trigger } from '../types'
import { cloneForTrigger, compile, SynthCompileError } from '../internal/graph'
import { noteToFreq } from '../internal/util'
import {
  cachedBinaryGraph,
  serializeBinaryRuntimeGraphRequest,
  type CachedBinaryGraph,
} from './wasm-binary'
import type { WasmExports } from './wasm-instance'
import { getWasmExports, hasDirectRuntimeOutput } from './wasm-instance'
import { validateRenderInputs } from './render-inputs'
import { durationForFrames, maxTriggerFrames, triggerRenderFrames } from './wasm-tail'
import { addHeapInto, addInto } from './wasm-output'
import { renderSingleWasm } from './wasm-single'

export function renderTriggeredWasm(
  wasm: WasmExports,
  node: Node,
  opts: RenderOptions,
  sampleRate: number,
  length: number,
): Samples | null {
  const binaryGraph = wasm.stopcock_synth_render_binary ? cachedBinaryGraph(node) : undefined
  const compiled = binaryGraph ? undefined : compile(node, 'offline')
  validateRenderInputs(binaryGraph?.inputNodes ?? compiled!.inputNodes, opts.inputs, length)
  const root = binaryGraph?.root ?? compiled!.root
  const triggers = [...opts.triggers!].sort((a, b) => a.atSec - b.atSec)
  if (binaryGraph && triggeredWasmModeForGraph(root) === 'legacy') {
    const legacyOutput = renderTriggeredLegacyWasm(
      wasm,
      binaryGraph,
      node,
      opts,
      sampleRate,
      length,
      triggers,
    )
    if (legacyOutput) return legacyOutput
  }

  const runtimeOutput = binaryGraph
    ? renderTriggeredRuntimeWasm(wasm, binaryGraph, opts, sampleRate, length, triggers)
    : null
  if (runtimeOutput) return runtimeOutput

  const output: Samples =
    (binaryGraph?.rootOut ?? compiled!.root.out) === 2
      ? [new Float32Array(length), new Float32Array(length)]
      : new Float32Array(length)
  for (const trigger of triggers) {
    const start = Math.max(0, Math.floor(trigger.atSec * sampleRate))
    if (start >= length) continue
    const frames = triggerRenderFrames(root, length - start, sampleRate, trigger)
    if (frames <= 0) continue
    const localDuration = durationForFrames(frames, sampleRate)
    const localInputs = opts.inputs?.map((input) => input.subarray(start, start + frames))
    const voice = renderSingleWasm(
      wasm,
      binaryGraph ? node : cloneForTrigger(node, trigger),
      {
        duration: localDuration,
        sampleRate,
        inputs: localInputs,
      },
      trigger,
    )
    if (!voice) return null
    addInto(output, voice, start)
  }
  return output
}

export function triggeredWasmModeForGraph(root: Node): 'runtime' | 'legacy' {
  return prefersPerTriggerBinaryWasm(root, new WeakSet()) ? 'legacy' : 'runtime'
}

function prefersPerTriggerBinaryWasm(node: Node, seen: WeakSet<Node>): boolean {
  if (seen.has(node)) return false
  seen.add(node)

  try {
    if (node.mods.length > 0) return false
    switch (node.kind) {
      case 'delay':
        return (
          node.mix !== 0 &&
          node.feedback === 0 &&
          Number.isFinite(node.delayMs) &&
          hasFiniteGatedSource(node.input, seen)
        )
      case 'multiTapDelay':
        return (
          node.mix !== 0 &&
          node.feedback === 0 &&
          Number.isFinite(node.tone) &&
          node.tone >= 1 &&
          node.taps.length > 0 &&
          hasFiniteGatedSource(node.input, seen)
        )
      default:
        return false
    }
  } finally {
    seen.delete(node)
  }
}

function hasFiniteGatedSource(node: Node, seen: WeakSet<Node>): boolean {
  if (seen.has(node)) return false
  seen.add(node)

  try {
    if (node.mods.length > 0) return false
    switch (node.kind) {
      case 'samplerInstrument':
      case 'lofiSampler':
      case 'ar':
      case 'adsr':
        return true
      case 'gain':
      case 'pan':
      case 'exponential':
      case 'distortion':
      case 'compressor':
      case 'bitcrush':
      case 'frequencyShifter':
      case 'stereoSpread':
      case 'microPitch':
        return hasFiniteGatedSource(node.input, seen)
      case 'tiltEq':
        return (
          ((Number.isFinite(node.mix) && node.mix <= 0) ||
            node.gainDb === 0 ||
            !Number.isFinite(node.gainDb)) &&
          hasFiniteGatedSource(node.input, seen)
        )
      case 'rotarySpeaker':
        return (node.mix === 0 || node.depth === 0) && hasFiniteGatedSource(node.input, seen)
      case 'saturator':
      case 'wavefolder':
      case 'degrade':
        return node.mix === 0 && hasFiniteGatedSource(node.input, seen)
      case 'stateVariableFilter':
        return node.mix === 0 && hasFiniteGatedSource(node.input, seen)
      case 'constant':
      case 'buffer':
        return true
      case 'mix':
        return node.inputs.every((input) => hasFiniteGatedSource(input, seen))
      case 'stereo':
        return hasFiniteGatedSource(node.left, seen) && hasFiniteGatedSource(node.right, seen)
      default:
        return false
    }
  } finally {
    seen.delete(node)
  }
}

export function renderTriggeredWasmWithMode(
  node: Node,
  opts: RenderOptions,
  mode: 'runtime' | 'legacy',
): Samples | null {
  const wasm = getWasmExports()
  if (!wasm?.stopcock_synth_render_binary || !opts.triggers || opts.triggers.length === 0)
    return null
  const sampleRate = opts.sampleRate ?? 48_000
  const length = Math.max(0, Math.floor(opts.duration * sampleRate))

  if (!Number.isFinite(opts.duration) || opts.duration < 0)
    throw new SynthCompileError('render duration must be a non-negative finite number')
  if (!Number.isFinite(sampleRate) || sampleRate <= 0)
    throw new SynthCompileError('sampleRate must be a positive finite number')

  const graph = cachedBinaryGraph(node)
  validateRenderInputs(graph.inputNodes, opts.inputs, length)
  const triggers = [...opts.triggers].sort((a, b) => a.atSec - b.atSec)
  if (mode === 'runtime')
    return renderTriggeredRuntimeWasm(wasm, graph, opts, sampleRate, length, triggers)
  return renderTriggeredLegacyWasm(wasm, graph, node, opts, sampleRate, length, triggers)
}

function renderTriggeredRuntimeWasm(
  wasm: WasmExports,
  graph: CachedBinaryGraph,
  opts: RenderOptions,
  sampleRate: number,
  length: number,
  triggers: Trigger[],
): Samples | null {
  if (
    !wasm.stopcock_synth_runtime_new ||
    !wasm.stopcock_synth_runtime_free ||
    !wasm.stopcock_synth_runtime_reset_event ||
    !wasm.stopcock_synth_runtime_process
  )
    return null
  const output: Samples =
    graph.rootOut === 2
      ? [new Float32Array(length), new Float32Array(length)]
      : new Float32Array(length)
  if (length === 0) return output

  const maxFrames = maxTriggerFrames(graph.root, length, sampleRate, triggers)
  if (maxFrames === 0) return output

  const request = serializeBinaryRuntimeGraphRequest(graph, sampleRate, maxFrames)
  const requestPtr = wasm.stopcock_synth_alloc(request.length)
  const directRuntime = hasDirectRuntimeOutput(wasm)
  const leftPtr = directRuntime
    ? 0
    : wasm.stopcock_synth_alloc(maxFrames * Float32Array.BYTES_PER_ELEMENT)
  const rightPtr = directRuntime
    ? 0
    : wasm.stopcock_synth_alloc(maxFrames * Float32Array.BYTES_PER_ELEMENT)
  const inputChannels = opts.inputs?.length ?? 0
  const inputPtr =
    inputChannels > 0
      ? wasm.stopcock_synth_alloc(inputChannels * maxFrames * Float32Array.BYTES_PER_ELEMENT)
      : 0
  let runtimePtr = 0

  try {
    new Uint8Array(wasm.memory.buffer, requestPtr, request.length).set(request)
    runtimePtr = wasm.stopcock_synth_runtime_new(requestPtr, request.length)
    if (runtimePtr === 0) return null
    const leftReadPtr = directRuntime
      ? wasm.stopcock_synth_runtime_output_left_ptr!(runtimePtr)
      : leftPtr
    const rightReadPtr = directRuntime
      ? wasm.stopcock_synth_runtime_output_right_ptr!(runtimePtr)
      : rightPtr
    if (leftReadPtr === 0 || rightReadPtr === 0) return null
    const inputHeap =
      inputPtr !== 0
        ? new Float32Array(wasm.memory.buffer, inputPtr, inputChannels * maxFrames)
        : undefined

    for (const trigger of triggers) {
      const start = Math.max(0, Math.floor(trigger.atSec * sampleRate))
      if (start >= length) continue
      const frames = triggerRenderFrames(graph.root, length - start, sampleRate, trigger)
      if (frames <= 0) continue
      if (inputHeap && opts.inputs) {
        for (let channel = 0; channel < inputChannels; channel++) {
          inputHeap.set(opts.inputs[channel].subarray(start, start + frames), channel * maxFrames)
        }
      }

      const reset = wasm.stopcock_synth_runtime_reset_event(
        runtimePtr,
        trigger.gateMs !== undefined ? Math.max(0, trigger.gateMs / 1000) : Number.NaN,
        trigger.velocity !== undefined ? trigger.velocity : Number.NaN,
        noteToFreq(trigger),
      )
      if (reset !== 0) return null
      const channels = directRuntime
        ? wasm.stopcock_synth_runtime_process_direct!(
            runtimePtr,
            inputPtr,
            inputChannels,
            maxFrames,
            0,
            0,
            maxFrames,
            frames,
          )
        : wasm.stopcock_synth_runtime_process(
            runtimePtr,
            inputPtr,
            inputChannels,
            maxFrames,
            0,
            0,
            maxFrames,
            frames,
            leftPtr,
            rightPtr,
          )
      if (channels !== 1 && channels !== 2) return null
      addHeapInto(output, wasm.memory.buffer, leftReadPtr, rightReadPtr, channels, frames, start)
    }

    return output
  } catch {
    return null
  } finally {
    if (runtimePtr !== 0) wasm.stopcock_synth_runtime_free(runtimePtr)
    wasm.stopcock_synth_dealloc(requestPtr, request.length)
    if (leftPtr !== 0)
      wasm.stopcock_synth_dealloc(leftPtr, maxFrames * Float32Array.BYTES_PER_ELEMENT)
    if (rightPtr !== 0)
      wasm.stopcock_synth_dealloc(rightPtr, maxFrames * Float32Array.BYTES_PER_ELEMENT)
    if (inputPtr !== 0)
      wasm.stopcock_synth_dealloc(
        inputPtr,
        inputChannels * maxFrames * Float32Array.BYTES_PER_ELEMENT,
      )
  }
}

function renderTriggeredLegacyWasm(
  wasm: WasmExports,
  graph: CachedBinaryGraph,
  node: Node,
  opts: RenderOptions,
  sampleRate: number,
  length: number,
  triggers: Trigger[],
): Samples | null {
  const output: Samples =
    graph.rootOut === 2
      ? [new Float32Array(length), new Float32Array(length)]
      : new Float32Array(length)
  for (const trigger of triggers) {
    const start = Math.max(0, Math.floor(trigger.atSec * sampleRate))
    if (start >= length) continue
    const frames = triggerRenderFrames(graph.root, length - start, sampleRate, trigger)
    if (frames <= 0) continue
    const localDuration = durationForFrames(frames, sampleRate)
    const localInputs = opts.inputs?.map((input) => input.subarray(start, start + frames))
    const voice = renderSingleWasm(
      wasm,
      node,
      {
        duration: localDuration,
        sampleRate,
        inputs: localInputs,
      },
      trigger,
    )
    if (!voice) return null
    addInto(output, voice, start)
  }
  return output
}
