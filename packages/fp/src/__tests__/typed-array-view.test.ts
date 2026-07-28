import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vite-plus/test'
import { inspectCanonicalView } from '../internal/typed-array-view'

const optionalFloat16 = Reflect.get(globalThis, 'Float16Array') as typeof Float32Array | undefined

describe('canonical view inspection', () => {
  it('reports the family, element type and element width for every built-in view', () => {
    const expected = [
      [new Int8Array(1), 'int8', false, 1],
      [new Uint8Array(1), 'uint8', false, 1],
      [new Uint8ClampedArray(1), 'uint8clamped', false, 1],
      [new Int16Array(1), 'int16', false, 2],
      [new Uint16Array(1), 'uint16', false, 2],
      [new Int32Array(1), 'int32', false, 4],
      [new Uint32Array(1), 'uint32', false, 4],
      [new Float32Array(1), 'float32', false, 4],
      [new Float64Array(1), 'float64', false, 8],
      [new BigInt64Array(1), 'bigint64', true, 8],
      [new BigUint64Array(1), 'biguint64', true, 8],
    ] as const

    for (const [value, family, bigint, bytesPerElement] of expected) {
      expect(inspectCanonicalView(value)).toEqual({ family, bigint, bytesPerElement })
    }
  })

  it('covers Float16Array when the engine has it', () => {
    if (optionalFloat16 === undefined) return
    expect(inspectCanonicalView(new optionalFloat16(1))).toEqual({
      family: 'float16',
      bigint: false,
      bytesPerElement: 2,
    })
  })

  it('rejects subclasses, own constructors and cross-realm views', () => {
    class Subclassed extends Uint8Array {}
    expect(inspectCanonicalView(new Subclassed(2))).toBeUndefined()

    const ownConstructor = new Uint8Array(2)
    Object.defineProperty(ownConstructor, 'constructor', {
      configurable: true,
      value: Uint8Array,
    })
    expect(inspectCanonicalView(ownConstructor)).toBeUndefined()

    const foreign = runInNewContext('new Uint8Array(2)') as Uint8Array
    expect(foreign.length).toBe(2)
    expect(inspectCanonicalView(foreign)).toBeUndefined()
  })

  it('admits shared, resizable and detached views, which keep their prototype', () => {
    expect(inspectCanonicalView(new Uint8Array(new SharedArrayBuffer(4)))?.family).toBe('uint8')

    const detached = new Uint8Array(4)
    structuredClone(detached.buffer, { transfer: [detached.buffer] })
    expect(inspectCanonicalView(detached)?.family).toBe('uint8')

    if (typeof ArrayBuffer.prototype.resize !== 'function') return
    const resizable = new ArrayBuffer(8, { maxByteLength: 16 })
    expect(inspectCanonicalView(new Uint8Array(resizable))?.family).toBe('uint8')
    expect(inspectCanonicalView(new Uint8Array(resizable, 0, 4))?.family).toBe('uint8')
  })

  it('returns a frozen fact that a caller cannot mutate for the next caller', () => {
    const first = inspectCanonicalView(new Int32Array(1))
    expect(Object.isFrozen(first)).toBe(true)
    expect(() => {
      ;(first as { family: string }).family = 'float64'
    }).toThrow(TypeError)
    expect(inspectCanonicalView(new Int32Array(1))?.family).toBe('int32')
  })

  it('rejects plain objects that only look like a view', () => {
    expect(inspectCanonicalView({ length: 4, 0: 1 })).toBeUndefined()
    expect(inspectCanonicalView([1, 2, 3])).toBeUndefined()
    expect(inspectCanonicalView(Object.create(null) as object)).toBeUndefined()
  })
})
