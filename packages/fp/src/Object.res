// JS primitives with no ReScript equivalent
@val external objectKeys: 'a => array<string> = "Object.keys"
@val external objectAssign2: ({..}, 'a) => 'b = "Object.assign"
@val external objectAssign3: ({..}, 'a, 'b) => 'c = "Object.assign"
@val external structuredClone: 'a => 'a = "structuredClone"
@val external arrayIsArray: 'a => bool = "Array.isArray"

let hasOwn: ('a, string) => bool = %raw(`
  function(o, k) { return Object.prototype.hasOwnProperty.call(o, k) }
`)
let deleteKey: ('a, string) => unit = %raw(`
  function(o, k) { delete o[k] }
`)
@get_index external getUnsafe: ('a, string) => 'b = ""
@set_index external setUnsafe: ('a, string, 'b) => unit = ""
let isPlainObject: 'a => bool = %raw(`
  function(v) { return typeof v === "object" && v !== null && !Array.isArray(v) }
`)
let isFunction: 'a => bool = %raw(`
  function(v) { return typeof v === "function" }
`)
let toStr: 'a => string = %raw(`
  function(v) { return String(v) }
`)
let isNullish: 'a => bool = %raw(`
  function(v) { return v == null }
`)
let emptyObj = (): 'a => Obj.magic(%raw(`{}`))

/** Returns a new object with only the specified keys. */
@genType
let pick = (obj: 'a, ks: array<string>): 'b => {
  let out = emptyObj()
  for i in 0 to Belt.Array.length(ks) - 1 {
    let k = Belt.Array.getUnsafe(ks, i)
    if hasOwn(obj, k) {
      setUnsafe(out, k, getUnsafe(obj, k))
    }
  }
  out
}

/** Returns a new object without the specified keys. */
@genType
let omit: ('a, array<string>) => 'b = %raw(`
  function(obj, ks) {
    var idx = {}, i = 0, len = ks.length;
    while (i < len) { idx[ks[i]] = 1; i++; }
    var out = {};
    for (var k in obj) {
      if (!idx.hasOwnProperty(k)) out[k] = obj[k];
    }
    return out;
  }
`)

/** Returns a new object with the given key set to the value. */
@genType
let assoc = (obj: 'a, key: string, value: 'b): 'c => {
  let out = objectAssign2(Obj.magic(emptyObj()), obj)
  setUnsafe(out, key, value)
  out
}

/** Returns a new object without the given key. */
@genType
let dissoc = (obj: 'a, key: string): 'b => {
  let out = Obj.magic(emptyObj())
  let allKeys = Js.Dict.keys(Obj.magic(obj))
  for i in 0 to Belt.Array.length(allKeys) - 1 {
    let k = Belt.Array.getUnsafe(allKeys, i)
    if k !== key {
      setUnsafe(out, k, Js.Dict.unsafeGet(Obj.magic(obj), k))
    }
  }
  out
}

let rec mergeDeep = (left: 'a, right: 'a, leftWins: bool): 'a => {
  let out = objectAssign2(Obj.magic(emptyObj()), left)
  let ks = objectKeys(right)
  for i in 0 to Belt.Array.length(ks) - 1 {
    let k = Belt.Array.getUnsafe(ks, i)
    let outV = getUnsafe(out, k)
    let rightV = getUnsafe(right, k)
    if isPlainObject(outV) && isPlainObject(rightV) {
      setUnsafe(out, k, mergeDeep(outV, rightV, leftWins))
    } else if leftWins && hasOwn(out, k) {
      () // keep left
    } else {
      setUnsafe(out, k, rightV)
    }
  }
  out
}

/** Recursively merges two objects; the first object's values win on conflict. */
@genType
let mergeDeepLeft = (a: 'a, b: 'a): 'a => mergeDeep(a, b, true)

/** Recursively merges two objects; the second object's values win on conflict. */
@genType
let mergeDeepRight = (a: 'a, b: 'a): 'a => mergeDeep(a, b, false)

/** Merges two objects using a resolver function for conflicting keys. */
@genType
let mergeWith = (a: 'a, b: 'a, resolver: ('b, 'b) => 'b): 'a => {
  let out = objectAssign2(Obj.magic(emptyObj()), a)
  let ks = objectKeys(b)
  for i in 0 to Belt.Array.length(ks) - 1 {
    let k = Belt.Array.getUnsafe(ks, i)
    if hasOwn(out, k) {
      setUnsafe(out, k, resolver(getUnsafe(out, k), getUnsafe(b, k)))
    } else {
      setUnsafe(out, k, getUnsafe(b, k))
    }
  }
  out
}

/** Sets a value at a nested path, creating intermediate objects as needed. */
@genType
let rec assocPath = (obj: 'a, p: array<string>, value: 'b): 'c => {
  let len = Belt.Array.length(p)
  if len === 0 {
    Obj.magic(value)
  } else {
    let out = objectAssign2(Obj.magic(emptyObj()), obj)
    let k = Belt.Array.getUnsafe(p, 0)
    if len === 1 {
      setUnsafe(out, k, value)
    } else {
      let child = getUnsafe(out, k)
      let next = isNullish(child) ? emptyObj() : child
      setUnsafe(out, k, assocPath(next, Array.sliceToEnd(p, ~start=1), value))
    }
    out
  }
}

/** Removes a key at a nested path. */
@genType
let rec dissocPath = (obj: 'a, p: array<string>): 'b => {
  let len = Belt.Array.length(p)
  if len === 0 {
    Obj.magic(obj)
  } else {
    let out = objectAssign2(Obj.magic(emptyObj()), obj)
    let k = Belt.Array.getUnsafe(p, 0)
    if len === 1 {
      deleteKey(out, k)
    } else {
      let child = getUnsafe(out, k)
      if !isNullish(child) {
        setUnsafe(out, k, dissocPath(child, Array.sliceToEnd(p, ~start=1)))
      }
    }
    out
  }
}

/** Deep clones an object using structuredClone. */
@genType
let clone = (obj: 'a): 'a => structuredClone(obj)

/** Checks if a property is equal in two objects. */
@genType
let eqProps = (key: string, a: 'a, b: 'b): bool =>
  getUnsafe(a, key) === getUnsafe(b, key)

/** Applies transformation functions to matching keys. */
@genType
let rec evolve = (transformations: 'a, obj: 'b): 'c => {
  let out = objectAssign2(Obj.magic(emptyObj()), obj)
  let ks = objectKeys(transformations)
  for i in 0 to Belt.Array.length(ks) - 1 {
    let k = Belt.Array.getUnsafe(ks, i)
    if hasOwn(out, k) {
      let t = getUnsafe(transformations, k)
      if isFunction(t) {
        setUnsafe(out, k, (Obj.magic(t))(getUnsafe(out, k)))
      } else if isPlainObject(t) && isPlainObject(getUnsafe(out, k)) {
        setUnsafe(out, k, evolve(t, getUnsafe(out, k)))
      }
    }
  }
  out
}

/** Iterates over each key-value pair for side effects. */
@genType
let forEachObjIndexed = (obj: 'a, fn: ('b, string) => unit): unit => {
  let ks = objectKeys(obj)
  for i in 0 to Belt.Array.length(ks) - 1 {
    let k = Belt.Array.getUnsafe(ks, i)
    fn(getUnsafe(obj, k), k)
  }
}

/** Checks if the object has an own property. */
@genType
let has = (obj: 'a, key: string): bool => hasOwn(obj, key)

/** Checks if a nested path exists in the object. */
@genType
let hasPath = (obj: 'a, p: array<string>): bool => {
  let len = Belt.Array.length(p)
  let cur = ref(Obj.magic(obj))
  let ok = ref(true)
  let i = ref(0)
  while i.contents < len && ok.contents {
    if isNullish(cur.contents) || !hasOwn(cur.contents, Belt.Array.getUnsafe(p, i.contents)) {
      ok := false
    } else {
      cur := getUnsafe(cur.contents, Belt.Array.getUnsafe(p, i.contents))
      i := i.contents + 1
    }
  }
  ok.contents
}

/** Inverts an object: values become keys, keys become arrays of original keys. */
@genType
let invert = (obj: 'a): Dict.t<array<string>> => {
  let out: Dict.t<array<string>> = Obj.magic(emptyObj())
  let ks = objectKeys(obj)
  for i in 0 to Belt.Array.length(ks) - 1 {
    let k = Belt.Array.getUnsafe(ks, i)
    let v = toStr(getUnsafe(obj, k))
    switch Obj.magic(getUnsafe(out, v)) {
    | None =>
      setUnsafe(out, v, [k])
    | Some(arr) =>
      Obj.magic(arr)->Array.push(k)
    }
  }
  out
}

/** Inverts an object: values become keys, last key wins. */
@genType
let invertObj = (obj: 'a): Dict.t<string> => {
  let out: Dict.t<string> = Obj.magic(emptyObj())
  let ks = objectKeys(obj)
  for i in 0 to Belt.Array.length(ks) - 1 {
    let k = Belt.Array.getUnsafe(ks, i)
    setUnsafe(out, toStr(getUnsafe(obj, k)), k)
  }
  out
}

/** Transforms the keys of an object. */
@genType
let mapKeys = (obj: 'a, fn: string => string): 'b => {
  let out = emptyObj()
  let ks = objectKeys(obj)
  for i in 0 to Belt.Array.length(ks) - 1 {
    let k = Belt.Array.getUnsafe(ks, i)
    setUnsafe(out, fn(k), getUnsafe(obj, k))
  }
  out
}

/** Transforms each value with access to its key. */
@genType
let mapObjIndexed = (obj: 'a, fn: ('b, string) => 'c): 'd => {
  let out = emptyObj()
  let ks = objectKeys(obj)
  for i in 0 to Belt.Array.length(ks) - 1 {
    let k = Belt.Array.getUnsafe(ks, i)
    setUnsafe(out, k, fn(getUnsafe(obj, k), k))
  }
  out
}

/** Recursively merges with a resolver function for conflicting leaf values. */
@genType
let rec mergeDeepWith = (a: 'a, b: 'a, fn: ('b, 'b) => 'b): 'a => {
  let out = objectAssign2(Obj.magic(emptyObj()), a)
  let ks = objectKeys(b)
  for i in 0 to Belt.Array.length(ks) - 1 {
    let k = Belt.Array.getUnsafe(ks, i)
    let outV = getUnsafe(out, k)
    let bV = getUnsafe(b, k)
    if isPlainObject(outV) && isPlainObject(bV) {
      setUnsafe(out, k, mergeDeepWith(outV, bV, fn))
    } else if hasOwn(out, k) {
      setUnsafe(out, k, fn(outV, bV))
    } else {
      setUnsafe(out, k, bV)
    }
  }
  out
}

/** Recursively merges with a resolver function that also receives the key. */
@genType
let rec mergeDeepWithKey = (a: 'a, b: 'a, fn: (string, 'b, 'b) => 'b): 'a => {
  let out = objectAssign2(Obj.magic(emptyObj()), a)
  let ks = objectKeys(b)
  for i in 0 to Belt.Array.length(ks) - 1 {
    let k = Belt.Array.getUnsafe(ks, i)
    let outV = getUnsafe(out, k)
    let bV = getUnsafe(b, k)
    if isPlainObject(outV) && isPlainObject(bV) {
      setUnsafe(out, k, mergeDeepWithKey(outV, bV, fn))
    } else if hasOwn(out, k) {
      setUnsafe(out, k, fn(k, outV, bV))
    } else {
      setUnsafe(out, k, bV)
    }
  }
  out
}

/** Merges two objects; the first wins on conflict. */
@genType
let mergeLeft = (a: 'a, b: 'a): 'a => objectAssign3(Obj.magic(emptyObj()), b, a)

/** Merges two objects; the second wins on conflict. */
@genType
let mergeRight = (a: 'a, b: 'a): 'a => objectAssign3(Obj.magic(emptyObj()), a, b)

/** Merges with a key-aware resolver for conflicts. */
@genType
let mergeWithKey = (a: 'a, b: 'a, fn: (string, 'b, 'b) => 'b): 'a => {
  let out = objectAssign2(Obj.magic(emptyObj()), a)
  let ks = objectKeys(b)
  for i in 0 to Belt.Array.length(ks) - 1 {
    let k = Belt.Array.getUnsafe(ks, i)
    if hasOwn(out, k) {
      setUnsafe(out, k, fn(k, getUnsafe(out, k), getUnsafe(b, k)))
    } else {
      setUnsafe(out, k, getUnsafe(b, k))
    }
  }
  out
}

/** Transforms a value at a key. */
@genType
let modify = (obj: 'a, key: string, fn: 'b => 'b): 'c => {
  let out = objectAssign2(Obj.magic(emptyObj()), obj)
  setUnsafe(out, key, fn(getUnsafe(out, key)))
  out
}

/** Transforms a value at a nested path. */
@genType
let rec modifyPath = (obj: 'a, p: array<string>, fn: 'b => 'b): 'c => {
  let len = Belt.Array.length(p)
  if len === 0 {
    Obj.magic(fn(Obj.magic(obj)))
  } else {
    let out = objectAssign2(Obj.magic(emptyObj()), obj)
    let k = Belt.Array.getUnsafe(p, 0)
    if len === 1 {
      setUnsafe(out, k, fn(getUnsafe(out, k)))
    } else {
      let child = getUnsafe(out, k)
      let next = isNullish(child) ? emptyObj() : child
      setUnsafe(out, k, modifyPath(next, Array.sliceToEnd(p, ~start=1), fn))
    }
    out
  }
}

/** Creates a singleton object. */
@genType
let objOf = (key: string, value: 'a): 'b => {
  let out = emptyObj()
  setUnsafe(out, key, value)
  out
}

/** Traverses a nested path, returning the value or None. */
@genType
let path = (obj: 'a, p: array<string>): option<'b> => {
  let len = Belt.Array.length(p)
  let cur = ref(Obj.magic(obj))
  let i = ref(0)
  while i.contents < len && !isNullish(cur.contents) {
    cur := getUnsafe(cur.contents, Belt.Array.getUnsafe(p, i.contents))
    i := i.contents + 1
  }
  Obj.magic(cur.contents)
}

/** Traverses a nested path, returning a fallback if missing. */
@genType
let pathOr = (obj: 'a, fallback: 'b, p: array<string>): 'b => {
  let len = Belt.Array.length(p)
  let cur = ref(Obj.magic(obj))
  let i = ref(0)
  while i.contents < len && !isNullish(cur.contents) {
    cur := getUnsafe(cur.contents, Belt.Array.getUnsafe(p, i.contents))
    i := i.contents + 1
  }
  if isNullish(cur.contents) { fallback } else { Obj.magic(cur.contents) }
}

/** Traverses multiple nested paths. */
@genType
let paths = (obj: 'a, ps: array<array<string>>): array<'b> => {
  let len = Belt.Array.length(ps)
  let out = Belt.Array.makeUninitializedUnsafe(len)
  for i in 0 to len - 1 {
    let p = Belt.Array.getUnsafe(ps, i)
    let pLen = Belt.Array.length(p)
    let cur = ref(Obj.magic(obj))
    let j = ref(0)
    while j.contents < pLen && !isNullish(cur.contents) {
      cur := getUnsafe(cur.contents, Belt.Array.getUnsafe(p, j.contents))
      j := j.contents + 1
    }
    Belt.Array.setUnsafe(out, i, Obj.magic(cur.contents))
  }
  out
}

/** Like pick, but includes undefined for missing keys. */
@genType
let pickAll = (obj: 'a, ks: array<string>): 'b => {
  let out = emptyObj()
  for i in 0 to Belt.Array.length(ks) - 1 {
    let k = Belt.Array.getUnsafe(ks, i)
    setUnsafe(out, k, getUnsafe(obj, k))
  }
  out
}

/** Picks keys where the predicate returns true. */
@genType
let pickBy = (obj: 'a, pred: ('b, string) => bool): 'c => {
  let out = emptyObj()
  let ks = objectKeys(obj)
  for i in 0 to Belt.Array.length(ks) - 1 {
    let k = Belt.Array.getUnsafe(ks, i)
    let v = getUnsafe(obj, k)
    if pred(v, k) { setUnsafe(out, k, v) }
  }
  out
}

/** Projects specific keys from an array of objects. */
@genType
let project = (arr: array<'a>, ks: array<string>): array<'b> => {
  let len = Belt.Array.length(arr)
  let kLen = Belt.Array.length(ks)
  let out = Belt.Array.makeUninitializedUnsafe(len)
  for i in 0 to len - 1 {
    let item = Belt.Array.getUnsafe(arr, i)
    let o = emptyObj()
    for j in 0 to kLen - 1 {
      let k = Belt.Array.getUnsafe(ks, j)
      if hasOwn(item, k) { setUnsafe(o, k, getUnsafe(item, k)) }
    }
    Belt.Array.setUnsafe(out, i, o)
  }
  out
}

/** Returns the value at a key (unsafe). */
@genType
let prop = (obj: 'a, key: string): 'b => getUnsafe(obj, key)

/** Returns the value at a key, or a fallback. */
@genType
let propOr = (obj: 'a, fallback: 'b, key: string): 'b => {
  let v = getUnsafe(obj, key)
  if isNullish(v) { fallback } else { Obj.magic(v) }
}

/** Returns values at multiple keys. */
@genType
let props = (obj: 'a, ks: array<string>): array<'b> => {
  let len = Belt.Array.length(ks)
  let out = Belt.Array.makeUninitializedUnsafe(len)
  for i in 0 to len - 1 {
    Belt.Array.setUnsafe(out, i, getUnsafe(obj, Belt.Array.getUnsafe(ks, i)))
  }
  out
}

/** Renames keys according to a mapping. */
@genType
let renameKeys = (obj: 'a, mapping: Dict.t<string>): 'b => {
  let out = emptyObj()
  let ks = objectKeys(obj)
  for i in 0 to Belt.Array.length(ks) - 1 {
    let k = Belt.Array.getUnsafe(ks, i)
    let newKey = switch Obj.magic(getUnsafe(mapping, k)) {
    | Some(nk) => nk
    | None => k
    }
    setUnsafe(out, newKey, getUnsafe(obj, k))
  }
  out
}

/** Converts an object to an array of [key, value] pairs. */
@genType
let toPairs = (obj: 'a): array<(string, 'b)> => {
  let ks = objectKeys(obj)
  let len = Belt.Array.length(ks)
  let out = Belt.Array.makeUninitializedUnsafe(len)
  for i in 0 to len - 1 {
    let k = Belt.Array.getUnsafe(ks, i)
    Belt.Array.setUnsafe(out, i, (k, getUnsafe(obj, k)))
  }
  out
}

/** Expands an array-valued key into multiple objects. */
@genType
let unwind = (obj: 'a, key: string): array<'b> => {
  let arr = getUnsafe(obj, key)
  if !arrayIsArray(arr) {
    [Obj.magic(obj)]
  } else {
    let len = Belt.Array.length(Obj.magic(arr))
    let out = Belt.Array.makeUninitializedUnsafe(len)
    for i in 0 to len - 1 {
      let copy = objectAssign2(Obj.magic(emptyObj()), obj)
      setUnsafe(copy, key, Belt.Array.getUnsafe(Obj.magic(arr), i))
      Belt.Array.setUnsafe(out, i, copy)
    }
    out
  }
}

/** Returns the keys of an object. */
@genType
let keys = (obj: 'a): array<string> => objectKeys(obj)

/** Returns the values of an object. */
@genType
let values = (obj: 'a): array<'b> => {
  let ks = objectKeys(obj)
  let len = Belt.Array.length(ks)
  let out = Belt.Array.makeUninitializedUnsafe(len)
  for i in 0 to len - 1 {
    Belt.Array.setUnsafe(out, i, getUnsafe(obj, Belt.Array.getUnsafe(ks, i)))
  }
  out
}

/** Checks if all predicate specs pass for the object. */
@genType
let where = (spec: 'a, obj: 'b): bool => {
  let ks = objectKeys(spec)
  let len = Belt.Array.length(ks)
  let ok = ref(true)
  let i = ref(0)
  while i.contents < len && ok.contents {
    let k = Belt.Array.getUnsafe(ks, i.contents)
    let predFn: 'c => bool = Obj.magic(getUnsafe(spec, k))
    if !predFn(getUnsafe(obj, k)) { ok := false }
    i := i.contents + 1
  }
  ok.contents
}

/** Checks if any predicate spec passes for the object. */
@genType
let whereAny = (spec: 'a, obj: 'b): bool => {
  let ks = objectKeys(spec)
  let len = Belt.Array.length(ks)
  let found = ref(false)
  let i = ref(0)
  while i.contents < len && !found.contents {
    let k = Belt.Array.getUnsafe(ks, i.contents)
    let predFn: 'c => bool = Obj.magic(getUnsafe(spec, k))
    if predFn(getUnsafe(obj, k)) { found := true }
    i := i.contents + 1
  }
  found.contents
}

/** Checks if all spec values equal the object's values. */
@genType
let whereEq = (spec: 'a, obj: 'b): bool => {
  let ks = objectKeys(spec)
  let len = Belt.Array.length(ks)
  let ok = ref(true)
  let i = ref(0)
  while i.contents < len && ok.contents {
    let k = Belt.Array.getUnsafe(ks, i.contents)
    if getUnsafe(obj, k) !== getUnsafe(spec, k) { ok := false }
    i := i.contents + 1
  }
  ok.contents
}

/** Creates an object from keys with a constant value. */
@genType
let fromKeys = (ks: array<string>, value: 'a): 'b => {
  let out = emptyObj()
  for i in 0 to Belt.Array.length(ks) - 1 {
    setUnsafe(out, Belt.Array.getUnsafe(ks, i), value)
  }
  out
}

/** Omits keys where the predicate returns true. */
@genType
let omitBy = (obj: 'a, pred: ('b, string) => bool): 'c => {
  let out = emptyObj()
  let ks = objectKeys(obj)
  for i in 0 to Belt.Array.length(ks) - 1 {
    let k = Belt.Array.getUnsafe(ks, i)
    let v = getUnsafe(obj, k)
    if !pred(v, k) { setUnsafe(out, k, v) }
  }
  out
}

/** Indexes an array into a dict by key and value extractors. */
@genType
let pullObject = (arr: array<'a>, keyFn: 'a => string, valFn: 'a => 'b): Dict.t<'b> => {
  let out: Dict.t<'b> = Obj.magic(emptyObj())
  for i in 0 to Belt.Array.length(arr) - 1 {
    let item = Belt.Array.getUnsafe(arr, i)
    setUnsafe(out, keyFn(item), valFn(item))
  }
  out
}

/** Swaps the values of two keys. */
@genType
let swapProps = (obj: 'a, k1: string, k2: string): 'b => {
  let out = objectAssign2(Obj.magic(emptyObj()), obj)
  let tmp = getUnsafe(out, k1)
  setUnsafe(out, k1, getUnsafe(out, k2))
  setUnsafe(out, k2, tmp)
  out
}
