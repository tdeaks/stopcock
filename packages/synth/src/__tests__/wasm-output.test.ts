import { describe, expect, it } from 'vite-plus/test'
import { addHeapInto, addInto, copyHeapBlockInto } from '../render/wasm-output'

describe('WASM output helpers', () => {
  it('adds mono and stereo voices into stereo output without reallocating shape', () => {
    const target: [Float32Array, Float32Array] = [new Float32Array(5), new Float32Array(5)]

    addInto(target, new Float32Array([0.5, -0.25]), 1)
    addInto(target, [new Float32Array([1, 2]), new Float32Array([-1, -2])], 2)

    expect(Array.from(target[0])).toEqual([0, 0.5, 0.75, 2, 0])
    expect(Array.from(target[1])).toEqual([0, 0.5, -1.25, -2, 0])
  })

  it('adds stereo voices into mono output without a temporary mix buffer', () => {
    const target = new Float32Array([0, 0.5, 0, 1])

    addInto(target, [new Float32Array([1, 0.25, 8]), new Float32Array([-0.5, 0.75, 8])], 1)

    expect(Array.from(target)).toEqual([0, 0.75, 0.5, 9])
  })

  it('adds only the overlapping frames when a voice reaches the output edge', () => {
    const target: [Float32Array, Float32Array] = [
      new Float32Array([0, 0, 0.25]),
      new Float32Array([0, 0, -0.25]),
    ]

    addInto(target, [new Float32Array([1, 2, 3]), new Float32Array([-1, -2, -3])], 2)

    expect(Array.from(target[0])).toEqual([0, 0, 1.25])
    expect(Array.from(target[1])).toEqual([0, 0, -1.25])
  })

  it('copies heap stereo into mono by averaging channels', () => {
    const memory = new ArrayBuffer(6 * Float32Array.BYTES_PER_ELEMENT)
    const heap = new Float32Array(memory)
    heap.set([1, -1, 0.25], 0)
    heap.set([-1, 1, 0.75], 3)
    const target = new Float32Array(5).fill(9)

    copyHeapBlockInto(target, memory, 0, 3 * Float32Array.BYTES_PER_ELEMENT, 2, 3, 1)

    expect(Array.from(target)).toEqual([9, 0, 0, 0.5, 9])
  })

  it('adds heap mono into stereo trigger output', () => {
    const memory = new ArrayBuffer(3 * Float32Array.BYTES_PER_ELEMENT)
    new Float32Array(memory).set([0.25, 0.5, 0.75])
    const target: [Float32Array, Float32Array] = [new Float32Array(5), new Float32Array(5)]

    addHeapInto(target, memory, 0, 0, 1, 3, 2)

    expect(Array.from(target[0])).toEqual([0, 0, 0.25, 0.5, 0.75])
    expect(Array.from(target[1])).toEqual([0, 0, 0.25, 0.5, 0.75])
  })
})
