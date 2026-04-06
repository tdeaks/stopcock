/** Returns the first element, or `undefined` if empty. */
@genType
let head: array<'a> => option<'a> = %raw(`
  function(arr) { return arr.length === 0 ? undefined : arr[0] }
`)

let truncate: (array<'a>, int) => unit = %raw(`function(a, n) { a.length = n }`)

/** Returns the last element, or `undefined` if empty. */
@genType
let last: array<'a> => option<'a> = %raw(`
  function(arr) { return arr.length === 0 ? undefined : arr[arr.length - 1] }
`)

/** Returns all elements except the first. */
@genType
let tail = (arr: array<'a>): array<'a> =>
  if Array.length(arr) <= 1 { [] } else { arr->Array.sliceToEnd(~start=1) }

/** Returns all elements except the last. */
@genType
let init = (arr: array<'a>): array<'a> => {
  let len = Array.length(arr)
  if len <= 1 { [] } else { arr->Array.slice(~start=0, ~end=len - 1) }
}

/** Checks whether the array is empty. */
@genType
let isEmpty = (arr: array<'a>): bool => Array.length(arr) === 0

/** Returns the number of elements. */
@genType
let length = (arr: array<'a>): int => Array.length(arr)

/** Returns the first `n` elements. */
@genType
let take = (arr: array<'a>, n: int): array<'a> => {
  let len = Array.length(arr)
  if n <= 0 {
    []
  } else {
    arr->Array.slice(~start=0, ~end=if n > len { len } else { n })
  }
}

/** Returns all elements after the first `n`. */
@genType
let drop = (arr: array<'a>, n: int): array<'a> => {
  let len = Array.length(arr)
  if n <= 0 {
    arr->Array.copy
  } else if n >= len {
    []
  } else {
    arr->Array.sliceToEnd(~start=n)
  }
}

/** Returns the longest prefix of elements satisfying the predicate. */
@genType
let takeWhile: (array<'a>, 'a => bool) => array<'a> = %raw(`
  function(arr, pred) {
    var out = [];
    for (var i = 0, len = arr.length; i < len; i++) {
      if (!pred(arr[i])) break;
      out.push(arr[i]);
    }
    return out;
  }
`)

/** Drops the longest prefix of elements satisfying the predicate. */
@genType
let dropWhile: (array<'a>, 'a => bool) => array<'a> = %raw(`
  function(arr, pred) {
    for (var i = 0, len = arr.length; i < len; i++) {
      if (!pred(arr[i])) return arr.slice(i);
    }
    return [];
  }
`)

/** Splits into sub-arrays of size `n`. */
@genType
let chunk: (array<'a>, int) => array<array<'a>> = %raw(`
  function(arr, n) {
    var len = arr.length;
    if (n <= 0 || len === 0) return [];
    var numChunks = ((len + n - 1) / n) | 0;
    var out = new Array(numChunks);
    for (var i = 0; i < numChunks; i++) {
      out[i] = arr.slice(i * n, i * n + n);
    }
    return out;
  }
`)

/** Returns overlapping windows of size `n`. */
@genType
let slidingWindow = (arr: array<'a>, n: int): array<array<'a>> => {
  let len = Array.length(arr)
  if n <= 0 || n > len {
    []
  } else {
    let numWindows = len - n + 1
    let out = Belt.Array.makeUninitializedUnsafe(numWindows)
    for wi in 0 to numWindows - 1 {
      let win = Belt.Array.makeUninitializedUnsafe(n)
      for j in 0 to n - 1 {
        Belt.Array.setUnsafe(win, j, Belt.Array.getUnsafe(arr, wi + j))
      }
      Belt.Array.setUnsafe(out, wi, win)
    }
    out
  }
}

/** Applies a function to each element. */
@genType
let map: (array<'a>, 'a => 'b) => array<'b> = %raw(`
  function(arr, f) {
    var len = arr.length, out = new Array(len);
    for (var i = 0; i < len; i++) out[i] = f(arr[i]);
    return out;
  }
`)

/** Applies a function to each element with its index. */
@genType
let mapWithIndex: (array<'a>, ('a, int) => 'b) => array<'b> = %raw(`
  function(arr, f) {
    var len = arr.length, out = new Array(len);
    for (var i = 0; i < len; i++) out[i] = f(arr[i], i);
    return out;
  }
`)

/** Returns elements satisfying the predicate. */
@genType
let filter = (arr: array<'a>, pred: 'a => bool): array<'a> => {
  let result = []
  for i in 0 to Array.length(arr) - 1 {
    let x = Belt.Array.getUnsafe(arr, i)
    if pred(x) { result->Array.push(x) }
  }
  result
}

/** Returns elements satisfying the predicate, with index. */
@genType
let filterWithIndex = (arr: array<'a>, pred: ('a, int) => bool): array<'a> => {
  let result = []
  for i in 0 to Array.length(arr) - 1 {
    let x = Belt.Array.getUnsafe(arr, i)
    if pred(x, i) { result->Array.push(x) }
  }
  result
}

/** Calls a function on each element for side effects. */
@genType
let forEach = (arr: array<'a>, f: 'a => unit): unit => {
  let len = Array.length(arr)
  for i in 0 to len - 1 {
    f(Belt.Array.getUnsafe(arr, i))
  }
}

/** Calls a function on each element with its index for side effects. */
@genType
let forEachWithIndex = (arr: array<'a>, f: ('a, int) => unit): unit => {
  let len = Array.length(arr)
  for i in 0 to len - 1 {
    f(Belt.Array.getUnsafe(arr, i), i)
  }
}

/** Reduces from left to right with an initial accumulator. */
@genType
let reduce: (array<'a>, ('b, 'a) => 'b, 'b) => 'b = %raw(`
  function(arr, f, init) {
    for (var i = 0, acc = init; i < arr.length; i++) acc = f(acc, arr[i]);
    return acc;
  }
`)

/** Reduces from right to left with an initial accumulator. */
@genType
let reduceRight: (array<'a>, ('b, 'a) => 'b, 'b) => 'b = %raw(`
  function(arr, f, init) {
    for (var i = arr.length - 1, acc = init; i >= 0; i--) acc = f(acc, arr[i]);
    return acc;
  }
`)

/** Maps each element to an array and flattens the result. */
@genType
let flatMap: (array<'a>, 'a => array<'b>) => array<'b> = %raw(`
  function(arr, f) {
    var out = [];
    for (var i = 0; i < arr.length; i++) {
      var inner = f(arr[i]);
      for (var j = 0; j < inner.length; j++) out.push(inner[j]);
    }
    return out;
  }
`)

/** Flattens a nested array by one level. */
@genType
let flatten: array<array<'a>> => array<'a> = %raw(`
  function(arr) {
    var out = [];
    for (var i = 0; i < arr.length; i++) {
      var inner = arr[i];
      for (var j = 0; j < inner.length; j++) out.push(inner[j]);
    }
    return out;
  }
`)

/** Returns the first element satisfying the predicate, or `undefined`. */
@genType
let find: (array<'a>, 'a => bool) => option<'a> = %raw(`
  function(arr, pred) {
    for (var i = 0; i < arr.length; i++) { if (pred(arr[i])) return arr[i]; }
    return undefined;
  }
`)

/** Returns the index of the first element satisfying the predicate, or `undefined`. */
@genType
let findIndex: (array<'a>, 'a => bool) => option<int> = %raw(`
  function(arr, pred) {
    for (var i = 0; i < arr.length; i++) { if (pred(arr[i])) return i; }
    return undefined;
  }
`)

/** Checks whether all elements satisfy the predicate. */
@genType
let every: (array<'a>, 'a => bool) => bool = %raw(`
  function(arr, pred) {
    for (var i = 0; i < arr.length; i++) { if (!pred(arr[i])) return false; }
    return true;
  }
`)

/** Checks whether any element satisfies the predicate. */
@genType
let some: (array<'a>, 'a => bool) => bool = %raw(`
  function(arr, pred) {
    for (var i = 0; i < arr.length; i++) { if (pred(arr[i])) return true; }
    return false;
  }
`)

/** Checks whether the array contains the given value. */
@genType
let includes: (array<'a>, 'a) => bool = %raw(`
  function(arr, val) { return arr.indexOf(val) !== -1; }
`)

/** Returns a new array with elements in reverse order. */
@genType
let reverse: array<'a> => array<'a> = %raw(`
  function(arr) {
    var len = arr.length, out = new Array(len);
    for (var i = 0; i < len; i++) out[i] = arr[len - 1 - i];
    return out;
  }
`)

/** Returns a new array with elements in reverse order. */
@genType
/** Returns a numerically sorted copy. */
@genType
let sort = (arr: array<float>): array<float> =>
  Belt.SortArray.stableSortBy(arr, (a, b) => if a < b { -1 } else if a > b { 1 } else { 0 })

/** Returns a copy sorted by the given comparator. */
@genType
let sortBy = (arr: array<'a>, cmp: ('a, 'a) => int): array<'a> =>
  Belt.SortArray.stableSortBy(arr, cmp)

/** Returns the first k elements as if the array were sorted by cmp.
    Uses quickselect O(n) + sort O(k log k) instead of full sort O(n log n). */
@genType
let takeSortedBy: (array<'a>, int, ('a, 'a) => int) => array<'a> = %raw(`
  function(arr, k, cmp) {
    var n = arr.length;
    if (k <= 0) return [];
    if (k >= n) return arr.slice().sort(cmp);
    // Copy to avoid mutating input
    var work = arr.slice();
    // Quickselect: partition work so that work[0..k-1] contains the k smallest
    var lo = 0, hi = n - 1;
    while (lo < hi) {
      var pivot = work[lo + ((hi - lo) >> 1)];
      var i = lo, j = hi;
      while (i <= j) {
        while (cmp(work[i], pivot) < 0) i++;
        while (cmp(work[j], pivot) > 0) j--;
        if (i <= j) { var tmp = work[i]; work[i] = work[j]; work[j] = tmp; i++; j--; }
      }
      if (j < k - 1) lo = i;
      else if (i > k - 1) hi = j;
      else break;
    }
    // Extract first k and sort them
    var result = work.slice(0, k);
    result.sort(cmp);
    return result;
  }
`)

@val external arrayFrom: Set.t<'a> => array<'a> = "Array.from"

/** Returns a new array with duplicates removed. */
@genType
let uniq: array<'a> => array<'a> = %raw(`function(arr) { return Array.from(new Set(arr)) }`)

/** Returns a new array deduplicated by the given key function. */
@genType
let uniqBy: (array<'a>, 'a => 'b) => array<'a> = %raw(`
  function(arr, f) {
    var seen = new Set(), out = [];
    for (var i = 0, len = arr.length; i < len; i++) {
      var x = arr[i], key = f(x);
      if (!seen.has(key)) { seen.add(key); out.push(x); }
    }
    return out;
  }
`)

/** Inserts a separator between each element. */
@genType
let intersperse = (arr: array<'a>, sep: 'a): array<'a> => {
  let len = Array.length(arr)
  if len <= 1 {
    Belt.Array.copy(arr)
  } else {
    let outLen = 2 * len - 1
    let out = Belt.Array.makeUninitializedUnsafe(outLen)
    for i in 0 to len - 1 {
      Belt.Array.setUnsafe(out, i * 2, Belt.Array.getUnsafe(arr, i))
      if i < len - 1 {
        Belt.Array.setUnsafe(out, i * 2 + 1, sep)
      }
    }
    out
  }
}

/** Pairs elements from two arrays into tuples, truncating to the shorter. */
@genType
let zip: (array<'a>, array<'b>) => array<('a, 'b)> = %raw(`
  function(a, b) {
    var len = a.length < b.length ? a.length : b.length;
    var out = new Array(len), i = 0;
    while (i < len) { out[i] = [a[i], b[i]]; i++; }
    return out;
  }
`)

/** Combines elements from two arrays using a function, truncating to the shorter. */
@genType
let zipWith = (a: array<'a>, b: array<'b>, f: ('a, 'b) => 'c): array<'c> => {
  let lenA = Array.length(a)
  let lenB = Array.length(b)
  let len = if lenA < lenB { lenA } else { lenB }
  let out = Belt.Array.makeUninitializedUnsafe(len)
  for i in 0 to len - 1 {
    Belt.Array.setUnsafe(out, i, f(Belt.Array.getUnsafe(a, i), Belt.Array.getUnsafe(b, i)))
  }
  out
}

/** Groups elements by a string key function. */
@genType
let groupBy: (array<'a>, 'a => string) => Dict.t<array<'a>> = %raw(`
  function(arr, f) {
    var out = {};
    for (var i = 0, len = arr.length; i < len; i++) {
      var x = arr[i], key = f(x);
      var existing = out[key];
      if (existing !== undefined) existing.push(x);
      else out[key] = [x];
    }
    return out;
  }
`)

/** Splits into `[matches, non-matches]` based on the predicate. */
@genType
let partition = (arr: array<'a>, pred: 'a => bool): (array<'a>, array<'a>) => {
  let len = Array.length(arr)
  let pass = Belt.Array.makeUninitializedUnsafe(len)
  let fail = Belt.Array.makeUninitializedUnsafe(len)
  let pi = ref(0)
  let fi = ref(0)
  for i in 0 to len - 1 {
    let x = Belt.Array.getUnsafe(arr, i)
    if pred(x) {
      Belt.Array.setUnsafe(pass, pi.contents, x)
      pi := pi.contents + 1
    } else {
      Belt.Array.setUnsafe(fail, fi.contents, x)
      fi := fi.contents + 1
    }
  }
  truncate(pass, pi.contents)
  truncate(fail, fi.contents)
  (pass, fail)
}

/** Applies a function to the element at the given index. Returns unchanged if out of bounds. */
@genType
let adjust = (arr: array<'a>, index: int, f: 'a => 'a): array<'a> => {
  let len = Array.length(arr)
  if index < 0 || index >= len {
    Belt.Array.copy(arr)
  } else {
    let out = Belt.Array.copy(arr)
    Belt.Array.setUnsafe(out, index, f(Belt.Array.getUnsafe(arr, index)))
    out
  }
}

/** Replaces the element at the given index. Returns unchanged if out of bounds. */
@genType
let update: (array<'a>, int, 'a) => array<'a> = %raw(`
  function(arr, index, value) {
    var len = arr.length;
    if (index < 0 || index >= len) return arr.slice();
    var out = arr.slice();
    out[index] = value;
    return out;
  }
`)

/** Inserts an element at the given index, shifting subsequent elements right. */
@genType
let insert = (arr: array<'a>, index: int, value: 'a): array<'a> => {
  let len = Array.length(arr)
  let idx = if index < 0 { 0 } else if index > len { len } else { index }
  let out = Belt.Array.makeUninitializedUnsafe(len + 1)
  for i in 0 to idx - 1 {
    Belt.Array.setUnsafe(out, i, Belt.Array.getUnsafe(arr, i))
  }
  Belt.Array.setUnsafe(out, idx, value)
  for i in idx to len - 1 {
    Belt.Array.setUnsafe(out, i + 1, Belt.Array.getUnsafe(arr, i))
  }
  out
}

/** Removes `count` elements starting at the given index. */
@genType
let remove = (arr: array<'a>, index: int, count: int): array<'a> => {
  let len = Array.length(arr)
  if index < 0 || index >= len || count <= 0 {
    Belt.Array.copy(arr)
  } else {
    let actual = if index + count > len { len - index } else { count }
    let newLen = len - actual
    let out = Belt.Array.makeUninitializedUnsafe(newLen)
    for i in 0 to index - 1 {
      Belt.Array.setUnsafe(out, i, Belt.Array.getUnsafe(arr, i))
    }
    for i in index + actual to len - 1 {
      Belt.Array.setUnsafe(out, i - actual, Belt.Array.getUnsafe(arr, i))
    }
    out
  }
}

/** Alias for `slidingWindow`. */
@genType
let aperture = (arr: array<'a>, n: int): array<array<'a>> => slidingWindow(arr, n)

/** Creates an array of integers from `start` (inclusive) to `end` (exclusive). */
@genType
let range = (start: int, end_: int): array<int> => {
  if end_ <= start {
    []
  } else {
    let len = end_ - start
    let out = Belt.Array.makeUninitializedUnsafe(len)
    for i in 0 to len - 1 {
      Belt.Array.setUnsafe(out, i, start + i)
    }
    out
  }
}

/** Creates an array of `n` copies of the given value. */
@genType
let repeat = (value: 'a, n: int): array<'a> => {
  if n <= 0 {
    []
  } else {
    let out = Belt.Array.makeUninitializedUnsafe(n)
    for i in 0 to n - 1 {
      Belt.Array.setUnsafe(out, i, value)
    }
    out
  }
}

/** Creates an array by applying a function to each index from 0 to `n - 1`. */
@genType
let times = (f: int => 'a, n: int): array<'a> => {
  if n <= 0 {
    []
  } else {
    let out = Belt.Array.makeUninitializedUnsafe(n)
    for i in 0 to n - 1 {
      Belt.Array.setUnsafe(out, i, f(i))
    }
    out
  }
}

/** Generates an array by repeatedly applying a function to a seed until it returns `undefined`. */
@genType
let unfold = (f: 'b => option<('a, 'b)>, seed: 'b): array<'a> => {
  let result = []
  let s = ref(seed)
  let continue_ = ref(true)
  while continue_.contents {
    switch f(s.contents) {
    | Some((value, nextSeed)) =>
      result->Array.push(value)
      s := nextSeed
    | None => continue_ := false
    }
  }
  result
}

/** Like `reduce`, but returns all intermediate accumulator values. */
@genType
let scan = (arr: array<'a>, f: ('b, 'a) => 'b, init: 'b): array<'b> => {
  let len = Array.length(arr)
  let out = Belt.Array.makeUninitializedUnsafe(len + 1)
  let acc = ref(init)
  Belt.Array.setUnsafe(out, 0, init)
  for i in 0 to len - 1 {
    acc := f(acc.contents, Belt.Array.getUnsafe(arr, i))
    Belt.Array.setUnsafe(out, i + 1, acc.contents)
  }
  out
}

/** Returns the cartesian product of two arrays as tuples. */
@genType
let xprod = (a: array<'a>, b: array<'b>): array<('a, 'b)> => {
  let lenA = Array.length(a)
  let lenB = Array.length(b)
  let total = lenA * lenB
  if total === 0 {
    []
  } else {
    let out = Belt.Array.makeUninitializedUnsafe(total)
    for i in 0 to lenA - 1 {
      for j in 0 to lenB - 1 {
        Belt.Array.setUnsafe(out, i * lenB + j, (Belt.Array.getUnsafe(a, i), Belt.Array.getUnsafe(b, j)))
      }
    }
    out
  }
}

/** Transposes rows and columns, truncating to the shortest row. */
@genType
let transpose = (arr: array<array<'a>>): array<array<'a>> => {
  let rows = Array.length(arr)
  if rows === 0 {
    []
  } else {
    let cols = ref(Array.length(Belt.Array.getUnsafe(arr, 0)))
    for i in 1 to rows - 1 {
      let rowLen = Array.length(Belt.Array.getUnsafe(arr, i))
      if rowLen < cols.contents {
        cols := rowLen
      }
    }
    if cols.contents === 0 {
      []
    } else {
      let out = Belt.Array.makeUninitializedUnsafe(cols.contents)
      for c in 0 to cols.contents - 1 {
        let col = Belt.Array.makeUninitializedUnsafe(rows)
        for r in 0 to rows - 1 {
          Belt.Array.setUnsafe(col, r, Belt.Array.getUnsafe(Belt.Array.getUnsafe(arr, r), c))
        }
        Belt.Array.setUnsafe(out, c, col)
      }
      out
    }
  }
}

/** Returns elements present in both arrays (deduped). */
@genType
let intersection: (array<'a>, array<'a>) => array<'a> = %raw(`
  function(a, b) {
    var setB = new Set(b);
    return a.filter(function(x) { return setB.delete(x); });
  }
`)

/** Returns elements present in either array (deduped). */
@genType
let union: (array<'a>, array<'a>) => array<'a> = %raw(`
  function(a, b) {
    var la = a.length, lb = b.length, out, i, j, x, found;
    if (la + lb < 256) {
      out = a.slice();
      for (i = 0; i < lb; i++) {
        x = b[i]; found = false;
        for (j = 0; j < out.length; j++) { if (out[j] === x) { found = true; break; } }
        if (!found) out.push(x);
      }
      return out;
    }
    var seen = new Set(); out = [];
    for (i = 0; i < la; i++) { x = a[i]; if (!seen.has(x)) { seen.add(x); out.push(x); } }
    for (i = 0; i < lb; i++) { x = b[i]; if (!seen.has(x)) { seen.add(x); out.push(x); } }
    return out;
  }
`)

/** Like `union`, but compares elements by a key function. */
@genType
let unionBy = (a: array<'a>, b: array<'a>, f: 'a => string): array<'a> => {
  let seen = Set.make()
  let result = []
  for i in 0 to Array.length(a) - 1 {
    let x = Belt.Array.getUnsafe(a, i)
    let k = f(x)
    if !Set.has(seen, k) { Set.add(seen, k)->ignore; result->Array.push(x) }
  }
  for i in 0 to Array.length(b) - 1 {
    let x = Belt.Array.getUnsafe(b, i)
    let k = f(x)
    if !Set.has(seen, k) { Set.add(seen, k)->ignore; result->Array.push(x) }
  }
  result
}

/** Like `intersection`, but compares elements by a key function. */
@genType
let intersectionBy = (a: array<'a>, b: array<'a>, f: 'a => string): array<'a> => {
  let setB = Set.make()
  for i in 0 to Array.length(b) - 1 { Set.add(setB, f(Belt.Array.getUnsafe(b, i)))->ignore }
  let seen = Set.make()
  let result = []
  for i in 0 to Array.length(a) - 1 {
    let x = Belt.Array.getUnsafe(a, i)
    let k = f(x)
    if Set.has(setB, k) && !Set.has(seen, k) { Set.add(seen, k)->ignore; result->Array.push(x) }
  }
  result
}

/** Returns elements in the first array but not the second (deduped). */
@genType
let difference: (array<'a>, array<'a>) => array<'a> = %raw(`
  function(a, b) {
    var lenA = a.length, lenB = b.length, out = [];
    if (lenB < 64) {
      outer: for (var i = 0; i < lenA; i++) {
        var x = a[i];
        for (var j = 0; j < lenB; j++) { if (b[j] === x) continue outer; }
        out.push(x);
      }
    } else {
      var setB = new Set(b);
      for (var i = 0; i < lenA; i++) {
        var x = a[i];
        if (!setB.has(x)) { setB.add(x); out.push(x); }
      }
    }
    return out;
  }
`)

/** Like `difference`, but compares elements by a key function. */
@genType
let differenceBy = (a: array<'a>, b: array<'a>, f: 'a => string): array<'a> => {
  let setB = Set.make()
  for i in 0 to Array.length(b) - 1 { Set.add(setB, f(Belt.Array.getUnsafe(b, i)))->ignore }
  let seen = Set.make()
  let result = []
  for i in 0 to Array.length(a) - 1 {
    let x = Belt.Array.getUnsafe(a, i)
    let k = f(x)
    if !Set.has(setB, k) && !Set.has(seen, k) { Set.add(seen, k)->ignore; result->Array.push(x) }
  }
  result
}

/** Returns elements in one array but not both (deduped). */
@genType
let symmetricDifference: (array<'a>, array<'a>) => array<'a> = %raw(`
  function(a, b) {
    var la = a.length, lb = b.length, out, i, j, x;
    if (la + lb < 256) {
      var d1 = [], d2 = [];
      outer1: for (i = 0; i < la; i++) { x = a[i]; j = lb; while (j--) { if (b[j] === x) continue outer1; } d1.push(x); }
      outer2: for (i = 0; i < lb; i++) { x = b[i]; j = la; while (j--) { if (a[j] === x) continue outer2; } d2.push(x); }
      var all = d1.length + d2.length; out = new Array(all);
      for (i = 0; i < d1.length; i++) out[i] = d1[i];
      for (i = 0; i < d2.length; i++) out[d1.length + i] = d2[i];
      if (all < 2) return out;
      var r = [out[0]];
      outer3: for (i = 1; i < all; i++) { x = out[i]; j = r.length; while (j--) { if (r[j] === x) continue outer3; } r.push(x); }
      return r;
    }
    var setA = new Set(a), setB = new Set(b); out = [];
    for (i = 0; i < la; i++) { x = a[i]; if (!setB.has(x) && setA.has(x)) { setA.delete(x); out.push(x); } }
    for (i = 0; i < lb; i++) { x = b[i]; if (!setA.has(x) && setB.has(x)) { setB.delete(x); out.push(x); } }
    return out;
  }
`)

/** Like `symmetricDifference`, but compares elements by a key function. */
@genType
let symmetricDifferenceBy = (a: array<'a>, b: array<'a>, f: 'a => string): array<'a> => {
  let setA = Set.make()
  let setB = Set.make()
  for i in 0 to Array.length(a) - 1 { Set.add(setA, f(Belt.Array.getUnsafe(a, i)))->ignore }
  for i in 0 to Array.length(b) - 1 { Set.add(setB, f(Belt.Array.getUnsafe(b, i)))->ignore }
  let seen = Set.make()
  let result = []
  for i in 0 to Array.length(a) - 1 {
    let x = Belt.Array.getUnsafe(a, i)
    let k = f(x)
    if !Set.has(setB, k) && !Set.has(seen, k) { Set.add(seen, k)->ignore; result->Array.push(x) }
  }
  for i in 0 to Array.length(b) - 1 {
    let x = Belt.Array.getUnsafe(b, i)
    let k = f(x)
    if !Set.has(setA, k) && !Set.has(seen, k) { Set.add(seen, k)->ignore; result->Array.push(x) }
  }
  result
}

// Group 12: Core List Operations

@genType
let append = (arr: array<'a>, value: 'a): array<'a> => {
  let len = Array.length(arr)
  let out = Belt.Array.makeUninitializedUnsafe(len + 1)
  for i in 0 to len - 1 {
    Belt.Array.setUnsafe(out, i, Belt.Array.getUnsafe(arr, i))
  }
  Belt.Array.setUnsafe(out, len, value)
  out
}

@genType
let prepend = (arr: array<'a>, value: 'a): array<'a> => {
  let len = Array.length(arr)
  let out = Belt.Array.makeUninitializedUnsafe(len + 1)
  Belt.Array.setUnsafe(out, 0, value)
  for i in 0 to len - 1 {
    Belt.Array.setUnsafe(out, i + 1, Belt.Array.getUnsafe(arr, i))
  }
  out
}

@genType
let concat: (array<'a>, array<'a>) => array<'a> = %raw(`
  function(a, b) { return a.concat(b) }
`)

@genType
let nth: (array<'a>, int) => option<'a> = %raw(`
  function(arr, n) {
    var i = n < 0 ? arr.length + n : n;
    return i < 0 || i >= arr.length ? undefined : arr[i];
  }
`)

@genType
let indexOf: (array<'a>, 'a) => option<int> = %raw(`
  function(arr, val) {
    var i = arr.indexOf(val);
    return i === -1 ? undefined : i;
  }
`)

@genType
let lastIndexOf: (array<'a>, 'a) => option<int> = %raw(`
  function(arr, val) {
    var i = arr.lastIndexOf(val);
    return i === -1 ? undefined : i;
  }
`)

@genType
let findLast: (array<'a>, 'a => bool) => option<'a> = %raw(`
  function(arr, pred) {
    for (var i = arr.length - 1; i >= 0; i--) { if (pred(arr[i])) return arr[i]; }
    return undefined;
  }
`)

@genType
let findLastIndex: (array<'a>, 'a => bool) => option<int> = %raw(`
  function(arr, pred) {
    for (var i = arr.length - 1; i >= 0; i--) { if (pred(arr[i])) return i; }
    return undefined;
  }
`)

@genType
let reject: (array<'a>, 'a => bool) => array<'a> = %raw(`
  function(arr, pred) {
    var out = [];
    for (var i = 0; i < arr.length; i++) { if (!pred(arr[i])) out.push(arr[i]); }
    return out;
  }
`)

@genType
let none: (array<'a>, 'a => bool) => bool = %raw(`
  function(arr, pred) {
    for (var i = 0; i < arr.length; i++) { if (pred(arr[i])) return false; }
    return true;
  }
`)

@genType
let count = (arr: array<'a>, pred: 'a => bool): int => {
  let len = Array.length(arr)
  let c = ref(0)
  for i in 0 to len - 1 {
    if pred(Belt.Array.getUnsafe(arr, i)) {
      c := c.contents + 1
    }
  }
  c.contents
}

@genType
let slice = (arr: array<'a>, start: int, end_: int): array<'a> => {
  let len = Array.length(arr)
  let s = if start < 0 { if len + start > 0 { len + start } else { 0 } } else { if start < len { start } else { len } }
  let e = if end_ < 0 { if len + end_ > 0 { len + end_ } else { 0 } } else { if end_ < len { end_ } else { len } }
  if s >= e {
    []
  } else {
    let count = e - s
    let out = Belt.Array.makeUninitializedUnsafe(count)
    for i in 0 to count - 1 {
      Belt.Array.setUnsafe(out, i, Belt.Array.getUnsafe(arr, s + i))
    }
    out
  }
}

@genType
let join: (array<string>, string) => string = %raw(`
  function(arr, sep) { return arr.join(sep); }
`)

@genType
let pair = (a: 'a, b: 'b): ('a, 'b) => (a, b)

let pluckRaw: (array<'a>, string) => array<'b> = %raw(`
  function(arr, key) {
    const len = arr.length;
    const out = new Array(len);
    for (let i = 0; i < len; i++) {
      out[i] = arr[i][key];
    }
    return out;
  }
`)

@genType
let pluck = (arr: array<'a>, key: string): array<'b> => pluckRaw(arr, key)

@genType
let without = (arr: array<'a>, values: array<'a>): array<'a> => {
  let exclude = Set.fromArray(values)
  let result = []
  for i in 0 to Array.length(arr) - 1 {
    let x = Belt.Array.getUnsafe(arr, i)
    if !Set.has(exclude, x) { result->Array.push(x) }
  }
  result
}

/** Like `without`, but compares elements by a key function. */
@genType
let withoutBy = (arr: array<'a>, values: array<'a>, f: 'a => string): array<'a> => {
  let exclude = Set.make()
  for i in 0 to Array.length(values) - 1 { Set.add(exclude, f(Belt.Array.getUnsafe(values, i)))->ignore }
  let result = []
  for i in 0 to Array.length(arr) - 1 {
    let x = Belt.Array.getUnsafe(arr, i)
    if !Set.has(exclude, f(x)) { result->Array.push(x) }
  }
  result
}

@genType
let dropLast = (arr: array<'a>, n: int): array<'a> => {
  let len = Array.length(arr)
  if n <= 0 {
    Belt.Array.copy(arr)
  } else if n >= len {
    []
  } else {
    let count = len - n
    let out = Belt.Array.makeUninitializedUnsafe(count)
    for i in 0 to count - 1 {
      Belt.Array.setUnsafe(out, i, Belt.Array.getUnsafe(arr, i))
    }
    out
  }
}

@genType
let dropLastWhile = (arr: array<'a>, pred: 'a => bool): array<'a> => {
  let len = Array.length(arr)
  let i = ref(len - 1)
  while i.contents >= 0 && pred(Belt.Array.getUnsafe(arr, i.contents)) {
    i := i.contents - 1
  }
  let count = i.contents + 1
  if count === len {
    Belt.Array.copy(arr)
  } else if count <= 0 {
    []
  } else {
    let out = Belt.Array.makeUninitializedUnsafe(count)
    for j in 0 to count - 1 {
      Belt.Array.setUnsafe(out, j, Belt.Array.getUnsafe(arr, j))
    }
    out
  }
}

@genType
let dropRepeats = (arr: array<'a>): array<'a> => {
  let len = Array.length(arr)
  if len === 0 {
    []
  } else {
    let result = [Belt.Array.getUnsafe(arr, 0)]
    for i in 1 to len - 1 {
      let x = Belt.Array.getUnsafe(arr, i)
      if x != Belt.Array.getUnsafe(arr, i - 1) { result->Array.push(x) }
    }
    result
  }
}

@genType
let dropRepeatsBy = (arr: array<'a>, f: 'a => 'b): array<'a> => {
  let len = Array.length(arr)
  if len === 0 {
    []
  } else {
    let first = Belt.Array.getUnsafe(arr, 0)
    let result = [first]
    let lastKey = ref(f(first))
    for i in 1 to len - 1 {
      let x = Belt.Array.getUnsafe(arr, i)
      let key = f(x)
      if key != lastKey.contents { result->Array.push(x); lastKey := key }
    }
    result
  }
}

@genType
let dropRepeatsWith = (arr: array<'a>, eq: ('a, 'a) => bool): array<'a> => {
  let len = Array.length(arr)
  if len === 0 {
    []
  } else {
    let result = [Belt.Array.getUnsafe(arr, 0)]
    for i in 1 to len - 1 {
      let x = Belt.Array.getUnsafe(arr, i)
      if !eq(Belt.Array.getUnsafe(arr, i - 1), x) { result->Array.push(x) }
    }
    result
  }
}

@genType
let takeLast = (arr: array<'a>, n: int): array<'a> => {
  let len = Array.length(arr)
  if n <= 0 {
    []
  } else if n >= len {
    Belt.Array.copy(arr)
  } else {
    let start = len - n
    let out = Belt.Array.makeUninitializedUnsafe(n)
    for i in 0 to n - 1 {
      Belt.Array.setUnsafe(out, i, Belt.Array.getUnsafe(arr, start + i))
    }
    out
  }
}

@genType
let takeLastWhile = (arr: array<'a>, pred: 'a => bool): array<'a> => {
  let len = Array.length(arr)
  let i = ref(len - 1)
  while i.contents >= 0 && pred(Belt.Array.getUnsafe(arr, i.contents)) {
    i := i.contents - 1
  }
  let start = i.contents + 1
  let count = len - start
  if count <= 0 {
    []
  } else if count === len {
    Belt.Array.copy(arr)
  } else {
    let out = Belt.Array.makeUninitializedUnsafe(count)
    for j in 0 to count - 1 {
      Belt.Array.setUnsafe(out, j, Belt.Array.getUnsafe(arr, start + j))
    }
    out
  }
}

@genType
let splitAt: (array<'a>, int) => (array<'a>, array<'a>) = %raw(`
  function(arr, index) {
    var i = index < 0 ? 0 : index > arr.length ? arr.length : index;
    return [arr.slice(0, i), arr.slice(i)];
  }
`)

@genType
let splitWhen = (arr: array<'a>, pred: 'a => bool): (array<'a>, array<'a>) => {
  let len = Array.length(arr)
  let i = ref(0)
  let found = ref(false)
  while i.contents < len && !found.contents {
    if pred(Belt.Array.getUnsafe(arr, i.contents)) {
      found := true
    } else {
      i := i.contents + 1
    }
  }
  splitAt(arr, i.contents)
}

// Phase 2: Advanced List Operations

@genType
let splitWhenever = (arr: array<'a>, pred: 'a => bool): array<array<'a>> => {
  let len = Array.length(arr)
  if len === 0 {
    []
  } else {
    let result: array<array<'a>> = []
    let current: array<'a> = []
    for i in 0 to len - 1 {
      let x = Belt.Array.getUnsafe(arr, i)
      if pred(x) {
        result->Array.push(current->Array.copy)
        let _ = current->Array.splice(~start=0, ~remove=Array.length(current), ~insert=[])
      } else {
        current->Array.push(x)
      }
    }
    result->Array.push(current->Array.copy)
    result
  }
}

@genType
let swap = (arr: array<'a>, i: int, j: int): array<'a> => {
  let len = Array.length(arr)
  if i < 0 || i >= len || j < 0 || j >= len {
    Belt.Array.copy(arr)
  } else {
    let out = Belt.Array.copy(arr)
    Belt.Array.setUnsafe(out, i, Belt.Array.getUnsafe(arr, j))
    Belt.Array.setUnsafe(out, j, Belt.Array.getUnsafe(arr, i))
    out
  }
}

@genType
let insertAll = (arr: array<'a>, index: int, values: array<'a>): array<'a> => {
  let len = Array.length(arr)
  let vLen = Array.length(values)
  let idx = if index < 0 { 0 } else if index > len { len } else { index }
  let out = Belt.Array.makeUninitializedUnsafe(len + vLen)
  for i in 0 to idx - 1 {
    Belt.Array.setUnsafe(out, i, Belt.Array.getUnsafe(arr, i))
  }
  for i in 0 to vLen - 1 {
    Belt.Array.setUnsafe(out, idx + i, Belt.Array.getUnsafe(values, i))
  }
  for i in idx to len - 1 {
    Belt.Array.setUnsafe(out, i + vLen, Belt.Array.getUnsafe(arr, i))
  }
  out
}

@genType
let arrayStartsWith = (arr: array<'a>, prefix: array<'a>): bool => {
  let lenA = Array.length(arr)
  let lenP = Array.length(prefix)
  if lenP > lenA {
    false
  } else {
    let i = ref(0)
    let ok = ref(true)
    while i.contents < lenP && ok.contents {
      if Belt.Array.getUnsafe(arr, i.contents) != Belt.Array.getUnsafe(prefix, i.contents) {
        ok := false
      }
      i := i.contents + 1
    }
    ok.contents
  }
}

@genType
let arrayEndsWith = (arr: array<'a>, suffix: array<'a>): bool => {
  let lenA = Array.length(arr)
  let lenS = Array.length(suffix)
  if lenS > lenA {
    false
  } else {
    let offset = lenA - lenS
    let i = ref(0)
    let ok = ref(true)
    while i.contents < lenS && ok.contents {
      if Belt.Array.getUnsafe(arr, offset + i.contents) != Belt.Array.getUnsafe(suffix, i.contents) {
        ok := false
      }
      i := i.contents + 1
    }
    ok.contents
  }
}

@genType
let uniqWith = (arr: array<'a>, eq: ('a, 'a) => bool): array<'a> => {
  let result = []
  for i in 0 to Array.length(arr) - 1 {
    let x = Belt.Array.getUnsafe(arr, i)
    let dup = ref(false)
    let j = ref(0)
    while j.contents < Array.length(result) && !dup.contents {
      if eq(Belt.Array.getUnsafe(result, j.contents), x) { dup := true }
      j := j.contents + 1
    }
    if !dup.contents { result->Array.push(x) }
  }
  result
}

@genType
let unionWith = (a: array<'a>, b: array<'a>, eq: ('a, 'a) => bool): array<'a> => {
  let result = []
  let addIfNew = (x: 'a) => {
    let dup = ref(false)
    let j = ref(0)
    while j.contents < Array.length(result) && !dup.contents {
      if eq(Belt.Array.getUnsafe(result, j.contents), x) { dup := true }
      j := j.contents + 1
    }
    if !dup.contents { result->Array.push(x) }
  }
  for i in 0 to Array.length(a) - 1 { addIfNew(Belt.Array.getUnsafe(a, i)) }
  for i in 0 to Array.length(b) - 1 { addIfNew(Belt.Array.getUnsafe(b, i)) }
  result
}

@genType
let differenceWith = (a: array<'a>, b: array<'a>, eq: ('a, 'a) => bool): array<'a> => {
  let result = []
  for i in 0 to Array.length(a) - 1 {
    let x = Belt.Array.getUnsafe(a, i)
    let found = ref(false)
    let j = ref(0)
    while j.contents < Array.length(b) && !found.contents {
      if eq(x, Belt.Array.getUnsafe(b, j.contents)) { found := true }
      j := j.contents + 1
    }
    if !found.contents { result->Array.push(x) }
  }
  result
}

@genType
let symmetricDifferenceWith = (a: array<'a>, b: array<'a>, eq: ('a, 'a) => bool): array<'a> => {
  let result = []
  for i in 0 to Array.length(a) - 1 {
    let x = Belt.Array.getUnsafe(a, i)
    let found = ref(false)
    let j = ref(0)
    while j.contents < Array.length(b) && !found.contents {
      if eq(x, Belt.Array.getUnsafe(b, j.contents)) { found := true }
      j := j.contents + 1
    }
    if !found.contents { result->Array.push(x) }
  }
  for i in 0 to Array.length(b) - 1 {
    let x = Belt.Array.getUnsafe(b, i)
    let found = ref(false)
    let j = ref(0)
    while j.contents < Array.length(a) && !found.contents {
      if eq(x, Belt.Array.getUnsafe(a, j.contents)) { found := true }
      j := j.contents + 1
    }
    if !found.contents { result->Array.push(x) }
  }
  result
}

@genType
let indexBy = (arr: array<'a>, f: 'a => string): Dict.t<'a> => {
  let len = Array.length(arr)
  let dict = Dict.make()
  for i in 0 to len - 1 {
    let x = Belt.Array.getUnsafe(arr, i)
    Dict.set(dict, f(x), x)
  }
  dict
}

@genType
let collectBy = (arr: array<'a>, f: 'a => string): array<array<'a>> => {
  let len = Array.length(arr)
  let dict: Dict.t<array<'a>> = Dict.make()
  let keys: array<string> = []
  for i in 0 to len - 1 {
    let x = Belt.Array.getUnsafe(arr, i)
    let key = f(x)
    switch Dict.get(dict, key) {
    | None =>
      Dict.set(dict, key, [x])
      keys->Array.push(key)
    | Some(group) =>
      group->Array.push(x)
    }
  }
  let kLen = Array.length(keys)
  let out = Belt.Array.makeUninitializedUnsafe(kLen)
  for i in 0 to kLen - 1 {
    switch Dict.get(dict, Belt.Array.getUnsafe(keys, i)) {
    | Some(group) => Belt.Array.setUnsafe(out, i, group)
    | None => Belt.Array.setUnsafe(out, i, [])
    }
  }
  out
}

@genType
let groupWith = (arr: array<'a>, eq: ('a, 'a) => bool): array<array<'a>> => {
  let len = Array.length(arr)
  if len === 0 {
    []
  } else {
    let result: array<array<'a>> = []
    let current: array<'a> = [Belt.Array.getUnsafe(arr, 0)]
    for i in 1 to len - 1 {
      let x = Belt.Array.getUnsafe(arr, i)
      if eq(Belt.Array.getUnsafe(arr, i - 1), x) {
        current->Array.push(x)
      } else {
        result->Array.push(current->Array.copy)
        let _ = current->Array.splice(~start=0, ~remove=Array.length(current), ~insert=[x])
      }
    }
    result->Array.push(current->Array.copy)
    result
  }
}

@genType
let mapAccum = (arr: array<'a>, f: ('b, 'a) => ('b, 'c), init: 'b): ('b, array<'c>) => {
  let len = Array.length(arr)
  let out = Belt.Array.makeUninitializedUnsafe(len)
  let acc = ref(init)
  for i in 0 to len - 1 {
    let (nextAcc, value) = f(acc.contents, Belt.Array.getUnsafe(arr, i))
    acc := nextAcc
    Belt.Array.setUnsafe(out, i, value)
  }
  (acc.contents, out)
}

@genType
let mapAccumRight = (arr: array<'a>, f: ('b, 'a) => ('b, 'c), init: 'b): ('b, array<'c>) => {
  let len = Array.length(arr)
  let out = Belt.Array.makeUninitializedUnsafe(len)
  let acc = ref(init)
  for i in 0 to len - 1 {
    let j = len - 1 - i
    let (nextAcc, value) = f(acc.contents, Belt.Array.getUnsafe(arr, j))
    acc := nextAcc
    Belt.Array.setUnsafe(out, j, value)
  }
  (acc.contents, out)
}

@genType
let reduceBy = (arr: array<'a>, keyFn: 'a => string, reducer: ('b, 'a) => 'b, init: 'b): Dict.t<'b> => {
  let len = Array.length(arr)
  let dict = Dict.make()
  for i in 0 to len - 1 {
    let x = Belt.Array.getUnsafe(arr, i)
    let key = keyFn(x)
    let acc = switch Dict.get(dict, key) {
    | Some(v) => v
    | None => init
    }
    Dict.set(dict, key, reducer(acc, x))
  }
  dict
}

@genType
let reduceWhile = (arr: array<'a>, pred: ('b, 'a) => bool, f: ('b, 'a) => 'b, init: 'b): 'b => {
  let len = Array.length(arr)
  let acc = ref(init)
  let i = ref(0)
  let continue_ = ref(true)
  while i.contents < len && continue_.contents {
    let x = Belt.Array.getUnsafe(arr, i.contents)
    if pred(acc.contents, x) {
      acc := f(acc.contents, x)
      i := i.contents + 1
    } else {
      continue_ := false
    }
  }
  acc.contents
}

let mergeAllRaw: array<'a> => 'b = %raw(`
  function(arr) {
    return Object.assign({}, ...arr);
  }
`)

@genType
let mergeAll = (arr: array<'a>): 'b => mergeAllRaw(arr)

@genType
let zipObj = (keys: array<string>, values: array<'a>): Dict.t<'a> => {
  let lenK = Array.length(keys)
  let lenV = Array.length(values)
  let len = if lenK < lenV { lenK } else { lenV }
  let dict = Dict.make()
  for i in 0 to len - 1 {
    Dict.set(dict, Belt.Array.getUnsafe(keys, i), Belt.Array.getUnsafe(values, i))
  }
  dict
}

@genType
let unnest = (arr: array<array<'a>>): array<'a> => flatten(arr)

// Group 14: Remeda-Unique Array Functions

@genType
let mapToObj = (arr: array<'a>, f: 'a => (string, 'b)): Dict.t<'b> => {
  let len = Array.length(arr)
  let dict = Dict.make()
  for i in 0 to len - 1 {
    let (key, value) = f(Belt.Array.getUnsafe(arr, i))
    Dict.set(dict, key, value)
  }
  dict
}

@genType
let only = (arr: array<'a>): option<'a> =>
  if Array.length(arr) === 1 { Some(Belt.Array.getUnsafe(arr, 0)) } else { None }

@genType
let hasAtLeast = (arr: array<'a>, n: int): bool => Array.length(arr) >= n

let sampleRaw: (array<'a>, int) => array<'a> = %raw(`
  function(arr, n) {
    var len = arr.length;
    var size = n > len ? len : n;
    var copy = arr.slice();
    for (var i = len - 1; i > len - 1 - size && i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = copy[i]; copy[i] = copy[j]; copy[j] = tmp;
    }
    return copy.slice(len - size);
  }
`)

@genType
let sample = (arr: array<'a>, n: int): array<'a> => sampleRaw(arr, n)

let shuffleRaw: array<'a> => array<'a> = %raw(`
  function(arr) {
    var copy = arr.slice();
    for (var i = copy.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = copy[i]; copy[i] = copy[j]; copy[j] = tmp;
    }
    return copy;
  }
`)

@genType
let shuffle = (arr: array<'a>): array<'a> => shuffleRaw(arr)

@genType
let splice = (arr: array<'a>, start: int, deleteCount: int, items: array<'a>): array<'a> => {
  let len = Array.length(arr)
  let s = if start < 0 { if len + start > 0 { len + start } else { 0 } } else { if start < len { start } else { len } }
  let dc = if deleteCount < 0 { 0 } else if s + deleteCount > len { len - s } else { deleteCount }
  let itemsLen = Array.length(items)
  let newLen = len - dc + itemsLen
  let out = Belt.Array.makeUninitializedUnsafe(newLen)
  for i in 0 to s - 1 {
    Belt.Array.setUnsafe(out, i, Belt.Array.getUnsafe(arr, i))
  }
  for i in 0 to itemsLen - 1 {
    Belt.Array.setUnsafe(out, s + i, Belt.Array.getUnsafe(items, i))
  }
  for i in s + dc to len - 1 {
    Belt.Array.setUnsafe(out, s + itemsLen + (i - s - dc), Belt.Array.getUnsafe(arr, i))
  }
  out
}

@genType
let sortedIndex = (arr: array<float>, value: float): int => {
  let lo = ref(0)
  let hi = ref(Array.length(arr))
  while lo.contents < hi.contents {
    let mid = (lo.contents + hi.contents) / 2
    if Belt.Array.getUnsafe(arr, mid) < value {
      lo := mid + 1
    } else {
      hi := mid
    }
  }
  lo.contents
}

@genType
let sortedIndexBy = (arr: array<'a>, value: 'a, f: 'a => float): int => {
  let target = f(value)
  let lo = ref(0)
  let hi = ref(Array.length(arr))
  while lo.contents < hi.contents {
    let mid = (lo.contents + hi.contents) / 2
    if f(Belt.Array.getUnsafe(arr, mid)) < target {
      lo := mid + 1
    } else {
      hi := mid
    }
  }
  lo.contents
}

@genType
let sortedIndexWith = (arr: array<'a>, pred: 'a => bool): int => {
  let lo = ref(0)
  let hi = ref(Array.length(arr))
  while lo.contents < hi.contents {
    let mid = (lo.contents + hi.contents) / 2
    if !pred(Belt.Array.getUnsafe(arr, mid)) {
      lo := mid + 1
    } else {
      hi := mid
    }
  }
  lo.contents
}

@genType
let sortedLastIndex = (arr: array<float>, value: float): int => {
  let lo = ref(0)
  let hi = ref(Array.length(arr))
  while lo.contents < hi.contents {
    let mid = (lo.contents + hi.contents) / 2
    if Belt.Array.getUnsafe(arr, mid) <= value {
      lo := mid + 1
    } else {
      hi := mid
    }
  }
  lo.contents
}

@genType
let sortedLastIndexBy = (arr: array<'a>, value: 'a, f: 'a => float): int => {
  let target = f(value)
  let lo = ref(0)
  let hi = ref(Array.length(arr))
  while lo.contents < hi.contents {
    let mid = (lo.contents + hi.contents) / 2
    if f(Belt.Array.getUnsafe(arr, mid)) <= target {
      lo := mid + 1
    } else {
      hi := mid
    }
  }
  lo.contents
}

@genType
let meanBy = (arr: array<'a>, f: 'a => float): float => {
  let len = Array.length(arr)
  if len === 0 {
    0.0
  } else {
    let acc = ref(0.0)
    for i in 0 to len - 1 {
      acc := acc.contents +. f(Belt.Array.getUnsafe(arr, i))
    }
    acc.contents /. Int.toFloat(len)
  }
}

@genType
let sumBy = (arr: array<'a>, f: 'a => float): float => {
  let len = Array.length(arr)
  let acc = ref(0.0)
  for i in 0 to len - 1 {
    acc := acc.contents +. f(Belt.Array.getUnsafe(arr, i))
  }
  acc.contents
}

let groupByPropRaw: (array<'a>, string) => Dict.t<array<'a>> = %raw(`
  function(arr, prop) {
    var dict = {};
    for (var i = 0; i < arr.length; i++) {
      var key = String(arr[i][prop]);
      if (!dict[key]) dict[key] = [];
      dict[key].push(arr[i]);
    }
    return dict;
  }
`)

@genType
let groupByProp = (arr: array<'a>, prop: string): Dict.t<array<'a>> => groupByPropRaw(arr, prop)
