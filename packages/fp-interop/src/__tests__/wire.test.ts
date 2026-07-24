import { describe, expect, it } from 'vite-plus/test'
import * as Option from '@stopcock/fp/option'
import * as Result from '@stopcock/fp/result'
import {
  asJsonValue,
  decodeOptionWire,
  decodeResultWire,
  deserializeOption,
  deserializeResult,
  encodeOptionWire,
  encodeResultWire,
  serializeOption,
  serializeResult,
} from '../wire'

const decodeNumber = (input: unknown): Result.Result<number, string> =>
  typeof input === 'number'
    ? Result.ok(input)
    : Result.err('Expected a number')

const decodeString = (input: unknown): Result.Result<string, string> =>
  typeof input === 'string'
    ? Result.ok(input)
    : Result.err('Expected a string')

describe('JSON-safe wire values', () => {
  it('encodes Option and Result into distinct tagged wire shapes', () => {
    expect(encodeOptionWire(Option.none, String)).toEqual(
      Result.ok({ _tag: 'None' }),
    )
    expect(encodeOptionWire(Option.some(2), (value) => value)).toEqual(
      Result.ok({ _tag: 'Some', value: 2 }),
    )
    expect(
      encodeResultWire(Result.err('bad'), Number, (error) => error),
    ).toEqual(Result.ok({ _tag: 'Err', error: 'bad' }))
  })

  it('rejects non-JSON values, non-finite numbers, sparse arrays, and cycles', () => {
    expect(asJsonValue(undefined)._tag).toBe(0)
    expect(asJsonValue(Number.NaN)._tag).toBe(0)
    expect(asJsonValue(new Date())._tag).toBe(0)

    const sparse: unknown[] = []
    sparse.length = 1
    expect(asJsonValue(sparse)._tag).toBe(0)

    const cyclic: { self?: unknown } = {}
    cyclic.self = cyclic
    expect(asJsonValue(cyclic)._tag).toBe(0)

    const revoked = Proxy.revocable({ value: 1 }, {})
    revoked.revoke()
    expect(asJsonValue(revoked.proxy)._tag).toBe(0)
    expect(
      encodeOptionWire(Option.some(1), () => {
        throw new Error('encoder failed')
      })._tag,
    ).toBe(0)
  })

  it('decodes unknown payloads only through explicit decoders', () => {
    expect(
      decodeOptionWire({ _tag: 'Some', value: 2 }, decodeNumber),
    ).toEqual(Result.ok(Option.some(2)))
    expect(
      decodeOptionWire({ _tag: 'Some', value: '2' }, decodeNumber),
    ).toEqual(
      Result.err({
        _tag: 'PayloadDecodeError',
        field: 'value',
        error: 'Expected a number',
      }),
    )
    expect(
      decodeResultWire(
        { _tag: 'Err', error: 'bad' },
        decodeNumber,
        decodeString,
      ),
    ).toEqual(Result.ok(Result.err('bad')))
    expect(
      decodeResultWire(
        { _tag: 'Ok', value: 3 },
        decodeNumber,
        decodeString,
      ),
    ).toEqual(Result.ok(Result.ok(3)))
    expect(
      decodeOptionWire({ _tag: 'Some', value: 1 }, () => {
        throw new Error('decoder failed')
      }),
    ).toMatchObject({
      _tag: 0,
      error: {
        _tag: 'PayloadDecoderThrew',
        field: 'value',
      },
    })
  })

  it('serializes and deserializes without trusting parsed JSON', () => {
    const encodedOption = serializeOption(Option.some(2), (value) => value)
    expect(encodedOption).toEqual(Result.ok('{"_tag":"Some","value":2}'))
    if (encodedOption._tag === 1) {
      expect(deserializeOption(encodedOption.value, decodeNumber)).toEqual(
        Result.ok(Option.some(2)),
      )
    }

    const encodedResult = serializeResult(
      Result.err('bad'),
      (value: number) => value,
      (error) => error,
    )
    expect(encodedResult).toEqual(Result.ok('{"_tag":"Err","error":"bad"}'))
    if (encodedResult._tag === 1) {
      expect(
        deserializeResult(encodedResult.value, decodeNumber, decodeString),
      ).toEqual(Result.ok(Result.err('bad')))
    }

    expect(deserializeOption('{bad json', decodeNumber)._tag).toBe(0)
    expect(
      deserializeResult(
        '{"_tag":"Ok","value":"not a number"}',
        decodeNumber,
        decodeString,
      )._tag,
    ).toBe(0)
  })
})
