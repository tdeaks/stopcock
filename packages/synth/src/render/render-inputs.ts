import { SynthCompileError } from '../internal/graph'
import type { Node, RenderOptions } from '../types'

export function validateRenderInputs(
  inputNodes: ReadonlyArray<Extract<Node, { kind: 'input' }>>,
  inputs: RenderOptions['inputs'],
  length: number,
): void {
  if (inputNodes.length === 0) return
  const maxChannel = Math.max(...inputNodes.map((node) => node.channel))
  if (!inputs || inputs.length <= maxChannel)
    throw new SynthCompileError(`render inputs must include channel ${maxChannel}`)
  for (const node of inputNodes) {
    const input = inputs[node.channel]
    if (!input || input.length !== length) {
      throw new SynthCompileError(`input(${node.channel}) must be exactly ${length} samples`)
    }
  }
}
