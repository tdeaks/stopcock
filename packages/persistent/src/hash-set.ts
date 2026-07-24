import { defaultHashEq, type HashEq } from './hash'
import { HashMap, HashMapBuilder } from './hash-map'

/** An immutable HAMT-backed set. */
export class HashSet<T> implements Iterable<T> {
  static empty<T>(hashEq: HashEq<T> = defaultHashEq as HashEq<T>): HashSet<T> {
    return new HashSet(HashMap.empty<T, true>(hashEq))
  }

  static from<T>(values: Iterable<T>, hashEq: HashEq<T> = defaultHashEq as HashEq<T>): HashSet<T> {
    const builder = new HashMapBuilder<T, true>(hashEq)
    for (const value of values) builder.set(value, true)
    return new HashSet(builder.build())
  }

  readonly #map: HashMap<T, true>

  /** Creates a set from a compatible immutable backing map. */
  constructor(map: HashMap<T, true>) {
    this.#map = map
  }

  get size(): number {
    return this.#map.size
  }

  get isEmpty(): boolean {
    return this.#map.isEmpty
  }

  get hashEq(): HashEq<T> {
    return this.#map.hashEq
  }

  has(value: T): boolean {
    return this.#map.has(value)
  }

  add(value: T): HashSet<T> {
    const map = this.#map.set(value, true)
    return map === this.#map ? this : new HashSet(map)
  }

  addAll(values: Iterable<T>): HashSet<T> {
    const builder = this.transient()
    builder.addAll(values)
    return builder.build()
  }

  remove(value: T): HashSet<T> {
    const map = this.#map.remove(value)
    return map === this.#map ? this : new HashSet(map)
  }

  delete(value: T): HashSet<T> {
    return this.remove(value)
  }

  union(values: Iterable<T>): HashSet<T> {
    return this.addAll(values)
  }

  intersection(values: Iterable<T>): HashSet<T> {
    const that =
      values instanceof HashSet && values.hashEq === this.hashEq
        ? values
        : HashSet.from(values, this.hashEq)
    const builder = HashSet.builder(this.hashEq)
    for (const value of this) {
      if (that.has(value)) builder.add(value)
    }
    return builder.build()
  }

  difference(values: Iterable<T>): HashSet<T> {
    const that =
      values instanceof HashSet && values.hashEq === this.hashEq
        ? values
        : HashSet.from(values, this.hashEq)
    const builder = HashSet.builder(this.hashEq)
    for (const value of this) {
      if (!that.has(value)) builder.add(value)
    }
    return builder.build()
  }

  isSubsetOf(values: Iterable<T>): boolean {
    const that =
      values instanceof HashSet && values.hashEq === this.hashEq
        ? values
        : HashSet.from(values, this.hashEq)
    for (const value of this) {
      if (!that.has(value)) return false
    }
    return true
  }

  toSet(): Set<T> {
    return new Set(this)
  }

  transient(): HashSetBuilder<T> {
    return HashSetBuilder.from(this)
  }

  static builder<T>(hashEq: HashEq<T> = defaultHashEq as HashEq<T>): HashSetBuilder<T> {
    return new HashSetBuilder(hashEq)
  }

  [Symbol.iterator](): IterableIterator<T> {
    return this.#map.keys()
  }
}

/** Mutable set builder. `build()` permanently seals it. */
export class HashSetBuilder<T> implements Iterable<T> {
  static from<T>(set: HashSet<T>): HashSetBuilder<T> {
    return new HashSetBuilder(set.hashEq, set)
  }

  readonly #map: HashMapBuilder<T, true>

  constructor(hashEq: HashEq<T> = defaultHashEq as HashEq<T>, values: Iterable<T> = []) {
    this.#map = new HashMapBuilder(hashEq)
    for (const value of values) this.#map.set(value, true)
  }

  get size(): number {
    return this.#map.size
  }

  get isSealed(): boolean {
    return this.#map.isSealed
  }

  get hashEq(): HashEq<T> {
    return this.#map.hashEq
  }

  has(value: T): boolean {
    return this.#map.has(value)
  }

  add(value: T): this {
    this.#map.set(value, true)
    return this
  }

  addAll(values: Iterable<T>): this {
    if (this.isSealed) throw new Error('HashSetBuilder has already been sealed')
    for (const value of values) this.#map.set(value, true)
    return this
  }

  remove(value: T): boolean {
    return this.#map.remove(value)
  }

  delete(value: T): boolean {
    return this.remove(value)
  }

  clear(): this {
    this.#map.clear()
    return this
  }

  build(): HashSet<T> {
    return new HashSet(this.#map.build())
  }

  *[Symbol.iterator](): IterableIterator<T> {
    for (const [value] of this.#map) yield value
  }
}

export const hashSet = <T>(
  values: Iterable<T> = [],
  hashEq: HashEq<T> = defaultHashEq as HashEq<T>,
): HashSet<T> => HashSet.from(values, hashEq)

export const hashSetBuilder = <T>(
  hashEq: HashEq<T> = defaultHashEq as HashEq<T>,
): HashSetBuilder<T> => HashSet.builder(hashEq)
