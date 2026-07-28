import { describe, expect, it } from 'vite-plus/test'
import { err, isErr, isOk, ok } from '../result'
import * as Schema from '../schema'

describe('Standard Schema interop', () => {
  const positive = Schema.fromPredicate(
    (value: unknown): value is number => typeof value === 'number' && value > 0,
    () => Schema.issue('Expected a positive number', ['value']),
  )

  it('creates a synchronous Standard Schema V1 validator', () => {
    expect(positive['~standard'].version).toBe(1)
    expect(positive['~standard'].vendor).toBe('@stopcock/fp')
    expect(Schema.isStandardSchema(positive)).toBe(true)

    const valid = Schema.validateSync(positive)(2)
    const invalid = Schema.validateSync(positive)(-1)
    expect(isOk(valid) && valid.value).toBe(2)
    expect(isErr(invalid) && invalid.error[0]).toEqual({
      message: 'Expected a positive number',
      path: ['value'],
    })
  })

  it('normalizes strings, issues, and issue arrays', () => {
    expect(Schema.issues('bad')).toEqual([{ message: 'bad' }])
    const item = Schema.issue('bad', [{ key: 0 }])
    expect(Schema.issues(item)).toEqual([item])
    expect(Schema.issues([item])).toEqual([item])
  })

  it('accepts async decoders and exposes a uniform async consumer', async () => {
    const schema = Schema.make(async (value) =>
      typeof value === 'string' ? ok(value.length) : err('Expected a string'),
    )
    expect(await Schema.validate(schema)('four')).toEqual(ok(4))
    expect(isErr(await Schema.validate(schema)(4))).toBe(true)
    expect(() => Schema.validateSync(schema)('four')).toThrow(TypeError)
  })

  it('maps output and models optional and nullable boundaries without making sync schemas async', async () => {
    const labelled = Schema.map(positive, (value) => `n:${value}`)
    expect(Schema.validateSync(labelled)(2)).toEqual(ok('n:2'))
    expect(Schema.validateSync(Schema.optional(positive))(undefined)).toEqual(ok(undefined))
    expect(Schema.validateSync(Schema.nullable(positive))(null)).toEqual(ok(null))
    expect(await Schema.validate(labelled)(2)).toEqual(ok('n:2'))
    expect(await Schema.validate(Schema.optional(positive))(undefined)).toEqual(ok(undefined))
    expect(await Schema.validate(Schema.nullable(positive))(null)).toEqual(ok(null))
  })
})
