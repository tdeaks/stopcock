// GENERATED FILE. Do not edit by hand — run `bun run codegen` to regenerate.
// Hand-shaped fused loop templates for the highest-frequency stream-segment
// shapes: chains of map/filter/reject/filterMap (length 1-3, optionally
// take-limited) plus sink fusions (reduce/count/sum). Looked up by opcode
// shape key from src/lower.ts before falling back to the generic closure
// chain. Semantics mirror src/interpret.ts exactly.
import { type StepBinding, type ConsumeMeta } from './plan'

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
  readonly kind: 'reduce' | 'count' | 'sum'
  readonly run: PortableTemplateFn
}

export function t_1(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
    const x = src[i]
    const v0 = f0(x)
    out.push(v0)
  }
  return out
}

export function t_1_3_lim(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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

export function t_1_2(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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

export function t_2(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
    const x = src[i]
    if (!f0(x)) continue
    out.push(x)
  }
  return out
}

export function t_2_3_lim(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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

export function t_2_14(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const f1 = bindings[offset + 1].fn as (v: unknown) => unknown
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
    const x = src[i]
    if (f0(x)) continue
    out.push(x)
  }
  return out
}

export function t_16_3_lim(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
    const x = src[i]
    const v0 = f0(x)
    if (v0 == null) continue
    out.push(v0)
  }
  return out
}

export function t_14_3_lim(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
  const f0 = bindings[offset + 0].fn as (v: unknown) => unknown
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
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

export function t_1_8_reduce(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown {
  const f0 = bindings[offset].fn as (v: unknown) => unknown
  const fr = bindings[offset + 1].fn as (acc: unknown, v: unknown) => unknown
  let acc: unknown = bindings[offset + 1].a1
  for (let i = 0; i < src.length; i++) {
    const x = src[i]
    const v0 = f0(x)
    acc = fr(acc, v0)
  }
  return acc
}

export function t_1_18_count(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown {
  const f0 = bindings[offset].fn as (v: unknown) => unknown
  const fs = bindings[offset + 1].fn as (v: unknown) => boolean
  let count = 0
  for (let i = 0; i < src.length; i++) {
    const x = src[i]
    const v0 = f0(x)
    if (fs(v0)) count++
  }
  return count
}

export function t_1_41_sum(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown {
  const f0 = bindings[offset].fn as (v: unknown) => unknown
  let sum = 0
  for (let i = 0; i < src.length; i++) {
    const x = src[i]
    const v0 = f0(x)
    sum += v0 as number
  }
  return sum
}

export function t_2_8_reduce(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown {
  const f0 = bindings[offset].fn as (v: unknown) => unknown
  const fr = bindings[offset + 1].fn as (acc: unknown, v: unknown) => unknown
  let acc: unknown = bindings[offset + 1].a1
  for (let i = 0; i < src.length; i++) {
    const x = src[i]
    if (!f0(x)) continue
    acc = fr(acc, x)
  }
  return acc
}

export function t_2_18_count(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown {
  const f0 = bindings[offset].fn as (v: unknown) => unknown
  const fs = bindings[offset + 1].fn as (v: unknown) => boolean
  let count = 0
  for (let i = 0; i < src.length; i++) {
    const x = src[i]
    if (!f0(x)) continue
    if (fs(x)) count++
  }
  return count
}

export function t_2_41_sum(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown {
  const f0 = bindings[offset].fn as (v: unknown) => unknown
  let sum = 0
  for (let i = 0; i < src.length; i++) {
    const x = src[i]
    if (!f0(x)) continue
    sum += x as number
  }
  return sum
}

export function t_16_8_reduce(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown {
  const f0 = bindings[offset].fn as (v: unknown) => unknown
  const fr = bindings[offset + 1].fn as (acc: unknown, v: unknown) => unknown
  let acc: unknown = bindings[offset + 1].a1
  for (let i = 0; i < src.length; i++) {
    const x = src[i]
    if (f0(x)) continue
    acc = fr(acc, x)
  }
  return acc
}

export function t_16_18_count(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown {
  const f0 = bindings[offset].fn as (v: unknown) => unknown
  const fs = bindings[offset + 1].fn as (v: unknown) => boolean
  let count = 0
  for (let i = 0; i < src.length; i++) {
    const x = src[i]
    if (f0(x)) continue
    if (fs(x)) count++
  }
  return count
}

export function t_16_41_sum(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown {
  const f0 = bindings[offset].fn as (v: unknown) => unknown
  let sum = 0
  for (let i = 0; i < src.length; i++) {
    const x = src[i]
    if (f0(x)) continue
    sum += x as number
  }
  return sum
}

export function t_14_8_reduce(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown {
  const f0 = bindings[offset].fn as (v: unknown) => unknown
  const fr = bindings[offset + 1].fn as (acc: unknown, v: unknown) => unknown
  let acc: unknown = bindings[offset + 1].a1
  for (let i = 0; i < src.length; i++) {
    const x = src[i]
    const v0 = f0(x)
    if (v0 == null) continue
    acc = fr(acc, v0)
  }
  return acc
}

export function t_14_18_count(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown {
  const f0 = bindings[offset].fn as (v: unknown) => unknown
  const fs = bindings[offset + 1].fn as (v: unknown) => boolean
  let count = 0
  for (let i = 0; i < src.length; i++) {
    const x = src[i]
    const v0 = f0(x)
    if (v0 == null) continue
    if (fs(v0)) count++
  }
  return count
}

export function t_14_41_sum(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown {
  const f0 = bindings[offset].fn as (v: unknown) => unknown
  let sum = 0
  for (let i = 0; i < src.length; i++) {
    const x = src[i]
    const v0 = f0(x)
    if (v0 == null) continue
    sum += v0 as number
  }
  return sum
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
]

export const SINK_TEMPLATES: readonly SinkTemplateEntry[] = [
  { key: '1,8', opcodes: [1, 8], kind: 'reduce', run: t_1_8_reduce },
  { key: '1,18', opcodes: [1, 18], kind: 'count', run: t_1_18_count },
  { key: '1>SUM', opcodes: [1, 41], kind: 'sum', run: t_1_41_sum },
  { key: '2,8', opcodes: [2, 8], kind: 'reduce', run: t_2_8_reduce },
  { key: '2,18', opcodes: [2, 18], kind: 'count', run: t_2_18_count },
  { key: '2>SUM', opcodes: [2, 41], kind: 'sum', run: t_2_41_sum },
  { key: '16,8', opcodes: [16, 8], kind: 'reduce', run: t_16_8_reduce },
  { key: '16,18', opcodes: [16, 18], kind: 'count', run: t_16_18_count },
  { key: '16>SUM', opcodes: [16, 41], kind: 'sum', run: t_16_41_sum },
  { key: '14,8', opcodes: [14, 8], kind: 'reduce', run: t_14_8_reduce },
  { key: '14,18', opcodes: [14, 18], kind: 'count', run: t_14_18_count },
  { key: '14>SUM', opcodes: [14, 41], kind: 'sum', run: t_14_41_sum },
]
