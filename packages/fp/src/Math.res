/** Adds two numbers. */
@genType
let add = (a: float, b: float): float => a +. b

/** Subtracts the second number from the first. */
@genType
let subtract = (a: float, b: float): float => a -. b

/** Multiplies two numbers. */
@genType
let multiply = (a: float, b: float): float => a *. b

/** Divides the first number by the second. Division by zero returns `Infinity`. */
@genType
let divide = (a: float, b: float): float => a /. b

/** Returns the remainder of dividing the first number by the second. */
@genType
let modulo = (a: float, b: float): float => mod_float(a, b)

/** Increments by one. */
@genType
let inc = (n: float): float => n +. 1.0

/** Decrements by one. */
@genType
let dec = (n: float): float => n -. 1.0

/** Negates a number. */
@genType
let negate = (n: float): float => -.n

/** Multiplies all elements. Returns `1` for an empty array. */
@genType
let product = (arr: array<float>): float => {
  let len = Array.length(arr)
  let acc = ref(1.0)
  for i in 0 to len - 1 {
    acc := acc.contents *. Belt.Array.getUnsafe(arr, i)
  }
  acc.contents
}

@genType
let sum = (arr: array<float>): float => {
  let len = Array.length(arr)
  let acc = ref(0.0)
  for i in 0 to len - 1 {
    acc := acc.contents +. Belt.Array.getUnsafe(arr, i)
  }
  acc.contents
}

@genType
let mean = (arr: array<float>): float => {
  let len = Array.length(arr)
  if len === 0 {
    0.0
  } else {
    sum(arr) /. Int.toFloat(len)
  }
}

@genType
let median = (arr: array<float>): float => {
  let len = Array.length(arr)
  if len === 0 {
    0.0
  } else {
    let sorted = Belt.Array.copy(arr)
    Belt.SortArray.stableSortInPlaceBy(sorted, (a, b) =>
      if a < b { -1 } else if a > b { 1 } else { 0 }
    )
    let mid = len / 2
    if mod(len, 2) === 0 {
      (Belt.Array.getUnsafe(sorted, mid - 1) +. Belt.Array.getUnsafe(sorted, mid)) /. 2.0
    } else {
      Belt.Array.getUnsafe(sorted, mid)
    }
  }
}

@genType
let mathMod = (a: int, b: int): int => {
  if b === 0 {
    0
  } else {
    let r = mod(a, b)
    if r < 0 {
      r + (if b < 0 { -b } else { b })
    } else {
      r
    }
  }
}
