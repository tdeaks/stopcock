import type { Node, RenderOptions, Samples } from '../types'
import { SynthCompileError } from '../internal/graph'
import { tryRenderWasm } from './wasm'

export function render(node: Node, opts: RenderOptions): Samples {
  const wasm = tryRenderWasm(node, opts)
  if (wasm) return wasm
  throw new SynthCompileError('WASM synth renderer is unavailable')
}
