import { none, some, type Option } from '@stopcock/fp/option'
import { err, ok, type Result } from '@stopcock/fp/result'
import { hasOwn, isObject } from './internal'

export type JsonPrimitive = string | number | boolean | null
export type JsonValue =
  | JsonPrimitive
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue }

export interface JsonEncodingError {
  readonly _tag: 'JsonEncodingError'
  readonly path: readonly (string | number)[]
  readonly message: string
}

const encodingError = (
  path: readonly (string | number)[],
  message: string,
): JsonEncodingError => ({
  _tag: 'JsonEncodingError',
  path,
  message,
})

const inspectJsonValueUnchecked = (
  input: unknown,
  path: readonly (string | number)[],
  ancestors: ReadonlySet<object>,
): Result<JsonValue, JsonEncodingError> => {
  if (
    input === null ||
    typeof input === 'string' ||
    typeof input === 'boolean'
  ) {
    return ok(input)
  }
  if (typeof input === 'number') {
    return Number.isFinite(input)
      ? ok(input)
      : err(encodingError(path, 'JSON numbers must be finite'))
  }
  if (!isObject(input)) {
    return err(
      encodingError(
        path,
        `Expected a JSON value, received ${typeof input}`,
      ),
    )
  }
  if (ancestors.has(input)) {
    return err(encodingError(path, 'JSON values cannot contain cycles'))
  }

  const nextAncestors = new Set(ancestors)
  nextAncestors.add(input)

  if (Array.isArray(input)) {
    const output: JsonValue[] = []
    for (let index = 0; index < input.length; index++) {
      if (!hasOwn(input, index)) {
        return err(
          encodingError([...path, index], 'Sparse arrays are not JSON-safe wire values'),
        )
      }
      const item = inspectJsonValue(input[index], [...path, index], nextAncestors)
      if (item._tag === 0) return item
      output.push(item.value)
    }
    return ok(output)
  }

  const prototype = Object.getPrototypeOf(input)
  if (prototype !== Object.prototype && prototype !== null) {
    return err(
      encodingError(path, 'Expected a plain object, array, or JSON primitive'),
    )
  }

  const symbolKeys = Object.getOwnPropertySymbols(input)
  if (symbolKeys.length > 0) {
    return err(encodingError(path, 'JSON objects cannot contain symbol keys'))
  }

  const output: Record<string, JsonValue> = Object.create(null)
  for (const key of Object.keys(input)) {
    let raw: unknown
    try {
      raw = (input as Record<string, unknown>)[key]
    } catch {
      return err(encodingError([...path, key], 'Property access threw'))
    }
    const item = inspectJsonValue(raw, [...path, key], nextAncestors)
    if (item._tag === 0) return item
    output[key] = item.value
  }
  return ok(output)
}

function inspectJsonValue(
  input: unknown,
  path: readonly (string | number)[],
  ancestors: ReadonlySet<object>,
): Result<JsonValue, JsonEncodingError> {
  try {
    return inspectJsonValueUnchecked(input, path, ancestors)
  } catch {
    return err(encodingError(path, 'Inspecting the candidate JSON value threw'))
  }
}

export function asJsonValue(
  input: unknown,
): Result<JsonValue, JsonEncodingError> {
  return inspectJsonValue(input, [], new Set())
}

const encodeJsonPayload = (
  encode: () => unknown,
  field: 'value' | 'error',
): Result<JsonValue, JsonEncodingError> => {
  let input: unknown
  try {
    input = encode()
  } catch {
    return err(encodingError([field], 'Payload encoder threw'))
  }
  return inspectJsonValue(input, [field], new Set())
}

export type OptionWire<A extends JsonValue = JsonValue> =
  | { readonly _tag: 'None' }
  | { readonly _tag: 'Some'; readonly value: A }

export type ResultWire<
  A extends JsonValue = JsonValue,
  E extends JsonValue = JsonValue,
> =
  | { readonly _tag: 'Err'; readonly error: E }
  | { readonly _tag: 'Ok'; readonly value: A }

export function encodeOptionWire<A>(
  value: Option<A>,
  encodeValue: (value: A) => unknown,
): Result<OptionWire, JsonEncodingError> {
  if (value._tag === 0) return ok({ _tag: 'None' })
  const encoded = encodeJsonPayload(() => encodeValue(value.value), 'value')
  return encoded._tag === 0
    ? encoded
    : ok({ _tag: 'Some', value: encoded.value })
}

export function encodeResultWire<A, E>(
  value: Result<A, E>,
  encodeValue: (value: A) => unknown,
  encodeError: (error: E) => unknown,
): Result<ResultWire, JsonEncodingError> {
  const encoded = value._tag === 1
    ? encodeJsonPayload(() => encodeValue(value.value), 'value')
    : encodeJsonPayload(() => encodeError(value.error), 'error')
  if (encoded._tag === 0) return encoded
  return value._tag === 1
    ? ok({ _tag: 'Ok', value: encoded.value })
    : ok({ _tag: 'Err', error: encoded.value })
}

export interface InvalidWireShape {
  readonly _tag: 'InvalidWireShape'
  readonly message: string
}

export interface PayloadDecodeError<E> {
  readonly _tag: 'PayloadDecodeError'
  readonly field: 'value' | 'error'
  readonly error: E
}

export interface PayloadDecoderThrew {
  readonly _tag: 'PayloadDecoderThrew'
  readonly field: 'value' | 'error'
  readonly error: unknown
}

export type WireDecodeError<E> =
  | InvalidWireShape
  | PayloadDecodeError<E>
  | PayloadDecoderThrew

const invalidWire = (message: string): InvalidWireShape => ({
  _tag: 'InvalidWireShape',
  message,
})

export function decodeOptionWire<A, E>(
  input: unknown,
  decodeValue: (input: unknown) => Result<A, E>,
): Result<Option<A>, WireDecodeError<E>> {
  let payload: unknown
  try {
    if (!isObject(input) || !hasOwn(input, '_tag')) {
      return err(invalidWire('Expected an object with an own _tag property'))
    }
    const tag = (input as { readonly _tag?: unknown })._tag
    if (tag === 'None') return ok(none)
    if (tag !== 'Some') {
      return err(invalidWire('Expected _tag to be "None" or "Some"'))
    }
    if (!hasOwn(input, 'value')) {
      return err(invalidWire('Expected Some to contain an own value property'))
    }
    payload = (input as { readonly value?: unknown }).value
  } catch {
    return err(invalidWire('Inspecting the Option wire value threw'))
  }

  let decoded: Result<A, E>
  try {
    decoded = decodeValue(payload)
  } catch (error) {
    return err({ _tag: 'PayloadDecoderThrew', field: 'value', error })
  }
  return decoded._tag === 0
    ? err({ _tag: 'PayloadDecodeError', field: 'value', error: decoded.error })
    : ok(some(decoded.value))
}

export function decodeResultWire<A, E, ValueError, ErrorError>(
  input: unknown,
  decodeValue: (input: unknown) => Result<A, ValueError>,
  decodeError: (input: unknown) => Result<E, ErrorError>,
): Result<Result<A, E>, WireDecodeError<ValueError | ErrorError>> {
  let tag: unknown
  try {
    if (!isObject(input) || !hasOwn(input, '_tag')) {
      return err(invalidWire('Expected an object with an own _tag property'))
    }
    tag = (input as { readonly _tag?: unknown })._tag
  } catch {
    return err(invalidWire('Inspecting the Result wire value threw'))
  }

  if (tag === 'Ok') {
    let payload: unknown
    try {
      if (!hasOwn(input, 'value')) {
        return err(invalidWire('Expected Ok to contain an own value property'))
      }
      payload = (input as { readonly value?: unknown }).value
    } catch {
      return err(invalidWire('Inspecting the Ok wire value threw'))
    }
    let decoded: Result<A, ValueError>
    try {
      decoded = decodeValue(payload)
    } catch (error) {
      return err({ _tag: 'PayloadDecoderThrew', field: 'value', error })
    }
    return decoded._tag === 0
      ? err({
          _tag: 'PayloadDecodeError',
          field: 'value',
          error: decoded.error,
        })
      : ok(ok(decoded.value))
  }
  if (tag === 'Err') {
    let payload: unknown
    try {
      if (!hasOwn(input, 'error')) {
        return err(invalidWire('Expected Err to contain an own error property'))
      }
      payload = (input as { readonly error?: unknown }).error
    } catch {
      return err(invalidWire('Inspecting the Err wire value threw'))
    }
    let decoded: Result<E, ErrorError>
    try {
      decoded = decodeError(payload)
    } catch (error) {
      return err({ _tag: 'PayloadDecoderThrew', field: 'error', error })
    }
    return decoded._tag === 0
      ? err({
          _tag: 'PayloadDecodeError',
          field: 'error',
          error: decoded.error,
        })
      : ok(err(decoded.value))
  }
  return err(invalidWire('Expected _tag to be "Ok" or "Err"'))
}

export interface JsonSyntaxError {
  readonly _tag: 'JsonSyntaxError'
  readonly error: unknown
}

export type WireDeserializationError<E> =
  | JsonSyntaxError
  | WireDecodeError<E>

const stringifyWire = (
  wire: JsonValue,
): Result<string, JsonEncodingError> => {
  try {
    return ok(JSON.stringify(wire))
  } catch {
    return err(encodingError([], 'JSON serialization threw'))
  }
}

export function serializeOption<A>(
  value: Option<A>,
  encodeValue: (value: A) => unknown,
): Result<string, JsonEncodingError> {
  const wire = encodeOptionWire(value, encodeValue)
  return wire._tag === 0 ? wire : stringifyWire(wire.value)
}

export function serializeResult<A, E>(
  value: Result<A, E>,
  encodeValue: (value: A) => unknown,
  encodeError: (error: E) => unknown,
): Result<string, JsonEncodingError> {
  const wire = encodeResultWire(value, encodeValue, encodeError)
  return wire._tag === 0 ? wire : stringifyWire(wire.value)
}

export function deserializeOption<A, E>(
  text: string,
  decodeValue: (input: unknown) => Result<A, E>,
): Result<Option<A>, WireDeserializationError<E>> {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (error) {
    return err({ _tag: 'JsonSyntaxError', error })
  }
  return decodeOptionWire(parsed, decodeValue)
}

export function deserializeResult<A, E, ValueError, ErrorError>(
  text: string,
  decodeValue: (input: unknown) => Result<A, ValueError>,
  decodeError: (input: unknown) => Result<E, ErrorError>,
): Result<
  Result<A, E>,
  WireDeserializationError<ValueError | ErrorError>
> {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (error) {
    return err({ _tag: 'JsonSyntaxError', error })
  }
  return decodeResultWire(parsed, decodeValue, decodeError)
}
