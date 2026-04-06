import { dual } from './dual'

export const isEven = (n: number): boolean => n % 2 === 0
export const isOdd = (n: number): boolean => n % 2 !== 0

export const clamp: {
  (value: number, min: number, max: number): number
  (min: number, max: number): (value: number) => number
} = dual(3, (value: number, lo: number, hi: number): number =>
  Math.min(Math.max(value, lo < hi ? lo : hi), lo < hi ? hi : lo),
)

// Stats. Pure TypeScript

export const sum = (nums: number[]): number => {
  let total = 0
  for (let i = 0; i < nums.length; i++) total += nums[i]
  return total
}

export const mean = (nums: number[]): number =>
  nums.length === 0 ? NaN : sum(nums) / nums.length

export const median = (nums: number[]): number => {
  if (nums.length === 0) return NaN
  const sorted = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2
}

export const variance = (nums: number[]): number => {
  const n = nums.length
  if (n === 0) return NaN
  let total = 0
  for (let i = 0; i < n; i++) total += nums[i]
  const m = total / n
  let v = 0
  for (let i = 0; i < n; i++) { const d = nums[i] - m; v += d * d }
  return v / n
}

export const standardDeviation = (nums: number[]): number => {
  const n = nums.length
  if (n === 0) return NaN
  let total = 0
  for (let i = 0; i < n; i++) total += nums[i]
  const m = total / n
  let v = 0
  for (let i = 0; i < n; i++) { const d = nums[i] - m; v += d * d }
  return Math.sqrt(v / n)
}

export const min = (nums: number[]): number => {
  let m = nums[0]
  for (let i = 1; i < nums.length; i++) if (nums[i] < m) m = nums[i]
  return m
}

export const max = (nums: number[]): number => {
  let m = nums[0]
  for (let i = 1; i < nums.length; i++) if (nums[i] > m) m = nums[i]
  return m
}

export const minMax = (nums: number[]): [number, number] => {
  if (nums.length === 0) return [Infinity, -Infinity]
  let lo = nums[0]
  let hi = nums[0]
  for (let i = 1; i < nums.length; i++) {
    if (nums[i] < lo) lo = nums[i]
    if (nums[i] > hi) hi = nums[i]
  }
  return [lo, hi]
}

export const percentile: {
  (nums: number[], p: number): number
  (p: number): (nums: number[]) => number
} = dual(2, (nums: number[], p: number): number => {
  if (nums.length === 0) return NaN
  const sorted = [...nums].sort((a, b) => a - b)
  const idx = (p / 100) * (sorted.length - 1)
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  const frac = idx - lo
  return sorted[lo] + frac * (sorted[hi] - sorted[lo])
})

export const dotProduct: {
  (a: number[], b: number[]): number
  (b: number[]): (a: number[]) => number
} = dual(2, (a: number[], b: number[]): number => {
  const len = Math.min(a.length, b.length)
  let total = 0
  for (let i = 0; i < len; i++) total += a[i] * b[i]
  return total
})
