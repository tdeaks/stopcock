/** Checks deep structural equality of two values. */
@genType
let equals = (a: 'a, b: 'a): bool => a == b

/** Returns the value if defined, otherwise returns the fallback. */
@genType
let defaultTo = (fallback: 'a, opt: option<'a>): 'a =>
  switch opt {
  | Some(v) => v
  | None => fallback
  }

/** Applies the transform if the predicate is true, otherwise returns the value unchanged. */
@genType
let when_ = (value: 'a, pred: 'a => bool, f: 'a => 'a): 'a =>
  if pred(value) { f(value) } else { value }

/** Applies the transform if the predicate is false, otherwise returns the value unchanged. */
@genType
let unless = (value: 'a, pred: 'a => bool, f: 'a => 'a): 'a =>
  if pred(value) { value } else { f(value) }

/** Returns the result of the first matching condition's transform, or `undefined` if none match. */
@genType
let cond = (conditions: array<('a => bool, 'a => 'b)>, value: 'a): option<'b> => {
  let len = Array.length(conditions)
  let i = ref(0)
  let result = ref(None)
  while i.contents < len && result.contents === None {
    let (pred, transform) = Belt.Array.getUnsafe(conditions, i.contents)
    if pred(value) {
      result := Some(transform(value))
    }
    i := i.contents + 1
  }
  result.contents
}

/** Combines two predicates with AND. */
@genType
let both = (p1: 'a => bool, p2: 'a => bool): ('a => bool) =>
  x => p1(x) && p2(x)

/** Combines two predicates with OR. */
@genType
let either = (p1: 'a => bool, p2: 'a => bool): ('a => bool) =>
  x => p1(x) || p2(x)

/** Returns a predicate that is true when all given predicates pass. Empty array → always true. */
@genType
let allPass = (preds: array<'a => bool>): ('a => bool) =>
  x => {
    let len = Array.length(preds)
    let i = ref(0)
    let ok = ref(true)
    while i.contents < len && ok.contents {
      if !Belt.Array.getUnsafe(preds, i.contents)(x) {
        ok := false
      }
      i := i.contents + 1
    }
    ok.contents
  }

/** Returns a predicate that is true when any given predicate passes. Empty array → always false. */
@genType
let anyPass = (preds: array<'a => bool>): ('a => bool) =>
  x => {
    let len = Array.length(preds)
    let i = ref(0)
    let found = ref(false)
    while i.contents < len && !found.contents {
      if Belt.Array.getUnsafe(preds, i.contents)(x) {
        found := true
      }
      i := i.contents + 1
    }
    found.contents
  }

let logicIsEmptyRaw: 'a => bool = %raw(`
  function(x) {
    if (x == null) return true;
    if (typeof x === 'string' || Array.isArray(x)) return x.length === 0;
    if (typeof x === 'object') return Object.keys(x).length === 0;
    return false;
  }
`)
@genType
let logicIsEmpty = (x: 'a): bool => logicIsEmptyRaw(x)

@genType
let isNotEmpty = (x: 'a): bool => !logicIsEmptyRaw(x)

let pathSatisfiesRaw: (array<string>, 'a => bool, 'b) => bool = %raw(`
  function(path, pred, obj) {
    let val = obj;
    for (let i = 0; i < path.length; i++) {
      if (val == null) return false;
      val = val[path[i]];
    }
    return pred(val);
  }
`)
@genType
let pathSatisfies = (path: array<string>, pred: 'a => bool, obj: 'b): bool =>
  pathSatisfiesRaw(path, pred, obj)

let propSatisfiesRaw: (string, 'a => bool, 'b) => bool = %raw(`
  function(prop, pred, obj) { return pred(obj[prop]); }
`)
@genType
let propSatisfies = (prop: string, pred: 'a => bool, obj: 'b): bool =>
  propSatisfiesRaw(prop, pred, obj)

@genType
let until = (value: 'a, pred: 'a => bool, f: 'a => 'a): 'a => {
  let val = ref(value)
  while !pred(val.contents) {
    val := f(val.contents)
  }
  val.contents
}

@genType
let xor = (a: bool, b: bool): bool => (a && !b) || (!a && b)
