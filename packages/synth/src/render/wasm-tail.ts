import type { Node, Trigger } from '../types'
import { clamp } from '../internal/util'

export function durationForFrames(frames: number, sampleRate: number): number {
  return (frames + 0.25) / sampleRate
}

export function maxTriggerFrames(root: Node, length: number, sampleRate: number, triggers: ReadonlyArray<Trigger>): number {
  let frames = 0
  for (const trigger of triggers) {
    const start = Math.max(0, Math.floor(trigger.atSec * sampleRate))
    if (start < length) frames = Math.max(frames, triggerRenderFrames(root, length - start, sampleRate, trigger))
  }
  return frames
}

export function triggerRenderFrames(root: Node, remainingFrames: number, sampleRate: number, trigger: Trigger): number {
  const activeFrames = triggerActiveFrames(root, sampleRate, trigger, new WeakSet())
  if (activeFrames === null) return remainingFrames
  return Math.min(remainingFrames, Math.max(0, activeFrames))
}

function triggerActiveFrames(node: Node, sampleRate: number, trigger: Trigger, seen: WeakSet<Node>): number | null {
  if (seen.has(node)) return null
  seen.add(node)

  try {
    if (node.mods.length > 0) return null

    switch (node.kind) {
      case 'samplerInstrument':
      case 'lofiSampler':
      case 'ar':
        return gatedReleaseFrames(trigger, node.release, sampleRate)
      case 'adsr':
        return gatedReleaseFrames(trigger, node.release, sampleRate)
      case 'gain':
        if (node.amount === 0) return 0
        return triggerActiveFrames(node.input, sampleRate, trigger, seen)
      case 'pan':
      case 'exponential':
      case 'distortion':
      case 'compressor':
        return triggerActiveFrames(node.input, sampleRate, trigger, seen)
      case 'tiltEq':
        return tiltEqHasNoTail(node)
          ? triggerActiveFrames(node.input, sampleRate, trigger, seen)
          : null
      case 'stateVariableFilter':
        return node.mix === 0 ? triggerActiveFrames(node.input, sampleRate, trigger, seen) : null
      case 'stereoSpread':
        return stereoSpreadActiveFrames(node, sampleRate, trigger, seen)
      case 'frequencyShifter':
        return frequencyShifterActiveFrames(node, sampleRate, trigger, seen)
      case 'rotarySpeaker':
        return node.mix === 0 || node.depth === 0 ? triggerActiveFrames(node.input, sampleRate, trigger, seen) : null
      case 'phaser':
        return node.mix === 0 || node.depth === 0 ? triggerActiveFrames(node.input, sampleRate, trigger, seen) : null
      case 'bitcrush': {
        const inputFrames = triggerActiveFrames(node.input, sampleRate, trigger, seen)
        if (inputFrames === null) return null
        if (inputFrames === 0) return 0
        return inputFrames + bitcrushHoldFrames(node.downsample) - 1
      }
      case 'delay':
        return delayActiveFrames(node, sampleRate, trigger, seen)
      case 'chorus':
        return chorusActiveFrames(node, sampleRate, trigger, seen)
      case 'microPitch':
        return microPitchActiveFrames(node, sampleRate, trigger, seen)
      case 'multiTapDelay':
        return multiTapDelayActiveFrames(node, sampleRate, trigger, seen)
      case 'reverb':
      case 'ensembleChorus':
      case 'tapeDelay':
      case 'plateReverb':
      case 'springReverb':
      case 'nonlinearReverb':
      case 'saturator':
      case 'wavefolder':
      case 'degrade':
        return node.mix === 0 ? triggerActiveFrames(node.input, sampleRate, trigger, seen) : null
      case 'spaceEcho':
        return node.mix === 0 && node.reverbMix === 0 ? triggerActiveFrames(node.input, sampleRate, trigger, seen) : null
      case 'mix': {
        let max = 0
        for (const input of node.inputs) {
          const active = triggerActiveFrames(input, sampleRate, trigger, seen)
          if (active === null) return null
          max = Math.max(max, active)
        }
        return max
      }
      case 'stereo': {
        const left = triggerActiveFrames(node.left, sampleRate, trigger, seen)
        if (left === null) return null
        const right = triggerActiveFrames(node.right, sampleRate, trigger, seen)
        if (right === null) return null
        return Math.max(left, right)
      }
      case 'constant':
        return node.value === 0 ? 0 : null
      case 'buffer':
        return !node.loop && Number.isFinite(node.rate) && node.rate > 0
          ? Math.ceil(node.samples.length / node.rate)
          : null
      default:
        return null
    }
  } finally {
    seen.delete(node)
  }
}

function gatedReleaseFrames(trigger: Trigger, release: number, sampleRate: number): number | null {
  if (trigger.gateMs === undefined || !Number.isFinite(trigger.gateMs)) return null
  if (!Number.isFinite(release)) return null
  const seconds = Math.max(0, trigger.gateMs / 1000) + Math.max(0, release)
  return Math.ceil(seconds * sampleRate - 1e-9)
}

function bitcrushHoldFrames(downsample: number): number {
  return Math.min(128, Math.max(1, Math.round(Number.isFinite(downsample) ? downsample : 1)))
}

function tiltEqHasNoTail(node: Extract<Node, { kind: 'tiltEq' }>): boolean {
  return (Number.isFinite(node.mix) && node.mix <= 0)
    || node.gainDb === 0
    || !Number.isFinite(node.gainDb)
}

function stereoSpreadActiveFrames(node: Extract<Node, { kind: 'stereoSpread' }>, sampleRate: number, trigger: Trigger, seen: WeakSet<Node>): number | null {
  if (node.mix === 0 || node.width === 0) return triggerActiveFrames(node.input, sampleRate, trigger, seen)
  if (!Number.isFinite(node.delayMs)) return null
  const inputFrames = triggerActiveFrames(node.input, sampleRate, trigger, seen)
  if (inputFrames === null) return null
  if (inputFrames === 0) return 0
  return inputFrames + stereoSpreadTailFrames(node.delayMs, sampleRate)
}

function stereoSpreadTailFrames(delayMs: number, sampleRate: number): number {
  const sanitizedDelayMs = clamp(safeFinite(delayMs, 9), 0, 50)
  if (sanitizedDelayMs <= 0) return 0
  return Math.max(1, Math.ceil(sanitizedDelayMs * sampleRate / 1000))
}

function frequencyShifterActiveFrames(node: Extract<Node, { kind: 'frequencyShifter' }>, sampleRate: number, trigger: Trigger, seen: WeakSet<Node>): number | null {
  if ((Number.isFinite(node.mix) && node.mix <= 0) || node.shiftHz === 0 || !Number.isFinite(node.shiftHz)) {
    return triggerActiveFrames(node.input, sampleRate, trigger, seen)
  }
  const inputFrames = triggerActiveFrames(node.input, sampleRate, trigger, seen)
  if (inputFrames === null) return null
  if (inputFrames === 0) return 0
  return inputFrames + 62
}

function delayActiveFrames(node: Extract<Node, { kind: 'delay' }>, sampleRate: number, trigger: Trigger, seen: WeakSet<Node>): number | null {
  if (node.mix === 0) return triggerActiveFrames(node.input, sampleRate, trigger, seen)
  if (node.feedback !== 0) return null
  if (!Number.isFinite(node.delayMs)) return null
  const inputFrames = triggerActiveFrames(node.input, sampleRate, trigger, seen)
  if (inputFrames === null) return null
  if (inputFrames === 0) return 0
  return inputFrames + delayTailFrames(node.delayMs, sampleRate)
}

function delayTailFrames(delayMs: number, sampleRate: number): number {
  const maxDelay = Math.max(1, Math.ceil(sampleRate * 5))
  const raw = Math.round(delayMs * sampleRate / 1000)
  return Math.min(maxDelay - 1, Math.max(1, raw))
}

function chorusActiveFrames(node: Extract<Node, { kind: 'chorus' }>, sampleRate: number, trigger: Trigger, seen: WeakSet<Node>): number | null {
  if (node.mix === 0) return triggerActiveFrames(node.input, sampleRate, trigger, seen)
  const inputFrames = triggerActiveFrames(node.input, sampleRate, trigger, seen)
  if (inputFrames === null) return null
  if (inputFrames === 0) return 0
  return inputFrames + chorusTailFrames(node.depth, sampleRate)
}

function chorusTailFrames(depth: number, sampleRate: number): number {
  const maxDelay = Math.max(1, Math.ceil(sampleRate * 0.1))
  const sanitizedDepth = Math.max(0, Number.isFinite(depth) ? depth : 0)
  const raw = Math.round((8 + sanitizedDepth) * sampleRate / 1000)
  return Math.min(maxDelay - 1, Math.max(1, raw))
}

function microPitchActiveFrames(node: Extract<Node, { kind: 'microPitch' }>, sampleRate: number, trigger: Trigger, seen: WeakSet<Node>): number | null {
  if (node.mix === 0) return triggerActiveFrames(node.input, sampleRate, trigger, seen)
  const inputFrames = triggerActiveFrames(node.input, sampleRate, trigger, seen)
  if (inputFrames === null) return null
  if (inputFrames === 0) return 0
  return inputFrames + microPitchTailFrames(node.detune, node.width, node.delayMs, sampleRate)
}

function microPitchTailFrames(detune: number, width: number, delayMs: number, sampleRate: number): number {
  const sanitizedDetune = clamp(safeFinite(detune, 0), -120, 120)
  const sanitizedWidth = clamp(safeFinite(width, 1), 0, 2)
  const sanitizedDelayMs = clamp(safeFinite(delayMs, 12), 1, 80)
  const sweepMs = Math.abs(sanitizedDetune * sanitizedWidth) < 0.001 ? 0 : 32
  return Math.max(1, Math.ceil((sanitizedDelayMs + sweepMs) * sampleRate / 1000))
}

function multiTapDelayActiveFrames(node: Extract<Node, { kind: 'multiTapDelay' }>, sampleRate: number, trigger: Trigger, seen: WeakSet<Node>): number | null {
  if (node.mix === 0 || node.taps.length === 0) return triggerActiveFrames(node.input, sampleRate, trigger, seen)
  if (node.feedback !== 0 || !Number.isFinite(node.tone) || node.tone < 1) return null
  const inputFrames = triggerActiveFrames(node.input, sampleRate, trigger, seen)
  if (inputFrames === null) return null
  if (inputFrames === 0) return 0
  return inputFrames + multiTapDelayTailFrames(node, sampleRate)
}

function multiTapDelayTailFrames(node: Extract<Node, { kind: 'multiTapDelay' }>, sampleRate: number): number {
  const maxDelay = Math.max(1, Math.ceil(sampleRate * 5))
  const timeMs = clamp(safeFinite(node.timeMs, 96), 1, 5_000)
  let tail = 1
  for (const tap of node.taps.slice(0, 16)) {
    const ratio = clamp(safeFinite(tap.ratio, 1), 0.01, 16)
    tail = Math.max(tail, Math.ceil(clamp(ratio * timeMs * sampleRate / 1000, 1, maxDelay)))
  }
  return tail
}

function safeFinite(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback
}
