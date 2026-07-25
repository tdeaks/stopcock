import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vite-plus/test'
import {
  CANONICAL_FAMILIES,
  hasIntrinsicIteration,
  inspectCanonicalView,
  isCanonicalView,
} from '../internal/typed-array-view'

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
      expect(isCanonicalView(value)).toBe(true)
    }
  })

  it('covers Float16Array when the engine has it and stays silent when it does not', () => {
    expect(CANONICAL_FAMILIES.includes('float16')).toBe(optionalFloat16 !== undefined)
    if (optionalFloat16 === undefined) return
    expect(inspectCanonicalView(new optionalFloat16(1))).toEqual({
      family: 'float16',
      bigint: false,
      bytesPerElement: 2,
    })
  })

  it('lists every family this realm has, without duplicates', () => {
    expect(new Set(CANONICAL_FAMILIES).size).toBe(CANONICAL_FAMILIES.length)
    expect(CANONICAL_FAMILIES.length).toBe(optionalFloat16 === undefined ? 11 : 12)
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

describe('intrinsic iteration', () => {
  it('accepts a plain view and rejects an own iterator override', () => {
    expect(hasIntrinsicIteration(new Uint8Array(2))).toBe(true)

    const shadowed = new Uint8Array(2)
    Object.defineProperty(shadowed, Symbol.iterator, {
      configurable: true,
      value: function* () {
        yield 99
      },
    })
    expect(hasIntrinsicIteration(shadowed)).toBe(false)
  })

  it('rejects every view once the shared prototype method is replaced', () => {
    const typedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype) as object
    const original = Object.getOwnPropertyDescriptor(typedArrayPrototype, Symbol.iterator)
    expect(original).toBeDefined()
    try {
      Object.defineProperty(typedArrayPrototype, Symbol.iterator, {
        configurable: true,
        value: function* () {
          yield 99
        },
      })
      expect(hasIntrinsicIteration(new Uint8Array(2))).toBe(false)
      expect(hasIntrinsicIteration(new Float64Array(2))).toBe(false)
    } finally {
      Object.defineProperty(typedArrayPrototype, Symbol.iterator, original as PropertyDescriptor)
    }
    expect(hasIntrinsicIteration(new Uint8Array(2))).toBe(true)
  })
})

describe('iteration authenticity', () => {
  it('rejects an override on the family prototype', () => {
    // The hole this closes: the check looked at the value's own property and
    // the shared %TypedArray%.prototype, and missed the family prototype
    // sitting between them.
    const source = new Uint8Array([1, 2, 3])
    const original = Object.getOwnPropertyDescriptor(Uint8Array.prototype, Symbol.iterator)
    Object.defineProperty(Uint8Array.prototype, Symbol.iterator, {
      value: function* () {
        yield 99
      },
      configurable: true,
    })
    try {
      expect([...source]).toEqual([99])
      expect(hasIntrinsicIteration(source)).toBe(false)
    } finally {
      if (original === undefined) delete (Uint8Array.prototype as never)[Symbol.iterator]
      else Object.defineProperty(Uint8Array.prototype, Symbol.iterator, original)
    }
    expect(hasIntrinsicIteration(new Uint8Array([1]))).toBe(true)
  })

  it('rejects an override on the value itself', () => {
    const source = new Uint8Array([1])
    Object.defineProperty(source, Symbol.iterator, {
      value: function* () {
        yield 1
      },
      configurable: true,
    })
    expect(hasIntrinsicIteration(source)).toBe(false)
  })
})
