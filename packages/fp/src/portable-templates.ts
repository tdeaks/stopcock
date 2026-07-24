// GENERATED FILE. Do not edit by hand — run `bun run codegen` to regenerate.
// Hand-shaped fused loop templates for high-frequency stream-segment
// shapes: short linear chains, reducing/short-circuit sinks, and a bounded
// set of flatMap-heavy shapes. Looked up by opcode-shape key from
// src/lower.ts before falling back to the generic stage machine. Semantics
// mirror src/interpret.ts exactly.
import { type StepBinding, type ConsumeMeta } from './plan'
import { none as optionNone, some as optionSome } from './option'

const IS_BUN_RUNTIME =
  typeof (globalThis as { readonly Bun?: unknown }).Bun !== 'undefined'

export type PortableTemplateFn = (
  src: readonly unknown[],
  bindings: readonly StepBinding[],
  offset: number,
  limit: number,
  meta?: ConsumeMeta,
) => unknown

export interface ArrayTemplateEntry {
  readonly key: string
  readonly opcodes: readonly number[]
  readonly run: PortableTemplateFn
}

export interface SinkTemplateEntry {
  readonly key: string
  readonly opcodes: readonly number[]
  readonly kind: 'reduce' | 'count' | 'sum' | 'every' | 'some' | 'find' | 'findIndex' | 'none' | 'findMap'
  readonly run: PortableTemplateFn
}

function t_1_lane0(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    const v0 = f0(x)
    out.push(v0)
  }
  return out
}

function t_1_lane1(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    const v0 = f0(x)
    out.push(v0)
  }
  return out
}

function t_1_lane2(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    const v0 = f0(x)
    out.push(v0)
  }
  return out
}

function t_1_lane3(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    const v0 = f0(x)
    out.push(v0)
  }
  return out
}

const t_1_lanes = new WeakMap<object, number>()
let t_1_nextLane = 0

export function t_1(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  if (!IS_BUN_RUNTIME || src.length >= 512) {
    let lane = t_1_lanes.get(bindings)
    if (lane === undefined) {
      lane = t_1_nextLane
      t_1_nextLane = (t_1_nextLane + 1) & 3
      t_1_lanes.set(bindings, lane)
    }
    switch (lane) {
      case 0: return t_1_lane0(src, bindings, offset, limit, meta)
      case 1: return t_1_lane1(src, bindings, offset, limit, meta)
      case 2: return t_1_lane2(src, bindings, offset, limit, meta)
      default: return t_1_lane3(src, bindings, offset, limit, meta)
    }
  }
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    const v0 = f0(x)
    out.push(v0)
  }
  return out
}

export function t_1_3_lim(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    const v0 = f0(x)
      if (limit !== -1 && out.length === limit) {
        if (meta) meta.consumed = i + 1
        break
      }
    out.push(v0)
  }
  return out
}

export function t_1_1(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    const v0 = f0(x)
    const v1 = f1(v0)
    out.push(v1)
  }
  return out
}

export function t_1_1_3_lim(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    const v0 = f0(x)
    const v1 = f1(v0)
      if (limit !== -1 && out.length === limit) {
        if (meta) meta.consumed = i + 1
        break
      }
    out.push(v1)
  }
  return out
}

export function t_1_1_1(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const f2 = bindings[offset + 2].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    const v0 = f0(x)
    const v1 = f1(v0)
    const v2 = f2(v1)
    out.push(v2)
  }
  return out
}

export function t_1_1_1_3_lim(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const f2 = bindings[offset + 2].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    const v0 = f0(x)
    const v1 = f1(v0)
    const v2 = f2(v1)
      if (limit !== -1 && out.length === limit) {
        if (meta) meta.consumed = i + 1
        break
      }
    out.push(v2)
  }
  return out
}

export function t_1_1_2(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const f2 = bindings[offset + 2].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    const v0 = f0(x)
    const v1 = f1(v0)
    if (!f2(v1)) continue
    out.push(v1)
  }
  return out
}

export function t_1_1_2_3_lim(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const f2 = bindings[offset + 2].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    const v0 = f0(x)
    const v1 = f1(v0)
    if (!f2(v1)) continue
      if (limit !== -1 && out.length === limit) {
        if (meta) meta.consumed = i + 1
        break
      }
    out.push(v1)
  }
  return out
}

export function t_1_1_16(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const f2 = bindings[offset + 2].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    const v0 = f0(x)
    const v1 = f1(v0)
    if (f2(v1)) continue
    out.push(v1)
  }
  return out
}

export function t_1_1_16_3_lim(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const f2 = bindings[offset + 2].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    const v0 = f0(x)
    const v1 = f1(v0)
    if (f2(v1)) continue
      if (limit !== -1 && out.length === limit) {
        if (meta) meta.consumed = i + 1
        break
      }
    out.push(v1)
  }
  return out
}

export function t_1_1_14(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const f2 = bindings[offset + 2].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    const v0 = f0(x)
    const v1 = f1(v0)
    const v2 = f2(v1)
    if (v2 == null) continue
    out.push(v2)
  }
  return out
}

export function t_1_1_14_3_lim(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const f2 = bindings[offset + 2].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    const v0 = f0(x)
    const v1 = f1(v0)
    const v2 = f2(v1)
    if (v2 == null) continue
      if (limit !== -1 && out.length === limit) {
        if (meta) meta.consumed = i + 1
        break
      }
    out.push(v2)
  }
  return out
}

function t_1_2_lane0(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    const v0 = f0(x)
    if (!f1(v0)) continue
    out.push(v0)
  }
  return out
}

function t_1_2_lane1(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    const v0 = f0(x)
    if (!f1(v0)) continue
    out.push(v0)
  }
  return out
}

function t_1_2_lane2(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    const v0 = f0(x)
    if (!f1(v0)) continue
    out.push(v0)
  }
  return out
}

function t_1_2_lane3(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    const v0 = f0(x)
    if (!f1(v0)) continue
    out.push(v0)
  }
  return out
}

const t_1_2_lanes = new WeakMap<object, number>()
let t_1_2_nextLane = 0

export function t_1_2(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  if (!IS_BUN_RUNTIME || src.length >= 512) {
    let lane = t_1_2_lanes.get(bindings)
    if (lane === undefined) {
      lane = t_1_2_nextLane
      t_1_2_nextLane = (t_1_2_nextLane + 1) & 3
      t_1_2_lanes.set(bindings, lane)
    }
    switch (lane) {
      case 0: return t_1_2_lane0(src, bindings, offset, limit, meta)
      case 1: return t_1_2_lane1(src, bindings, offset, limit, meta)
      case 2: return t_1_2_lane2(src, bindings, offset, limit, meta)
      default: return t_1_2_lane3(src, bindings, offset, limit, meta)
    }
  }
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    const v0 = f0(x)
    if (!f1(v0)) continue
    out.push(v0)
  }
  return out
}

export function t_1_2_3_lim(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    const v0 = f0(x)
    if (!f1(v0)) continue
      if (limit !== -1 && out.length === limit) {
        if (meta) meta.consumed = i + 1
        break
      }
    out.push(v0)
  }
  return out
}

export function t_1_2_1(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const f2 = bindings[offset + 2].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    const v0 = f0(x)
    if (!f1(v0)) continue
    const v2 = f2(v0)
    out.push(v2)
  }
  return out
}

export function t_1_2_1_3_lim(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const f2 = bindings[offset + 2].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    const v0 = f0(x)
    if (!f1(v0)) continue
    const v2 = f2(v0)
      if (limit !== -1 && out.length === limit) {
        if (meta) meta.consumed = i + 1
        break
      }
    out.push(v2)
  }
  return out
}

export function t_1_2_2(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const f2 = bindings[offset + 2].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    const v0 = f0(x)
    if (!f1(v0)) continue
    if (!f2(v0)) continue
    out.push(v0)
  }
  return out
}

export function t_1_2_2_3_lim(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const f2 = bindings[offset + 2].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    const v0 = f0(x)
    if (!f1(v0)) continue
    if (!f2(v0)) continue
      if (limit !== -1 && out.length === limit) {
        if (meta) meta.consumed = i + 1
        break
      }
    out.push(v0)
  }
  return out
}

export function t_1_2_16(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const f2 = bindings[offset + 2].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    const v0 = f0(x)
    if (!f1(v0)) continue
    if (f2(v0)) continue
    out.push(v0)
  }
  return out
}

export function t_1_2_16_3_lim(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const f2 = bindings[offset + 2].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    const v0 = f0(x)
    if (!f1(v0)) continue
    if (f2(v0)) continue
      if (limit !== -1 && out.length === limit) {
        if (meta) meta.consumed = i + 1
        break
      }
    out.push(v0)
  }
  return out
}

export function t_1_2_14(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const f2 = bindings[offset + 2].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    const v0 = f0(x)
    if (!f1(v0)) continue
    const v2 = f2(v0)
    if (v2 == null) continue
    out.push(v2)
  }
  return out
}

export function t_1_2_14_3_lim(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const f2 = bindings[offset + 2].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    const v0 = f0(x)
    if (!f1(v0)) continue
    const v2 = f2(v0)
    if (v2 == null) continue
      if (limit !== -1 && out.length === limit) {
        if (meta) meta.consumed = i + 1
        break
      }
    out.push(v2)
  }
  return out
}

export function t_1_16(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    const v0 = f0(x)
    if (f1(v0)) continue
    out.push(v0)
  }
  return out
}

export function t_1_16_3_lim(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    const v0 = f0(x)
    if (f1(v0)) continue
      if (limit !== -1 && out.length === limit) {
        if (meta) meta.consumed = i + 1
        break
      }
    out.push(v0)
  }
  return out
}

export function t_1_16_1(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const f2 = bindings[offset + 2].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    const v0 = f0(x)
    if (f1(v0)) continue
    const v2 = f2(v0)
    out.push(v2)
  }
  return out
}

export function t_1_16_1_3_lim(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const f2 = bindings[offset + 2].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    const v0 = f0(x)
    if (f1(v0)) continue
    const v2 = f2(v0)
      if (limit !== -1 && out.length === limit) {
        if (meta) meta.consumed = i + 1
        break
      }
    out.push(v2)
  }
  return out
}

export function t_1_16_2(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const f2 = bindings[offset + 2].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    const v0 = f0(x)
    if (f1(v0)) continue
    if (!f2(v0)) continue
    out.push(v0)
  }
  return out
}

export function t_1_16_2_3_lim(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const f2 = bindings[offset + 2].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    const v0 = f0(x)
    if (f1(v0)) continue
    if (!f2(v0)) continue
      if (limit !== -1 && out.length === limit) {
        if (meta) meta.consumed = i + 1
        break
      }
    out.push(v0)
  }
  return out
}

export function t_1_16_16(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const f2 = bindings[offset + 2].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    const v0 = f0(x)
    if (f1(v0)) continue
    if (f2(v0)) continue
    out.push(v0)
  }
  return out
}

export function t_1_16_16_3_lim(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const f2 = bindings[offset + 2].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    const v0 = f0(x)
    if (f1(v0)) continue
    if (f2(v0)) continue
      if (limit !== -1 && out.length === limit) {
        if (meta) meta.consumed = i + 1
        break
      }
    out.push(v0)
  }
  return out
}

export function t_1_16_14(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const f2 = bindings[offset + 2].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    const v0 = f0(x)
    if (f1(v0)) continue
    const v2 = f2(v0)
    if (v2 == null) continue
    out.push(v2)
  }
  return out
}

export function t_1_16_14_3_lim(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const f2 = bindings[offset + 2].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    const v0 = f0(x)
    if (f1(v0)) continue
    const v2 = f2(v0)
    if (v2 == null) continue
      if (limit !== -1 && out.length === limit) {
        if (meta) meta.consumed = i + 1
        break
      }
    out.push(v2)
  }
  return out
}

export function t_1_14(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    const v0 = f0(x)
    const v1 = f1(v0)
    if (v1 == null) continue
    out.push(v1)
  }
  return out
}

export function t_1_14_3_lim(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    const v0 = f0(x)
    const v1 = f1(v0)
    if (v1 == null) continue
      if (limit !== -1 && out.length === limit) {
        if (meta) meta.consumed = i + 1
        break
      }
    out.push(v1)
  }
  return out
}

export function t_1_14_1(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const f2 = bindings[offset + 2].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    const v0 = f0(x)
    const v1 = f1(v0)
    if (v1 == null) continue
    const v2 = f2(v1)
    out.push(v2)
  }
  return out
}

export function t_1_14_1_3_lim(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const f2 = bindings[offset + 2].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    const v0 = f0(x)
    const v1 = f1(v0)
    if (v1 == null) continue
    const v2 = f2(v1)
      if (limit !== -1 && out.length === limit) {
        if (meta) meta.consumed = i + 1
        break
      }
    out.push(v2)
  }
  return out
}

export function t_1_14_2(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const f2 = bindings[offset + 2].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    const v0 = f0(x)
    const v1 = f1(v0)
    if (v1 == null) continue
    if (!f2(v1)) continue
    out.push(v1)
  }
  return out
}

export function t_1_14_2_3_lim(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const f2 = bindings[offset + 2].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    const v0 = f0(x)
    const v1 = f1(v0)
    if (v1 == null) continue
    if (!f2(v1)) continue
      if (limit !== -1 && out.length === limit) {
        if (meta) meta.consumed = i + 1
        break
      }
    out.push(v1)
  }
  return out
}

export function t_1_14_16(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const f2 = bindings[offset + 2].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    const v0 = f0(x)
    const v1 = f1(v0)
    if (v1 == null) continue
    if (f2(v1)) continue
    out.push(v1)
  }
  return out
}

export function t_1_14_16_3_lim(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const f2 = bindings[offset + 2].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    const v0 = f0(x)
    const v1 = f1(v0)
    if (v1 == null) continue
    if (f2(v1)) continue
      if (limit !== -1 && out.length === limit) {
        if (meta) meta.consumed = i + 1
        break
      }
    out.push(v1)
  }
  return out
}

export function t_1_14_14(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const f2 = bindings[offset + 2].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    const v0 = f0(x)
    const v1 = f1(v0)
    if (v1 == null) continue
    const v2 = f2(v1)
    if (v2 == null) continue
    out.push(v2)
  }
  return out
}

export function t_1_14_14_3_lim(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const f2 = bindings[offset + 2].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    const v0 = f0(x)
    const v1 = f1(v0)
    if (v1 == null) continue
    const v2 = f2(v1)
    if (v2 == null) continue
      if (limit !== -1 && out.length === limit) {
        if (meta) meta.consumed = i + 1
        break
      }
    out.push(v2)
  }
  return out
}

function t_2_lane0(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    if (!f0(x)) continue
    out.push(x)
  }
  return out
}

function t_2_lane1(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    if (!f0(x)) continue
    out.push(x)
  }
  return out
}

function t_2_lane2(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    if (!f0(x)) continue
    out.push(x)
  }
  return out
}

function t_2_lane3(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    if (!f0(x)) continue
    out.push(x)
  }
  return out
}

const t_2_lanes = new WeakMap<object, number>()
let t_2_nextLane = 0

export function t_2(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  if (!IS_BUN_RUNTIME || src.length >= 512) {
    let lane = t_2_lanes.get(bindings)
    if (lane === undefined) {
      lane = t_2_nextLane
      t_2_nextLane = (t_2_nextLane + 1) & 3
      t_2_lanes.set(bindings, lane)
    }
    switch (lane) {
      case 0: return t_2_lane0(src, bindings, offset, limit, meta)
      case 1: return t_2_lane1(src, bindings, offset, limit, meta)
      case 2: return t_2_lane2(src, bindings, offset, limit, meta)
      default: return t_2_lane3(src, bindings, offset, limit, meta)
    }
  }
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    if (!f0(x)) continue
    out.push(x)
  }
  return out
}

export function t_2_3_lim(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    if (!f0(x)) continue
      if (limit !== -1 && out.length === limit) {
        if (meta) meta.consumed = i + 1
        break
      }
    out.push(x)
  }
  return out
}

export function t_2_1(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    if (!f0(x)) continue
    const v1 = f1(x)
    out.push(v1)
  }
  return out
}

export function t_2_1_3_lim(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    if (!f0(x)) continue
    const v1 = f1(x)
      if (limit !== -1 && out.length === limit) {
        if (meta) meta.consumed = i + 1
        break
      }
    out.push(v1)
  }
  return out
}

export function t_2_1_1(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const f2 = bindings[offset + 2].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    if (!f0(x)) continue
    const v1 = f1(x)
    const v2 = f2(v1)
    out.push(v2)
  }
  return out
}

export function t_2_1_1_3_lim(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const f2 = bindings[offset + 2].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    if (!f0(x)) continue
    const v1 = f1(x)
    const v2 = f2(v1)
      if (limit !== -1 && out.length === limit) {
        if (meta) meta.consumed = i + 1
        break
      }
    out.push(v2)
  }
  return out
}

export function t_2_1_2(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const f2 = bindings[offset + 2].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    if (!f0(x)) continue
    const v1 = f1(x)
    if (!f2(v1)) continue
    out.push(v1)
  }
  return out
}

export function t_2_1_2_3_lim(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const f2 = bindings[offset + 2].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    if (!f0(x)) continue
    const v1 = f1(x)
    if (!f2(v1)) continue
      if (limit !== -1 && out.length === limit) {
        if (meta) meta.consumed = i + 1
        break
      }
    out.push(v1)
  }
  return out
}

export function t_2_1_16(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const f2 = bindings[offset + 2].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    if (!f0(x)) continue
    const v1 = f1(x)
    if (f2(v1)) continue
    out.push(v1)
  }
  return out
}

export function t_2_1_16_3_lim(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const f2 = bindings[offset + 2].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    if (!f0(x)) continue
    const v1 = f1(x)
    if (f2(v1)) continue
      if (limit !== -1 && out.length === limit) {
        if (meta) meta.consumed = i + 1
        break
      }
    out.push(v1)
  }
  return out
}

export function t_2_1_14(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const f2 = bindings[offset + 2].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    if (!f0(x)) continue
    const v1 = f1(x)
    const v2 = f2(v1)
    if (v2 == null) continue
    out.push(v2)
  }
  return out
}

export function t_2_1_14_3_lim(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const f2 = bindings[offset + 2].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    if (!f0(x)) continue
    const v1 = f1(x)
    const v2 = f2(v1)
    if (v2 == null) continue
      if (limit !== -1 && out.length === limit) {
        if (meta) meta.consumed = i + 1
        break
      }
    out.push(v2)
  }
  return out
}

export function t_2_2(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    if (!f0(x)) continue
    if (!f1(x)) continue
    out.push(x)
  }
  return out
}

export function t_2_2_3_lim(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    if (!f0(x)) continue
    if (!f1(x)) continue
      if (limit !== -1 && out.length === limit) {
        if (meta) meta.consumed = i + 1
        break
      }
    out.push(x)
  }
  return out
}

export function t_2_2_1(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const f2 = bindings[offset + 2].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    if (!f0(x)) continue
    if (!f1(x)) continue
    const v2 = f2(x)
    out.push(v2)
  }
  return out
}

export function t_2_2_1_3_lim(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const f2 = bindings[offset + 2].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    if (!f0(x)) continue
    if (!f1(x)) continue
    const v2 = f2(x)
      if (limit !== -1 && out.length === limit) {
        if (meta) meta.consumed = i + 1
        break
      }
    out.push(v2)
  }
  return out
}

export function t_2_2_2(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const f2 = bindings[offset + 2].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    if (!f0(x)) continue
    if (!f1(x)) continue
    if (!f2(x)) continue
    out.push(x)
  }
  return out
}

export function t_2_2_2_3_lim(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const f2 = bindings[offset + 2].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    if (!f0(x)) continue
    if (!f1(x)) continue
    if (!f2(x)) continue
      if (limit !== -1 && out.length === limit) {
        if (meta) meta.consumed = i + 1
        break
      }
    out.push(x)
  }
  return out
}

export function t_2_2_16(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const f2 = bindings[offset + 2].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    if (!f0(x)) continue
    if (!f1(x)) continue
    if (f2(x)) continue
    out.push(x)
  }
  return out
}

export function t_2_2_16_3_lim(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const f2 = bindings[offset + 2].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    if (!f0(x)) continue
    if (!f1(x)) continue
    if (f2(x)) continue
      if (limit !== -1 && out.length === limit) {
        if (meta) meta.consumed = i + 1
        break
      }
    out.push(x)
  }
  return out
}

export function t_2_2_14(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const f2 = bindings[offset + 2].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    if (!f0(x)) continue
    if (!f1(x)) continue
    const v2 = f2(x)
    if (v2 == null) continue
    out.push(v2)
  }
  return out
}

export function t_2_2_14_3_lim(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const f2 = bindings[offset + 2].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    if (!f0(x)) continue
    if (!f1(x)) continue
    const v2 = f2(x)
    if (v2 == null) continue
      if (limit !== -1 && out.length === limit) {
        if (meta) meta.consumed = i + 1
        break
      }
    out.push(v2)
  }
  return out
}

export function t_2_16(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    if (!f0(x)) continue
    if (f1(x)) continue
    out.push(x)
  }
  return out
}

export function t_2_16_3_lim(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    if (!f0(x)) continue
    if (f1(x)) continue
      if (limit !== -1 && out.length === limit) {
        if (meta) meta.consumed = i + 1
        break
      }
    out.push(x)
  }
  return out
}

export function t_2_16_1(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const f2 = bindings[offset + 2].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    if (!f0(x)) continue
    if (f1(x)) continue
    const v2 = f2(x)
    out.push(v2)
  }
  return out
}

export function t_2_16_1_3_lim(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const f2 = bindings[offset + 2].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    if (!f0(x)) continue
    if (f1(x)) continue
    const v2 = f2(x)
      if (limit !== -1 && out.length === limit) {
        if (meta) meta.consumed = i + 1
        break
      }
    out.push(v2)
  }
  return out
}

export function t_2_16_2(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const f2 = bindings[offset + 2].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    if (!f0(x)) continue
    if (f1(x)) continue
    if (!f2(x)) continue
    out.push(x)
  }
  return out
}

export function t_2_16_2_3_lim(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const f2 = bindings[offset + 2].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    if (!f0(x)) continue
    if (f1(x)) continue
    if (!f2(x)) continue
      if (limit !== -1 && out.length === limit) {
        if (meta) meta.consumed = i + 1
        break
      }
    out.push(x)
  }
  return out
}

export function t_2_16_16(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const f2 = bindings[offset + 2].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    if (!f0(x)) continue
    if (f1(x)) continue
    if (f2(x)) continue
    out.push(x)
  }
  return out
}

export function t_2_16_16_3_lim(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const f2 = bindings[offset + 2].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    if (!f0(x)) continue
    if (f1(x)) continue
    if (f2(x)) continue
      if (limit !== -1 && out.length === limit) {
        if (meta) meta.consumed = i + 1
        break
      }
    out.push(x)
  }
  return out
}

export function t_2_16_14(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const f2 = bindings[offset + 2].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    if (!f0(x)) continue
    if (f1(x)) continue
    const v2 = f2(x)
    if (v2 == null) continue
    out.push(v2)
  }
  return out
}

export function t_2_16_14_3_lim(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const f2 = bindings[offset + 2].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    if (!f0(x)) continue
    if (f1(x)) continue
    const v2 = f2(x)
    if (v2 == null) continue
      if (limit !== -1 && out.length === limit) {
        if (meta) meta.consumed = i + 1
        break
      }
    out.push(v2)
  }
  return out
}

function t_2_14_lane0(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    if (!f0(x)) continue
    const v1 = f1(x)
    if (v1 == null) continue
    out.push(v1)
  }
  return out
}

function t_2_14_lane1(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    if (!f0(x)) continue
    const v1 = f1(x)
    if (v1 == null) continue
    out.push(v1)
  }
  return out
}

function t_2_14_lane2(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    if (!f0(x)) continue
    const v1 = f1(x)
    if (v1 == null) continue
    out.push(v1)
  }
  return out
}

function t_2_14_lane3(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    if (!f0(x)) continue
    const v1 = f1(x)
    if (v1 == null) continue
    out.push(v1)
  }
  return out
}

const t_2_14_lanes = new WeakMap<object, number>()
let t_2_14_nextLane = 0

export function t_2_14(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  if (!IS_BUN_RUNTIME || src.length >= 512) {
    let lane = t_2_14_lanes.get(bindings)
    if (lane === undefined) {
      lane = t_2_14_nextLane
      t_2_14_nextLane = (t_2_14_nextLane + 1) & 3
      t_2_14_lanes.set(bindings, lane)
    }
    switch (lane) {
      case 0: return t_2_14_lane0(src, bindings, offset, limit, meta)
      case 1: return t_2_14_lane1(src, bindings, offset, limit, meta)
      case 2: return t_2_14_lane2(src, bindings, offset, limit, meta)
      default: return t_2_14_lane3(src, bindings, offset, limit, meta)
    }
  }
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    if (!f0(x)) continue
    const v1 = f1(x)
    if (v1 == null) continue
    out.push(v1)
  }
  return out
}

export function t_2_14_3_lim(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    if (!f0(x)) continue
    const v1 = f1(x)
    if (v1 == null) continue
      if (limit !== -1 && out.length === limit) {
        if (meta) meta.consumed = i + 1
        break
      }
    out.push(v1)
  }
  return out
}

export function t_2_14_1(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const f2 = bindings[offset + 2].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    if (!f0(x)) continue
    const v1 = f1(x)
    if (v1 == null) continue
    const v2 = f2(v1)
    out.push(v2)
  }
  return out
}

export function t_2_14_1_3_lim(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const f2 = bindings[offset + 2].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    if (!f0(x)) continue
    const v1 = f1(x)
    if (v1 == null) continue
    const v2 = f2(v1)
      if (limit !== -1 && out.length === limit) {
        if (meta) meta.consumed = i + 1
        break
      }
    out.push(v2)
  }
  return out
}

export function t_2_14_2(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const f2 = bindings[offset + 2].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    if (!f0(x)) continue
    const v1 = f1(x)
    if (v1 == null) continue
    if (!f2(v1)) continue
    out.push(v1)
  }
  return out
}

export function t_2_14_2_3_lim(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const f2 = bindings[offset + 2].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    if (!f0(x)) continue
    const v1 = f1(x)
    if (v1 == null) continue
    if (!f2(v1)) continue
      if (limit !== -1 && out.length === limit) {
        if (meta) meta.consumed = i + 1
        break
      }
    out.push(v1)
  }
  return out
}

export function t_2_14_16(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const f2 = bindings[offset + 2].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    if (!f0(x)) continue
    const v1 = f1(x)
    if (v1 == null) continue
    if (f2(v1)) continue
    out.push(v1)
  }
  return out
}

export function t_2_14_16_3_lim(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const f2 = bindings[offset + 2].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    if (!f0(x)) continue
    const v1 = f1(x)
    if (v1 == null) continue
    if (f2(v1)) continue
      if (limit !== -1 && out.length === limit) {
        if (meta) meta.consumed = i + 1
        break
      }
    out.push(v1)
  }
  return out
}

export function t_2_14_14(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const f2 = bindings[offset + 2].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    if (!f0(x)) continue
    const v1 = f1(x)
    if (v1 == null) continue
    const v2 = f2(v1)
    if (v2 == null) continue
    out.push(v2)
  }
  return out
}

export function t_2_14_14_3_lim(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const f2 = bindings[offset + 2].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    if (!f0(x)) continue
    const v1 = f1(x)
    if (v1 == null) continue
    const v2 = f2(v1)
    if (v2 == null) continue
      if (limit !== -1 && out.length === limit) {
        if (meta) meta.consumed = i + 1
        break
      }
    out.push(v2)
  }
  return out
}

export function t_16(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    if (f0(x)) continue
    out.push(x)
  }
  return out
}

export function t_16_3_lim(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    if (f0(x)) continue
      if (limit !== -1 && out.length === limit) {
        if (meta) meta.consumed = i + 1
        break
      }
    out.push(x)
  }
  return out
}

export function t_16_1(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    if (f0(x)) continue
    const v1 = f1(x)
    out.push(v1)
  }
  return out
}

export function t_16_1_3_lim(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    if (f0(x)) continue
    const v1 = f1(x)
      if (limit !== -1 && out.length === limit) {
        if (meta) meta.consumed = i + 1
        break
      }
    out.push(v1)
  }
  return out
}

export function t_16_1_1(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const f2 = bindings[offset + 2].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    if (f0(x)) continue
    const v1 = f1(x)
    const v2 = f2(v1)
    out.push(v2)
  }
  return out
}

export function t_16_1_1_3_lim(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const f2 = bindings[offset + 2].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    if (f0(x)) continue
    const v1 = f1(x)
    const v2 = f2(v1)
      if (limit !== -1 && out.length === limit) {
        if (meta) meta.consumed = i + 1
        break
      }
    out.push(v2)
  }
  return out
}

export function t_16_1_2(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const f2 = bindings[offset + 2].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    if (f0(x)) continue
    const v1 = f1(x)
    if (!f2(v1)) continue
    out.push(v1)
  }
  return out
}

export function t_16_1_2_3_lim(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const f2 = bindings[offset + 2].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    if (f0(x)) continue
    const v1 = f1(x)
    if (!f2(v1)) continue
      if (limit !== -1 && out.length === limit) {
        if (meta) meta.consumed = i + 1
        break
      }
    out.push(v1)
  }
  return out
}

export function t_16_1_16(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const f2 = bindings[offset + 2].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    if (f0(x)) continue
    const v1 = f1(x)
    if (f2(v1)) continue
    out.push(v1)
  }
  return out
}

export function t_16_1_16_3_lim(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const f2 = bindings[offset + 2].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    if (f0(x)) continue
    const v1 = f1(x)
    if (f2(v1)) continue
      if (limit !== -1 && out.length === limit) {
        if (meta) meta.consumed = i + 1
        break
      }
    out.push(v1)
  }
  return out
}

export function t_16_1_14(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const f2 = bindings[offset + 2].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    if (f0(x)) continue
    const v1 = f1(x)
    const v2 = f2(v1)
    if (v2 == null) continue
    out.push(v2)
  }
  return out
}

export function t_16_1_14_3_lim(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const f2 = bindings[offset + 2].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    if (f0(x)) continue
    const v1 = f1(x)
    const v2 = f2(v1)
    if (v2 == null) continue
      if (limit !== -1 && out.length === limit) {
        if (meta) meta.consumed = i + 1
        break
      }
    out.push(v2)
  }
  return out
}

export function t_16_2(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    if (f0(x)) continue
    if (!f1(x)) continue
    out.push(x)
  }
  return out
}

export function t_16_2_3_lim(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    if (f0(x)) continue
    if (!f1(x)) continue
      if (limit !== -1 && out.length === limit) {
        if (meta) meta.consumed = i + 1
        break
      }
    out.push(x)
  }
  return out
}

export function t_16_2_1(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const f2 = bindings[offset + 2].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    if (f0(x)) continue
    if (!f1(x)) continue
    const v2 = f2(x)
    out.push(v2)
  }
  return out
}

export function t_16_2_1_3_lim(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const f2 = bindings[offset + 2].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    if (f0(x)) continue
    if (!f1(x)) continue
    const v2 = f2(x)
      if (limit !== -1 && out.length === limit) {
        if (meta) meta.consumed = i + 1
        break
      }
    out.push(v2)
  }
  return out
}

export function t_16_2_2(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const f2 = bindings[offset + 2].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    if (f0(x)) continue
    if (!f1(x)) continue
    if (!f2(x)) continue
    out.push(x)
  }
  return out
}

export function t_16_2_2_3_lim(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const f2 = bindings[offset + 2].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    if (f0(x)) continue
    if (!f1(x)) continue
    if (!f2(x)) continue
      if (limit !== -1 && out.length === limit) {
        if (meta) meta.consumed = i + 1
        break
      }
    out.push(x)
  }
  return out
}

export function t_16_2_16(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const f2 = bindings[offset + 2].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    if (f0(x)) continue
    if (!f1(x)) continue
    if (f2(x)) continue
    out.push(x)
  }
  return out
}

export function t_16_2_16_3_lim(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const f2 = bindings[offset + 2].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    if (f0(x)) continue
    if (!f1(x)) continue
    if (f2(x)) continue
      if (limit !== -1 && out.length === limit) {
        if (meta) meta.consumed = i + 1
        break
      }
    out.push(x)
  }
  return out
}

export function t_16_2_14(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const f2 = bindings[offset + 2].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    if (f0(x)) continue
    if (!f1(x)) continue
    const v2 = f2(x)
    if (v2 == null) continue
    out.push(v2)
  }
  return out
}

export function t_16_2_14_3_lim(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const f2 = bindings[offset + 2].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    if (f0(x)) continue
    if (!f1(x)) continue
    const v2 = f2(x)
    if (v2 == null) continue
      if (limit !== -1 && out.length === limit) {
        if (meta) meta.consumed = i + 1
        break
      }
    out.push(v2)
  }
  return out
}

export function t_16_16(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    if (f0(x)) continue
    if (f1(x)) continue
    out.push(x)
  }
  return out
}

export function t_16_16_3_lim(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    if (f0(x)) continue
    if (f1(x)) continue
      if (limit !== -1 && out.length === limit) {
        if (meta) meta.consumed = i + 1
        break
      }
    out.push(x)
  }
  return out
}

export function t_16_16_1(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const f2 = bindings[offset + 2].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    if (f0(x)) continue
    if (f1(x)) continue
    const v2 = f2(x)
    out.push(v2)
  }
  return out
}

export function t_16_16_1_3_lim(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const f2 = bindings[offset + 2].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    if (f0(x)) continue
    if (f1(x)) continue
    const v2 = f2(x)
      if (limit !== -1 && out.length === limit) {
        if (meta) meta.consumed = i + 1
        break
      }
    out.push(v2)
  }
  return out
}

export function t_16_16_2(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const f2 = bindings[offset + 2].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    if (f0(x)) continue
    if (f1(x)) continue
    if (!f2(x)) continue
    out.push(x)
  }
  return out
}

export function t_16_16_2_3_lim(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const f2 = bindings[offset + 2].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    if (f0(x)) continue
    if (f1(x)) continue
    if (!f2(x)) continue
      if (limit !== -1 && out.length === limit) {
        if (meta) meta.consumed = i + 1
        break
      }
    out.push(x)
  }
  return out
}

export function t_16_16_16(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const f2 = bindings[offset + 2].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    if (f0(x)) continue
    if (f1(x)) continue
    if (f2(x)) continue
    out.push(x)
  }
  return out
}

export function t_16_16_16_3_lim(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const f2 = bindings[offset + 2].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    if (f0(x)) continue
    if (f1(x)) continue
    if (f2(x)) continue
      if (limit !== -1 && out.length === limit) {
        if (meta) meta.consumed = i + 1
        break
      }
    out.push(x)
  }
  return out
}

export function t_16_16_14(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const f2 = bindings[offset + 2].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    if (f0(x)) continue
    if (f1(x)) continue
    const v2 = f2(x)
    if (v2 == null) continue
    out.push(v2)
  }
  return out
}

export function t_16_16_14_3_lim(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const f2 = bindings[offset + 2].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    if (f0(x)) continue
    if (f1(x)) continue
    const v2 = f2(x)
    if (v2 == null) continue
      if (limit !== -1 && out.length === limit) {
        if (meta) meta.consumed = i + 1
        break
      }
    out.push(v2)
  }
  return out
}

export function t_16_14(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    if (f0(x)) continue
    const v1 = f1(x)
    if (v1 == null) continue
    out.push(v1)
  }
  return out
}

export function t_16_14_3_lim(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    if (f0(x)) continue
    const v1 = f1(x)
    if (v1 == null) continue
      if (limit !== -1 && out.length === limit) {
        if (meta) meta.consumed = i + 1
        break
      }
    out.push(v1)
  }
  return out
}

export function t_16_14_1(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const f2 = bindings[offset + 2].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    if (f0(x)) continue
    const v1 = f1(x)
    if (v1 == null) continue
    const v2 = f2(v1)
    out.push(v2)
  }
  return out
}

export function t_16_14_1_3_lim(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const f2 = bindings[offset + 2].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    if (f0(x)) continue
    const v1 = f1(x)
    if (v1 == null) continue
    const v2 = f2(v1)
      if (limit !== -1 && out.length === limit) {
        if (meta) meta.consumed = i + 1
        break
      }
    out.push(v2)
  }
  return out
}

export function t_16_14_2(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const f2 = bindings[offset + 2].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    if (f0(x)) continue
    const v1 = f1(x)
    if (v1 == null) continue
    if (!f2(v1)) continue
    out.push(v1)
  }
  return out
}

export function t_16_14_2_3_lim(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const f2 = bindings[offset + 2].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    if (f0(x)) continue
    const v1 = f1(x)
    if (v1 == null) continue
    if (!f2(v1)) continue
      if (limit !== -1 && out.length === limit) {
        if (meta) meta.consumed = i + 1
        break
      }
    out.push(v1)
  }
  return out
}

export function t_16_14_16(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const f2 = bindings[offset + 2].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    if (f0(x)) continue
    const v1 = f1(x)
    if (v1 == null) continue
    if (f2(v1)) continue
    out.push(v1)
  }
  return out
}

export function t_16_14_16_3_lim(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const f2 = bindings[offset + 2].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    if (f0(x)) continue
    const v1 = f1(x)
    if (v1 == null) continue
    if (f2(v1)) continue
      if (limit !== -1 && out.length === limit) {
        if (meta) meta.consumed = i + 1
        break
      }
    out.push(v1)
  }
  return out
}

export function t_16_14_14(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const f2 = bindings[offset + 2].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    if (f0(x)) continue
    const v1 = f1(x)
    if (v1 == null) continue
    const v2 = f2(v1)
    if (v2 == null) continue
    out.push(v2)
  }
  return out
}

export function t_16_14_14_3_lim(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const f2 = bindings[offset + 2].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    if (f0(x)) continue
    const v1 = f1(x)
    if (v1 == null) continue
    const v2 = f2(v1)
    if (v2 == null) continue
      if (limit !== -1 && out.length === limit) {
        if (meta) meta.consumed = i + 1
        break
      }
    out.push(v2)
  }
  return out
}

export function t_14(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    const v0 = f0(x)
    if (v0 == null) continue
    out.push(v0)
  }
  return out
}

export function t_14_3_lim(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    const v0 = f0(x)
    if (v0 == null) continue
      if (limit !== -1 && out.length === limit) {
        if (meta) meta.consumed = i + 1
        break
      }
    out.push(v0)
  }
  return out
}

export function t_14_1(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    const v0 = f0(x)
    if (v0 == null) continue
    const v1 = f1(v0)
    out.push(v1)
  }
  return out
}

export function t_14_1_3_lim(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    const v0 = f0(x)
    if (v0 == null) continue
    const v1 = f1(v0)
      if (limit !== -1 && out.length === limit) {
        if (meta) meta.consumed = i + 1
        break
      }
    out.push(v1)
  }
  return out
}

export function t_14_1_1(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const f2 = bindings[offset + 2].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    const v0 = f0(x)
    if (v0 == null) continue
    const v1 = f1(v0)
    const v2 = f2(v1)
    out.push(v2)
  }
  return out
}

export function t_14_1_1_3_lim(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const f2 = bindings[offset + 2].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    const v0 = f0(x)
    if (v0 == null) continue
    const v1 = f1(v0)
    const v2 = f2(v1)
      if (limit !== -1 && out.length === limit) {
        if (meta) meta.consumed = i + 1
        break
      }
    out.push(v2)
  }
  return out
}

export function t_14_1_2(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const f2 = bindings[offset + 2].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    const v0 = f0(x)
    if (v0 == null) continue
    const v1 = f1(v0)
    if (!f2(v1)) continue
    out.push(v1)
  }
  return out
}

export function t_14_1_2_3_lim(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const f2 = bindings[offset + 2].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    const v0 = f0(x)
    if (v0 == null) continue
    const v1 = f1(v0)
    if (!f2(v1)) continue
      if (limit !== -1 && out.length === limit) {
        if (meta) meta.consumed = i + 1
        break
      }
    out.push(v1)
  }
  return out
}

export function t_14_1_16(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const f2 = bindings[offset + 2].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    const v0 = f0(x)
    if (v0 == null) continue
    const v1 = f1(v0)
    if (f2(v1)) continue
    out.push(v1)
  }
  return out
}

export function t_14_1_16_3_lim(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const f2 = bindings[offset + 2].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    const v0 = f0(x)
    if (v0 == null) continue
    const v1 = f1(v0)
    if (f2(v1)) continue
      if (limit !== -1 && out.length === limit) {
        if (meta) meta.consumed = i + 1
        break
      }
    out.push(v1)
  }
  return out
}

export function t_14_1_14(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const f2 = bindings[offset + 2].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    const v0 = f0(x)
    if (v0 == null) continue
    const v1 = f1(v0)
    const v2 = f2(v1)
    if (v2 == null) continue
    out.push(v2)
  }
  return out
}

export function t_14_1_14_3_lim(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const f2 = bindings[offset + 2].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    const v0 = f0(x)
    if (v0 == null) continue
    const v1 = f1(v0)
    const v2 = f2(v1)
    if (v2 == null) continue
      if (limit !== -1 && out.length === limit) {
        if (meta) meta.consumed = i + 1
        break
      }
    out.push(v2)
  }
  return out
}

export function t_14_2(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    const v0 = f0(x)
    if (v0 == null) continue
    if (!f1(v0)) continue
    out.push(v0)
  }
  return out
}

export function t_14_2_3_lim(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    const v0 = f0(x)
    if (v0 == null) continue
    if (!f1(v0)) continue
      if (limit !== -1 && out.length === limit) {
        if (meta) meta.consumed = i + 1
        break
      }
    out.push(v0)
  }
  return out
}

export function t_14_2_1(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const f2 = bindings[offset + 2].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    const v0 = f0(x)
    if (v0 == null) continue
    if (!f1(v0)) continue
    const v2 = f2(v0)
    out.push(v2)
  }
  return out
}

export function t_14_2_1_3_lim(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const f2 = bindings[offset + 2].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    const v0 = f0(x)
    if (v0 == null) continue
    if (!f1(v0)) continue
    const v2 = f2(v0)
      if (limit !== -1 && out.length === limit) {
        if (meta) meta.consumed = i + 1
        break
      }
    out.push(v2)
  }
  return out
}

export function t_14_2_2(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const f2 = bindings[offset + 2].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    const v0 = f0(x)
    if (v0 == null) continue
    if (!f1(v0)) continue
    if (!f2(v0)) continue
    out.push(v0)
  }
  return out
}

export function t_14_2_2_3_lim(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const f2 = bindings[offset + 2].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    const v0 = f0(x)
    if (v0 == null) continue
    if (!f1(v0)) continue
    if (!f2(v0)) continue
      if (limit !== -1 && out.length === limit) {
        if (meta) meta.consumed = i + 1
        break
      }
    out.push(v0)
  }
  return out
}

export function t_14_2_16(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const f2 = bindings[offset + 2].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    const v0 = f0(x)
    if (v0 == null) continue
    if (!f1(v0)) continue
    if (f2(v0)) continue
    out.push(v0)
  }
  return out
}

export function t_14_2_16_3_lim(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const f2 = bindings[offset + 2].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    const v0 = f0(x)
    if (v0 == null) continue
    if (!f1(v0)) continue
    if (f2(v0)) continue
      if (limit !== -1 && out.length === limit) {
        if (meta) meta.consumed = i + 1
        break
      }
    out.push(v0)
  }
  return out
}

export function t_14_2_14(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const f2 = bindings[offset + 2].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    const v0 = f0(x)
    if (v0 == null) continue
    if (!f1(v0)) continue
    const v2 = f2(v0)
    if (v2 == null) continue
    out.push(v2)
  }
  return out
}

export function t_14_2_14_3_lim(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const f2 = bindings[offset + 2].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    const v0 = f0(x)
    if (v0 == null) continue
    if (!f1(v0)) continue
    const v2 = f2(v0)
    if (v2 == null) continue
      if (limit !== -1 && out.length === limit) {
        if (meta) meta.consumed = i + 1
        break
      }
    out.push(v2)
  }
  return out
}

export function t_14_16(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    const v0 = f0(x)
    if (v0 == null) continue
    if (f1(v0)) continue
    out.push(v0)
  }
  return out
}

export function t_14_16_3_lim(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    const v0 = f0(x)
    if (v0 == null) continue
    if (f1(v0)) continue
      if (limit !== -1 && out.length === limit) {
        if (meta) meta.consumed = i + 1
        break
      }
    out.push(v0)
  }
  return out
}

export function t_14_16_1(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const f2 = bindings[offset + 2].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    const v0 = f0(x)
    if (v0 == null) continue
    if (f1(v0)) continue
    const v2 = f2(v0)
    out.push(v2)
  }
  return out
}

export function t_14_16_1_3_lim(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const f2 = bindings[offset + 2].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    const v0 = f0(x)
    if (v0 == null) continue
    if (f1(v0)) continue
    const v2 = f2(v0)
      if (limit !== -1 && out.length === limit) {
        if (meta) meta.consumed = i + 1
        break
      }
    out.push(v2)
  }
  return out
}

export function t_14_16_2(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const f2 = bindings[offset + 2].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    const v0 = f0(x)
    if (v0 == null) continue
    if (f1(v0)) continue
    if (!f2(v0)) continue
    out.push(v0)
  }
  return out
}

export function t_14_16_2_3_lim(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const f2 = bindings[offset + 2].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    const v0 = f0(x)
    if (v0 == null) continue
    if (f1(v0)) continue
    if (!f2(v0)) continue
      if (limit !== -1 && out.length === limit) {
        if (meta) meta.consumed = i + 1
        break
      }
    out.push(v0)
  }
  return out
}

export function t_14_16_16(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const f2 = bindings[offset + 2].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    const v0 = f0(x)
    if (v0 == null) continue
    if (f1(v0)) continue
    if (f2(v0)) continue
    out.push(v0)
  }
  return out
}

export function t_14_16_16_3_lim(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const f2 = bindings[offset + 2].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    const v0 = f0(x)
    if (v0 == null) continue
    if (f1(v0)) continue
    if (f2(v0)) continue
      if (limit !== -1 && out.length === limit) {
        if (meta) meta.consumed = i + 1
        break
      }
    out.push(v0)
  }
  return out
}

export function t_14_16_14(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const f2 = bindings[offset + 2].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    const v0 = f0(x)
    if (v0 == null) continue
    if (f1(v0)) continue
    const v2 = f2(v0)
    if (v2 == null) continue
    out.push(v2)
  }
  return out
}

export function t_14_16_14_3_lim(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const f2 = bindings[offset + 2].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    const v0 = f0(x)
    if (v0 == null) continue
    if (f1(v0)) continue
    const v2 = f2(v0)
    if (v2 == null) continue
      if (limit !== -1 && out.length === limit) {
        if (meta) meta.consumed = i + 1
        break
      }
    out.push(v2)
  }
  return out
}

export function t_14_14(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    const v0 = f0(x)
    if (v0 == null) continue
    const v1 = f1(v0)
    if (v1 == null) continue
    out.push(v1)
  }
  return out
}

export function t_14_14_3_lim(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    const v0 = f0(x)
    if (v0 == null) continue
    const v1 = f1(v0)
    if (v1 == null) continue
      if (limit !== -1 && out.length === limit) {
        if (meta) meta.consumed = i + 1
        break
      }
    out.push(v1)
  }
  return out
}

export function t_14_14_1(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const f2 = bindings[offset + 2].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    const v0 = f0(x)
    if (v0 == null) continue
    const v1 = f1(v0)
    if (v1 == null) continue
    const v2 = f2(v1)
    out.push(v2)
  }
  return out
}

export function t_14_14_1_3_lim(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const f2 = bindings[offset + 2].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    const v0 = f0(x)
    if (v0 == null) continue
    const v1 = f1(v0)
    if (v1 == null) continue
    const v2 = f2(v1)
      if (limit !== -1 && out.length === limit) {
        if (meta) meta.consumed = i + 1
        break
      }
    out.push(v2)
  }
  return out
}

export function t_14_14_2(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const f2 = bindings[offset + 2].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    const v0 = f0(x)
    if (v0 == null) continue
    const v1 = f1(v0)
    if (v1 == null) continue
    if (!f2(v1)) continue
    out.push(v1)
  }
  return out
}

export function t_14_14_2_3_lim(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const f2 = bindings[offset + 2].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    const v0 = f0(x)
    if (v0 == null) continue
    const v1 = f1(v0)
    if (v1 == null) continue
    if (!f2(v1)) continue
      if (limit !== -1 && out.length === limit) {
        if (meta) meta.consumed = i + 1
        break
      }
    out.push(v1)
  }
  return out
}

export function t_14_14_16(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const f2 = bindings[offset + 2].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    const v0 = f0(x)
    if (v0 == null) continue
    const v1 = f1(v0)
    if (v1 == null) continue
    if (f2(v1)) continue
    out.push(v1)
  }
  return out
}

export function t_14_14_16_3_lim(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const f2 = bindings[offset + 2].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    const v0 = f0(x)
    if (v0 == null) continue
    const v1 = f1(v0)
    if (v1 == null) continue
    if (f2(v1)) continue
      if (limit !== -1 && out.length === limit) {
        if (meta) meta.consumed = i + 1
        break
      }
    out.push(v1)
  }
  return out
}

export function t_14_14_14(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const f2 = bindings[offset + 2].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    const v0 = f0(x)
    if (v0 == null) continue
    const v1 = f1(v0)
    if (v1 == null) continue
    const v2 = f2(v1)
    if (v2 == null) continue
    out.push(v2)
  }
  return out
}

export function t_14_14_14_3_lim(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const f2 = bindings[offset + 2].fn as (v: unknown) => unknown
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    const v0 = f0(x)
    if (v0 == null) continue
    const v1 = f1(v0)
    if (v1 == null) continue
    const v2 = f2(v1)
    if (v2 == null) continue
      if (limit !== -1 && out.length === limit) {
        if (meta) meta.consumed = i + 1
        break
      }
    out.push(v2)
  }
  return out
}

export function t_8_reduce(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown {
  const fr = bindings[offset + 0].fn as (acc: unknown, v: unknown) => unknown
  let acc: unknown = bindings[offset + 0].a1
  const sourceLength = src.length
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]

    acc = fr(acc, x)
  }
  return acc
}

export function t_18_count(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown {
  const fs = bindings[offset + 0].fn as (v: unknown) => boolean
  let count = 0
  const sourceLength = src.length
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]

    if (fs(x)) count++
  }
  return count
}

export function t_10_every(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown {
  const fs = bindings[offset + 0].fn as (v: unknown) => unknown
  const sourceLength = src.length
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]

    if (!fs(x)) {
      if (meta) meta.consumed = i + 1
      return false
    }
  }
  return true
}

export function t_11_some(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown {
  const fs = bindings[offset + 0].fn as (v: unknown) => unknown
  const sourceLength = src.length
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]

    if (fs(x)) {
      if (meta) meta.consumed = i + 1
      return true
    }
  }
  return false
}

export function t_12_find(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown {
  const fs = bindings[offset + 0].fn as (v: unknown) => unknown
  const sourceLength = src.length
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]

    if (fs(x)) {
      if (meta) meta.consumed = i + 1
      return optionSome(x)
    }
  }
  return optionNone
}

export function t_13_findIndex(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown {
  const fs = bindings[offset + 0].fn as (v: unknown) => unknown
  let index = 0
  const sourceLength = src.length
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]

    if (fs(x)) {
      if (meta) meta.consumed = i + 1
      return optionSome(index)
    }
    index++
  }
  return optionNone
}

export function t_17_none(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown {
  const fs = bindings[offset + 0].fn as (v: unknown) => unknown
  const sourceLength = src.length
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]

    if (fs(x)) {
      if (meta) meta.consumed = i + 1
      return false
    }
  }
  return true
}

export function t_22_findMap(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown {
  const fs = bindings[offset + 0].fn as (v: unknown) => unknown
  const sourceLength = src.length
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]

    const mapped = fs(x)
    if (mapped != null) {
      if (meta) meta.consumed = i + 1
      return optionSome(mapped)
    }
  }
  return optionNone
}

export function t_1_8_reduce(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const fr = bindings[offset + 1].fn as (acc: unknown, v: unknown) => unknown
  let acc: unknown = bindings[offset + 1].a1
  const sourceLength = src.length
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    const v0 = f0(x)
    acc = fr(acc, v0)
  }
  return acc
}

export function t_1_18_count(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const fs = bindings[offset + 1].fn as (v: unknown) => boolean
  let count = 0
  const sourceLength = src.length
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    const v0 = f0(x)
    if (fs(v0)) count++
  }
  return count
}

export function t_1_41_sum(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  let sum = 0
  const sourceLength = src.length
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    const v0 = f0(x)
    sum += v0 as number
  }
  return sum
}

export function t_1_10_every(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const fs = bindings[offset + 1].fn as (v: unknown) => unknown
  const sourceLength = src.length
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    const v0 = f0(x)
    if (!fs(v0)) {
      if (meta) meta.consumed = i + 1
      return false
    }
  }
  return true
}

export function t_1_11_some(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const fs = bindings[offset + 1].fn as (v: unknown) => unknown
  const sourceLength = src.length
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    const v0 = f0(x)
    if (fs(v0)) {
      if (meta) meta.consumed = i + 1
      return true
    }
  }
  return false
}

export function t_1_12_find(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const fs = bindings[offset + 1].fn as (v: unknown) => unknown
  const sourceLength = src.length
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    const v0 = f0(x)
    if (fs(v0)) {
      if (meta) meta.consumed = i + 1
      return optionSome(v0)
    }
  }
  return optionNone
}

export function t_1_13_findIndex(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const fs = bindings[offset + 1].fn as (v: unknown) => unknown
  let index = 0
  const sourceLength = src.length
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    const v0 = f0(x)
    if (fs(v0)) {
      if (meta) meta.consumed = i + 1
      return optionSome(index)
    }
    index++
  }
  return optionNone
}

export function t_1_17_none(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const fs = bindings[offset + 1].fn as (v: unknown) => unknown
  const sourceLength = src.length
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    const v0 = f0(x)
    if (fs(v0)) {
      if (meta) meta.consumed = i + 1
      return false
    }
  }
  return true
}

export function t_1_22_findMap(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const fs = bindings[offset + 1].fn as (v: unknown) => unknown
  const sourceLength = src.length
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    const v0 = f0(x)
    const mapped = fs(v0)
    if (mapped != null) {
      if (meta) meta.consumed = i + 1
      return optionSome(mapped)
    }
  }
  return optionNone
}

function t_2_8_reduce_lane0(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const fr = bindings[offset + 1].fn as (acc: unknown, v: unknown) => unknown
  let acc: unknown = bindings[offset + 1].a1
  const sourceLength = src.length
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    if (!f0(x)) continue
    acc = fr(acc, x)
  }
  return acc
}

function t_2_8_reduce_lane1(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const fr = bindings[offset + 1].fn as (acc: unknown, v: unknown) => unknown
  let acc: unknown = bindings[offset + 1].a1
  const sourceLength = src.length
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    if (!f0(x)) continue
    acc = fr(acc, x)
  }
  return acc
}

function t_2_8_reduce_lane2(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const fr = bindings[offset + 1].fn as (acc: unknown, v: unknown) => unknown
  let acc: unknown = bindings[offset + 1].a1
  const sourceLength = src.length
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    if (!f0(x)) continue
    acc = fr(acc, x)
  }
  return acc
}

function t_2_8_reduce_lane3(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const fr = bindings[offset + 1].fn as (acc: unknown, v: unknown) => unknown
  let acc: unknown = bindings[offset + 1].a1
  const sourceLength = src.length
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    if (!f0(x)) continue
    acc = fr(acc, x)
  }
  return acc
}

const t_2_8_reduce_lanes = new WeakMap<object, number>()
let t_2_8_reduce_nextLane = 0

export function t_2_8_reduce(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown {
  if (!IS_BUN_RUNTIME || src.length >= 512) {
    let lane = t_2_8_reduce_lanes.get(bindings)
    if (lane === undefined) {
      lane = t_2_8_reduce_nextLane
      t_2_8_reduce_nextLane = (t_2_8_reduce_nextLane + 1) & 3
      t_2_8_reduce_lanes.set(bindings, lane)
    }
    switch (lane) {
      case 0: return t_2_8_reduce_lane0(src, bindings, offset, limit, meta)
      case 1: return t_2_8_reduce_lane1(src, bindings, offset, limit, meta)
      case 2: return t_2_8_reduce_lane2(src, bindings, offset, limit, meta)
      default: return t_2_8_reduce_lane3(src, bindings, offset, limit, meta)
    }
  }
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const fr = bindings[offset + 1].fn as (acc: unknown, v: unknown) => unknown
  let acc: unknown = bindings[offset + 1].a1
  const sourceLength = src.length
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    if (!f0(x)) continue
    acc = fr(acc, x)
  }
  return acc
}

export function t_2_18_count(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const fs = bindings[offset + 1].fn as (v: unknown) => boolean
  let count = 0
  const sourceLength = src.length
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    if (!f0(x)) continue
    if (fs(x)) count++
  }
  return count
}

export function t_2_41_sum(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  let sum = 0
  const sourceLength = src.length
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    if (!f0(x)) continue
    sum += x as number
  }
  return sum
}

export function t_2_10_every(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const fs = bindings[offset + 1].fn as (v: unknown) => unknown
  const sourceLength = src.length
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    if (!f0(x)) continue
    if (!fs(x)) {
      if (meta) meta.consumed = i + 1
      return false
    }
  }
  return true
}

export function t_2_11_some(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const fs = bindings[offset + 1].fn as (v: unknown) => unknown
  const sourceLength = src.length
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    if (!f0(x)) continue
    if (fs(x)) {
      if (meta) meta.consumed = i + 1
      return true
    }
  }
  return false
}

function t_2_12_find_lane0(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const fs = bindings[offset + 1].fn as (v: unknown) => unknown
  const sourceLength = src.length
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    if (!f0(x)) continue
    if (fs(x)) {
      if (meta) meta.consumed = i + 1
      return optionSome(x)
    }
  }
  return optionNone
}

function t_2_12_find_lane1(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const fs = bindings[offset + 1].fn as (v: unknown) => unknown
  const sourceLength = src.length
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    if (!f0(x)) continue
    if (fs(x)) {
      if (meta) meta.consumed = i + 1
      return optionSome(x)
    }
  }
  return optionNone
}

function t_2_12_find_lane2(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const fs = bindings[offset + 1].fn as (v: unknown) => unknown
  const sourceLength = src.length
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    if (!f0(x)) continue
    if (fs(x)) {
      if (meta) meta.consumed = i + 1
      return optionSome(x)
    }
  }
  return optionNone
}

function t_2_12_find_lane3(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const fs = bindings[offset + 1].fn as (v: unknown) => unknown
  const sourceLength = src.length
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    if (!f0(x)) continue
    if (fs(x)) {
      if (meta) meta.consumed = i + 1
      return optionSome(x)
    }
  }
  return optionNone
}

const t_2_12_find_lanes = new WeakMap<object, number>()
let t_2_12_find_nextLane = 0

export function t_2_12_find(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown {
  if (!IS_BUN_RUNTIME || src.length >= 512) {
    let lane = t_2_12_find_lanes.get(bindings)
    if (lane === undefined) {
      lane = t_2_12_find_nextLane
      t_2_12_find_nextLane = (t_2_12_find_nextLane + 1) & 3
      t_2_12_find_lanes.set(bindings, lane)
    }
    switch (lane) {
      case 0: return t_2_12_find_lane0(src, bindings, offset, limit, meta)
      case 1: return t_2_12_find_lane1(src, bindings, offset, limit, meta)
      case 2: return t_2_12_find_lane2(src, bindings, offset, limit, meta)
      default: return t_2_12_find_lane3(src, bindings, offset, limit, meta)
    }
  }
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const fs = bindings[offset + 1].fn as (v: unknown) => unknown
  const sourceLength = src.length
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    if (!f0(x)) continue
    if (fs(x)) {
      if (meta) meta.consumed = i + 1
      return optionSome(x)
    }
  }
  return optionNone
}

export function t_2_13_findIndex(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const fs = bindings[offset + 1].fn as (v: unknown) => unknown
  let index = 0
  const sourceLength = src.length
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    if (!f0(x)) continue
    if (fs(x)) {
      if (meta) meta.consumed = i + 1
      return optionSome(index)
    }
    index++
  }
  return optionNone
}

export function t_2_17_none(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const fs = bindings[offset + 1].fn as (v: unknown) => unknown
  const sourceLength = src.length
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    if (!f0(x)) continue
    if (fs(x)) {
      if (meta) meta.consumed = i + 1
      return false
    }
  }
  return true
}

export function t_2_22_findMap(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const fs = bindings[offset + 1].fn as (v: unknown) => unknown
  const sourceLength = src.length
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    if (!f0(x)) continue
    const mapped = fs(x)
    if (mapped != null) {
      if (meta) meta.consumed = i + 1
      return optionSome(mapped)
    }
  }
  return optionNone
}

export function t_16_8_reduce(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const fr = bindings[offset + 1].fn as (acc: unknown, v: unknown) => unknown
  let acc: unknown = bindings[offset + 1].a1
  const sourceLength = src.length
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    if (f0(x)) continue
    acc = fr(acc, x)
  }
  return acc
}

export function t_16_18_count(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const fs = bindings[offset + 1].fn as (v: unknown) => boolean
  let count = 0
  const sourceLength = src.length
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    if (f0(x)) continue
    if (fs(x)) count++
  }
  return count
}

export function t_16_41_sum(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  let sum = 0
  const sourceLength = src.length
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    if (f0(x)) continue
    sum += x as number
  }
  return sum
}

export function t_16_10_every(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const fs = bindings[offset + 1].fn as (v: unknown) => unknown
  const sourceLength = src.length
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    if (f0(x)) continue
    if (!fs(x)) {
      if (meta) meta.consumed = i + 1
      return false
    }
  }
  return true
}

export function t_16_11_some(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const fs = bindings[offset + 1].fn as (v: unknown) => unknown
  const sourceLength = src.length
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    if (f0(x)) continue
    if (fs(x)) {
      if (meta) meta.consumed = i + 1
      return true
    }
  }
  return false
}

export function t_16_12_find(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const fs = bindings[offset + 1].fn as (v: unknown) => unknown
  const sourceLength = src.length
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    if (f0(x)) continue
    if (fs(x)) {
      if (meta) meta.consumed = i + 1
      return optionSome(x)
    }
  }
  return optionNone
}

export function t_16_13_findIndex(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const fs = bindings[offset + 1].fn as (v: unknown) => unknown
  let index = 0
  const sourceLength = src.length
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    if (f0(x)) continue
    if (fs(x)) {
      if (meta) meta.consumed = i + 1
      return optionSome(index)
    }
    index++
  }
  return optionNone
}

export function t_16_17_none(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const fs = bindings[offset + 1].fn as (v: unknown) => unknown
  const sourceLength = src.length
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    if (f0(x)) continue
    if (fs(x)) {
      if (meta) meta.consumed = i + 1
      return false
    }
  }
  return true
}

export function t_16_22_findMap(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const fs = bindings[offset + 1].fn as (v: unknown) => unknown
  const sourceLength = src.length
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    if (f0(x)) continue
    const mapped = fs(x)
    if (mapped != null) {
      if (meta) meta.consumed = i + 1
      return optionSome(mapped)
    }
  }
  return optionNone
}

export function t_14_8_reduce(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const fr = bindings[offset + 1].fn as (acc: unknown, v: unknown) => unknown
  let acc: unknown = bindings[offset + 1].a1
  const sourceLength = src.length
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    const v0 = f0(x)
    if (v0 == null) continue
    acc = fr(acc, v0)
  }
  return acc
}

export function t_14_18_count(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const fs = bindings[offset + 1].fn as (v: unknown) => boolean
  let count = 0
  const sourceLength = src.length
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    const v0 = f0(x)
    if (v0 == null) continue
    if (fs(v0)) count++
  }
  return count
}

export function t_14_41_sum(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  let sum = 0
  const sourceLength = src.length
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    const v0 = f0(x)
    if (v0 == null) continue
    sum += v0 as number
  }
  return sum
}

export function t_14_10_every(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const fs = bindings[offset + 1].fn as (v: unknown) => unknown
  const sourceLength = src.length
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    const v0 = f0(x)
    if (v0 == null) continue
    if (!fs(v0)) {
      if (meta) meta.consumed = i + 1
      return false
    }
  }
  return true
}

export function t_14_11_some(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const fs = bindings[offset + 1].fn as (v: unknown) => unknown
  const sourceLength = src.length
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    const v0 = f0(x)
    if (v0 == null) continue
    if (fs(v0)) {
      if (meta) meta.consumed = i + 1
      return true
    }
  }
  return false
}

export function t_14_12_find(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const fs = bindings[offset + 1].fn as (v: unknown) => unknown
  const sourceLength = src.length
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    const v0 = f0(x)
    if (v0 == null) continue
    if (fs(v0)) {
      if (meta) meta.consumed = i + 1
      return optionSome(v0)
    }
  }
  return optionNone
}

export function t_14_13_findIndex(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const fs = bindings[offset + 1].fn as (v: unknown) => unknown
  let index = 0
  const sourceLength = src.length
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    const v0 = f0(x)
    if (v0 == null) continue
    if (fs(v0)) {
      if (meta) meta.consumed = i + 1
      return optionSome(index)
    }
    index++
  }
  return optionNone
}

export function t_14_17_none(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const fs = bindings[offset + 1].fn as (v: unknown) => unknown
  const sourceLength = src.length
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    const v0 = f0(x)
    if (v0 == null) continue
    if (fs(v0)) {
      if (meta) meta.consumed = i + 1
      return false
    }
  }
  return true
}

export function t_14_22_findMap(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const fs = bindings[offset + 1].fn as (v: unknown) => unknown
  const sourceLength = src.length
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    const v0 = f0(x)
    if (v0 == null) continue
    const mapped = fs(v0)
    if (mapped != null) {
      if (meta) meta.consumed = i + 1
      return optionSome(mapped)
    }
  }
  return optionNone
}

function t_1_2_8_reduce_lane0(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const fr = bindings[offset + 2].fn as (acc: unknown, v: unknown) => unknown
  let acc: unknown = bindings[offset + 2].a1
  const sourceLength = src.length
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    const v0 = f0(x)
    if (!f1(v0)) continue
    acc = fr(acc, v0)
  }
  return acc
}

function t_1_2_8_reduce_lane1(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const fr = bindings[offset + 2].fn as (acc: unknown, v: unknown) => unknown
  let acc: unknown = bindings[offset + 2].a1
  const sourceLength = src.length
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    const v0 = f0(x)
    if (!f1(v0)) continue
    acc = fr(acc, v0)
  }
  return acc
}

function t_1_2_8_reduce_lane2(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const fr = bindings[offset + 2].fn as (acc: unknown, v: unknown) => unknown
  let acc: unknown = bindings[offset + 2].a1
  const sourceLength = src.length
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    const v0 = f0(x)
    if (!f1(v0)) continue
    acc = fr(acc, v0)
  }
  return acc
}

function t_1_2_8_reduce_lane3(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const fr = bindings[offset + 2].fn as (acc: unknown, v: unknown) => unknown
  let acc: unknown = bindings[offset + 2].a1
  const sourceLength = src.length
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    const v0 = f0(x)
    if (!f1(v0)) continue
    acc = fr(acc, v0)
  }
  return acc
}

const t_1_2_8_reduce_lanes = new WeakMap<object, number>()
let t_1_2_8_reduce_nextLane = 0

export function t_1_2_8_reduce(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown {
  if (!IS_BUN_RUNTIME || src.length >= 512) {
    let lane = t_1_2_8_reduce_lanes.get(bindings)
    if (lane === undefined) {
      lane = t_1_2_8_reduce_nextLane
      t_1_2_8_reduce_nextLane = (t_1_2_8_reduce_nextLane + 1) & 3
      t_1_2_8_reduce_lanes.set(bindings, lane)
    }
    switch (lane) {
      case 0: return t_1_2_8_reduce_lane0(src, bindings, offset, limit, meta)
      case 1: return t_1_2_8_reduce_lane1(src, bindings, offset, limit, meta)
      case 2: return t_1_2_8_reduce_lane2(src, bindings, offset, limit, meta)
      default: return t_1_2_8_reduce_lane3(src, bindings, offset, limit, meta)
    }
  }
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const fr = bindings[offset + 2].fn as (acc: unknown, v: unknown) => unknown
  let acc: unknown = bindings[offset + 2].a1
  const sourceLength = src.length
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    const v0 = f0(x)
    if (!f1(v0)) continue
    acc = fr(acc, v0)
  }
  return acc
}

export function t_1_2_18_count(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const fs = bindings[offset + 2].fn as (v: unknown) => boolean
  let count = 0
  const sourceLength = src.length
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    const v0 = f0(x)
    if (!f1(v0)) continue
    if (fs(v0)) count++
  }
  return count
}

export function t_1_2_10_every(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const fs = bindings[offset + 2].fn as (v: unknown) => unknown
  const sourceLength = src.length
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    const v0 = f0(x)
    if (!f1(v0)) continue
    if (!fs(v0)) {
      if (meta) meta.consumed = i + 1
      return false
    }
  }
  return true
}

export function t_1_2_11_some(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const fs = bindings[offset + 2].fn as (v: unknown) => unknown
  const sourceLength = src.length
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    const v0 = f0(x)
    if (!f1(v0)) continue
    if (fs(v0)) {
      if (meta) meta.consumed = i + 1
      return true
    }
  }
  return false
}

function t_1_2_12_find_lane0(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const fs = bindings[offset + 2].fn as (v: unknown) => unknown
  const sourceLength = src.length
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    const v0 = f0(x)
    if (!f1(v0)) continue
    if (fs(v0)) {
      if (meta) meta.consumed = i + 1
      return optionSome(v0)
    }
  }
  return optionNone
}

function t_1_2_12_find_lane1(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const fs = bindings[offset + 2].fn as (v: unknown) => unknown
  const sourceLength = src.length
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    const v0 = f0(x)
    if (!f1(v0)) continue
    if (fs(v0)) {
      if (meta) meta.consumed = i + 1
      return optionSome(v0)
    }
  }
  return optionNone
}

function t_1_2_12_find_lane2(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const fs = bindings[offset + 2].fn as (v: unknown) => unknown
  const sourceLength = src.length
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    const v0 = f0(x)
    if (!f1(v0)) continue
    if (fs(v0)) {
      if (meta) meta.consumed = i + 1
      return optionSome(v0)
    }
  }
  return optionNone
}

function t_1_2_12_find_lane3(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const fs = bindings[offset + 2].fn as (v: unknown) => unknown
  const sourceLength = src.length
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    const v0 = f0(x)
    if (!f1(v0)) continue
    if (fs(v0)) {
      if (meta) meta.consumed = i + 1
      return optionSome(v0)
    }
  }
  return optionNone
}

const t_1_2_12_find_lanes = new WeakMap<object, number>()
let t_1_2_12_find_nextLane = 0

export function t_1_2_12_find(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown {
  if (!IS_BUN_RUNTIME || src.length >= 512) {
    let lane = t_1_2_12_find_lanes.get(bindings)
    if (lane === undefined) {
      lane = t_1_2_12_find_nextLane
      t_1_2_12_find_nextLane = (t_1_2_12_find_nextLane + 1) & 3
      t_1_2_12_find_lanes.set(bindings, lane)
    }
    switch (lane) {
      case 0: return t_1_2_12_find_lane0(src, bindings, offset, limit, meta)
      case 1: return t_1_2_12_find_lane1(src, bindings, offset, limit, meta)
      case 2: return t_1_2_12_find_lane2(src, bindings, offset, limit, meta)
      default: return t_1_2_12_find_lane3(src, bindings, offset, limit, meta)
    }
  }
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const fs = bindings[offset + 2].fn as (v: unknown) => unknown
  const sourceLength = src.length
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    const v0 = f0(x)
    if (!f1(v0)) continue
    if (fs(v0)) {
      if (meta) meta.consumed = i + 1
      return optionSome(v0)
    }
  }
  return optionNone
}

export function t_1_2_13_findIndex(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const fs = bindings[offset + 2].fn as (v: unknown) => unknown
  let index = 0
  const sourceLength = src.length
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    const v0 = f0(x)
    if (!f1(v0)) continue
    if (fs(v0)) {
      if (meta) meta.consumed = i + 1
      return optionSome(index)
    }
    index++
  }
  return optionNone
}

export function t_1_2_17_none(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const fs = bindings[offset + 2].fn as (v: unknown) => unknown
  const sourceLength = src.length
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    const v0 = f0(x)
    if (!f1(v0)) continue
    if (fs(v0)) {
      if (meta) meta.consumed = i + 1
      return false
    }
  }
  return true
}

export function t_1_2_22_findMap(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const fs = bindings[offset + 2].fn as (v: unknown) => unknown
  const sourceLength = src.length
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    const v0 = f0(x)
    if (!f1(v0)) continue
    const mapped = fs(v0)
    if (mapped != null) {
      if (meta) meta.consumed = i + 1
      return optionSome(mapped)
    }
  }
  return optionNone
}

function t_2_14_8_reduce_lane0(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const fr = bindings[offset + 2].fn as (acc: unknown, v: unknown) => unknown
  let acc: unknown = bindings[offset + 2].a1
  const sourceLength = src.length
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    if (!f0(x)) continue
    const v1 = f1(x)
    if (v1 == null) continue
    acc = fr(acc, v1)
  }
  return acc
}

function t_2_14_8_reduce_lane1(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const fr = bindings[offset + 2].fn as (acc: unknown, v: unknown) => unknown
  let acc: unknown = bindings[offset + 2].a1
  const sourceLength = src.length
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    if (!f0(x)) continue
    const v1 = f1(x)
    if (v1 == null) continue
    acc = fr(acc, v1)
  }
  return acc
}

function t_2_14_8_reduce_lane2(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const fr = bindings[offset + 2].fn as (acc: unknown, v: unknown) => unknown
  let acc: unknown = bindings[offset + 2].a1
  const sourceLength = src.length
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    if (!f0(x)) continue
    const v1 = f1(x)
    if (v1 == null) continue
    acc = fr(acc, v1)
  }
  return acc
}

function t_2_14_8_reduce_lane3(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const fr = bindings[offset + 2].fn as (acc: unknown, v: unknown) => unknown
  let acc: unknown = bindings[offset + 2].a1
  const sourceLength = src.length
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    if (!f0(x)) continue
    const v1 = f1(x)
    if (v1 == null) continue
    acc = fr(acc, v1)
  }
  return acc
}

const t_2_14_8_reduce_lanes = new WeakMap<object, number>()
let t_2_14_8_reduce_nextLane = 0

export function t_2_14_8_reduce(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown {
  if (!IS_BUN_RUNTIME || src.length >= 512) {
    let lane = t_2_14_8_reduce_lanes.get(bindings)
    if (lane === undefined) {
      lane = t_2_14_8_reduce_nextLane
      t_2_14_8_reduce_nextLane = (t_2_14_8_reduce_nextLane + 1) & 3
      t_2_14_8_reduce_lanes.set(bindings, lane)
    }
    switch (lane) {
      case 0: return t_2_14_8_reduce_lane0(src, bindings, offset, limit, meta)
      case 1: return t_2_14_8_reduce_lane1(src, bindings, offset, limit, meta)
      case 2: return t_2_14_8_reduce_lane2(src, bindings, offset, limit, meta)
      default: return t_2_14_8_reduce_lane3(src, bindings, offset, limit, meta)
    }
  }
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const fr = bindings[offset + 2].fn as (acc: unknown, v: unknown) => unknown
  let acc: unknown = bindings[offset + 2].a1
  const sourceLength = src.length
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    if (!f0(x)) continue
    const v1 = f1(x)
    if (v1 == null) continue
    acc = fr(acc, v1)
  }
  return acc
}

export function t_2_14_18_count(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const fs = bindings[offset + 2].fn as (v: unknown) => boolean
  let count = 0
  const sourceLength = src.length
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    if (!f0(x)) continue
    const v1 = f1(x)
    if (v1 == null) continue
    if (fs(v1)) count++
  }
  return count
}

export function t_2_14_10_every(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const fs = bindings[offset + 2].fn as (v: unknown) => unknown
  const sourceLength = src.length
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    if (!f0(x)) continue
    const v1 = f1(x)
    if (v1 == null) continue
    if (!fs(v1)) {
      if (meta) meta.consumed = i + 1
      return false
    }
  }
  return true
}

export function t_2_14_11_some(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const fs = bindings[offset + 2].fn as (v: unknown) => unknown
  const sourceLength = src.length
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    if (!f0(x)) continue
    const v1 = f1(x)
    if (v1 == null) continue
    if (fs(v1)) {
      if (meta) meta.consumed = i + 1
      return true
    }
  }
  return false
}

function t_2_14_12_find_lane0(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const fs = bindings[offset + 2].fn as (v: unknown) => unknown
  const sourceLength = src.length
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    if (!f0(x)) continue
    const v1 = f1(x)
    if (v1 == null) continue
    if (fs(v1)) {
      if (meta) meta.consumed = i + 1
      return optionSome(v1)
    }
  }
  return optionNone
}

function t_2_14_12_find_lane1(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const fs = bindings[offset + 2].fn as (v: unknown) => unknown
  const sourceLength = src.length
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    if (!f0(x)) continue
    const v1 = f1(x)
    if (v1 == null) continue
    if (fs(v1)) {
      if (meta) meta.consumed = i + 1
      return optionSome(v1)
    }
  }
  return optionNone
}

function t_2_14_12_find_lane2(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const fs = bindings[offset + 2].fn as (v: unknown) => unknown
  const sourceLength = src.length
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    if (!f0(x)) continue
    const v1 = f1(x)
    if (v1 == null) continue
    if (fs(v1)) {
      if (meta) meta.consumed = i + 1
      return optionSome(v1)
    }
  }
  return optionNone
}

function t_2_14_12_find_lane3(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const fs = bindings[offset + 2].fn as (v: unknown) => unknown
  const sourceLength = src.length
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    if (!f0(x)) continue
    const v1 = f1(x)
    if (v1 == null) continue
    if (fs(v1)) {
      if (meta) meta.consumed = i + 1
      return optionSome(v1)
    }
  }
  return optionNone
}

const t_2_14_12_find_lanes = new WeakMap<object, number>()
let t_2_14_12_find_nextLane = 0

export function t_2_14_12_find(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown {
  if (!IS_BUN_RUNTIME || src.length >= 512) {
    let lane = t_2_14_12_find_lanes.get(bindings)
    if (lane === undefined) {
      lane = t_2_14_12_find_nextLane
      t_2_14_12_find_nextLane = (t_2_14_12_find_nextLane + 1) & 3
      t_2_14_12_find_lanes.set(bindings, lane)
    }
    switch (lane) {
      case 0: return t_2_14_12_find_lane0(src, bindings, offset, limit, meta)
      case 1: return t_2_14_12_find_lane1(src, bindings, offset, limit, meta)
      case 2: return t_2_14_12_find_lane2(src, bindings, offset, limit, meta)
      default: return t_2_14_12_find_lane3(src, bindings, offset, limit, meta)
    }
  }
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const fs = bindings[offset + 2].fn as (v: unknown) => unknown
  const sourceLength = src.length
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    if (!f0(x)) continue
    const v1 = f1(x)
    if (v1 == null) continue
    if (fs(v1)) {
      if (meta) meta.consumed = i + 1
      return optionSome(v1)
    }
  }
  return optionNone
}

export function t_2_14_13_findIndex(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const fs = bindings[offset + 2].fn as (v: unknown) => unknown
  let index = 0
  const sourceLength = src.length
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    if (!f0(x)) continue
    const v1 = f1(x)
    if (v1 == null) continue
    if (fs(v1)) {
      if (meta) meta.consumed = i + 1
      return optionSome(index)
    }
    index++
  }
  return optionNone
}

export function t_2_14_17_none(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const fs = bindings[offset + 2].fn as (v: unknown) => unknown
  const sourceLength = src.length
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    if (!f0(x)) continue
    const v1 = f1(x)
    if (v1 == null) continue
    if (fs(v1)) {
      if (meta) meta.consumed = i + 1
      return false
    }
  }
  return true
}

export function t_2_14_22_findMap(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const fs = bindings[offset + 2].fn as (v: unknown) => unknown
  const sourceLength = src.length
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    if (!f0(x)) continue
    const v1 = f1(x)
    if (v1 == null) continue
    const mapped = fs(v1)
    if (mapped != null) {
      if (meta) meta.consumed = i + 1
      return optionSome(mapped)
    }
  }
  return optionNone
}

export function t_7(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const ff = bindings[offset + 0].fn as (v: unknown) => Iterable<unknown>
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    const items = ff(x)
    if (Array.isArray(items)) {
      const itemLength = items.length
      for (let j = 0; j < itemLength; j++) out.push(items[j])
    } else {
      for (const item of items) out.push(item)
    }
  }
  return out
}

function t_1_7_lane0(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const fm = bindings[offset].fn as (v: unknown) => unknown
  const ff = bindings[offset + 1].fn as (v: unknown) => Iterable<unknown>
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    const items = ff(fm(x))
    if (Array.isArray(items)) {
      const itemLength = items.length
      for (let j = 0; j < itemLength; j++) out.push(items[j])
    } else {
      for (const item of items) out.push(item)
    }
  }
  return out
}

function t_1_7_lane1(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const fm = bindings[offset].fn as (v: unknown) => unknown
  const ff = bindings[offset + 1].fn as (v: unknown) => Iterable<unknown>
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    const items = ff(fm(x))
    if (Array.isArray(items)) {
      const itemLength = items.length
      for (let j = 0; j < itemLength; j++) out.push(items[j])
    } else {
      for (const item of items) out.push(item)
    }
  }
  return out
}

function t_1_7_lane2(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const fm = bindings[offset].fn as (v: unknown) => unknown
  const ff = bindings[offset + 1].fn as (v: unknown) => Iterable<unknown>
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    const items = ff(fm(x))
    if (Array.isArray(items)) {
      const itemLength = items.length
      for (let j = 0; j < itemLength; j++) out.push(items[j])
    } else {
      for (const item of items) out.push(item)
    }
  }
  return out
}

function t_1_7_lane3(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const fm = bindings[offset].fn as (v: unknown) => unknown
  const ff = bindings[offset + 1].fn as (v: unknown) => Iterable<unknown>
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    const items = ff(fm(x))
    if (Array.isArray(items)) {
      const itemLength = items.length
      for (let j = 0; j < itemLength; j++) out.push(items[j])
    } else {
      for (const item of items) out.push(item)
    }
  }
  return out
}

const t_1_7_lanes = new WeakMap<object, number>()
let t_1_7_nextLane = 0

export function t_1_7(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  if (!IS_BUN_RUNTIME || src.length >= 512) {
    let lane = t_1_7_lanes.get(bindings)
    if (lane === undefined) {
      lane = t_1_7_nextLane
      t_1_7_nextLane = (t_1_7_nextLane + 1) & 3
      t_1_7_lanes.set(bindings, lane)
    }
    switch (lane) {
      case 0: return t_1_7_lane0(src, bindings, offset, limit, meta)
      case 1: return t_1_7_lane1(src, bindings, offset, limit, meta)
      case 2: return t_1_7_lane2(src, bindings, offset, limit, meta)
      default: return t_1_7_lane3(src, bindings, offset, limit, meta)
    }
  }
  const fm = bindings[offset].fn as (v: unknown) => unknown
  const ff = bindings[offset + 1].fn as (v: unknown) => Iterable<unknown>
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    const items = ff(fm(x))
    if (Array.isArray(items)) {
      const itemLength = items.length
      for (let j = 0; j < itemLength; j++) out.push(items[j])
    } else {
      for (const item of items) out.push(item)
    }
  }
  return out
}

function t_1_7_2_14_lane0(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown {
  const fm = bindings[offset].fn as (v: unknown) => unknown
  const ff = bindings[offset + 1].fn as (v: unknown) => Iterable<unknown>
  const fp = bindings[offset + 2].fn as (v: unknown) => boolean
  const fmo = bindings[offset + 3].fn as (v: unknown) => unknown
  const out: unknown[] = []
  const sourceLength = src.length
  for (let i = 0; i < sourceLength; i++) {
    const items = ff(fm(src[i]))
    if (Array.isArray(items)) {
      const itemLength = items.length
      for (let j = 0; j < itemLength; j++) {
        const item = items[j]
        if (!fp(item)) continue
        const mapped = fmo(item)
        if (mapped == null) continue
      out.push(mapped)
      }
    } else {
      for (const item of items) {
        if (!fp(item)) continue
        const mapped = fmo(item)
        if (mapped == null) continue
      out.push(mapped)
      }
    }
  }
  return out
}

function t_1_7_2_14_lane1(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown {
  const fm = bindings[offset].fn as (v: unknown) => unknown
  const ff = bindings[offset + 1].fn as (v: unknown) => Iterable<unknown>
  const fp = bindings[offset + 2].fn as (v: unknown) => boolean
  const fmo = bindings[offset + 3].fn as (v: unknown) => unknown
  const out: unknown[] = []
  const sourceLength = src.length
  for (let i = 0; i < sourceLength; i++) {
    const items = ff(fm(src[i]))
    if (Array.isArray(items)) {
      const itemLength = items.length
      for (let j = 0; j < itemLength; j++) {
        const item = items[j]
        if (!fp(item)) continue
        const mapped = fmo(item)
        if (mapped == null) continue
      out.push(mapped)
      }
    } else {
      for (const item of items) {
        if (!fp(item)) continue
        const mapped = fmo(item)
        if (mapped == null) continue
      out.push(mapped)
      }
    }
  }
  return out
}

function t_1_7_2_14_lane2(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown {
  const fm = bindings[offset].fn as (v: unknown) => unknown
  const ff = bindings[offset + 1].fn as (v: unknown) => Iterable<unknown>
  const fp = bindings[offset + 2].fn as (v: unknown) => boolean
  const fmo = bindings[offset + 3].fn as (v: unknown) => unknown
  const out: unknown[] = []
  const sourceLength = src.length
  for (let i = 0; i < sourceLength; i++) {
    const items = ff(fm(src[i]))
    if (Array.isArray(items)) {
      const itemLength = items.length
      for (let j = 0; j < itemLength; j++) {
        const item = items[j]
        if (!fp(item)) continue
        const mapped = fmo(item)
        if (mapped == null) continue
      out.push(mapped)
      }
    } else {
      for (const item of items) {
        if (!fp(item)) continue
        const mapped = fmo(item)
        if (mapped == null) continue
      out.push(mapped)
      }
    }
  }
  return out
}

function t_1_7_2_14_lane3(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown {
  const fm = bindings[offset].fn as (v: unknown) => unknown
  const ff = bindings[offset + 1].fn as (v: unknown) => Iterable<unknown>
  const fp = bindings[offset + 2].fn as (v: unknown) => boolean
  const fmo = bindings[offset + 3].fn as (v: unknown) => unknown
  const out: unknown[] = []
  const sourceLength = src.length
  for (let i = 0; i < sourceLength; i++) {
    const items = ff(fm(src[i]))
    if (Array.isArray(items)) {
      const itemLength = items.length
      for (let j = 0; j < itemLength; j++) {
        const item = items[j]
        if (!fp(item)) continue
        const mapped = fmo(item)
        if (mapped == null) continue
      out.push(mapped)
      }
    } else {
      for (const item of items) {
        if (!fp(item)) continue
        const mapped = fmo(item)
        if (mapped == null) continue
      out.push(mapped)
      }
    }
  }
  return out
}

const t_1_7_2_14_lanes = new WeakMap<object, number>()
let t_1_7_2_14_nextLane = 0

export function t_1_7_2_14(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown {
  if (!IS_BUN_RUNTIME || src.length >= 512) {
    let lane = t_1_7_2_14_lanes.get(bindings)
    if (lane === undefined) {
      lane = t_1_7_2_14_nextLane
      t_1_7_2_14_nextLane = (t_1_7_2_14_nextLane + 1) & 3
      t_1_7_2_14_lanes.set(bindings, lane)
    }
    switch (lane) {
      case 0: return t_1_7_2_14_lane0(src, bindings, offset, limit, meta)
      case 1: return t_1_7_2_14_lane1(src, bindings, offset, limit, meta)
      case 2: return t_1_7_2_14_lane2(src, bindings, offset, limit, meta)
      default: return t_1_7_2_14_lane3(src, bindings, offset, limit, meta)
    }
  }
  const fm = bindings[offset].fn as (v: unknown) => unknown
  const ff = bindings[offset + 1].fn as (v: unknown) => Iterable<unknown>
  const fp = bindings[offset + 2].fn as (v: unknown) => boolean
  const fmo = bindings[offset + 3].fn as (v: unknown) => unknown
  const out: unknown[] = []
  const sourceLength = src.length
  for (let i = 0; i < sourceLength; i++) {
    const items = ff(fm(src[i]))
    if (Array.isArray(items)) {
      const itemLength = items.length
      for (let j = 0; j < itemLength; j++) {
        const item = items[j]
        if (!fp(item)) continue
        const mapped = fmo(item)
        if (mapped == null) continue
      out.push(mapped)
      }
    } else {
      for (const item of items) {
        if (!fp(item)) continue
        const mapped = fmo(item)
        if (mapped == null) continue
      out.push(mapped)
      }
    }
  }
  return out
}

function t_1_7_2_14_8_reduce_lane0(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown {
  const fm = bindings[offset].fn as (v: unknown) => unknown
  const ff = bindings[offset + 1].fn as (v: unknown) => Iterable<unknown>
  const fp = bindings[offset + 2].fn as (v: unknown) => boolean
  const fmo = bindings[offset + 3].fn as (v: unknown) => unknown
  const fs = bindings[offset + 4].fn as (acc: unknown, v: unknown) => unknown
  let acc: unknown = bindings[offset + 4].a1
  const sourceLength = src.length
  for (let i = 0; i < sourceLength; i++) {
    const items = ff(fm(src[i]))
    if (Array.isArray(items)) {
      const itemLength = items.length
      for (let j = 0; j < itemLength; j++) {
        const item = items[j]
        if (!fp(item)) continue
        const mapped = fmo(item)
        if (mapped == null) continue
      acc = fs(acc, mapped)
      }
    } else {
      for (const item of items) {
        if (!fp(item)) continue
        const mapped = fmo(item)
        if (mapped == null) continue
      acc = fs(acc, mapped)
      }
    }
  }
  return acc
}

function t_1_7_2_14_8_reduce_lane1(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown {
  const fm = bindings[offset].fn as (v: unknown) => unknown
  const ff = bindings[offset + 1].fn as (v: unknown) => Iterable<unknown>
  const fp = bindings[offset + 2].fn as (v: unknown) => boolean
  const fmo = bindings[offset + 3].fn as (v: unknown) => unknown
  const fs = bindings[offset + 4].fn as (acc: unknown, v: unknown) => unknown
  let acc: unknown = bindings[offset + 4].a1
  const sourceLength = src.length
  for (let i = 0; i < sourceLength; i++) {
    const items = ff(fm(src[i]))
    if (Array.isArray(items)) {
      const itemLength = items.length
      for (let j = 0; j < itemLength; j++) {
        const item = items[j]
        if (!fp(item)) continue
        const mapped = fmo(item)
        if (mapped == null) continue
      acc = fs(acc, mapped)
      }
    } else {
      for (const item of items) {
        if (!fp(item)) continue
        const mapped = fmo(item)
        if (mapped == null) continue
      acc = fs(acc, mapped)
      }
    }
  }
  return acc
}

function t_1_7_2_14_8_reduce_lane2(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown {
  const fm = bindings[offset].fn as (v: unknown) => unknown
  const ff = bindings[offset + 1].fn as (v: unknown) => Iterable<unknown>
  const fp = bindings[offset + 2].fn as (v: unknown) => boolean
  const fmo = bindings[offset + 3].fn as (v: unknown) => unknown
  const fs = bindings[offset + 4].fn as (acc: unknown, v: unknown) => unknown
  let acc: unknown = bindings[offset + 4].a1
  const sourceLength = src.length
  for (let i = 0; i < sourceLength; i++) {
    const items = ff(fm(src[i]))
    if (Array.isArray(items)) {
      const itemLength = items.length
      for (let j = 0; j < itemLength; j++) {
        const item = items[j]
        if (!fp(item)) continue
        const mapped = fmo(item)
        if (mapped == null) continue
      acc = fs(acc, mapped)
      }
    } else {
      for (const item of items) {
        if (!fp(item)) continue
        const mapped = fmo(item)
        if (mapped == null) continue
      acc = fs(acc, mapped)
      }
    }
  }
  return acc
}

function t_1_7_2_14_8_reduce_lane3(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown {
  const fm = bindings[offset].fn as (v: unknown) => unknown
  const ff = bindings[offset + 1].fn as (v: unknown) => Iterable<unknown>
  const fp = bindings[offset + 2].fn as (v: unknown) => boolean
  const fmo = bindings[offset + 3].fn as (v: unknown) => unknown
  const fs = bindings[offset + 4].fn as (acc: unknown, v: unknown) => unknown
  let acc: unknown = bindings[offset + 4].a1
  const sourceLength = src.length
  for (let i = 0; i < sourceLength; i++) {
    const items = ff(fm(src[i]))
    if (Array.isArray(items)) {
      const itemLength = items.length
      for (let j = 0; j < itemLength; j++) {
        const item = items[j]
        if (!fp(item)) continue
        const mapped = fmo(item)
        if (mapped == null) continue
      acc = fs(acc, mapped)
      }
    } else {
      for (const item of items) {
        if (!fp(item)) continue
        const mapped = fmo(item)
        if (mapped == null) continue
      acc = fs(acc, mapped)
      }
    }
  }
  return acc
}

const t_1_7_2_14_8_reduce_lanes = new WeakMap<object, number>()
let t_1_7_2_14_8_reduce_nextLane = 0

export function t_1_7_2_14_8_reduce(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown {
  if (!IS_BUN_RUNTIME || src.length >= 512) {
    let lane = t_1_7_2_14_8_reduce_lanes.get(bindings)
    if (lane === undefined) {
      lane = t_1_7_2_14_8_reduce_nextLane
      t_1_7_2_14_8_reduce_nextLane = (t_1_7_2_14_8_reduce_nextLane + 1) & 3
      t_1_7_2_14_8_reduce_lanes.set(bindings, lane)
    }
    switch (lane) {
      case 0: return t_1_7_2_14_8_reduce_lane0(src, bindings, offset, limit, meta)
      case 1: return t_1_7_2_14_8_reduce_lane1(src, bindings, offset, limit, meta)
      case 2: return t_1_7_2_14_8_reduce_lane2(src, bindings, offset, limit, meta)
      default: return t_1_7_2_14_8_reduce_lane3(src, bindings, offset, limit, meta)
    }
  }
  const fm = bindings[offset].fn as (v: unknown) => unknown
  const ff = bindings[offset + 1].fn as (v: unknown) => Iterable<unknown>
  const fp = bindings[offset + 2].fn as (v: unknown) => boolean
  const fmo = bindings[offset + 3].fn as (v: unknown) => unknown
  const fs = bindings[offset + 4].fn as (acc: unknown, v: unknown) => unknown
  let acc: unknown = bindings[offset + 4].a1
  const sourceLength = src.length
  for (let i = 0; i < sourceLength; i++) {
    const items = ff(fm(src[i]))
    if (Array.isArray(items)) {
      const itemLength = items.length
      for (let j = 0; j < itemLength; j++) {
        const item = items[j]
        if (!fp(item)) continue
        const mapped = fmo(item)
        if (mapped == null) continue
      acc = fs(acc, mapped)
      }
    } else {
      for (const item of items) {
        if (!fp(item)) continue
        const mapped = fmo(item)
        if (mapped == null) continue
      acc = fs(acc, mapped)
      }
    }
  }
  return acc
}

function t_1_7_2_14_12_find_lane0(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown {
  const fm = bindings[offset].fn as (v: unknown) => unknown
  const ff = bindings[offset + 1].fn as (v: unknown) => Iterable<unknown>
  const fp = bindings[offset + 2].fn as (v: unknown) => boolean
  const fmo = bindings[offset + 3].fn as (v: unknown) => unknown
  const fs = bindings[offset + 4].fn as (v: unknown) => boolean
  const sourceLength = src.length
  for (let i = 0; i < sourceLength; i++) {
    const items = ff(fm(src[i]))
    if (Array.isArray(items)) {
      const itemLength = items.length
      for (let j = 0; j < itemLength; j++) {
        const item = items[j]
        if (!fp(item)) continue
        const mapped = fmo(item)
        if (mapped == null) continue
      if (fs(mapped)) {
        if (meta) meta.consumed = i + 1
        return optionSome(mapped)
      }
      }
    } else {
      for (const item of items) {
        if (!fp(item)) continue
        const mapped = fmo(item)
        if (mapped == null) continue
      if (fs(mapped)) {
        if (meta) meta.consumed = i + 1
        return optionSome(mapped)
      }
      }
    }
  }
  return optionNone
}

function t_1_7_2_14_12_find_lane1(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown {
  const fm = bindings[offset].fn as (v: unknown) => unknown
  const ff = bindings[offset + 1].fn as (v: unknown) => Iterable<unknown>
  const fp = bindings[offset + 2].fn as (v: unknown) => boolean
  const fmo = bindings[offset + 3].fn as (v: unknown) => unknown
  const fs = bindings[offset + 4].fn as (v: unknown) => boolean
  const sourceLength = src.length
  for (let i = 0; i < sourceLength; i++) {
    const items = ff(fm(src[i]))
    if (Array.isArray(items)) {
      const itemLength = items.length
      for (let j = 0; j < itemLength; j++) {
        const item = items[j]
        if (!fp(item)) continue
        const mapped = fmo(item)
        if (mapped == null) continue
      if (fs(mapped)) {
        if (meta) meta.consumed = i + 1
        return optionSome(mapped)
      }
      }
    } else {
      for (const item of items) {
        if (!fp(item)) continue
        const mapped = fmo(item)
        if (mapped == null) continue
      if (fs(mapped)) {
        if (meta) meta.consumed = i + 1
        return optionSome(mapped)
      }
      }
    }
  }
  return optionNone
}

function t_1_7_2_14_12_find_lane2(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown {
  const fm = bindings[offset].fn as (v: unknown) => unknown
  const ff = bindings[offset + 1].fn as (v: unknown) => Iterable<unknown>
  const fp = bindings[offset + 2].fn as (v: unknown) => boolean
  const fmo = bindings[offset + 3].fn as (v: unknown) => unknown
  const fs = bindings[offset + 4].fn as (v: unknown) => boolean
  const sourceLength = src.length
  for (let i = 0; i < sourceLength; i++) {
    const items = ff(fm(src[i]))
    if (Array.isArray(items)) {
      const itemLength = items.length
      for (let j = 0; j < itemLength; j++) {
        const item = items[j]
        if (!fp(item)) continue
        const mapped = fmo(item)
        if (mapped == null) continue
      if (fs(mapped)) {
        if (meta) meta.consumed = i + 1
        return optionSome(mapped)
      }
      }
    } else {
      for (const item of items) {
        if (!fp(item)) continue
        const mapped = fmo(item)
        if (mapped == null) continue
      if (fs(mapped)) {
        if (meta) meta.consumed = i + 1
        return optionSome(mapped)
      }
      }
    }
  }
  return optionNone
}

function t_1_7_2_14_12_find_lane3(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown {
  const fm = bindings[offset].fn as (v: unknown) => unknown
  const ff = bindings[offset + 1].fn as (v: unknown) => Iterable<unknown>
  const fp = bindings[offset + 2].fn as (v: unknown) => boolean
  const fmo = bindings[offset + 3].fn as (v: unknown) => unknown
  const fs = bindings[offset + 4].fn as (v: unknown) => boolean
  const sourceLength = src.length
  for (let i = 0; i < sourceLength; i++) {
    const items = ff(fm(src[i]))
    if (Array.isArray(items)) {
      const itemLength = items.length
      for (let j = 0; j < itemLength; j++) {
        const item = items[j]
        if (!fp(item)) continue
        const mapped = fmo(item)
        if (mapped == null) continue
      if (fs(mapped)) {
        if (meta) meta.consumed = i + 1
        return optionSome(mapped)
      }
      }
    } else {
      for (const item of items) {
        if (!fp(item)) continue
        const mapped = fmo(item)
        if (mapped == null) continue
      if (fs(mapped)) {
        if (meta) meta.consumed = i + 1
        return optionSome(mapped)
      }
      }
    }
  }
  return optionNone
}

const t_1_7_2_14_12_find_lanes = new WeakMap<object, number>()
let t_1_7_2_14_12_find_nextLane = 0

export function t_1_7_2_14_12_find(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown {
  if (!IS_BUN_RUNTIME) {
    let lane = t_1_7_2_14_12_find_lanes.get(bindings)
    if (lane === undefined) {
      lane = t_1_7_2_14_12_find_nextLane
      t_1_7_2_14_12_find_nextLane = (t_1_7_2_14_12_find_nextLane + 1) & 3
      t_1_7_2_14_12_find_lanes.set(bindings, lane)
    }
    switch (lane) {
      case 0: return t_1_7_2_14_12_find_lane0(src, bindings, offset, limit, meta)
      case 1: return t_1_7_2_14_12_find_lane1(src, bindings, offset, limit, meta)
      case 2: return t_1_7_2_14_12_find_lane2(src, bindings, offset, limit, meta)
      default: return t_1_7_2_14_12_find_lane3(src, bindings, offset, limit, meta)
    }
  }
  const fm = bindings[offset].fn as (v: unknown) => unknown
  const ff = bindings[offset + 1].fn as (v: unknown) => Iterable<unknown>
  const fp = bindings[offset + 2].fn as (v: unknown) => boolean
  const fmo = bindings[offset + 3].fn as (v: unknown) => unknown
  const fs = bindings[offset + 4].fn as (v: unknown) => boolean
  const sourceLength = src.length
  for (let i = 0; i < sourceLength; i++) {
    const items = ff(fm(src[i]))
    if (Array.isArray(items)) {
      const itemLength = items.length
      for (let j = 0; j < itemLength; j++) {
        const item = items[j]
        if (!fp(item)) continue
        const mapped = fmo(item)
        if (mapped == null) continue
      if (fs(mapped)) {
        if (meta) meta.consumed = i + 1
        return optionSome(mapped)
      }
      }
    } else {
      for (const item of items) {
        if (!fp(item)) continue
        const mapped = fmo(item)
        if (mapped == null) continue
      if (fs(mapped)) {
        if (meta) meta.consumed = i + 1
        return optionSome(mapped)
      }
      }
    }
  }
  return optionNone
}

export const ARRAY_TEMPLATES: readonly ArrayTemplateEntry[] = [
  { key: '1', opcodes: [1], run: t_1 },
  { key: '1,3', opcodes: [1, 3], run: t_1_3_lim },
  { key: '1,1', opcodes: [1, 1], run: t_1_1 },
  { key: '1,1,3', opcodes: [1, 1, 3], run: t_1_1_3_lim },
  { key: '1,1,1', opcodes: [1, 1, 1], run: t_1_1_1 },
  { key: '1,1,1,3', opcodes: [1, 1, 1, 3], run: t_1_1_1_3_lim },
  { key: '1,1,2', opcodes: [1, 1, 2], run: t_1_1_2 },
  { key: '1,1,2,3', opcodes: [1, 1, 2, 3], run: t_1_1_2_3_lim },
  { key: '1,1,16', opcodes: [1, 1, 16], run: t_1_1_16 },
  { key: '1,1,16,3', opcodes: [1, 1, 16, 3], run: t_1_1_16_3_lim },
  { key: '1,1,14', opcodes: [1, 1, 14], run: t_1_1_14 },
  { key: '1,1,14,3', opcodes: [1, 1, 14, 3], run: t_1_1_14_3_lim },
  { key: '1,2', opcodes: [1, 2], run: t_1_2 },
  { key: '1,2,3', opcodes: [1, 2, 3], run: t_1_2_3_lim },
  { key: '1,2,1', opcodes: [1, 2, 1], run: t_1_2_1 },
  { key: '1,2,1,3', opcodes: [1, 2, 1, 3], run: t_1_2_1_3_lim },
  { key: '1,2,2', opcodes: [1, 2, 2], run: t_1_2_2 },
  { key: '1,2,2,3', opcodes: [1, 2, 2, 3], run: t_1_2_2_3_lim },
  { key: '1,2,16', opcodes: [1, 2, 16], run: t_1_2_16 },
  { key: '1,2,16,3', opcodes: [1, 2, 16, 3], run: t_1_2_16_3_lim },
  { key: '1,2,14', opcodes: [1, 2, 14], run: t_1_2_14 },
  { key: '1,2,14,3', opcodes: [1, 2, 14, 3], run: t_1_2_14_3_lim },
  { key: '1,16', opcodes: [1, 16], run: t_1_16 },
  { key: '1,16,3', opcodes: [1, 16, 3], run: t_1_16_3_lim },
  { key: '1,16,1', opcodes: [1, 16, 1], run: t_1_16_1 },
  { key: '1,16,1,3', opcodes: [1, 16, 1, 3], run: t_1_16_1_3_lim },
  { key: '1,16,2', opcodes: [1, 16, 2], run: t_1_16_2 },
  { key: '1,16,2,3', opcodes: [1, 16, 2, 3], run: t_1_16_2_3_lim },
  { key: '1,16,16', opcodes: [1, 16, 16], run: t_1_16_16 },
  { key: '1,16,16,3', opcodes: [1, 16, 16, 3], run: t_1_16_16_3_lim },
  { key: '1,16,14', opcodes: [1, 16, 14], run: t_1_16_14 },
  { key: '1,16,14,3', opcodes: [1, 16, 14, 3], run: t_1_16_14_3_lim },
  { key: '1,14', opcodes: [1, 14], run: t_1_14 },
  { key: '1,14,3', opcodes: [1, 14, 3], run: t_1_14_3_lim },
  { key: '1,14,1', opcodes: [1, 14, 1], run: t_1_14_1 },
  { key: '1,14,1,3', opcodes: [1, 14, 1, 3], run: t_1_14_1_3_lim },
  { key: '1,14,2', opcodes: [1, 14, 2], run: t_1_14_2 },
  { key: '1,14,2,3', opcodes: [1, 14, 2, 3], run: t_1_14_2_3_lim },
  { key: '1,14,16', opcodes: [1, 14, 16], run: t_1_14_16 },
  { key: '1,14,16,3', opcodes: [1, 14, 16, 3], run: t_1_14_16_3_lim },
  { key: '1,14,14', opcodes: [1, 14, 14], run: t_1_14_14 },
  { key: '1,14,14,3', opcodes: [1, 14, 14, 3], run: t_1_14_14_3_lim },
  { key: '2', opcodes: [2], run: t_2 },
  { key: '2,3', opcodes: [2, 3], run: t_2_3_lim },
  { key: '2,1', opcodes: [2, 1], run: t_2_1 },
  { key: '2,1,3', opcodes: [2, 1, 3], run: t_2_1_3_lim },
  { key: '2,1,1', opcodes: [2, 1, 1], run: t_2_1_1 },
  { key: '2,1,1,3', opcodes: [2, 1, 1, 3], run: t_2_1_1_3_lim },
  { key: '2,1,2', opcodes: [2, 1, 2], run: t_2_1_2 },
  { key: '2,1,2,3', opcodes: [2, 1, 2, 3], run: t_2_1_2_3_lim },
  { key: '2,1,16', opcodes: [2, 1, 16], run: t_2_1_16 },
  { key: '2,1,16,3', opcodes: [2, 1, 16, 3], run: t_2_1_16_3_lim },
  { key: '2,1,14', opcodes: [2, 1, 14], run: t_2_1_14 },
  { key: '2,1,14,3', opcodes: [2, 1, 14, 3], run: t_2_1_14_3_lim },
  { key: '2,2', opcodes: [2, 2], run: t_2_2 },
  { key: '2,2,3', opcodes: [2, 2, 3], run: t_2_2_3_lim },
  { key: '2,2,1', opcodes: [2, 2, 1], run: t_2_2_1 },
  { key: '2,2,1,3', opcodes: [2, 2, 1, 3], run: t_2_2_1_3_lim },
  { key: '2,2,2', opcodes: [2, 2, 2], run: t_2_2_2 },
  { key: '2,2,2,3', opcodes: [2, 2, 2, 3], run: t_2_2_2_3_lim },
  { key: '2,2,16', opcodes: [2, 2, 16], run: t_2_2_16 },
  { key: '2,2,16,3', opcodes: [2, 2, 16, 3], run: t_2_2_16_3_lim },
  { key: '2,2,14', opcodes: [2, 2, 14], run: t_2_2_14 },
  { key: '2,2,14,3', opcodes: [2, 2, 14, 3], run: t_2_2_14_3_lim },
  { key: '2,16', opcodes: [2, 16], run: t_2_16 },
  { key: '2,16,3', opcodes: [2, 16, 3], run: t_2_16_3_lim },
  { key: '2,16,1', opcodes: [2, 16, 1], run: t_2_16_1 },
  { key: '2,16,1,3', opcodes: [2, 16, 1, 3], run: t_2_16_1_3_lim },
  { key: '2,16,2', opcodes: [2, 16, 2], run: t_2_16_2 },
  { key: '2,16,2,3', opcodes: [2, 16, 2, 3], run: t_2_16_2_3_lim },
  { key: '2,16,16', opcodes: [2, 16, 16], run: t_2_16_16 },
  { key: '2,16,16,3', opcodes: [2, 16, 16, 3], run: t_2_16_16_3_lim },
  { key: '2,16,14', opcodes: [2, 16, 14], run: t_2_16_14 },
  { key: '2,16,14,3', opcodes: [2, 16, 14, 3], run: t_2_16_14_3_lim },
  { key: '2,14', opcodes: [2, 14], run: t_2_14 },
  { key: '2,14,3', opcodes: [2, 14, 3], run: t_2_14_3_lim },
  { key: '2,14,1', opcodes: [2, 14, 1], run: t_2_14_1 },
  { key: '2,14,1,3', opcodes: [2, 14, 1, 3], run: t_2_14_1_3_lim },
  { key: '2,14,2', opcodes: [2, 14, 2], run: t_2_14_2 },
  { key: '2,14,2,3', opcodes: [2, 14, 2, 3], run: t_2_14_2_3_lim },
  { key: '2,14,16', opcodes: [2, 14, 16], run: t_2_14_16 },
  { key: '2,14,16,3', opcodes: [2, 14, 16, 3], run: t_2_14_16_3_lim },
  { key: '2,14,14', opcodes: [2, 14, 14], run: t_2_14_14 },
  { key: '2,14,14,3', opcodes: [2, 14, 14, 3], run: t_2_14_14_3_lim },
  { key: '16', opcodes: [16], run: t_16 },
  { key: '16,3', opcodes: [16, 3], run: t_16_3_lim },
  { key: '16,1', opcodes: [16, 1], run: t_16_1 },
  { key: '16,1,3', opcodes: [16, 1, 3], run: t_16_1_3_lim },
  { key: '16,1,1', opcodes: [16, 1, 1], run: t_16_1_1 },
  { key: '16,1,1,3', opcodes: [16, 1, 1, 3], run: t_16_1_1_3_lim },
  { key: '16,1,2', opcodes: [16, 1, 2], run: t_16_1_2 },
  { key: '16,1,2,3', opcodes: [16, 1, 2, 3], run: t_16_1_2_3_lim },
  { key: '16,1,16', opcodes: [16, 1, 16], run: t_16_1_16 },
  { key: '16,1,16,3', opcodes: [16, 1, 16, 3], run: t_16_1_16_3_lim },
  { key: '16,1,14', opcodes: [16, 1, 14], run: t_16_1_14 },
  { key: '16,1,14,3', opcodes: [16, 1, 14, 3], run: t_16_1_14_3_lim },
  { key: '16,2', opcodes: [16, 2], run: t_16_2 },
  { key: '16,2,3', opcodes: [16, 2, 3], run: t_16_2_3_lim },
  { key: '16,2,1', opcodes: [16, 2, 1], run: t_16_2_1 },
  { key: '16,2,1,3', opcodes: [16, 2, 1, 3], run: t_16_2_1_3_lim },
  { key: '16,2,2', opcodes: [16, 2, 2], run: t_16_2_2 },
  { key: '16,2,2,3', opcodes: [16, 2, 2, 3], run: t_16_2_2_3_lim },
  { key: '16,2,16', opcodes: [16, 2, 16], run: t_16_2_16 },
  { key: '16,2,16,3', opcodes: [16, 2, 16, 3], run: t_16_2_16_3_lim },
  { key: '16,2,14', opcodes: [16, 2, 14], run: t_16_2_14 },
  { key: '16,2,14,3', opcodes: [16, 2, 14, 3], run: t_16_2_14_3_lim },
  { key: '16,16', opcodes: [16, 16], run: t_16_16 },
  { key: '16,16,3', opcodes: [16, 16, 3], run: t_16_16_3_lim },
  { key: '16,16,1', opcodes: [16, 16, 1], run: t_16_16_1 },
  { key: '16,16,1,3', opcodes: [16, 16, 1, 3], run: t_16_16_1_3_lim },
  { key: '16,16,2', opcodes: [16, 16, 2], run: t_16_16_2 },
  { key: '16,16,2,3', opcodes: [16, 16, 2, 3], run: t_16_16_2_3_lim },
  { key: '16,16,16', opcodes: [16, 16, 16], run: t_16_16_16 },
  { key: '16,16,16,3', opcodes: [16, 16, 16, 3], run: t_16_16_16_3_lim },
  { key: '16,16,14', opcodes: [16, 16, 14], run: t_16_16_14 },
  { key: '16,16,14,3', opcodes: [16, 16, 14, 3], run: t_16_16_14_3_lim },
  { key: '16,14', opcodes: [16, 14], run: t_16_14 },
  { key: '16,14,3', opcodes: [16, 14, 3], run: t_16_14_3_lim },
  { key: '16,14,1', opcodes: [16, 14, 1], run: t_16_14_1 },
  { key: '16,14,1,3', opcodes: [16, 14, 1, 3], run: t_16_14_1_3_lim },
  { key: '16,14,2', opcodes: [16, 14, 2], run: t_16_14_2 },
  { key: '16,14,2,3', opcodes: [16, 14, 2, 3], run: t_16_14_2_3_lim },
  { key: '16,14,16', opcodes: [16, 14, 16], run: t_16_14_16 },
  { key: '16,14,16,3', opcodes: [16, 14, 16, 3], run: t_16_14_16_3_lim },
  { key: '16,14,14', opcodes: [16, 14, 14], run: t_16_14_14 },
  { key: '16,14,14,3', opcodes: [16, 14, 14, 3], run: t_16_14_14_3_lim },
  { key: '14', opcodes: [14], run: t_14 },
  { key: '14,3', opcodes: [14, 3], run: t_14_3_lim },
  { key: '14,1', opcodes: [14, 1], run: t_14_1 },
  { key: '14,1,3', opcodes: [14, 1, 3], run: t_14_1_3_lim },
  { key: '14,1,1', opcodes: [14, 1, 1], run: t_14_1_1 },
  { key: '14,1,1,3', opcodes: [14, 1, 1, 3], run: t_14_1_1_3_lim },
  { key: '14,1,2', opcodes: [14, 1, 2], run: t_14_1_2 },
  { key: '14,1,2,3', opcodes: [14, 1, 2, 3], run: t_14_1_2_3_lim },
  { key: '14,1,16', opcodes: [14, 1, 16], run: t_14_1_16 },
  { key: '14,1,16,3', opcodes: [14, 1, 16, 3], run: t_14_1_16_3_lim },
  { key: '14,1,14', opcodes: [14, 1, 14], run: t_14_1_14 },
  { key: '14,1,14,3', opcodes: [14, 1, 14, 3], run: t_14_1_14_3_lim },
  { key: '14,2', opcodes: [14, 2], run: t_14_2 },
  { key: '14,2,3', opcodes: [14, 2, 3], run: t_14_2_3_lim },
  { key: '14,2,1', opcodes: [14, 2, 1], run: t_14_2_1 },
  { key: '14,2,1,3', opcodes: [14, 2, 1, 3], run: t_14_2_1_3_lim },
  { key: '14,2,2', opcodes: [14, 2, 2], run: t_14_2_2 },
  { key: '14,2,2,3', opcodes: [14, 2, 2, 3], run: t_14_2_2_3_lim },
  { key: '14,2,16', opcodes: [14, 2, 16], run: t_14_2_16 },
  { key: '14,2,16,3', opcodes: [14, 2, 16, 3], run: t_14_2_16_3_lim },
  { key: '14,2,14', opcodes: [14, 2, 14], run: t_14_2_14 },
  { key: '14,2,14,3', opcodes: [14, 2, 14, 3], run: t_14_2_14_3_lim },
  { key: '14,16', opcodes: [14, 16], run: t_14_16 },
  { key: '14,16,3', opcodes: [14, 16, 3], run: t_14_16_3_lim },
  { key: '14,16,1', opcodes: [14, 16, 1], run: t_14_16_1 },
  { key: '14,16,1,3', opcodes: [14, 16, 1, 3], run: t_14_16_1_3_lim },
  { key: '14,16,2', opcodes: [14, 16, 2], run: t_14_16_2 },
  { key: '14,16,2,3', opcodes: [14, 16, 2, 3], run: t_14_16_2_3_lim },
  { key: '14,16,16', opcodes: [14, 16, 16], run: t_14_16_16 },
  { key: '14,16,16,3', opcodes: [14, 16, 16, 3], run: t_14_16_16_3_lim },
  { key: '14,16,14', opcodes: [14, 16, 14], run: t_14_16_14 },
  { key: '14,16,14,3', opcodes: [14, 16, 14, 3], run: t_14_16_14_3_lim },
  { key: '14,14', opcodes: [14, 14], run: t_14_14 },
  { key: '14,14,3', opcodes: [14, 14, 3], run: t_14_14_3_lim },
  { key: '14,14,1', opcodes: [14, 14, 1], run: t_14_14_1 },
  { key: '14,14,1,3', opcodes: [14, 14, 1, 3], run: t_14_14_1_3_lim },
  { key: '14,14,2', opcodes: [14, 14, 2], run: t_14_14_2 },
  { key: '14,14,2,3', opcodes: [14, 14, 2, 3], run: t_14_14_2_3_lim },
  { key: '14,14,16', opcodes: [14, 14, 16], run: t_14_14_16 },
  { key: '14,14,16,3', opcodes: [14, 14, 16, 3], run: t_14_14_16_3_lim },
  { key: '14,14,14', opcodes: [14, 14, 14], run: t_14_14_14 },
  { key: '14,14,14,3', opcodes: [14, 14, 14, 3], run: t_14_14_14_3_lim },
  { key: '7', opcodes: [7], run: t_7 },
  { key: '1,7', opcodes: [1, 7], run: t_1_7 },
  { key: '1,7,2,14', opcodes: [1, 7, 2, 14], run: t_1_7_2_14 },
]

export const SINK_TEMPLATES: readonly SinkTemplateEntry[] = [
  { key: '8', opcodes: [8], kind: 'reduce', run: t_8_reduce },
  { key: '18', opcodes: [18], kind: 'count', run: t_18_count },
  { key: '10', opcodes: [10], kind: 'every', run: t_10_every },
  { key: '11', opcodes: [11], kind: 'some', run: t_11_some },
  { key: '12', opcodes: [12], kind: 'find', run: t_12_find },
  { key: '13', opcodes: [13], kind: 'findIndex', run: t_13_findIndex },
  { key: '17', opcodes: [17], kind: 'none', run: t_17_none },
  { key: '22', opcodes: [22], kind: 'findMap', run: t_22_findMap },
  { key: '1,8', opcodes: [1, 8], kind: 'reduce', run: t_1_8_reduce },
  { key: '1,18', opcodes: [1, 18], kind: 'count', run: t_1_18_count },
  { key: '1>SUM', opcodes: [1, 41], kind: 'sum', run: t_1_41_sum },
  { key: '1,10', opcodes: [1, 10], kind: 'every', run: t_1_10_every },
  { key: '1,11', opcodes: [1, 11], kind: 'some', run: t_1_11_some },
  { key: '1,12', opcodes: [1, 12], kind: 'find', run: t_1_12_find },
  { key: '1,13', opcodes: [1, 13], kind: 'findIndex', run: t_1_13_findIndex },
  { key: '1,17', opcodes: [1, 17], kind: 'none', run: t_1_17_none },
  { key: '1,22', opcodes: [1, 22], kind: 'findMap', run: t_1_22_findMap },
  { key: '2,8', opcodes: [2, 8], kind: 'reduce', run: t_2_8_reduce },
  { key: '2,18', opcodes: [2, 18], kind: 'count', run: t_2_18_count },
  { key: '2>SUM', opcodes: [2, 41], kind: 'sum', run: t_2_41_sum },
  { key: '2,10', opcodes: [2, 10], kind: 'every', run: t_2_10_every },
  { key: '2,11', opcodes: [2, 11], kind: 'some', run: t_2_11_some },
  { key: '2,12', opcodes: [2, 12], kind: 'find', run: t_2_12_find },
  { key: '2,13', opcodes: [2, 13], kind: 'findIndex', run: t_2_13_findIndex },
  { key: '2,17', opcodes: [2, 17], kind: 'none', run: t_2_17_none },
  { key: '2,22', opcodes: [2, 22], kind: 'findMap', run: t_2_22_findMap },
  { key: '16,8', opcodes: [16, 8], kind: 'reduce', run: t_16_8_reduce },
  { key: '16,18', opcodes: [16, 18], kind: 'count', run: t_16_18_count },
  { key: '16>SUM', opcodes: [16, 41], kind: 'sum', run: t_16_41_sum },
  { key: '16,10', opcodes: [16, 10], kind: 'every', run: t_16_10_every },
  { key: '16,11', opcodes: [16, 11], kind: 'some', run: t_16_11_some },
  { key: '16,12', opcodes: [16, 12], kind: 'find', run: t_16_12_find },
  { key: '16,13', opcodes: [16, 13], kind: 'findIndex', run: t_16_13_findIndex },
  { key: '16,17', opcodes: [16, 17], kind: 'none', run: t_16_17_none },
  { key: '16,22', opcodes: [16, 22], kind: 'findMap', run: t_16_22_findMap },
  { key: '14,8', opcodes: [14, 8], kind: 'reduce', run: t_14_8_reduce },
  { key: '14,18', opcodes: [14, 18], kind: 'count', run: t_14_18_count },
  { key: '14>SUM', opcodes: [14, 41], kind: 'sum', run: t_14_41_sum },
  { key: '14,10', opcodes: [14, 10], kind: 'every', run: t_14_10_every },
  { key: '14,11', opcodes: [14, 11], kind: 'some', run: t_14_11_some },
  { key: '14,12', opcodes: [14, 12], kind: 'find', run: t_14_12_find },
  { key: '14,13', opcodes: [14, 13], kind: 'findIndex', run: t_14_13_findIndex },
  { key: '14,17', opcodes: [14, 17], kind: 'none', run: t_14_17_none },
  { key: '14,22', opcodes: [14, 22], kind: 'findMap', run: t_14_22_findMap },
  { key: '1,2,8', opcodes: [1, 2, 8], kind: 'reduce', run: t_1_2_8_reduce },
  { key: '1,2,18', opcodes: [1, 2, 18], kind: 'count', run: t_1_2_18_count },
  { key: '1,2,10', opcodes: [1, 2, 10], kind: 'every', run: t_1_2_10_every },
  { key: '1,2,11', opcodes: [1, 2, 11], kind: 'some', run: t_1_2_11_some },
  { key: '1,2,12', opcodes: [1, 2, 12], kind: 'find', run: t_1_2_12_find },
  { key: '1,2,13', opcodes: [1, 2, 13], kind: 'findIndex', run: t_1_2_13_findIndex },
  { key: '1,2,17', opcodes: [1, 2, 17], kind: 'none', run: t_1_2_17_none },
  { key: '1,2,22', opcodes: [1, 2, 22], kind: 'findMap', run: t_1_2_22_findMap },
  { key: '2,14,8', opcodes: [2, 14, 8], kind: 'reduce', run: t_2_14_8_reduce },
  { key: '2,14,18', opcodes: [2, 14, 18], kind: 'count', run: t_2_14_18_count },
  { key: '2,14,10', opcodes: [2, 14, 10], kind: 'every', run: t_2_14_10_every },
  { key: '2,14,11', opcodes: [2, 14, 11], kind: 'some', run: t_2_14_11_some },
  { key: '2,14,12', opcodes: [2, 14, 12], kind: 'find', run: t_2_14_12_find },
  { key: '2,14,13', opcodes: [2, 14, 13], kind: 'findIndex', run: t_2_14_13_findIndex },
  { key: '2,14,17', opcodes: [2, 14, 17], kind: 'none', run: t_2_14_17_none },
  { key: '2,14,22', opcodes: [2, 14, 22], kind: 'findMap', run: t_2_14_22_findMap },
  { key: '1,7,2,14,8', opcodes: [1, 7, 2, 14, 8], kind: 'reduce', run: t_1_7_2_14_8_reduce },
  { key: '1,7,2,14,12', opcodes: [1, 7, 2, 14, 12], kind: 'find', run: t_1_7_2_14_12_find },
]
