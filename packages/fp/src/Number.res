/** Clamps a value between `min` and `max`. Swaps bounds if `min > max`. */
@genType
let clamp = (value: float, min: float, max: float): float => {
  let (lo, hi) = min > max ? (max, min) : (min, max)
  Math.min(Math.max(value, lo), hi)
}

/** Checks whether an integer is even. */
@genType
let isEven = (n: int): bool => mod(n, 2) === 0

/** Checks whether an integer is odd. */
@genType
let isOdd = (n: int): bool => mod(n, 2) !== 0

@genType
let ceil = (n: float): float => Math.ceil(n)

@genType
let floor = (n: float): float => Math.floor(n)

@genType
let round = (n: float): float => Math.round(n)
