import { defaultHashEq, type HashEq } from './hash'

type Entry<K, V> = readonly [K, V]

interface Leaf<K, V> {
  readonly _tag: 'Leaf'
  readonly hash: number
  readonly entries: readonly Entry<K, V>[]
}

interface Branch<K, V> {
  readonly _tag: 'Branch'
  readonly bitmap: number
  readonly children: readonly Node<K, V>[]
}

type Node<K, V> = Leaf<K, V> | Branch<K, V>

interface Update<K, V> {
  readonly node: Node<K, V>
  readonly added: boolean
  readonly changed: boolean
}

interface Removal<K, V> {
  readonly node: Node<K, V> | undefined
  readonly removed: boolean
}

export interface HashMapLookup<V> {
  readonly found: boolean
  readonly value: V | undefined
}

const popCount = (input: number): number => {
  let value = input - ((input >>> 1) & 0x55555555)
  value = (value & 0x33333333) + ((value >>> 2) & 0x33333333)
  return (((value + (value >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24
}

const hashFragment = (hash: number, shift: number): number => (hash >>> shift) & 31
const bitPosition = (hash: number, shift: number): number => 1 << hashFragment(hash, shift)
const childIndex = (bitmap: number, bit: number): number => popCount(bitmap & (bit - 1))

const leaf = <K, V>(hash: number, entries: readonly Entry<K, V>[]): Leaf<K, V> => ({
  _tag: 'Leaf',
  hash,
  entries,
})

const branch = <K, V>(bitmap: number, children: readonly Node<K, V>[]): Branch<K, V> => ({
  _tag: 'Branch',
  bitmap,
  children,
})

const mergeLeaves = <K, V>(self: Leaf<K, V>, that: Leaf<K, V>, shift: number): Branch<K, V> => {
  const selfBit = bitPosition(self.hash, shift)
  const thatBit = bitPosition(that.hash, shift)
  if (selfBit === thatBit) {
    return branch(selfBit, [mergeLeaves(self, that, shift + 5)])
  }
  return selfBit >>> 0 < thatBit >>> 0
    ? branch(selfBit | thatBit, [self, that])
    : branch(selfBit | thatBit, [that, self])
}

const lookupNode = <K, V>(
  node: Node<K, V> | undefined,
  hash: number,
  key: K,
  equals: HashEq<K>['equals'],
  shift = 0,
): HashMapLookup<V> => {
  if (node === undefined) return { found: false, value: undefined }
  if (node._tag === 'Leaf') {
    if (node.hash !== hash) return { found: false, value: undefined }
    for (const [candidate, value] of node.entries) {
      if (equals(candidate, key)) return { found: true, value }
    }
    return { found: false, value: undefined }
  }

  const bit = bitPosition(hash, shift)
  if ((node.bitmap & bit) === 0) return { found: false, value: undefined }
  return lookupNode(node.children[childIndex(node.bitmap, bit)], hash, key, equals, shift + 5)
}

const setNode = <K, V>(
  node: Node<K, V> | undefined,
  hash: number,
  key: K,
  value: V,
  equals: HashEq<K>['equals'],
  shift = 0,
): Update<K, V> => {
  if (node === undefined) {
    return { node: leaf(hash, [[key, value]]), added: true, changed: true }
  }

  if (node._tag === 'Leaf') {
    if (node.hash !== hash) {
      return {
        node: mergeLeaves(node, leaf(hash, [[key, value]]), shift),
        added: true,
        changed: true,
      }
    }

    const entryIndex = node.entries.findIndex(([candidate]) => equals(candidate, key))
    if (entryIndex < 0) {
      return {
        node: leaf(hash, [...node.entries, [key, value]]),
        added: true,
        changed: true,
      }
    }

    const existing = node.entries[entryIndex]!
    if (Object.is(existing[1], value)) {
      return { node, added: false, changed: false }
    }
    const entries = node.entries.slice()
    // Preserve the originally inserted key when a custom equality relation
    // considers the incoming key equivalent.
    entries[entryIndex] = [existing[0], value]
    return { node: leaf(hash, entries), added: false, changed: true }
  }

  const bit = bitPosition(hash, shift)
  const index = childIndex(node.bitmap, bit)
  if ((node.bitmap & bit) === 0) {
    const children = node.children.slice()
    children.splice(index, 0, leaf(hash, [[key, value]]))
    return {
      node: branch(node.bitmap | bit, children),
      added: true,
      changed: true,
    }
  }

  const update = setNode(node.children[index], hash, key, value, equals, shift + 5)
  if (!update.changed) return { node, added: false, changed: false }
  const children = node.children.slice()
  children[index] = update.node
  return {
    node: branch(node.bitmap, children),
    added: update.added,
    changed: true,
  }
}

const removeNode = <K, V>(
  node: Node<K, V> | undefined,
  hash: number,
  key: K,
  equals: HashEq<K>['equals'],
  shift = 0,
): Removal<K, V> => {
  if (node === undefined) return { node, removed: false }

  if (node._tag === 'Leaf') {
    if (node.hash !== hash) return { node, removed: false }
    const entryIndex = node.entries.findIndex(([candidate]) => equals(candidate, key))
    if (entryIndex < 0) return { node, removed: false }
    if (node.entries.length === 1) return { node: undefined, removed: true }
    return {
      node: leaf(hash, [
        ...node.entries.slice(0, entryIndex),
        ...node.entries.slice(entryIndex + 1),
      ]),
      removed: true,
    }
  }

  const bit = bitPosition(hash, shift)
  if ((node.bitmap & bit) === 0) return { node, removed: false }
  const index = childIndex(node.bitmap, bit)
  const removal = removeNode(node.children[index], hash, key, equals, shift + 5)
  if (!removal.removed) return { node, removed: false }

  if (removal.node === undefined) {
    const bitmap = node.bitmap & ~bit
    if (bitmap === 0) return { node: undefined, removed: true }
    const children = [...node.children.slice(0, index), ...node.children.slice(index + 1)]
    if (children.length === 1 && children[0]!._tag === 'Leaf') {
      return { node: children[0], removed: true }
    }
    return { node: branch(bitmap, children), removed: true }
  }

  const children = node.children.slice()
  children[index] = removal.node
  return { node: branch(node.bitmap, children), removed: true }
}

function* iterateNode<K, V>(node: Node<K, V> | undefined): Generator<Entry<K, V>> {
  if (node === undefined) return
  if (node._tag === 'Leaf') {
    yield* node.entries
    return
  }
  for (const child of node.children) yield* iterateNode(child)
}

/**
 * An immutable hash-array mapped trie.
 *
 * Lookup, insertion, and removal copy only the traversed trie path. Hash
 * collisions are retained in equality-checked leaf buckets.
 */
export class HashMap<K, V> implements Iterable<Entry<K, V>> {
  static empty<K, V>(hashEq: HashEq<K> = defaultHashEq as HashEq<K>): HashMap<K, V> {
    return new HashMap(undefined, 0, hashEq)
  }

  static from<K, V>(
    entries: Iterable<readonly [K, V]>,
    hashEq: HashEq<K> = defaultHashEq as HashEq<K>,
  ): HashMap<K, V> {
    let map = HashMap.empty<K, V>(hashEq)
    for (const [key, value] of entries) map = map.set(key, value)
    return map
  }

  readonly #root: Node<K, V> | undefined
  readonly size: number
  readonly hashEq: HashEq<K>

  private constructor(root: Node<K, V> | undefined, size: number, hashEq: HashEq<K>) {
    this.#root = root
    this.size = size
    this.hashEq = hashEq
  }

  get isEmpty(): boolean {
    return this.size === 0
  }

  get(key: K): V | undefined {
    return this.getEntry(key).value
  }

  getEntry(key: K): HashMapLookup<V> {
    return lookupNode(this.#root, this.hashEq.hash(key) | 0, key, this.hashEq.equals)
  }

  getOrElse(key: K, fallback: () => V): V {
    const lookup = this.getEntry(key)
    return lookup.found ? (lookup.value as V) : fallback()
  }

  has(key: K): boolean {
    return this.getEntry(key).found
  }

  set(key: K, value: V): HashMap<K, V> {
    const update = setNode(this.#root, this.hashEq.hash(key) | 0, key, value, this.hashEq.equals)
    return update.changed
      ? new HashMap(update.node, this.size + (update.added ? 1 : 0), this.hashEq)
      : this
  }

  update(key: K, transform: (value: V) => V): HashMap<K, V> {
    const lookup = this.getEntry(key)
    return lookup.found ? this.set(key, transform(lookup.value as V)) : this
  }

  remove(key: K): HashMap<K, V> {
    const removal = removeNode(this.#root, this.hashEq.hash(key) | 0, key, this.hashEq.equals)
    return removal.removed ? new HashMap(removal.node, this.size - 1, this.hashEq) : this
  }

  delete(key: K): HashMap<K, V> {
    return this.remove(key)
  }

  mapValues<U>(transform: (value: V, key: K) => U): HashMap<K, U> {
    const builder = HashMap.builder<K, U>(this.hashEq)
    for (const [key, value] of this) builder.set(key, transform(value, key))
    return builder.build()
  }

  filter(predicate: (value: V, key: K) => boolean): HashMap<K, V> {
    const builder = HashMap.builder<K, V>(this.hashEq)
    for (const [key, value] of this) {
      if (predicate(value, key)) builder.set(key, value)
    }
    return builder.build()
  }

  merge(entries: Iterable<readonly [K, V]>): HashMap<K, V> {
    const builder = this.transient()
    for (const [key, value] of entries) builder.set(key, value)
    return builder.build()
  }

  *keys(): IterableIterator<K> {
    for (const [key] of this) yield key
  }

  *values(): IterableIterator<V> {
    for (const [, value] of this) yield value
  }

  entries(): IterableIterator<Entry<K, V>> {
    return this[Symbol.iterator]()
  }

  forEach(effect: (value: V, key: K, map: HashMap<K, V>) => void): void {
    for (const [key, value] of this) effect(value, key, this)
  }

  toMap(): Map<K, V> {
    return new Map(this)
  }

  transient(): HashMapBuilder<K, V> {
    return HashMapBuilder.from(this)
  }

  static builder<K, V>(hashEq: HashEq<K> = defaultHashEq as HashEq<K>): HashMapBuilder<K, V> {
    return new HashMapBuilder(hashEq)
  }

  [Symbol.iterator](): IterableIterator<Entry<K, V>> {
    return iterateNode(this.#root)
  }
}

/**
 * Mutable hash-bucket builder for bulk construction.
 *
 * It uses the same equality contract as `HashMap`; `build()` seals the builder
 * and returns an immutable HAMT.
 */
export class HashMapBuilder<K, V> implements Iterable<Entry<K, V>> {
  static from<K, V>(map: HashMap<K, V>): HashMapBuilder<K, V> {
    return new HashMapBuilder(map.hashEq, map)
  }

  readonly hashEq: HashEq<K>
  readonly #buckets = new Map<number, Array<[K, V]>>()
  #size = 0
  #sealed = false

  constructor(
    hashEq: HashEq<K> = defaultHashEq as HashEq<K>,
    entries: Iterable<readonly [K, V]> = [],
  ) {
    this.hashEq = hashEq
    for (const [key, value] of entries) this.set(key, value)
  }

  get size(): number {
    return this.#size
  }

  get isSealed(): boolean {
    return this.#sealed
  }

  #assertOpen(): void {
    if (this.#sealed) throw new Error('HashMapBuilder has already been sealed')
  }

  #bucket(key: K): Array<[K, V]> | undefined {
    return this.#buckets.get(this.hashEq.hash(key) | 0)
  }

  getEntry(key: K): HashMapLookup<V> {
    const bucket = this.#bucket(key)
    if (bucket === undefined) return { found: false, value: undefined }
    for (const [candidate, value] of bucket) {
      if (this.hashEq.equals(candidate, key)) return { found: true, value }
    }
    return { found: false, value: undefined }
  }

  get(key: K): V | undefined {
    return this.getEntry(key).value
  }

  has(key: K): boolean {
    return this.getEntry(key).found
  }

  set(key: K, value: V): this {
    this.#assertOpen()
    const hash = this.hashEq.hash(key) | 0
    const bucket = this.#buckets.get(hash)
    if (bucket === undefined) {
      this.#buckets.set(hash, [[key, value]])
      this.#size += 1
      return this
    }
    const index = bucket.findIndex(([candidate]) => this.hashEq.equals(candidate, key))
    if (index < 0) {
      bucket.push([key, value])
      this.#size += 1
    } else {
      bucket[index] = [bucket[index]![0], value]
    }
    return this
  }

  remove(key: K): boolean {
    this.#assertOpen()
    const hash = this.hashEq.hash(key) | 0
    const bucket = this.#buckets.get(hash)
    if (bucket === undefined) return false
    const index = bucket.findIndex(([candidate]) => this.hashEq.equals(candidate, key))
    if (index < 0) return false
    bucket.splice(index, 1)
    this.#size -= 1
    if (bucket.length === 0) this.#buckets.delete(hash)
    return true
  }

  delete(key: K): boolean {
    return this.remove(key)
  }

  clear(): this {
    this.#assertOpen()
    this.#buckets.clear()
    this.#size = 0
    return this
  }

  build(): HashMap<K, V> {
    this.#assertOpen()
    this.#sealed = true
    return HashMap.from(this, this.hashEq)
  }

  *[Symbol.iterator](): IterableIterator<Entry<K, V>> {
    for (const bucket of this.#buckets.values()) {
      for (const entry of bucket) yield entry
    }
  }
}

export const hashMap = <K, V>(
  entries: Iterable<readonly [K, V]> = [],
  hashEq: HashEq<K> = defaultHashEq as HashEq<K>,
): HashMap<K, V> => HashMap.from(entries, hashEq)

export const hashMapBuilder = <K, V>(
  hashEq: HashEq<K> = defaultHashEq as HashEq<K>,
): HashMapBuilder<K, V> => HashMap.builder(hashEq)
