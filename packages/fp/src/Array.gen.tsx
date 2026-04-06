/* TypeScript file generated from Array.res by genType. */

/* eslint-disable */
/* tslint:disable */

import * as ArrayJS from './Array.res.js';

import type {t as Dict_t} from './Dict.gen.tsx';

/** Returns the first element, or `undefined` if empty. */
export const head: <a>(_1:a[]) => (undefined | a) = ArrayJS.head as any;

/** Returns the last element, or `undefined` if empty. */
export const last: <a>(_1:a[]) => (undefined | a) = ArrayJS.last as any;

/** Returns all elements except the first. */
export const tail: <a>(arr:a[]) => a[] = ArrayJS.tail as any;

/** Returns all elements except the last. */
export const init: <a>(arr:a[]) => a[] = ArrayJS.init as any;

/** Checks whether the array is empty. */
export const isEmpty: <a>(arr:a[]) => boolean = ArrayJS.isEmpty as any;

/** Returns the number of elements. */
export const length: <a>(arr:a[]) => number = ArrayJS.length as any;

/** Returns the first `n` elements. */
export const take: <a>(arr:a[], n:number) => a[] = ArrayJS.take as any;

/** Returns all elements after the first `n`. */
export const drop: <a>(arr:a[], n:number) => a[] = ArrayJS.drop as any;

/** Returns the longest prefix of elements satisfying the predicate. */
export const takeWhile: <a>(_1:a[], _2:((_1:a) => boolean)) => a[] = ArrayJS.takeWhile as any;

/** Drops the longest prefix of elements satisfying the predicate. */
export const dropWhile: <a>(_1:a[], _2:((_1:a) => boolean)) => a[] = ArrayJS.dropWhile as any;

/** Splits into sub-arrays of size `n`. */
export const chunk: <a>(_1:a[], _2:number) => Array<a[]> = ArrayJS.chunk as any;

/** Returns overlapping windows of size `n`. */
export const slidingWindow: <a>(arr:a[], n:number) => Array<a[]> = ArrayJS.slidingWindow as any;

/** Applies a function to each element. */
export const map: <a,b>(_1:a[], _2:((_1:a) => b)) => b[] = ArrayJS.map as any;

/** Applies a function to each element with its index. */
export const mapWithIndex: <a,b>(_1:a[], _2:((_1:a, _2:number) => b)) => b[] = ArrayJS.mapWithIndex as any;

/** Returns elements satisfying the predicate. */
export const filter: <a>(arr:a[], pred:((_1:a) => boolean)) => a[] = ArrayJS.filter as any;

/** Returns elements satisfying the predicate, with index. */
export const filterWithIndex: <a>(arr:a[], pred:((_1:a, _2:number) => boolean)) => a[] = ArrayJS.filterWithIndex as any;

/** Calls a function on each element for side effects. */
export const forEach: <a>(arr:a[], f:((_1:a) => void)) => void = ArrayJS.forEach as any;

/** Calls a function on each element with its index for side effects. */
export const forEachWithIndex: <a>(arr:a[], f:((_1:a, _2:number) => void)) => void = ArrayJS.forEachWithIndex as any;

/** Reduces from left to right with an initial accumulator. */
export const reduce: <a,b>(_1:a[], _2:((_1:b, _2:a) => b), _3:b) => b = ArrayJS.reduce as any;

/** Reduces from right to left with an initial accumulator. */
export const reduceRight: <a,b>(_1:a[], _2:((_1:b, _2:a) => b), _3:b) => b = ArrayJS.reduceRight as any;

/** Maps each element to an array and flattens the result. */
export const flatMap: <a,b>(_1:a[], _2:((_1:a) => b[])) => b[] = ArrayJS.flatMap as any;

/** Flattens a nested array by one level. */
export const flatten: <a>(_1:Array<a[]>) => a[] = ArrayJS.flatten as any;

/** Returns the first element satisfying the predicate, or `undefined`. */
export const find: <a>(_1:a[], _2:((_1:a) => boolean)) => (undefined | a) = ArrayJS.find as any;

/** Returns the index of the first element satisfying the predicate, or `undefined`. */
export const findIndex: <a>(_1:a[], _2:((_1:a) => boolean)) => (undefined | number) = ArrayJS.findIndex as any;

/** Checks whether all elements satisfy the predicate. */
export const every: <a>(_1:a[], _2:((_1:a) => boolean)) => boolean = ArrayJS.every as any;

/** Checks whether any element satisfies the predicate. */
export const some: <a>(_1:a[], _2:((_1:a) => boolean)) => boolean = ArrayJS.some as any;

/** Checks whether the array contains the given value. */
export const includes: <a>(_1:a[], _2:a) => boolean = ArrayJS.includes as any;

/** Returns a new array with elements in reverse order. */
export const reverse: <a>(_1:a[]) => a[] = ArrayJS.reverse as any;

/** Returns a new array with elements in reverse order. */
export const sort: (arr:number[]) => number[] = ArrayJS.sort as any;

/** Returns a copy sorted by the given comparator. */
export const sortBy: <a>(arr:a[], cmp:((_1:a, _2:a) => number)) => a[] = ArrayJS.sortBy as any;

/** Returns the first k elements as if the array were sorted by cmp.
    Uses quickselect O(n) + sort O(k log k) instead of full sort O(n log n). */
export const takeSortedBy: <a>(_1:a[], _2:number, _3:((_1:a, _2:a) => number)) => a[] = ArrayJS.takeSortedBy as any;

/** Returns a new array with duplicates removed. */
export const uniq: <a>(_1:a[]) => a[] = ArrayJS.uniq as any;

/** Returns a new array deduplicated by the given key function. */
export const uniqBy: <a,b>(_1:a[], _2:((_1:a) => b)) => a[] = ArrayJS.uniqBy as any;

/** Inserts a separator between each element. */
export const intersperse: <a>(arr:a[], sep:a) => a[] = ArrayJS.intersperse as any;

/** Pairs elements from two arrays into tuples, truncating to the shorter. */
export const zip: <a,b>(_1:a[], _2:b[]) => Array<[a, b]> = ArrayJS.zip as any;

/** Combines elements from two arrays using a function, truncating to the shorter. */
export const zipWith: <a,b,c>(a:a[], b:b[], f:((_1:a, _2:b) => c)) => c[] = ArrayJS.zipWith as any;

/** Groups elements by a string key function. */
export const groupBy: <a>(_1:a[], _2:((_1:a) => string)) => Dict_t<a[]> = ArrayJS.groupBy as any;

/** Splits into `[matches, non-matches]` based on the predicate. */
export const partition: <a>(arr:a[], pred:((_1:a) => boolean)) => [a[], a[]] = ArrayJS.partition as any;

/** Applies a function to the element at the given index. Returns unchanged if out of bounds. */
export const adjust: <a>(arr:a[], index:number, f:((_1:a) => a)) => a[] = ArrayJS.adjust as any;

/** Replaces the element at the given index. Returns unchanged if out of bounds. */
export const update: <a>(_1:a[], _2:number, _3:a) => a[] = ArrayJS.update as any;

/** Inserts an element at the given index, shifting subsequent elements right. */
export const insert: <a>(arr:a[], index:number, value:a) => a[] = ArrayJS.insert as any;

/** Removes `count` elements starting at the given index. */
export const remove: <a>(arr:a[], index:number, count:number) => a[] = ArrayJS.remove as any;

/** Alias for `slidingWindow`. */
export const aperture: <a>(arr:a[], n:number) => Array<a[]> = ArrayJS.aperture as any;

/** Creates an array of integers from `start` (inclusive) to `end` (exclusive). */
export const range: (start:number, end_:number) => number[] = ArrayJS.range as any;

/** Creates an array of `n` copies of the given value. */
export const repeat: <a>(value:a, n:number) => a[] = ArrayJS.repeat as any;

/** Creates an array by applying a function to each index from 0 to `n - 1`. */
export const times: <a>(f:((_1:number) => a), n:number) => a[] = ArrayJS.times as any;

/** Generates an array by repeatedly applying a function to a seed until it returns `undefined`. */
export const unfold: <a,b>(f:((_1:b) => (undefined | [a, b])), seed:b) => a[] = ArrayJS.unfold as any;

/** Like `reduce`, but returns all intermediate accumulator values. */
export const scan: <a,b>(arr:a[], f:((_1:b, _2:a) => b), init:b) => b[] = ArrayJS.scan as any;

/** Returns the cartesian product of two arrays as tuples. */
export const xprod: <a,b>(a:a[], b:b[]) => Array<[a, b]> = ArrayJS.xprod as any;

/** Transposes rows and columns, truncating to the shortest row. */
export const transpose: <a>(arr:Array<a[]>) => Array<a[]> = ArrayJS.transpose as any;

/** Returns elements present in both arrays (deduped). */
export const intersection: <a>(_1:a[], _2:a[]) => a[] = ArrayJS.intersection as any;

/** Returns elements present in either array (deduped). */
export const union: <a>(_1:a[], _2:a[]) => a[] = ArrayJS.union as any;

/** Like `union`, but compares elements by a key function. */
export const unionBy: <a>(a:a[], b:a[], f:((_1:a) => string)) => a[] = ArrayJS.unionBy as any;

/** Like `intersection`, but compares elements by a key function. */
export const intersectionBy: <a>(a:a[], b:a[], f:((_1:a) => string)) => a[] = ArrayJS.intersectionBy as any;

/** Returns elements in the first array but not the second (deduped). */
export const difference: <a>(_1:a[], _2:a[]) => a[] = ArrayJS.difference as any;

/** Like `difference`, but compares elements by a key function. */
export const differenceBy: <a>(a:a[], b:a[], f:((_1:a) => string)) => a[] = ArrayJS.differenceBy as any;

/** Returns elements in one array but not both (deduped). */
export const symmetricDifference: <a>(_1:a[], _2:a[]) => a[] = ArrayJS.symmetricDifference as any;

/** Like `symmetricDifference`, but compares elements by a key function. */
export const symmetricDifferenceBy: <a>(a:a[], b:a[], f:((_1:a) => string)) => a[] = ArrayJS.symmetricDifferenceBy as any;

export const append: <a>(arr:a[], value:a) => a[] = ArrayJS.append as any;

export const prepend: <a>(arr:a[], value:a) => a[] = ArrayJS.prepend as any;

export const concat: <a>(_1:a[], _2:a[]) => a[] = ArrayJS.concat as any;

export const nth: <a>(_1:a[], _2:number) => (undefined | a) = ArrayJS.nth as any;

export const indexOf: <a>(_1:a[], _2:a) => (undefined | number) = ArrayJS.indexOf as any;

export const lastIndexOf: <a>(_1:a[], _2:a) => (undefined | number) = ArrayJS.lastIndexOf as any;

export const findLast: <a>(_1:a[], _2:((_1:a) => boolean)) => (undefined | a) = ArrayJS.findLast as any;

export const findLastIndex: <a>(_1:a[], _2:((_1:a) => boolean)) => (undefined | number) = ArrayJS.findLastIndex as any;

export const reject: <a>(_1:a[], _2:((_1:a) => boolean)) => a[] = ArrayJS.reject as any;

export const none: <a>(_1:a[], _2:((_1:a) => boolean)) => boolean = ArrayJS.none as any;

export const count: <a>(arr:a[], pred:((_1:a) => boolean)) => number = ArrayJS.count as any;

export const slice: <a>(arr:a[], start:number, end_:number) => a[] = ArrayJS.slice as any;

export const join: (_1:string[], _2:string) => string = ArrayJS.join as any;

export const pair: <a,b>(a:a, b:b) => [a, b] = ArrayJS.pair as any;

export const pluck: <a,b>(arr:a[], key:string) => b[] = ArrayJS.pluck as any;

export const without: <a>(arr:a[], values:a[]) => a[] = ArrayJS.without as any;

/** Like `without`, but compares elements by a key function. */
export const withoutBy: <a>(arr:a[], values:a[], f:((_1:a) => string)) => a[] = ArrayJS.withoutBy as any;

export const dropLast: <a>(arr:a[], n:number) => a[] = ArrayJS.dropLast as any;

export const dropLastWhile: <a>(arr:a[], pred:((_1:a) => boolean)) => a[] = ArrayJS.dropLastWhile as any;

export const dropRepeats: <a>(arr:a[]) => a[] = ArrayJS.dropRepeats as any;

export const dropRepeatsBy: <a,b>(arr:a[], f:((_1:a) => b)) => a[] = ArrayJS.dropRepeatsBy as any;

export const dropRepeatsWith: <a>(arr:a[], eq:((_1:a, _2:a) => boolean)) => a[] = ArrayJS.dropRepeatsWith as any;

export const takeLast: <a>(arr:a[], n:number) => a[] = ArrayJS.takeLast as any;

export const takeLastWhile: <a>(arr:a[], pred:((_1:a) => boolean)) => a[] = ArrayJS.takeLastWhile as any;

export const splitAt: <a>(_1:a[], _2:number) => [a[], a[]] = ArrayJS.splitAt as any;

export const splitWhen: <a>(arr:a[], pred:((_1:a) => boolean)) => [a[], a[]] = ArrayJS.splitWhen as any;

export const splitWhenever: <a>(arr:a[], pred:((_1:a) => boolean)) => Array<a[]> = ArrayJS.splitWhenever as any;

export const swap: <a>(arr:a[], i:number, j:number) => a[] = ArrayJS.swap as any;

export const insertAll: <a>(arr:a[], index:number, values:a[]) => a[] = ArrayJS.insertAll as any;

export const arrayStartsWith: <a>(arr:a[], prefix:a[]) => boolean = ArrayJS.arrayStartsWith as any;

export const arrayEndsWith: <a>(arr:a[], suffix:a[]) => boolean = ArrayJS.arrayEndsWith as any;

export const uniqWith: <a>(arr:a[], eq:((_1:a, _2:a) => boolean)) => a[] = ArrayJS.uniqWith as any;

export const unionWith: <a>(a:a[], b:a[], eq:((_1:a, _2:a) => boolean)) => a[] = ArrayJS.unionWith as any;

export const differenceWith: <a>(a:a[], b:a[], eq:((_1:a, _2:a) => boolean)) => a[] = ArrayJS.differenceWith as any;

export const symmetricDifferenceWith: <a>(a:a[], b:a[], eq:((_1:a, _2:a) => boolean)) => a[] = ArrayJS.symmetricDifferenceWith as any;

export const indexBy: <a>(arr:a[], f:((_1:a) => string)) => Dict_t<a> = ArrayJS.indexBy as any;

export const collectBy: <a>(arr:a[], f:((_1:a) => string)) => Array<a[]> = ArrayJS.collectBy as any;

export const groupWith: <a>(arr:a[], eq:((_1:a, _2:a) => boolean)) => Array<a[]> = ArrayJS.groupWith as any;

export const mapAccum: <a,b,c>(arr:a[], f:((_1:b, _2:a) => [b, c]), init:b) => [b, c[]] = ArrayJS.mapAccum as any;

export const mapAccumRight: <a,b,c>(arr:a[], f:((_1:b, _2:a) => [b, c]), init:b) => [b, c[]] = ArrayJS.mapAccumRight as any;

export const reduceBy: <a,b>(arr:a[], keyFn:((_1:a) => string), reducer:((_1:b, _2:a) => b), init:b) => Dict_t<b> = ArrayJS.reduceBy as any;

export const reduceWhile: <a,b>(arr:a[], pred:((_1:b, _2:a) => boolean), f:((_1:b, _2:a) => b), init:b) => b = ArrayJS.reduceWhile as any;

export const mergeAll: <a,b>(arr:a[]) => b = ArrayJS.mergeAll as any;

export const zipObj: <a>(keys:string[], values:a[]) => Dict_t<a> = ArrayJS.zipObj as any;

export const unnest: <a>(arr:Array<a[]>) => a[] = ArrayJS.unnest as any;

export const mapToObj: <a,b>(arr:a[], f:((_1:a) => [string, b])) => Dict_t<b> = ArrayJS.mapToObj as any;

export const only: <a>(arr:a[]) => (undefined | a) = ArrayJS.only as any;

export const hasAtLeast: <a>(arr:a[], n:number) => boolean = ArrayJS.hasAtLeast as any;

export const sample: <a>(arr:a[], n:number) => a[] = ArrayJS.sample as any;

export const shuffle: <a>(arr:a[]) => a[] = ArrayJS.shuffle as any;

export const splice: <a>(arr:a[], start:number, deleteCount:number, items:a[]) => a[] = ArrayJS.splice as any;

export const sortedIndex: (arr:number[], value:number) => number = ArrayJS.sortedIndex as any;

export const sortedIndexBy: <a>(arr:a[], value:a, f:((_1:a) => number)) => number = ArrayJS.sortedIndexBy as any;

export const sortedIndexWith: <a>(arr:a[], pred:((_1:a) => boolean)) => number = ArrayJS.sortedIndexWith as any;

export const sortedLastIndex: (arr:number[], value:number) => number = ArrayJS.sortedLastIndex as any;

export const sortedLastIndexBy: <a>(arr:a[], value:a, f:((_1:a) => number)) => number = ArrayJS.sortedLastIndexBy as any;

export const meanBy: <a>(arr:a[], f:((_1:a) => number)) => number = ArrayJS.meanBy as any;

export const sumBy: <a>(arr:a[], f:((_1:a) => number)) => number = ArrayJS.sumBy as any;

export const groupByProp: <a>(arr:a[], prop:string) => Dict_t<a[]> = ArrayJS.groupByProp as any;
