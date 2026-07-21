import type { Node, RenderOptions, Samples, Trigger } from '../types'
import { cachedBinaryGraph, serializeBinaryRenderRequest } from './wasm-binary'
import type { WasmExports } from './wasm-instance'
import { serializeWasmJsonRenderRequest } from './wasm-json'
import { validateRenderInputs } from './render-inputs'

export function renderSingleWasm(
  wasm: WasmExports,
  node: Node,
  opts: RenderOptions,
  note?: Trigger,
): Samples | null {
  const sampleRate = opts.sampleRate ?? 48_000
  const length = Math.max(0, Math.floor(opts.duration * sampleRate))
  const binaryGraph = wasm.stopcock_synth_render_binary ? cachedBinaryGraph(node) : undefined
  if (binaryGraph) validateRenderInputs(binaryGraph.inputNodes, opts.inputs, length)
  const request = binaryGraph
    ? serializeBinaryRenderRequest(binaryGraph, opts, sampleRate, length, note)
    : new TextEncoder().encode(
        JSON.stringify(serializeWasmJsonRenderRequest(node, opts, sampleRate, length, note)),
      )
  const requestPtr = wasm.stopcock_synth_alloc(request.length)
  const leftPtr = wasm.stopcock_synth_alloc(length * Float32Array.BYTES_PER_ELEMENT)
  const rightPtr = wasm.stopcock_synth_alloc(length * Float32Array.BYTES_PER_ELEMENT)

  try {
    new Uint8Array(wasm.memory.buffer, requestPtr, request.length).set(request)
    const channels = binaryGraph
      ? wasm.stopcock_synth_render_binary!(requestPtr, request.length, leftPtr, rightPtr)
      : wasm.stopcock_synth_render(requestPtr, request.length, leftPtr, rightPtr)
    if (channels !== 1 && channels !== 2) return null
    const left = new Float32Array(length)
    left.set(new Float32Array(wasm.memory.buffer, leftPtr, length))
    if (channels === 1) return left
    const right = new Float32Array(length)
    right.set(new Float32Array(wasm.memory.buffer, rightPtr, length))
    return [left, right]
  } catch {
    return null
  } finally {
    wasm.stopcock_synth_dealloc(requestPtr, request.length)
    wasm.stopcock_synth_dealloc(leftPtr, length * Float32Array.BYTES_PER_ELEMENT)
    wasm.stopcock_synth_dealloc(rightPtr, length * Float32Array.BYTES_PER_ELEMENT)
  }
}
