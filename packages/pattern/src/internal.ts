export const matcherSymbol: unique symbol = Symbol('@stopcock/pattern/matcher')
export const selectionSymbol: unique symbol = Symbol('@stopcock/pattern/selection')
export const negativeSymbol: unique symbol = Symbol('@stopcock/pattern/negative')

export interface Capture {
  readonly key: string
  readonly value: unknown
}

export type Captures = Capture[]

export interface RuntimeMatcher {
  readonly [matcherSymbol]: (value: unknown, captures: Captures) => boolean
}

const isRuntimeMatcher = (value: unknown): value is RuntimeMatcher =>
  (typeof value === 'object' || typeof value === 'function') &&
  value !== null &&
  matcherSymbol in value

const isObjectLike = (value: unknown): value is object =>
  (typeof value === 'object' && value !== null) || typeof value === 'function'

export function matchPatternInternal(
  pattern: unknown,
  value: unknown,
  captures: Captures,
): boolean {
  const checkpoint = captures.length
  let matched = false

  if (isRuntimeMatcher(pattern)) {
    matched = pattern[matcherSymbol](value, captures)
  } else if (Array.isArray(pattern)) {
    if (Array.isArray(value) && pattern.length === value.length) {
      matched = true
      for (let index = 0; index < pattern.length; index++) {
        if (!matchPatternInternal(pattern[index], value[index], captures)) {
          matched = false
          break
        }
      }
    }
  } else if (isObjectLike(pattern)) {
    if (isObjectLike(value)) {
      matched = true
      for (const key of Reflect.ownKeys(pattern)) {
        if (
          Object.prototype.propertyIsEnumerable.call(pattern, key) &&
          !matchPatternInternal(Reflect.get(pattern, key), Reflect.get(value, key), captures)
        ) {
          matched = false
          break
        }
      }
    }
  } else {
    matched = Object.is(pattern, value)
  }

  if (!matched) captures.length = checkpoint
  return matched
}

export const capturesToObject = (
  captures: readonly Capture[],
): Readonly<Record<string, unknown>> => {
  if (captures.length === 0) return emptySelections
  const selections: Record<string, unknown> = Object.create(null)
  for (let index = 0; index < captures.length; index++) {
    const capture = captures[index]
    selections[capture.key] = capture.value
  }
  return selections
}

export const emptySelections: Readonly<Record<string, never>> = Object.freeze(
  Object.create(null) as Record<string, never>,
)
