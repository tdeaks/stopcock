// Seeded xorshift32 PRNG — deterministic across runs
function xorshift32(seed: number) {
  let state = seed
  return () => {
    state ^= state << 13
    state ^= state >> 17
    state ^= state << 5
    return (state >>> 0) / 0xFFFFFFFF
  }
}

const SIZES = [100, 1_000, 10_000, 100_000] as const
type Size = (typeof SIZES)[number]

const rand = xorshift32(42)

const CHARS = 'abcdefghijklmnopqrstuvwxyz'
function randomWord(length: number): string {
  let s = ''
  for (let i = 0; i < length; i++) s += CHARS[Math.floor(rand() * CHARS.length)]
  return s
}

// Pre-generate all data once at import time
const numbers = new Map<Size, number[]>()
const numbersWithDupes = new Map<Size, number[]>()
const strings = new Map<Size, string[]>()
const objects = new Map<Size, { id: number; name: string; active: boolean }[]>()

for (const n of SIZES) {
  const nums: number[] = []
  const strs: string[] = []
  const objs: { id: number; name: string; active: boolean }[] = []
  const dupes: number[] = []

  for (let i = 0; i < n; i++) {
    const v = rand()
    nums.push(v)
    strs.push(randomWord(5))
    objs.push({ id: i, name: randomWord(6), active: rand() > 0.3 })
    // ~30% duplicates: reuse a value from earlier in the array
    dupes.push(rand() < 0.3 && i > 0 ? dupes[Math.floor(rand() * i)] : Math.floor(rand() * n))
  }

  numbers.set(n, nums)
  numbersWithDupes.set(n, dupes)
  strings.set(n, strs)
  objects.set(n, objs)
}

type DataType = 'numbers' | 'numbersWithDupes' | 'strings' | 'objects'

const stores: Record<DataType, Map<Size, any>> = {
  numbers,
  numbersWithDupes,
  strings,
  objects,
}

export function getData<T = any>(type: DataType, size: Size): T[] {
  return stores[type].get(size)!
}

export { SIZES, type Size }
