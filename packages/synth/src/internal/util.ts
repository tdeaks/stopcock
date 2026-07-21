import type { Note } from '../types'

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function midiToFreq(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12)
}

export function noteToFreq(note: Note): number {
  return 'freq' in note && note.freq !== undefined ? note.freq : midiToFreq(note.midi)
}

export function unrefTimer(timer: unknown): void {
  if (
    typeof timer === 'object' &&
    timer !== null &&
    'unref' in timer &&
    typeof timer.unref === 'function'
  ) {
    timer.unref()
  }
}

export function isTypedArray(value: unknown): value is Float32Array {
  return value instanceof Float32Array
}

export function mulberry32(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state += 0x6d2b79f5
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function safeFinite(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback
}
