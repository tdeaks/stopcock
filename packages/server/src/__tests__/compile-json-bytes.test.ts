import { describe, it, expect } from 'vitest'
import { compileJsonSerializerWithBytes } from '../compile-json'

describe('compileJsonSerializerWithBytes — schemas with no strings', () => {
  it('number-only schema reports body.length as byteLength', () => {
    const ser = compileJsonSerializerWithBytes({ type: 'number' })
    const r = ser(42)
    expect(r.body).toBe('42')
    expect(r.byteLength).toBe(2)
  })

  it('boolean schema reports body.length', () => {
    const ser = compileJsonSerializerWithBytes({ type: 'boolean' })
    expect(ser(true)).toEqual({ body: 'true', byteLength: 4 })
    expect(ser(false)).toEqual({ body: 'false', byteLength: 5 })
  })

  it('object with only numeric fields reports byteLength', () => {
    const ser = compileJsonSerializerWithBytes({
      type: 'object',
      properties: { a: { type: 'number' }, b: { type: 'boolean' } },
      required: ['a', 'b'],
    })
    const r = ser({ a: 1, b: true })
    expect(r.body).toBe('{"a":1,"b":true}')
    expect(r.byteLength).toBe(r.body.length)
  })

  it('array of integers reports byteLength', () => {
    const ser = compileJsonSerializerWithBytes({ type: 'array', items: { type: 'number' } })
    const r = ser([1, 2, 3])
    expect(r.body).toBe('[1,2,3]')
    expect(r.byteLength).toBe(7)
  })
})

describe('compileJsonSerializerWithBytes — strings', () => {
  const ser = compileJsonSerializerWithBytes({ type: 'string' })

  it('clean ASCII string reports body.length', () => {
    const r = ser('hello world')
    expect(r.body).toBe('"hello world"')
    expect(r.byteLength).toBe(13)
  })

  it('string with non-ASCII char reports null byteLength', () => {
    const r = ser('café')
    // é is a single codepoint but multi-byte in UTF-8
    expect(r.body).toBe('"café"')
    expect(r.byteLength).toBeNull()
  })

  it('string requiring JSON.stringify (control char) reports null byteLength', () => {
    const r = ser('a\nb')
    expect(r.body).toBe('"a\\nb"')
    expect(r.byteLength).toBeNull()
  })

  it('string with embedded quote reports null byteLength', () => {
    const r = ser('he said "hi"')
    expect(r.body).toBe('"he said \\"hi\\""')
    expect(r.byteLength).toBeNull()
  })

  it('null string emits JSON null and stays ASCII-clean', () => {
    const r = ser(null)
    expect(r.body).toBe('null')
    expect(r.byteLength).toBe(4)
  })
})

describe('compileJsonSerializerWithBytes — mixed schemas', () => {
  const userSchema = {
    type: 'object',
    properties: {
      id: { type: 'string' },
      age: { type: 'number' },
      active: { type: 'boolean' },
    },
    required: ['id', 'age', 'active'],
  } as const

  const ser = compileJsonSerializerWithBytes(userSchema as never)

  it('all-ASCII user object reports byteLength', () => {
    const r = ser({ id: 'user-42', age: 30, active: true })
    expect(r.body).toBe('{"id":"user-42","age":30,"active":true}')
    expect(r.byteLength).toBe(r.body.length)
  })

  it('user object with non-ASCII string reports null byteLength', () => {
    const r = ser({ id: 'José', age: 30, active: true })
    expect(r.byteLength).toBeNull()
    expect(r.body).toContain('José')
  })

  it('first string non-ASCII flips byteLength for the whole serialize call', () => {
    const arrSchema = {
      type: 'array',
      items: { type: 'string' },
    } as const
    const arrSer = compileJsonSerializerWithBytes(arrSchema as never)
    expect(arrSer(['café', 'plain']).byteLength).toBeNull()
    expect(arrSer(['plain', 'plain']).byteLength).toBe(17)  // ["plain","plain"]
  })
})

describe('compileJsonSerializerWithBytes — output parity with regular compiler', () => {
  it('produces identical body to JSON.stringify for various shapes', async () => {
    const { compileJsonSerializer } = await import('../compile-json')
    const cases: { schema: any; value: unknown }[] = [
      { schema: { type: 'number' }, value: 7 },
      { schema: { type: 'string' }, value: 'plain text' },
      { schema: { type: 'array', items: { type: 'number' } }, value: [1, 2, 3] },
      {
        schema: {
          type: 'object',
          properties: { a: { type: 'string' }, b: { type: 'boolean' } },
          required: ['a', 'b'],
        },
        value: { a: 'hi', b: false },
      },
    ]
    for (const { schema, value } of cases) {
      const sb = compileJsonSerializerWithBytes(schema)
      const s = compileJsonSerializer(schema)
      expect(sb(value).body).toBe(s(value))
    }
  })
})
