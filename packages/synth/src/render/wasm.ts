import type { Node, RenderOptions, Samples, Trigger } from '../types'
import { SynthCompileError } from '../internal/graph'
import { getWasmExports, hasDirectRuntimeOutput } from './wasm-instance'
import { triggerRenderFrames } from './wasm-tail'
import { renderRuntimeWasm } from './wasm-runtime-render'
import { renderSingleWasm } from './wasm-single'
import { renderTriggeredWasm, renderTriggeredWasmWithMode, triggeredWasmModeForGraph } from './wasm-triggered'

export { serializeWasmRuntimeRequestForWorklet } from './wasm-binary'

export function isSynthWasmAvailable(): boolean {
  return getWasmExports() !== null
}

export function isSynthWasmBinaryAvailable(): boolean {
  return typeof getWasmExports()?.stopcock_synth_render_binary === 'function'
}

export function isSynthWasmRuntimeAvailable(): boolean {
  const wasm = getWasmExports()
  return typeof wasm?.stopcock_synth_runtime_new === 'function'
    && typeof wasm.stopcock_synth_runtime_process === 'function'
    && typeof wasm.stopcock_synth_runtime_free === 'function'
}

export function isSynthWasmRuntimeResetAvailable(): boolean {
  return typeof getWasmExports()?.stopcock_synth_runtime_reset_event === 'function'
}

export function isSynthWasmRuntimeDirectAvailable(): boolean {
  const wasm = getWasmExports()
  return hasDirectRuntimeOutput(wasm)
}

export function tryRenderWasm(node: Node, opts: RenderOptions): Samples | null {
  const wasm = getWasmExports()
  if (!wasm) return null
  const sampleRate = opts.sampleRate ?? 48_000
  const length = Math.max(0, Math.floor(opts.duration * sampleRate))

  if (!Number.isFinite(opts.duration) || opts.duration < 0) throw new SynthCompileError('render duration must be a non-negative finite number')
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) throw new SynthCompileError('sampleRate must be a positive finite number')

  if (opts.triggers && opts.triggers.length > 0) {
    return renderTriggeredWasm(wasm, node, opts, sampleRate, length)
  }

  return renderSingleWasm(wasm, node, opts)
}

export function renderWasmForTest(node: Node, opts: RenderOptions): Samples {
  const result = tryRenderWasm(node, opts)
  if (!result) throw new SynthCompileError('WASM synth renderer is unavailable')
  return result
}

export function renderWasmRuntimeForTest(node: Node, opts: RenderOptions, blockSize = 128): Samples {
  const result = renderRuntimeWasm(node, opts, blockSize)
  if (!result) throw new SynthCompileError('WASM synth runtime is unavailable')
  return result
}

export function renderWasmTriggeredRuntimeForBench(node: Node, opts: RenderOptions): Samples {
  const result = renderTriggeredWasmWithMode(node, opts, 'runtime')
  if (!result) throw new SynthCompileError('WASM triggered runtime renderer is unavailable')
  return result
}

export function renderWasmTriggeredLegacyForBench(node: Node, opts: RenderOptions): Samples {
  const result = renderTriggeredWasmWithMode(node, opts, 'legacy')
  if (!result) throw new SynthCompileError('WASM triggered legacy renderer is unavailable')
  return result
}

export function triggeredWasmModeForTest(node: Node): 'runtime' | 'legacy' {
  return triggeredWasmModeForGraph(node)
}

export function triggerRenderFramesForTest(root: Node, remainingFrames: number, sampleRate: number, trigger: Trigger): number {
  return triggerRenderFrames(root, remainingFrames, sampleRate, trigger)
}
