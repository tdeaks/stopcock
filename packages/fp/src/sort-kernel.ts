// Hand-written stable sorts, shared by every tier (array.ts data-first ops,
// lower.ts boundaries, interpret.ts oracle). Array.prototype.sort pays generic
// comparator dispatch on every element pair; a plain JS merge sort gets its
// comparator monomorphized and inlined, which is the whole reason ts-belt
// (Belt.SortArray, same algorithm out of the ReScript compiler) beat us on the
// sort benches. Output is identical to arr.slice().sort(cmp) for any
// consistent comparator: a stable sort's output is uniquely determined by the
// comparator plus stability.

const RUN = 32

export function mergeSortBy<A>(arr: readonly A[], cmp: (a: A, b: A) => number): A[] {
  const n = arr.length
  const a = arr.slice() as A[]
  if (n < 2) return a
  for (let lo = 0; lo < n; lo += RUN) {
    const hi = lo + RUN < n ? lo + RUN : n
    for (let i = lo + 1; i < hi; i++) {
      const v = a[i]
      let j = i - 1
      while (j >= lo && cmp(a[j], v) > 0) { a[j + 1] = a[j]; j-- }
      a[j + 1] = v
    }
  }
  if (n <= RUN) return a
  let src = a
  let dst = new Array<A>(n)
  for (let width = RUN; width < n; width *= 2) {
    const step = width * 2
    for (let lo = 0; lo < n; lo += step) {
      const mid = lo + width
      if (mid >= n) {
        for (let i = lo; i < n; i++) dst[i] = src[i]
        continue
      }
      const hi = mid + width < n ? mid + width : n
      let i = lo, j = mid, k = lo
      while (i < mid && j < hi) dst[k++] = cmp(src[j], src[i]) < 0 ? src[j++] : src[i++]
      while (i < mid) dst[k++] = src[i++]
      while (j < hi) dst[k++] = src[j++]
    }
    const t = src
    src = dst
    dst = t
  }
  return src
}

export function mergeSortAsc(arr: readonly number[]): number[] {
  const n = arr.length
  const a = arr.slice() as number[]
  if (n < 2) return a
  for (let lo = 0; lo < n; lo += RUN) {
    const hi = lo + RUN < n ? lo + RUN : n
    for (let i = lo + 1; i < hi; i++) {
      const v = a[i]
      let j = i - 1
      while (j >= lo && a[j] > v) { a[j + 1] = a[j]; j-- }
      a[j + 1] = v
    }
  }
  if (n <= RUN) return a
  let src = a
  let dst = new Array<number>(n)
  for (let width = RUN; width < n; width *= 2) {
    const step = width * 2
    for (let lo = 0; lo < n; lo += step) {
      const mid = lo + width
      if (mid >= n) {
        for (let i = lo; i < n; i++) dst[i] = src[i]
        continue
      }
      const hi = mid + width < n ? mid + width : n
      let i = lo, j = mid, k = lo
      while (i < mid && j < hi) dst[k++] = src[j] < src[i] ? src[j++] : src[i++]
      while (i < mid) dst[k++] = src[i++]
      while (j < hi) dst[k++] = src[j++]
    }
    const t = src
    src = dst
    dst = t
  }
  return src
}

export function mergeSortDesc(arr: readonly number[]): number[] {
  const n = arr.length
  const a = arr.slice() as number[]
  if (n < 2) return a
  for (let lo = 0; lo < n; lo += RUN) {
    const hi = lo + RUN < n ? lo + RUN : n
    for (let i = lo + 1; i < hi; i++) {
      const v = a[i]
      let j = i - 1
      while (j >= lo && a[j] < v) { a[j + 1] = a[j]; j-- }
      a[j + 1] = v
    }
  }
  if (n <= RUN) return a
  let src = a
  let dst = new Array<number>(n)
  for (let width = RUN; width < n; width *= 2) {
    const step = width * 2
    for (let lo = 0; lo < n; lo += step) {
      const mid = lo + width
      if (mid >= n) {
        for (let i = lo; i < n; i++) dst[i] = src[i]
        continue
      }
      const hi = mid + width < n ? mid + width : n
      let i = lo, j = mid, k = lo
      while (i < mid && j < hi) dst[k++] = src[j] > src[i] ? src[j++] : src[i++]
      while (i < mid) dst[k++] = src[i++]
      while (j < hi) dst[k++] = src[j++]
    }
    const t = src
    src = dst
    dst = t
  }
  return src
}
