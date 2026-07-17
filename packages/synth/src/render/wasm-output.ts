import type { Samples } from '../types'

export function addInto(target: Samples, source: Samples, offset: number): void {
  if (Array.isArray(target)) {
    addChannelsAt(target, source, offset)
  } else if (Array.isArray(source)) {
    const frames = Math.min(source[0].length, Math.max(0, target.length - offset))
    for (let i = 0; i < frames; i++) target[offset + i] += (source[0][i] + source[1][i]) * 0.5
  } else {
    const frames = Math.min(source.length, Math.max(0, target.length - offset))
    for (let i = 0; i < frames; i++) target[i + offset] += source[i]
  }
}

export function addHeapInto(
  target: Samples,
  memory: ArrayBuffer,
  leftPtr: number,
  rightPtr: number,
  channels: number,
  frames: number,
  offset: number,
): void {
  const left = new Float32Array(memory, leftPtr, frames)
  if (Array.isArray(target)) {
    if (channels === 2) {
      const right = new Float32Array(memory, rightPtr, frames)
      for (let i = 0; i < frames; i++) {
        target[0][offset + i] += left[i]
        target[1][offset + i] += right[i]
      }
    } else {
      for (let i = 0; i < frames; i++) {
        target[0][offset + i] += left[i]
        target[1][offset + i] += left[i]
      }
    }
  } else if (channels === 2) {
    const right = new Float32Array(memory, rightPtr, frames)
    for (let i = 0; i < frames; i++) target[offset + i] += (left[i] + right[i]) * 0.5
  } else {
    for (let i = 0; i < frames; i++) target[offset + i] += left[i]
  }
}

export function copyHeapBlockInto(
  target: Samples,
  memory: ArrayBuffer,
  leftPtr: number,
  rightPtr: number,
  channels: number,
  frames: number,
  offset: number,
): void {
  const left = new Float32Array(memory, leftPtr, frames)
  if (Array.isArray(target)) {
    target[0].set(left, offset)
    if (channels === 2) {
      target[1].set(new Float32Array(memory, rightPtr, frames), offset)
    } else {
      target[1].set(left, offset)
    }
  } else if (channels === 2) {
    const right = new Float32Array(memory, rightPtr, frames)
    for (let i = 0; i < frames; i++) target[offset + i] = (left[i] + right[i]) * 0.5
  } else {
    target.set(left, offset)
  }
}

function addChannelsAt(target: [Float32Array, Float32Array], source: Samples, offset: number): void {
  const writableFrames = Math.min(Math.max(0, target[0].length - offset), Math.max(0, target[1].length - offset))
  if (Array.isArray(source)) {
    const frames = Math.min(source[0].length, source[1].length, writableFrames)
    for (let i = 0; i < frames; i++) {
      const out = offset + i
      target[0][out] += source[0][i]
      target[1][out] += source[1][i]
    }
  } else {
    const frames = Math.min(source.length, writableFrames)
    for (let i = 0; i < frames; i++) {
      const out = offset + i
      target[0][out] += source[i]
      target[1][out] += source[i]
    }
  }
}
