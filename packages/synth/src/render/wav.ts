import type { Samples } from '../types'
import { clamp } from '../internal/util'

export function toWav(samples: Samples, opts: { sampleRate: number }): Uint8Array {
  const channels = Array.isArray(samples) ? 2 : 1
  const length = Array.isArray(samples) ? samples[0].length : samples.length
  const dataBytes = length * channels * 2
  const out = new Uint8Array(44 + dataBytes)
  const view = new DataView(out.buffer)

  writeAscii(out, 0, 'RIFF')
  view.setUint32(4, 36 + dataBytes, true)
  writeAscii(out, 8, 'WAVE')
  writeAscii(out, 12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, channels, true)
  view.setUint32(24, opts.sampleRate, true)
  view.setUint32(28, opts.sampleRate * channels * 2, true)
  view.setUint16(32, channels * 2, true)
  view.setUint16(34, 16, true)
  writeAscii(out, 36, 'data')
  view.setUint32(40, dataBytes, true)

  let offset = 44
  for (let i = 0; i < length; i++) {
    if (Array.isArray(samples)) {
      offset = writeSample(view, offset, samples[0][i])
      offset = writeSample(view, offset, samples[1][i])
    } else {
      offset = writeSample(view, offset, samples[i])
    }
  }
  return out
}

function writeAscii(out: Uint8Array, offset: number, value: string): void {
  for (let i = 0; i < value.length; i++) out[offset + i] = value.charCodeAt(i)
}

function writeSample(view: DataView, offset: number, sample: number): number {
  const clamped = clamp(sample, -1, 1)
  view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7FFF, true)
  return offset + 2
}
