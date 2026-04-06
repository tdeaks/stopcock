@genType
type t<'a> = dict<'a>

@val external objectKeys: dict<'a> => array<string> = "Object.keys"
@val external objectValues: dict<'a> => array<'a> = "Object.values"
@set_index external dictSet: (dict<'a>, string, 'a) => unit = ""
@get_index external dictGet: (dict<'a>, string) => 'a = ""

let assignRaw: (dict<'a>, dict<'a>) => dict<'a> = %raw(`
  function(a, b) { return Object.assign({}, a, b) }
`)

let hasRaw: (dict<'a>, string) => bool = %raw(`
  function(d, k) { return k in d }
`)

/** Creates a dictionary from an array of `[key, value]` pairs. */
@genType
let fromEntries = (entries: array<(string, 'a)>): dict<'a> => {
  let out: dict<'a> = Obj.magic(%raw(`{}`))
  for i in 0 to Belt.Array.length(entries) - 1 {
    let (k, v) = Belt.Array.getUnsafe(entries, i)
    dictSet(out, k, v)
  }
  out
}

/** Returns an array of `[key, value]` pairs. */
@genType
let toEntries = (d: dict<'a>): array<(string, 'a)> => {
  let ks = objectKeys(d)
  let len = Belt.Array.length(ks)
  let out = Belt.Array.makeUninitializedUnsafe(len)
  for i in 0 to len - 1 {
    let k = Belt.Array.getUnsafe(ks, i)
    Belt.Array.setUnsafe(out, i, (k, dictGet(d, k)))
  }
  out
}

/** Returns an array of the dictionary's keys. */
@genType
let keys = (d: dict<'a>): array<string> => objectKeys(d)

/** Returns an array of the dictionary's values. */
@genType
let values = (d: dict<'a>): array<'a> => objectValues(d)

/** Transforms each value using a function that receives the value and key. */
@genType
let map = (d: dict<'a>, f: ('a, string) => 'b): dict<'b> => {
  let ks = objectKeys(d)
  let out: dict<'b> = Obj.magic(%raw(`{}`))
  for i in 0 to Belt.Array.length(ks) - 1 {
    let k = Belt.Array.getUnsafe(ks, i)
    dictSet(Obj.magic(out), k, Obj.magic(f(dictGet(d, k), k)))
  }
  out
}

/** Returns a new dictionary with entries satisfying the predicate. */
@genType
let filter = (d: dict<'a>, pred: ('a, string) => bool): dict<'a> => {
  let out: dict<'a> = Obj.magic(%raw(`{}`))
  let ks = objectKeys(d)
  for i in 0 to Belt.Array.length(ks) - 1 {
    let k = Belt.Array.getUnsafe(ks, i)
    let v = dictGet(d, k)
    if pred(v, k) {
      dictSet(out, k, v)
    }
  }
  out
}

/** Merges two dictionaries; the second's values win on conflict. */
@genType
let merge = (a: dict<'a>, b: dict<'a>): dict<'a> => assignRaw(a, b)

/** Returns the value for a key, or `undefined` if missing. */
@genType
let get = (d: dict<'a>, key: string): option<'a> =>
  if hasRaw(d, key) { Some(dictGet(d, key)) } else { None }

/** Checks whether the dictionary has no entries. */
@genType
let isEmpty = (d: dict<'a>): bool => Belt.Array.length(objectKeys(d)) === 0
