import type { AnyParam, Node, RenderOptions, Trigger } from '../types'
import { compile } from '../internal/graph'
import { noteToFreq } from '../internal/util'
import { BinaryWriter, indexOf } from './wasm-binary-writer'
import { writeBinaryNode } from './wasm-binary-node'

const binaryGraphCache = new WeakMap<Node, CachedBinaryGraph>()

export type CachedBinaryGraph = {
  readonly root: Node
  readonly rootIndex: number
  readonly rootOut: 1 | 2
  readonly inputNodes: ReadonlyArray<Extract<Node, { kind: 'input' }>>
  readonly nodeBytes: Uint8Array
}

export function serializeBinaryRenderRequest(
  graph: CachedBinaryGraph,
  opts: Pick<RenderOptions, 'inputs'>,
  sampleRate: number,
  length: number,
  note?: Trigger,
): Uint8Array {
  const writer = new BinaryWriter()
  writer.ascii('SYN1')
  writer.f64(sampleRate)
  writer.u32(length)
  writer.u32(graph.rootIndex)
  const triggerFreq = note ? noteToFreq(note) : undefined
  writer.u8((note?.gateMs !== undefined ? 1 : 0) | (note?.velocity !== undefined ? 2 : 0) | (triggerFreq !== undefined ? 8 : 0))
  if (note?.gateMs !== undefined) writer.f64(Math.max(0, note.gateMs / 1000))
  if (note?.velocity !== undefined) writer.f64(note.velocity)
  if (triggerFreq !== undefined) writer.f64(triggerFreq)
  writer.array(opts.inputs ?? [], (input) => writer.f32Array(input))
  writer.raw(graph.nodeBytes)
  return writer.finish()
}

export function cachedBinaryGraph(node: Node): CachedBinaryGraph {
  const cached = binaryGraphCache.get(node)
  if (cached) return cached

  const compiled = compile(node, 'offline')
  const indexes = new WeakMap<Node, number>()
  compiled.nodes.forEach((item, index) => indexes.set(item, index))
  const writer = new BinaryWriter()
  writer.array(compiled.nodes, (item) => writeBinaryNode(writer, item, indexes))
  const graph = {
    root: compiled.root,
    rootIndex: indexOf(indexes, compiled.root),
    rootOut: compiled.root.out,
    inputNodes: compiled.inputNodes,
    nodeBytes: writer.finish(),
  }
  binaryGraphCache.set(node, graph)
  return graph
}

export function serializeBinaryRuntimeGraphRequest(graph: CachedBinaryGraph, sampleRate: number, maxFrames: number): Uint8Array {
  const writer = new BinaryWriter()
  writer.ascii('SYN1')
  writer.f64(sampleRate)
  writer.u32(maxFrames)
  writer.u32(graph.rootIndex)
  writer.u8(0)
  writer.u32(0)
  writer.raw(graph.nodeBytes)
  return writer.finish()
}

export function serializeWasmRuntimeRequestForWorklet(
  nodes: ReadonlyArray<Node>,
  root: Node,
  sampleRate: number,
  blockSize: number,
  paramSlots?: WeakMap<Node, Map<AnyParam, number>>,
  inputSlots?: WeakMap<Node, number>,
): Uint8Array {
  const indexes = new WeakMap<Node, number>()
  nodes.forEach((item, index) => indexes.set(item, index))

  const writer = new BinaryWriter()
  writer.ascii('SYN1')
  writer.f64(sampleRate)
  writer.u32(blockSize)
  writer.u32(indexOf(indexes, root))
  writer.u8(paramSlots ? 4 : 0)
  writer.u32(0)
  writer.array(nodes, (item) => writeBinaryNode(writer, item, indexes, paramSlots, inputSlots))
  return writer.finish()
}
