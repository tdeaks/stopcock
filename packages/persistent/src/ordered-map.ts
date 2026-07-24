import { defaultHashEq, type HashEq } from './hash'
import { HashMap, HashMapBuilder, type HashMapLookup } from './hash-map'
import { Vector } from './vector'

interface OrderedEntry<V> {
  readonly value: V
  readonly index: number
}

interface LiveSlot<K> {
  readonly _tag: 'Live'
  readonly key: K
}

interface DeadSlot {
  readonly _tag: 'Dead'
}

type Slot<K> = LiveSlot<K> | DeadSlot

const deadSlot: DeadSlot = { _tag: 'Dead' }
const liveSlot = <K>(key: K): LiveSlot<K> => ({ _tag: 'Live', key })

/**
 * An immutable insertion-ordered hash map.
 *
 * Updating an existing key keeps its position. Removing and later re-inserting
 * a key places it at the end, matching JavaScript `Map`.
 */
export class OrderedMap<K, V> implements Iterable<readonly [K, V]> {
  static empty<K, V>(hashEq: HashEq<K> = defaultHashEq as HashEq<K>): OrderedMap<K, V> {
    return new OrderedMap(HashMap.empty(hashEq), Vector.empty(), 0)
  }

  static from<K, V>(
    entries: Iterable<readonly [K, V]>,
    hashEq: HashEq<K> = defaultHashEq as HashEq<K>,
  ): OrderedMap<K, V> {
    let map = OrderedMap.empty<K, V>(hashEq)
    for (const [key, value] of entries) map = map.set(key, value)
    return map
  }

  readonly #entries: HashMap<K, OrderedEntry<V>>
  readonly #slots: Vector<Slot<K>>
  readonly #tombstones: number

  private constructor(
    entries: HashMap<K, OrderedEntry<V>>,
    slots: Vector<Slot<K>>,
    tombstones: number,
  ) {
    this.#entries = entries
    this.#slots = slots
    this.#tombstones = tombstones
  }

  get size(): number {
    return this.#entries.size
  }

  get isEmpty(): boolean {
    return this.#entries.isEmpty
  }

  get hashEq(): HashEq<K> {
    return this.#entries.hashEq
  }

  get(key: K): V | undefined {
    return this.#entries.get(key)?.value
  }

  getEntry(key: K): HashMapLookup<V> {
    const lookup = this.#entries.getEntry(key)
    return lookup.found
      ? { found: true, value: (lookup.value as OrderedEntry<V>).value }
      : { found: false, value: undefined }
  }

  getOrElse(key: K, fallback: () => V): V {
    const lookup = this.getEntry(key)
    return lookup.found ? (lookup.value as V) : fallback()
  }

  has(key: K): boolean {
    return this.#entries.has(key)
  }

  set(key: K, value: V): OrderedMap<K, V> {
    const existing = this.#entries.getEntry(key)
    if (existing.found) {
      const entry = existing.value as OrderedEntry<V>
      if (Object.is(entry.value, value)) return this
      return new OrderedMap(
        this.#entries.set(key, { value, index: entry.index }),
        this.#slots,
        this.#tombstones,
      )
    }

    return new OrderedMap(
      this.#entries.set(key, { value, index: this.#slots.length }),
      this.#slots.push(liveSlot(key)),
      this.#tombstones,
    )
  }

  update(key: K, transform: (value: V) => V): OrderedMap<K, V> {
    const lookup = this.getEntry(key)
    return lookup.found ? this.set(key, transform(lookup.value as V)) : this
  }

  remove(key: K): OrderedMap<K, V> {
    const existing = this.#entries.getEntry(key)
    if (!existing.found) return this
    if (this.size === 1) return OrderedMap.empty(this.hashEq)

    const entry = existing.value as OrderedEntry<V>
    const result = new OrderedMap(
      this.#entries.remove(key),
      this.#slots.set(entry.index, deadSlot),
      this.#tombstones + 1,
    )
    return result.#shouldCompact() ? result.#compact() : result
  }

  delete(key: K): OrderedMap<K, V> {
    return this.remove(key)
  }

  #shouldCompact(): boolean {
    return this.#slots.length > 64 && this.#tombstones > this.size
  }

  #compact(): OrderedMap<K, V> {
    return OrderedMap.from(this, this.hashEq)
  }

  merge(entries: Iterable<readonly [K, V]>): OrderedMap<K, V> {
    const builder = this.transient()
    for (const [key, value] of entries) builder.set(key, value)
    return builder.build()
  }

  mapValues<U>(transform: (value: V, key: K) => U): OrderedMap<K, U> {
    const builder = OrderedMap.builder<K, U>(this.hashEq)
    for (const [key, value] of this) builder.set(key, transform(value, key))
    return builder.build()
  }

  filter(predicate: (value: V, key: K) => boolean): OrderedMap<K, V> {
    const builder = OrderedMap.builder<K, V>(this.hashEq)
    for (const [key, value] of this) {
      if (predicate(value, key)) builder.set(key, value)
    }
    return builder.build()
  }

  *keys(): IterableIterator<K> {
    for (const [key] of this) yield key
  }

  *values(): IterableIterator<V> {
    for (const [, value] of this) yield value
  }

  entries(): IterableIterator<readonly [K, V]> {
    return this[Symbol.iterator]()
  }

  toMap(): Map<K, V> {
    return new Map(this)
  }

  transient(): OrderedMapBuilder<K, V> {
    return OrderedMapBuilder.from(this)
  }

  static builder<K, V>(hashEq: HashEq<K> = defaultHashEq as HashEq<K>): OrderedMapBuilder<K, V> {
    return new OrderedMapBuilder(hashEq)
  }

  *[Symbol.iterator](): IterableIterator<readonly [K, V]> {
    for (const slot of this.#slots) {
      if (slot._tag === 'Dead') continue
      const entry = this.#entries.getEntry(slot.key)
      if (entry.found) yield [slot.key, (entry.value as OrderedEntry<V>).value]
    }
  }
}

/** Mutable insertion-ordered map builder. `build()` permanently seals it. */
export class OrderedMapBuilder<K, V> implements Iterable<readonly [K, V]> {
  static from<K, V>(map: OrderedMap<K, V>): OrderedMapBuilder<K, V> {
    return new OrderedMapBuilder(map.hashEq, map)
  }

  readonly #entries: HashMapBuilder<K, OrderedEntry<V>>
  readonly #slots: Array<Slot<K>> = []
  #sealed = false

  constructor(
    hashEq: HashEq<K> = defaultHashEq as HashEq<K>,
    entries: Iterable<readonly [K, V]> = [],
  ) {
    this.#entries = new HashMapBuilder(hashEq)
    for (const [key, value] of entries) this.set(key, value)
  }

  get size(): number {
    return this.#entries.size
  }

  get isSealed(): boolean {
    return this.#sealed
  }

  get hashEq(): HashEq<K> {
    return this.#entries.hashEq
  }

  #assertOpen(): void {
    if (this.#sealed) throw new Error('OrderedMapBuilder has already been sealed')
  }

  getEntry(key: K): HashMapLookup<V> {
    const lookup = this.#entries.getEntry(key)
    return lookup.found
      ? { found: true, value: (lookup.value as OrderedEntry<V>).value }
      : { found: false, value: undefined }
  }

  get(key: K): V | undefined {
    return this.getEntry(key).value
  }

  has(key: K): boolean {
    return this.#entries.has(key)
  }

  set(key: K, value: V): this {
    this.#assertOpen()
    const existing = this.#entries.getEntry(key)
    if (existing.found) {
      const entry = existing.value as OrderedEntry<V>
      this.#entries.set(key, { value, index: entry.index })
    } else {
      const index = this.#slots.length
      this.#slots.push(liveSlot(key))
      this.#entries.set(key, { value, index })
    }
    return this
  }

  remove(key: K): boolean {
    this.#assertOpen()
    const existing = this.#entries.getEntry(key)
    if (!existing.found) return false
    this.#slots[(existing.value as OrderedEntry<V>).index] = deadSlot
    this.#entries.remove(key)
    return true
  }

  delete(key: K): boolean {
    return this.remove(key)
  }

  clear(): this {
    this.#assertOpen()
    this.#entries.clear()
    this.#slots.length = 0
    return this
  }

  build(): OrderedMap<K, V> {
    this.#assertOpen()
    this.#sealed = true
    const entries = this.#entries.build()
    const output: Array<readonly [K, V]> = []
    for (const slot of this.#slots) {
      if (slot._tag === 'Dead') continue
      const lookup = entries.getEntry(slot.key)
      if (lookup.found) output.push([slot.key, (lookup.value as OrderedEntry<V>).value])
    }
    return OrderedMap.from(output, this.hashEq)
  }

  *[Symbol.iterator](): IterableIterator<readonly [K, V]> {
    for (const slot of this.#slots) {
      if (slot._tag === 'Dead') continue
      const lookup = this.#entries.getEntry(slot.key)
      if (lookup.found) yield [slot.key, (lookup.value as OrderedEntry<V>).value]
    }
  }
}

export const orderedMap = <K, V>(
  entries: Iterable<readonly [K, V]> = [],
  hashEq: HashEq<K> = defaultHashEq as HashEq<K>,
): OrderedMap<K, V> => OrderedMap.from(entries, hashEq)

export const orderedMapBuilder = <K, V>(
  hashEq: HashEq<K> = defaultHashEq as HashEq<K>,
): OrderedMapBuilder<K, V> => OrderedMap.builder(hashEq)
