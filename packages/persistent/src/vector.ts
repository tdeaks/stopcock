const BRANCH_BITS = 5
const BRANCH_SIZE = 1 << BRANCH_BITS
const BRANCH_MASK = BRANCH_SIZE - 1

type TreeNode<T> = readonly unknown[]

const assertIndex = (index: number, length: number): void => {
  if (!Number.isInteger(index) || index < 0 || index >= length) {
    throw new RangeError(`Vector index ${index} is outside [0, ${length})`)
  }
}

const normalizeSliceIndex = (
  index: number | undefined,
  length: number,
  fallback: number,
): number => {
  if (index === undefined) return fallback
  const integer = Math.trunc(index)
  if (integer < 0) return Math.max(length + integer, 0)
  return Math.min(integer, length)
}

const tailOffset = (length: number): number =>
  length < BRANCH_SIZE ? 0 : ((length - 1) >>> BRANCH_BITS) << BRANCH_BITS

const newPath = <T>(level: number, node: TreeNode<T>): TreeNode<T> =>
  level === 0 ? node : [newPath(level - BRANCH_BITS, node)]

const pushTail = <T>(
  level: number,
  parent: TreeNode<T>,
  tail: TreeNode<T>,
  length: number,
): TreeNode<T> => {
  const childIndex = ((length - 1) >>> level) & BRANCH_MASK
  const output = parent.slice()
  if (level === BRANCH_BITS) {
    output[childIndex] = tail
  } else {
    const child = parent[childIndex] as TreeNode<T> | undefined
    output[childIndex] =
      child === undefined
        ? newPath(level - BRANCH_BITS, tail)
        : pushTail(level - BRANCH_BITS, child, tail, length)
  }
  return output
}

const updateNode = <T>(level: number, node: TreeNode<T>, index: number, value: T): TreeNode<T> => {
  const output = node.slice()
  if (level === 0) {
    output[index & BRANCH_MASK] = value
  } else {
    const childIndex = (index >>> level) & BRANCH_MASK
    output[childIndex] = updateNode(
      level - BRANCH_BITS,
      node[childIndex] as TreeNode<T>,
      index,
      value,
    )
  }
  return output
}

const popTail = <T>(level: number, node: TreeNode<T>, length: number): TreeNode<T> | undefined => {
  const childIndex = ((length - 2) >>> level) & BRANCH_MASK
  if (level > BRANCH_BITS) {
    const child = popTail(level - BRANCH_BITS, node[childIndex] as TreeNode<T>, length)
    if (child === undefined && childIndex === 0) return undefined
    if (child === undefined) return node.slice(0, childIndex)
    const output = node.slice()
    output[childIndex] = child
    return output
  }
  return childIndex === 0 ? undefined : node.slice(0, childIndex)
}

/**
 * An immutable 32-way bitmapped vector trie with a fast tail.
 *
 * Indexed reads and updates traverse at most `log32(size)` nodes. Point
 * updates, pushes, and pops copy only that shallow path; all untouched
 * branches are structurally shared with the previous vector.
 */
export class Vector<T> implements Iterable<T> {
  static empty<T>(): Vector<T> {
    return new Vector<T>(0, BRANCH_BITS, [], [])
  }

  static of<T>(...values: readonly T[]): Vector<T> {
    return Vector.from(values)
  }

  static from<T>(values: Iterable<T>): Vector<T> {
    if (values instanceof Vector) return values
    let output = Vector.empty<T>()
    for (const value of values) output = output.push(value)
    return output
  }

  readonly length: number
  readonly #shift: number
  readonly #root: TreeNode<T>
  readonly #tail: readonly T[]

  private constructor(length: number, shift: number, root: TreeNode<T>, tail: readonly T[]) {
    this.length = length
    this.#shift = shift
    this.#root = root
    this.#tail = tail
  }

  get size(): number {
    return this.length
  }

  get isEmpty(): boolean {
    return this.length === 0
  }

  #leafFor(index: number): readonly T[] {
    if (index >= tailOffset(this.length)) return this.#tail
    let node = this.#root
    for (let level = this.#shift; level > 0; level -= BRANCH_BITS) {
      node = node[(index >>> level) & BRANCH_MASK] as TreeNode<T>
    }
    return node as readonly T[]
  }

  get(index: number): T | undefined {
    if (!Number.isInteger(index) || index < 0 || index >= this.length) return undefined
    return this.#leafFor(index)[index & BRANCH_MASK]
  }

  getOrThrow(index: number): T {
    assertIndex(index, this.length)
    return this.#leafFor(index)[index & BRANCH_MASK] as T
  }

  first(): T | undefined {
    return this.get(0)
  }

  last(): T | undefined {
    return this.get(this.length - 1)
  }

  set(index: number, value: T): Vector<T> {
    assertIndex(index, this.length)
    const existing = this.getOrThrow(index)
    if (Object.is(existing, value)) return this

    if (index >= tailOffset(this.length)) {
      const tail = this.#tail.slice()
      tail[index & BRANCH_MASK] = value
      return new Vector(this.length, this.#shift, this.#root, tail)
    }
    return new Vector(
      this.length,
      this.#shift,
      updateNode(this.#shift, this.#root, index, value),
      this.#tail,
    )
  }

  update(index: number, transform: (value: T) => T): Vector<T> {
    return this.set(index, transform(this.getOrThrow(index)))
  }

  push(value: T): Vector<T> {
    if (this.#tail.length < BRANCH_SIZE) {
      return new Vector(this.length + 1, this.#shift, this.#root, [...this.#tail, value])
    }

    let root: TreeNode<T>
    let shift = this.#shift
    if (this.length >>> BRANCH_BITS > 1 << this.#shift) {
      root = [this.#root, newPath(this.#shift, this.#tail)]
      shift += BRANCH_BITS
    } else {
      root = pushTail(this.#shift, this.#root, this.#tail, this.length)
    }
    return new Vector(this.length + 1, shift, root, [value])
  }

  pushAll(values: Iterable<T>): Vector<T> {
    let output: Vector<T> | undefined
    for (const value of values) output = (output ?? this).push(value)
    return output ?? this
  }

  pop(): Vector<T> {
    if (this.length === 0) return this
    if (this.length === 1) return Vector.empty()
    if (this.#tail.length > 1) {
      return new Vector(this.length - 1, this.#shift, this.#root, this.#tail.slice(0, -1))
    }

    const tail = this.#leafFor(this.length - 2)
    let root = popTail(this.#shift, this.#root, this.length) ?? []
    let shift = this.#shift
    if (shift > BRANCH_BITS && root[1] === undefined) {
      root = root[0] as TreeNode<T>
      shift -= BRANCH_BITS
    }
    return new Vector(this.length - 1, shift, root, tail)
  }

  unappend(): readonly [Vector<T>, T] | undefined {
    const value = this.last()
    if (this.length === 0) return undefined
    return [this.pop(), value as T]
  }

  slice(start?: number, end?: number): Vector<T> {
    const from = normalizeSliceIndex(start, this.length, 0)
    const to = normalizeSliceIndex(end, this.length, this.length)
    if (from >= to) return Vector.empty()
    if (from === 0 && to === this.length) return this

    let output = Vector.empty<T>()
    for (let index = from; index < to; index += 1) {
      output = output.push(this.getOrThrow(index))
    }
    return output
  }

  concat(values: Iterable<T>): Vector<T> {
    if (values instanceof Vector && values.isEmpty) return this
    if (this.isEmpty && values instanceof Vector) return values
    return this.pushAll(values)
  }

  map<U>(transform: (value: T, index: number) => U): Vector<U> {
    let output = Vector.empty<U>()
    let index = 0
    for (const value of this) {
      output = output.push(transform(value, index))
      index += 1
    }
    return output
  }

  filter(predicate: (value: T, index: number) => boolean): Vector<T> {
    let output = Vector.empty<T>()
    let index = 0
    for (const value of this) {
      if (predicate(value, index)) output = output.push(value)
      index += 1
    }
    return output
  }

  reduce<U>(initial: U, reducer: (accumulator: U, value: T, index: number) => U): U {
    let accumulator = initial
    let index = 0
    for (const value of this) {
      accumulator = reducer(accumulator, value, index)
      index += 1
    }
    return accumulator
  }

  toArray(): T[] {
    return Array.from(this)
  }

  transient(): VectorBuilder<T> {
    return VectorBuilder.from(this)
  }

  static builder<T>(): VectorBuilder<T> {
    return new VectorBuilder<T>()
  }

  *[Symbol.iterator](): IterableIterator<T> {
    for (let index = 0; index < this.length; index += 1) {
      yield this.getOrThrow(index)
    }
  }
}

/** Mutable bulk-construction surface. `build()` permanently seals it. */
export class VectorBuilder<T> implements Iterable<T> {
  static from<T>(vector: Vector<T>): VectorBuilder<T> {
    return new VectorBuilder(vector)
  }

  #values: T[]
  #sealed = false

  constructor(values: Iterable<T> = []) {
    this.#values = Array.from(values)
  }

  get size(): number {
    return this.#values.length
  }

  get isSealed(): boolean {
    return this.#sealed
  }

  #assertOpen(): void {
    if (this.#sealed) throw new Error('VectorBuilder has already been sealed')
  }

  get(index: number): T | undefined {
    return this.#values[index]
  }

  set(index: number, value: T): this {
    this.#assertOpen()
    assertIndex(index, this.#values.length)
    this.#values[index] = value
    return this
  }

  push(value: T): this {
    this.#assertOpen()
    this.#values.push(value)
    return this
  }

  pushAll(values: Iterable<T>): this {
    this.#assertOpen()
    for (const value of values) this.#values.push(value)
    return this
  }

  pop(): T | undefined {
    this.#assertOpen()
    return this.#values.pop()
  }

  clear(): this {
    this.#assertOpen()
    this.#values.length = 0
    return this
  }

  build(): Vector<T> {
    this.#assertOpen()
    this.#sealed = true
    return Vector.from(this.#values)
  }

  [Symbol.iterator](): Iterator<T> {
    return this.#values[Symbol.iterator]()
  }
}

export const vector = <T>(...values: readonly T[]): Vector<T> => Vector.of(...values)
export const vectorFrom = <T>(values: Iterable<T>): Vector<T> => Vector.from(values)
export const vectorBuilder = <T>(): VectorBuilder<T> => Vector.builder()
