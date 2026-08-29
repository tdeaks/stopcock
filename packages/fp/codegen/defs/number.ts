import { dual } from './dual-untagged'
import { none, some, type Option } from './option'

declare const finiteBrand: unique symbol
declare const integerBrand: unique symbol
declare const positiveBrand: unique symbol

export type Finite = number & { readonly [finiteBrand]: true }
export type Integer = number & { readonly [integerBrand]: true }
export type Positive = number & { readonly [positiveBrand]: true }

export const isFinite = (value: number): value is Finite => Number.isFinite(value)
export const isInteger = (value: number): value is Integer => Number.isInteger(value)
export const isPositive = (value: number): value is Positive => value > 0
export const isEven = (value: number): boolean => value % 2 === 0
export const isOdd = (value: number): boolean => value % 2 !== 0

export const clamp: {
  (value: number, minimum: number, maximum: number): number
  (minimum: number, maximum: number): (value: number) => number
} = /* @__PURE__ */ dual(3, (value: number, minimum: number, maximum: number): number => {
  const low = Math.min(minimum, maximum)
  const high = Math.max(minimum, maximum)
  return Math.min(Math.max(value, low), high)
},
  (minimum, maximum) => (value) => {
    const low = Math.min(minimum, maximum)
    const high = Math.max(minimum, maximum)
    return Math.min(Math.max(value, low), high)
  },
)

export const between: {
  (value: number, minimum: number, maximum: number): boolean
  (minimum: number, maximum: number): (value: number) => boolean
} = /* @__PURE__ */ dual(3, (value: number, minimum: number, maximum: number): boolean => {
  const low = Math.min(minimum, maximum)
  const high = Math.max(minimum, maximum)
  return value >= low && value <= high
},
  (minimum, maximum) => (value) => {
    const low = Math.min(minimum, maximum)
    const high = Math.max(minimum, maximum)
    return value >= low && value <= high
  },
)

export const sum = (values: readonly number[]): number => {
  let total = 0
  for (let index = 0; index < values.length; index++) total += values[index]
  return total
}

export const product = (values: readonly number[]): number => {
  let total = 1
  for (let index = 0; index < values.length; index++) total *= values[index]
  return total
}

export const meanOrUndefined = (values: readonly number[]): number | undefined =>
  values.length === 0 ? undefined : sum(values) / values.length

export const mean = (values: readonly number[]): Option<number> => {
  const value = meanOrUndefined(values)
  return value === undefined ? none : some(value)
}

export const meanNonEmpty = (values: readonly [number, ...number[]]): number =>
  sum(values) / values.length

export const weightedMeanOrUndefined: {
  (values: readonly number[], weights: readonly number[]): number | undefined
  (weights: readonly number[]): (values: readonly number[]) => number | undefined
} = /* @__PURE__ */ dual(
  2,
  (values: readonly number[], weights: readonly number[]): number | undefined => {
    if (values.length !== weights.length) {
      throw new RangeError('weightedMean: values and weights must have equal lengths')
    }
    let weighted = 0
    let totalWeight = 0
    for (let index = 0; index < values.length; index++) {
      weighted += values[index] * weights[index]
      totalWeight += weights[index]
    }
    return totalWeight === 0 ? undefined : weighted / totalWeight
  },
  (weights) => (values) => {
    if (values.length !== weights.length) {
      throw new RangeError('weightedMean: values and weights must have equal lengths')
    }
    let weighted = 0
    let totalWeight = 0
    for (let index = 0; index < values.length; index++) {
      weighted += values[index] * weights[index]
      totalWeight += weights[index]
    }
    return totalWeight === 0 ? undefined : weighted / totalWeight
  },
)

export const weightedMean: {
  (values: readonly number[], weights: readonly number[]): Option<number>
  (weights: readonly number[]): (values: readonly number[]) => Option<number>
} = /* @__PURE__ */ dual(
  2,
  (values: readonly number[], weights: readonly number[]): Option<number> => {
    const value = weightedMeanOrUndefined(weights)(values)
    return value === undefined ? none : some(value)
  },
  (weights) => (values) => {
    const value = weightedMeanOrUndefined(weights)(values)
    return value === undefined ? none : some(value)
  },
)

export const medianOrUndefined = (values: readonly number[]): number | undefined => {
  if (values.length === 0) return undefined
  const sorted = values.slice().sort((left, right) => left - right)
  const middle = sorted.length >>> 1
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

export const median = (values: readonly number[]): Option<number> => {
  const value = medianOrUndefined(values)
  return value === undefined ? none : some(value)
}

export const medianNonEmpty = (values: readonly [number, ...number[]]): number =>
  medianOrUndefined(values) as number

export const minOrUndefined = (values: readonly number[]): number | undefined => {
  if (values.length === 0) return undefined
  let value = values[0]
  for (let index = 1; index < values.length; index++) {
    if (values[index] < value) value = values[index]
  }
  return value
}

export const min = (values: readonly number[]): Option<number> => {
  const value = minOrUndefined(values)
  return value === undefined ? none : some(value)
}

export const minNonEmpty = (values: readonly [number, ...number[]]): number =>
  minOrUndefined(values) as number

export const maxOrUndefined = (values: readonly number[]): number | undefined => {
  if (values.length === 0) return undefined
  let value = values[0]
  for (let index = 1; index < values.length; index++) {
    if (values[index] > value) value = values[index]
  }
  return value
}

export const max = (values: readonly number[]): Option<number> => {
  const value = maxOrUndefined(values)
  return value === undefined ? none : some(value)
}

export const maxNonEmpty = (values: readonly [number, ...number[]]): number =>
  maxOrUndefined(values) as number

export const minMaxOrUndefined = (
  values: readonly number[],
): readonly [number, number] | undefined => {
  if (values.length === 0) return undefined
  let low = values[0]
  let high = values[0]
  for (let index = 1; index < values.length; index++) {
    const value = values[index]
    if (value < low) low = value
    if (value > high) high = value
  }
  return [low, high]
}

export const minMax = (values: readonly number[]): Option<readonly [number, number]> => {
  const value = minMaxOrUndefined(values)
  return value === undefined ? none : some(value)
}

export const minMaxNonEmpty = (values: readonly [number, ...number[]]): readonly [number, number] =>
  minMaxOrUndefined(values) as readonly [number, number]

const varianceFrom = (values: readonly number[], correction: 0 | 1): number | undefined => {
  if (values.length <= correction) return undefined
  // Welford's algorithm avoids the catastrophic cancellation of E[x²]-E[x]².
  let count = 0
  let currentMean = 0
  let squaredDistance = 0
  for (const value of values) {
    count++
    const delta = value - currentMean
    currentMean += delta / count
    squaredDistance += delta * (value - currentMean)
  }
  return squaredDistance / (count - correction)
}

export const variancePopulationOrUndefined = (values: readonly number[]): number | undefined =>
  varianceFrom(values, 0)

export const varianceSampleOrUndefined = (values: readonly number[]): number | undefined =>
  varianceFrom(values, 1)

export const variancePopulation = (values: readonly number[]): Option<number> => {
  const value = variancePopulationOrUndefined(values)
  return value === undefined ? none : some(value)
}

export const varianceSample = (values: readonly number[]): Option<number> => {
  const value = varianceSampleOrUndefined(values)
  return value === undefined ? none : some(value)
}

export const variance = variancePopulation
export const varianceOrUndefined = variancePopulationOrUndefined

export const variancePopulationNonEmpty = (values: readonly [number, ...number[]]): number =>
  variancePopulationOrUndefined(values) as number

export const varianceNonEmpty = variancePopulationNonEmpty

export const varianceSampleAtLeastTwo = (values: readonly [number, number, ...number[]]): number =>
  varianceSampleOrUndefined(values) as number

export const standardDeviationPopulationOrUndefined = (
  values: readonly number[],
): number | undefined => {
  const value = variancePopulationOrUndefined(values)
  return value === undefined ? undefined : Math.sqrt(value)
}

export const standardDeviationSampleOrUndefined = (
  values: readonly number[],
): number | undefined => {
  const value = varianceSampleOrUndefined(values)
  return value === undefined ? undefined : Math.sqrt(value)
}

export const standardDeviationPopulation = (values: readonly number[]): Option<number> => {
  const value = standardDeviationPopulationOrUndefined(values)
  return value === undefined ? none : some(value)
}

export const standardDeviationSample = (values: readonly number[]): Option<number> => {
  const value = standardDeviationSampleOrUndefined(values)
  return value === undefined ? none : some(value)
}

export const standardDeviation = standardDeviationPopulation
export const standardDeviationOrUndefined = standardDeviationPopulationOrUndefined

export const standardDeviationPopulationNonEmpty = (
  values: readonly [number, ...number[]],
): number => standardDeviationPopulationOrUndefined(values) as number

export const standardDeviationNonEmpty = standardDeviationPopulationNonEmpty

export const standardDeviationSampleAtLeastTwo = (
  values: readonly [number, number, ...number[]],
): number => standardDeviationSampleOrUndefined(values) as number

const interpolateSorted = (values: readonly number[], fraction: number): number | undefined => {
  if (values.length === 0) return undefined
  const sorted = values.slice().sort((left, right) => left - right)
  const position = fraction * (sorted.length - 1)
  const low = Math.floor(position)
  const high = Math.ceil(position)
  return sorted[low] + (position - low) * (sorted[high] - sorted[low])
}

export const quantileOrUndefined: {
  (values: readonly number[], q: number): number | undefined
  (q: number): (values: readonly number[]) => number | undefined
} = /* @__PURE__ */ dual(2, (values: readonly number[], q: number): number | undefined => {
  if (q < 0 || q > 1 || Number.isNaN(q)) {
    throw new RangeError('quantile: q must be in the inclusive range [0, 1]')
  }
  return interpolateSorted(values, q)
},
  (q) => (values) => {
  if (q < 0 || q > 1 || Number.isNaN(q)) {
    throw new RangeError('quantile: q must be in the inclusive range [0, 1]')
  }
  return interpolateSorted(values, q)
},
)

export const quantile: {
  (values: readonly number[], q: number): Option<number>
  (q: number): (values: readonly number[]) => Option<number>
} = /* @__PURE__ */ dual(2, (values: readonly number[], q: number): Option<number> => {
  const value = quantileOrUndefined(q)(values)
  return value === undefined ? none : some(value)
},
  (q) => (values) => {
    const value = quantileOrUndefined(q)(values)
    return value === undefined ? none : some(value)
  },
)

export const quantileNonEmpty: {
  (values: readonly [number, ...number[]], q: number): number
  (q: number): (values: readonly [number, ...number[]]) => number
} = /* @__PURE__ */ dual(
  2,
  (values: readonly [number, ...number[]], q: number): number =>
    quantileOrUndefined(q)(values) as number,
  (q) => (values) =>
  quantileOrUndefined(q)(values) as number,
)

export const percentileOrUndefined: {
  (values: readonly number[], p: number): number | undefined
  (p: number): (values: readonly number[]) => number | undefined
} = /* @__PURE__ */ dual(2, (values: readonly number[], p: number): number | undefined => {
  if (p < 0 || p > 100 || Number.isNaN(p)) {
    throw new RangeError('percentile: p must be in the inclusive range [0, 100]')
  }
  return interpolateSorted(values, p / 100)
},
  (p) => (values) => {
  if (p < 0 || p > 100 || Number.isNaN(p)) {
    throw new RangeError('percentile: p must be in the inclusive range [0, 100]')
  }
  return interpolateSorted(values, p / 100)
},
)

export const percentile: {
  (values: readonly number[], p: number): Option<number>
  (p: number): (values: readonly number[]) => Option<number>
} = /* @__PURE__ */ dual(2, (values: readonly number[], p: number): Option<number> => {
  const value = percentileOrUndefined(p)(values)
  return value === undefined ? none : some(value)
},
  (p) => (values) => {
    const value = percentileOrUndefined(p)(values)
    return value === undefined ? none : some(value)
  },
)

export const percentileNonEmpty: {
  (values: readonly [number, ...number[]], p: number): number
  (p: number): (values: readonly [number, ...number[]]) => number
} = /* @__PURE__ */ dual(
  2,
  (values: readonly [number, ...number[]], p: number): number =>
    percentileOrUndefined(p)(values) as number,
  (p) => (values) =>
  percentileOrUndefined(p)(values) as number,
)

export const dotProduct: {
  (left: readonly number[], right: readonly number[]): number
  (right: readonly number[]): (left: readonly number[]) => number
} = /* @__PURE__ */ dual(2, (left: readonly number[], right: readonly number[]): number => {
  if (left.length !== right.length) {
    throw new RangeError('dotProduct: vectors must have equal lengths')
  }
  let total = 0
  for (let index = 0; index < left.length; index++) total += left[index] * right[index]
  return total
},
  (right) => (left) => {
    if (left.length !== right.length) {
      throw new RangeError('dotProduct: vectors must have equal lengths')
    }
    let total = 0
    for (let index = 0; index < left.length; index++) total += left[index] * right[index]
    return total
  },
)

export const dotProductTruncate: {
  (left: readonly number[], right: readonly number[]): number
  (right: readonly number[]): (left: readonly number[]) => number
} = /* @__PURE__ */ dual(2, (left: readonly number[], right: readonly number[]): number => {
  const length = Math.min(left.length, right.length)
  let total = 0
  for (let index = 0; index < length; index++) total += left[index] * right[index]
  return total
},
  (right) => (left) => {
  const length = Math.min(left.length, right.length)
  let total = 0
  for (let index = 0; index < length; index++) total += left[index] * right[index]
  return total
},
)

export const gcd: {
  (left: number, right: number): number
  (right: number): (left: number) => number
} = /* @__PURE__ */ dual(2, (left: number, right: number): number => {
  let a = Math.abs(Math.trunc(left))
  let b = Math.abs(Math.trunc(right))
  while (b !== 0) {
    const remainder = a % b
    a = b
    b = remainder
  }
  return a
},
  (right) => (left) => {
  let a = Math.abs(Math.trunc(left))
  let b = Math.abs(Math.trunc(right))
  while (b !== 0) {
    const remainder = a % b
    a = b
    b = remainder
  }
  return a
},
)

export const lcm: {
  (left: number, right: number): number
  (right: number): (left: number) => number
} = /* @__PURE__ */ dual(2, (left: number, right: number): number =>
  left === 0 || right === 0 ? 0 : Math.abs((left / gcd(right)(left)) * right),
  (right) => (left) =>
    left === 0 || right === 0 ? 0 : Math.abs((left / gcd(right)(left)) * right),
)

export const parseFinite = (input: string): Option<Finite> => {
  if (input.trim() === '') return none
  const value = Number(input)
  return Number.isFinite(value) ? some(value as Finite) : none
}

const parseIntegerValue = (input: string, radix = 10): Option<Integer> => {
  if (!Number.isInteger(radix) || radix < 2 || radix > 36) {
    throw new RangeError('parseInteger: radix must be an integer from 2 through 36')
  }
  const normalized = input.trim()
  if (normalized === '') return none
  const value = Number.parseInt(normalized, radix)
  return Number.isInteger(value) ? some(value as Integer) : none
}

export const parseInteger: {
  (input: string, radix?: number): Option<Integer>
  (radix?: number): (input: string) => Option<Integer>
} = function parseInteger(
  inputOrRadix?: string | number,
  maybeRadix: number = 10,
): Option<Integer> | ((input: string) => Option<Integer>) {
  if (typeof inputOrRadix === 'string') {
    return parseIntegerValue(inputOrRadix, maybeRadix)
  }
  const radix = inputOrRadix ?? 10
  return (input: string): Option<Integer> => parseIntegerValue(input, radix)
} as {
  (input: string, radix?: number): Option<Integer>
  (radix?: number): (input: string) => Option<Integer>
}

export type RoundingMode = 'round' | 'floor' | 'ceil' | 'trunc'

export const roundTo: {
  (value: number, digits: number, mode?: RoundingMode): number
  (digits: number, mode?: RoundingMode): (value: number) => number
} = function roundTo(
  valueOrDigits: number,
  digitsOrMode?: number | RoundingMode,
  maybeMode: RoundingMode = 'round',
): number | ((value: number) => number) {
  if (typeof digitsOrMode === 'number') {
    const digits = Math.trunc(digitsOrMode)
    const factor = 10 ** digits
    return Math[maybeMode](valueOrDigits * factor) / factor
  }
  const digits = valueOrDigits
  const mode = digitsOrMode ?? 'round'
  return (value) => {
    const factor = 10 ** Math.trunc(digits)
    return Math[mode](value * factor) / factor
  }
} as {
  (value: number, digits: number, mode?: RoundingMode): number
  (digits: number, mode?: RoundingMode): (value: number) => number
}
