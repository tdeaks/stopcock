import { SYNTH_WASM_BASE64 } from './wasm-blob'

export type WasmExports = {
  memory: WebAssembly.Memory
  stopcock_synth_alloc(len: number): number
  stopcock_synth_dealloc(ptr: number, len: number): void
  stopcock_synth_render(
    requestPtr: number,
    requestLen: number,
    leftPtr: number,
    rightPtr: number,
  ): number
  stopcock_synth_render_binary?(
    requestPtr: number,
    requestLen: number,
    leftPtr: number,
    rightPtr: number,
  ): number
  stopcock_synth_runtime_new?(requestPtr: number, requestLen: number): number
  stopcock_synth_runtime_free?(runtimePtr: number): void
  stopcock_synth_runtime_reset_event?(
    runtimePtr: number,
    gateSec: number,
    velocity: number,
    triggerFreq: number,
  ): number
  stopcock_synth_runtime_process?(
    runtimePtr: number,
    inputPtr: number,
    inputChannels: number,
    inputStride: number,
    paramPtr: number,
    paramSlots: number,
    paramStride: number,
    frames: number,
    leftPtr: number,
    rightPtr: number,
  ): number
  stopcock_synth_runtime_process_direct?(
    runtimePtr: number,
    inputPtr: number,
    inputChannels: number,
    inputStride: number,
    paramPtr: number,
    paramSlots: number,
    paramStride: number,
    frames: number,
  ): number
  stopcock_synth_runtime_process_mixed?(
    runtimePtr: number,
    inputPtr: number,
    inputChannels: number,
    inputStride: number,
    paramScalarPtr: number,
    paramBlockPtr: number,
    paramFlagsPtr: number,
    paramSlots: number,
    paramBlockStride: number,
    frames: number,
    leftPtr: number,
    rightPtr: number,
  ): number
  stopcock_synth_runtime_process_mixed_direct?(
    runtimePtr: number,
    inputPtr: number,
    inputChannels: number,
    inputStride: number,
    paramScalarPtr: number,
    paramBlockPtr: number,
    paramFlagsPtr: number,
    paramSlots: number,
    paramBlockStride: number,
    frames: number,
  ): number
  stopcock_synth_runtime_output_left_ptr?(runtimePtr: number): number
  stopcock_synth_runtime_output_right_ptr?(runtimePtr: number): number
}

let exportsCache: WasmExports | null | undefined

export function getWasmExports(): WasmExports | null {
  if (exportsCache !== undefined) return exportsCache
  if (!SYNTH_WASM_BASE64) {
    exportsCache = null
    return exportsCache
  }
  try {
    const module = new WebAssembly.Module(decodeBase64(SYNTH_WASM_BASE64))
    const instance = new WebAssembly.Instance(module, {})
    exportsCache = instance.exports as WasmExports
  } catch {
    exportsCache = null
  }
  return exportsCache
}

export function hasDirectRuntimeOutput(
  wasm: WasmExports | null | undefined,
): wasm is WasmExports & {
  stopcock_synth_runtime_process_direct: NonNullable<
    WasmExports['stopcock_synth_runtime_process_direct']
  >
  stopcock_synth_runtime_output_left_ptr: NonNullable<
    WasmExports['stopcock_synth_runtime_output_left_ptr']
  >
  stopcock_synth_runtime_output_right_ptr: NonNullable<
    WasmExports['stopcock_synth_runtime_output_right_ptr']
  >
} {
  return (
    typeof wasm?.stopcock_synth_runtime_process_direct === 'function' &&
    typeof wasm.stopcock_synth_runtime_output_left_ptr === 'function' &&
    typeof wasm.stopcock_synth_runtime_output_right_ptr === 'function'
  )
}

function decodeBase64(value: string): ArrayBuffer {
  const bufferCtor = (
    globalThis as typeof globalThis & {
      Buffer?: { from(value: string, encoding: 'base64'): Uint8Array }
    }
  ).Buffer
  if (bufferCtor) {
    const bytes = bufferCtor.from(value, 'base64')
    const out = new Uint8Array(bytes.byteLength)
    out.set(bytes)
    return out.buffer
  }
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes.buffer
}
