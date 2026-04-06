@genType
let gt = (a: float, b: float): bool => a > b

@genType
let gte = (a: float, b: float): bool => a >= b

@genType
let lt = (a: float, b: float): bool => a < b

@genType
let lte = (a: float, b: float): bool => a <= b

@genType
let min = (a: float, b: float): float => if a < b { a } else { b }

@genType
let max = (a: float, b: float): float => if a > b { a } else { b }

@genType
let minBy = (f: 'a => float, a: 'a, b: 'a): 'a => if f(a) <= f(b) { a } else { b }

@genType
let maxBy = (f: 'a => float, a: 'a, b: 'a): 'a => if f(a) >= f(b) { a } else { b }

let identicalRaw: ('a, 'a) => bool = %raw(`
  function(a, b) { return Object.is(a, b); }
`)
@genType
let identical = (a: 'a, b: 'a): bool => identicalRaw(a, b)

@genType
let eqBy = (f: 'a => 'b, a: 'a, b: 'a): bool => f(a) == f(b)

@genType
let sortWith = (arr: array<'a>, comparators: array<('a, 'a) => int>): array<'a> => {
  let out = Belt.Array.copy(arr)
  let numComps = Array.length(comparators)
  out->Array.sort((a, b) => {
    let result = ref(0.0)
    let i = ref(0)
    while i.contents < numComps && result.contents === 0.0 {
      let cmp = Belt.Array.getUnsafe(comparators, i.contents)
      let r = cmp(a, b)
      if r !== 0 {
        result := if r < 0 { -1.0 } else { 1.0 }
      }
      i := i.contents + 1
    }
    result.contents
  })
  out
}

@genType
let countBy = (arr: array<'a>, f: 'a => string): Dict.t<int> => {
  let len = Array.length(arr)
  let dict = Dict.make()
  for i in 0 to len - 1 {
    let key = f(Belt.Array.getUnsafe(arr, i))
    switch Dict.get(dict, key) {
    | Some(n) => Dict.set(dict, key, n + 1)
    | None => Dict.set(dict, key, 1)
    }
  }
  dict
}

@genType
let innerJoin = (a: array<'a>, b: array<'b>, pred: ('a, 'b) => bool): array<'a> => {
  let lenA = Array.length(a)
  let lenB = Array.length(b)
  let result = []
  for i in 0 to lenA - 1 {
    let x = Belt.Array.getUnsafe(a, i)
    let j = ref(0)
    let found = ref(false)
    while j.contents < lenB && !found.contents {
      if pred(x, Belt.Array.getUnsafe(b, j.contents)) {
        found := true
        result->Array.push(x)
      }
      j := j.contents + 1
    }
  }
  result
}

let pathEqRaw: (array<string>, 'a, 'b) => bool = %raw(`
  function(path, val, obj) {
    var cur = obj;
    for (var i = 0; i < path.length; i++) {
      if (cur == null) return false;
      cur = cur[path[i]];
    }
    return cur === val;
  }
`)
@genType
let pathEq = (path: array<string>, val: 'a, obj: 'b): bool => pathEqRaw(path, val, obj)

let propEqRaw: (string, 'a, 'b) => bool = %raw(`
  function(prop, val, obj) { return obj[prop] === val; }
`)
@genType
let propEq = (prop: string, val: 'a, obj: 'b): bool => propEqRaw(prop, val, obj)
