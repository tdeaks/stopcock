import { defaultHashEq, type HashEq } from './hash'
import { OrderedMap, OrderedMapBuilder } from './ordered-map'

/** An immutable insertion-ordered hash set. */
export class OrderedSet<T> implements Iterable<T> {
  static empty<T>(hashEq: HashEq<T> = defaultHashEq as HashEq<T>): OrderedSet<T> {
    return new OrderedSet(OrderedMap.empty(hashEq))
  }

  static from<T>(
    values: Iterable<T>,
    hashEq: HashEq<T> = defaultHashEq as HashEq<T>,
  ): OrderedSet<T> {
    const builder = new OrderedMapBuilder<T, true>(hashEq)
    for (const value of values) builder.set(value, true)
    return new OrderedSet(builder.build())
  }

  readonly #map: OrderedMap<T, true>

  /** Creates a set from a compatible immutable backing ordered map. */
  constructor(map: OrderedMap<T, true>) {
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

  add(value: T): OrderedSet<T> {
    const map = this.#map.set(value, true)
    return map === this.#map ? this : new OrderedSet(map)
  }

  addAll(values: Iterable<T>): OrderedSet<T> {
    const builder = this.transient()
    builder.addAll(values)
    return builder.build()
  }

  remove(value: T): OrderedSet<T> {
    const map = this.#map.remove(value)
    return map === this.#map ? this : new OrderedSet(map)
  }

  delete(value: T): OrderedSet<T> {
    return this.remove(value)
  }

  union(values: Iterable<T>): OrderedSet<T> {
    return this.addAll(values)
  }

  intersection(values: Iterable<T>): OrderedSet<T> {
    const that =
      values instanceof OrderedSet && values.hashEq === this.hashEq
        ? values
        : OrderedSet.from(values, this.hashEq)
    const builder = OrderedSet.builder(this.hashEq)
    for (const value of this) {
      if (that.has(value)) builder.add(value)
    }
    return builder.build()
  }

  difference(values: Iterable<T>): OrderedSet<T> {
    const that =
      values instanceof OrderedSet && values.hashEq === this.hashEq
        ? values
        : OrderedSet.from(values, this.hashEq)
    const builder = OrderedSet.builder(this.hashEq)
    for (const value of this) {
      if (!that.has(value)) builder.add(value)
    }
    return builder.build()
  }

  toSet(): Set<T> {
    return new Set(this)
  }

  transient(): OrderedSetBuilder<T> {
    return OrderedSetBuilder.from(this)
  }

  static builder<T>(hashEq: HashEq<T> = defaultHashEq as HashEq<T>): OrderedSetBuilder<T> {
    return new OrderedSetBuilder(hashEq)
  }

  [Symbol.iterator](): IterableIterator<T> {
    return this.#map.keys()
  }
}

/** Mutable ordered-set builder. `build()` permanently seals it. */
export class OrderedSetBuilder<T> implements Iterable<T> {
  static from<T>(set: OrderedSet<T>): OrderedSetBuilder<T> {
    return new OrderedSetBuilder(set.hashEq, set)
  }

  readonly #map: OrderedMapBuilder<T, true>

  constructor(hashEq: HashEq<T> = defaultHashEq as HashEq<T>, values: Iterable<T> = []) {
    this.#map = new OrderedMapBuilder(hashEq)
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
    if (this.isSealed) throw new Error('OrderedSetBuilder has already been sealed')
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

  build(): OrderedSet<T> {
    return new OrderedSet(this.#map.build())
  }

  *[Symbol.iterator](): IterableIterator<T> {
    for (const [value] of this.#map) yield value
  }
}

export const orderedSet = <T>(
  values: Iterable<T> = [],
  hashEq: HashEq<T> = defaultHashEq as HashEq<T>,
): OrderedSet<T> => OrderedSet.from(values, hashEq)

export const orderedSetBuilder = <T>(
  hashEq: HashEq<T> = defaultHashEq as HashEq<T>,
): OrderedSetBuilder<T> => OrderedSet.builder(hashEq)
