import type { Node, RenderOptions, Samples } from '../types'
import { compile, SynthCompileError } from '../internal/graph'
import { serializeWasmRuntimeRequestForWorklet } from './wasm-binary'
import { getWasmExports, hasDirectRuntimeOutput } from './wasm-instance'
import { validateRenderInputs } from './render-inputs'
import { copyHeapBlockInto } from './wasm-output'

export function renderRuntimeWasm(node: Node, opts: RenderOptions, blockSize: number): Samples | null {
  const wasm = getWasmExports()
  if (
    !wasm?.stopcock_synth_runtime_new
    || !wasm.stopcock_synth_runtime_process
    || !wasm.stopcock_synth_runtime_free
    || !wasm.stopcock_synth_render_binary
  ) return null
  if (opts.triggers && opts.triggers.length > 0) return null

  const sampleRate = opts.sampleRate ?? 48_000
  const length = Math.max(0, Math.floor(opts.duration * sampleRate))
  const framesPerBlock = Math.max(1, Math.floor(blockSize))

  if (!Number.isFinite(opts.duration) || opts.duration < 0) throw new SynthCompileError('render duration must be a non-negative finite number')
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) throw new SynthCompileError('sampleRate must be a positive finite number')

  const compiled = compile(node, 'offline')
  validateRenderInputs(compiled.inputNodes, opts.inputs, length)
  const request = serializeWasmRuntimeRequestForWorklet(compiled.nodes, compiled.root, sampleRate, framesPerBlock)
  const requestPtr = wasm.stopcock_synth_alloc(request.length)
  const directRuntime = hasDirectRuntimeOutput(wasm)
  const leftPtr = directRuntime ? 0 : wasm.stopcock_synth_alloc(framesPerBlock * Float32Array.BYTES_PER_ELEMENT)
  const rightPtr = directRuntime ? 0 : wasm.stopcock_synth_alloc(framesPerBlock * Float32Array.BYTES_PER_ELEMENT)
  const inputChannels = opts.inputs?.length ?? 0
  const inputPtr = inputChannels > 0
    ? wasm.stopcock_synth_alloc(inputChannels * framesPerBlock * Float32Array.BYTES_PER_ELEMENT)
    : 0
  const output: Samples = compiled.root.out === 2
    ? [new Float32Array(length), new Float32Array(length)]
    : new Float32Array(length)
  let runtimePtr = 0

  try {
    new Uint8Array(wasm.memory.buffer, requestPtr, request.length).set(request)
    runtimePtr = wasm.stopcock_synth_runtime_new(requestPtr, request.length)
    if (runtimePtr === 0) return null
    const leftReadPtr = directRuntime ? wasm.stopcock_synth_runtime_output_left_ptr!(runtimePtr) : leftPtr
    const rightReadPtr = directRuntime ? wasm.stopcock_synth_runtime_output_right_ptr!(runtimePtr) : rightPtr
    if (leftReadPtr === 0 || rightReadPtr === 0) return null
    const inputHeap = inputPtr !== 0 ? new Float32Array(wasm.memory.buffer, inputPtr, inputChannels * framesPerBlock) : undefined

    for (let offset = 0; offset < length; offset += framesPerBlock) {
      const frames = Math.min(framesPerBlock, length - offset)
      if (inputHeap && opts.inputs) {
        for (let channel = 0; channel < inputChannels; channel++) {
          inputHeap.set(opts.inputs[channel].subarray(offset, offset + frames), channel * framesPerBlock)
        }
      }
      const channels = directRuntime
        ? wasm.stopcock_synth_runtime_process_direct!(
          runtimePtr,
          inputPtr,
          inputChannels,
          framesPerBlock,
          0,
          0,
          framesPerBlock,
          frames,
        )
        : wasm.stopcock_synth_runtime_process(
          runtimePtr,
          inputPtr,
          inputChannels,
          framesPerBlock,
          0,
          0,
          framesPerBlock,
          frames,
          leftPtr,
          rightPtr,
        )
      if (channels !== 1 && channels !== 2) return null
      copyHeapBlockInto(output, wasm.memory.buffer, leftReadPtr, rightReadPtr, channels, frames, offset)
    }
    return output
  } catch {
    return null
  } finally {
    if (runtimePtr !== 0) wasm.stopcock_synth_runtime_free(runtimePtr)
    wasm.stopcock_synth_dealloc(requestPtr, request.length)
    if (leftPtr !== 0) wasm.stopcock_synth_dealloc(leftPtr, framesPerBlock * Float32Array.BYTES_PER_ELEMENT)
    if (rightPtr !== 0) wasm.stopcock_synth_dealloc(rightPtr, framesPerBlock * Float32Array.BYTES_PER_ELEMENT)
    if (inputPtr !== 0) wasm.stopcock_synth_dealloc(inputPtr, inputChannels * framesPerBlock * Float32Array.BYTES_PER_ELEMENT)
  }
}
