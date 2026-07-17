import { PARAMS_BY_KIND } from '../params'
import type { AnyParam, Node, WorkletInputHandle, WorkletModule, WorkletParamHandle } from '../types'
import { compile, SynthCompileError } from '../internal/graph'
import { SYNTH_WASM_BASE64 } from './wasm-blob'
import { serializeWasmRuntimeRequestForWorklet } from './wasm'
import { MAX_WORKLET_FRAMES, wasmProcessorBody } from './worklet-processor'

const moduleCache = new WeakMap<AudioContext, Map<string, Promise<void>>>()
let wasmBytesCache: Uint8Array | undefined

export async function compileWorklet(ctx: AudioContext, node: Node): Promise<WorkletModule> {
  if (!SYNTH_WASM_BASE64) throw new SynthCompileError('WASM synth runtime is unavailable')

  const compiled = compile(node, 'worklet')
  const params: WorkletParamHandle[] = []
  const inputs: WorkletInputHandle[] = []
  const audioParamSlots = new WeakMap<Node, Map<AnyParam, number>>()
  const inputSlots = new WeakMap<Node, number>()

  for (const item of compiled.nodes) {
    const nodeId = idOf(compiled.nodeIds, item)
    const bySlot = new Map<AnyParam, number>()
    for (const param of PARAMS_BY_KIND[item.kind]) {
      bySlot.set(param, params.length)
      params.push({ node: item, param, audioParamName: `${nodeId}_${param}` })
    }
    audioParamSlots.set(item, bySlot)
    if (item.kind === 'input') {
      inputSlots.set(item, inputs.length)
      inputs.push({ node: item, channel: item.channel })
    }
  }

  const descriptors = params.map((handle) => ({
    name: handle.audioParamName,
    defaultValue: 0,
    automationRate: 'a-rate',
  }))
  const body = wasmProcessorBody(descriptors)
  const processorName = `stopcock-${(await sha256(body)).slice(0, 16)}`
  const source = `${body}\nregisterProcessor('${processorName}', StopcockSynthProcessor)\n`
  await registerModule(ctx, processorName, source)

  const maxInput = inputs.reduce((max, item) => Math.max(max, item.channel), -1)
  return {
    processorName,
    params,
    inputs,
    numberOfInputs: maxInput + 1,
    numberOfOutputs: 1,
    outputChannelCount: [compiled.root.out],
    processorOptions: {
      buffers: [],
      wasmBase64: SYNTH_WASM_BASE64,
      wasmBytes: synthWasmBytes(),
      wasmGraph: serializeWasmRuntimeRequestForWorklet(
        compiled.nodes,
        compiled.root,
        ctx.sampleRate || 48_000,
        MAX_WORKLET_FRAMES,
        audioParamSlots,
        inputSlots,
      ),
      wasmParamNames: params.map((param) => param.audioParamName),
      wasmInputChannels: inputs.length,
      wasmInputMap: inputs.map((input) => input.channel),
    },
  }
}

export function workletParam(wm: WorkletModule, node: Node, param: AnyParam): WorkletParamHandle {
  const handle = wm.params.find((item) => item.node === node && item.param === param)
  if (!handle) throw new SynthCompileError(`Worklet param not found for ${node.kind}.${param}`)
  return handle
}

export function workletInput(wm: WorkletModule, node: Node): WorkletInputHandle {
  const handle = wm.inputs.find((item) => item.node === node)
  if (!handle) throw new SynthCompileError(`Worklet input not found for ${node.kind}`)
  return handle
}

function synthWasmBytes(): Uint8Array {
  if (wasmBytesCache) return wasmBytesCache
  wasmBytesCache = decodeBase64ToBytes(SYNTH_WASM_BASE64)
  return wasmBytesCache
}

function decodeBase64ToBytes(value: string): Uint8Array {
  const BufferCtor = (globalThis as unknown as { Buffer?: { from(value: string, encoding: string): Uint8Array } }).Buffer
  if (BufferCtor && typeof BufferCtor.from === 'function') {
    return new Uint8Array(BufferCtor.from(value, 'base64'))
  }
  const binary = atob(value)
  const decoded = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) decoded[i] = binary.charCodeAt(i)
  return decoded
}

async function registerModule(ctx: AudioContext, processorName: string, source: string): Promise<void> {
  const cache = moduleCache.get(ctx) ?? new Map<string, Promise<void>>()
  if (!moduleCache.has(ctx)) moduleCache.set(ctx, cache)
  const cached = cache.get(processorName)
  if (cached) return cached

  if (!ctx.audioWorklet || typeof ctx.audioWorklet.addModule !== 'function') {
    throw new SynthCompileError('AudioContext does not expose audioWorklet.addModule')
  }

  const blobUrl = URL.createObjectURL(new Blob([source], { type: 'application/javascript' }))
  const registration = ctx.audioWorklet.addModule(blobUrl).then(
    () => {
      URL.revokeObjectURL(blobUrl)
    },
    (err) => {
      URL.revokeObjectURL(blobUrl)
      if (cache.get(processorName) === registration) cache.delete(processorName)
      throw err
    },
  )
  cache.set(processorName, registration)
  return registration
}

function idOf(ids: WeakMap<Node, string>, node: Node): string {
  const id = ids.get(node)
  if (!id) throw new SynthCompileError(`Node id missing for ${node.kind}`)
  return id
}

async function sha256(value: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle
  if (subtle) {
    const data = new TextEncoder().encode(value)
    const digest = await subtle.digest('SHA-256', data)
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
  }
  let hash = 2166136261
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16).padStart(64, '0')
}
