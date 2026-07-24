import { iterateList, listFromArray, prepend, reverseList, type ListNode } from './internal/list'

/**
 * An immutable double-ended queue backed by two persistent linked spines.
 *
 * End operations are O(1) except when an empty side is rebalanced from the
 * opposite side.
 */
export class Deque<T> implements Iterable<T> {
  static empty<T>(): Deque<T> {
    return new Deque(undefined, undefined, 0)
  }

  static from<T>(values: Iterable<T>): Deque<T> {
    const array = Array.from(values)
    return new Deque(listFromArray(array), undefined, array.length)
  }

  readonly #front: ListNode<T> | undefined
  readonly #back: ListNode<T> | undefined
  readonly size: number

  private constructor(front: ListNode<T> | undefined, back: ListNode<T> | undefined, size: number) {
    this.#front = front
    this.#back = back
    this.size = size
  }

  get isEmpty(): boolean {
    return this.size === 0
  }

  peekFront(): T | undefined {
    return this.#front !== undefined ? this.#front.value : reverseList(this.#back)?.value
  }

  peekBack(): T | undefined {
    return this.#back !== undefined ? this.#back.value : reverseList(this.#front)?.value
  }

  pushFront(value: T): Deque<T> {
    return new Deque(prepend(value, this.#front), this.#back, this.size + 1)
  }

  pushBack(value: T): Deque<T> {
    return new Deque(this.#front, prepend(value, this.#back), this.size + 1)
  }

  pushFrontAll(values: Iterable<T>): Deque<T> {
    let output: Deque<T> | undefined
    for (const value of values) output = (output ?? this).pushFront(value)
    return output ?? this
  }

  pushBackAll(values: Iterable<T>): Deque<T> {
    let output: Deque<T> | undefined
    for (const value of values) output = (output ?? this).pushBack(value)
    return output ?? this
  }

  popFront(): readonly [T, Deque<T>] | undefined {
    if (this.#front !== undefined) {
      return [this.#front.value, new Deque(this.#front.next, this.#back, this.size - 1)]
    }
    const front = reverseList(this.#back)
    return front === undefined
      ? undefined
      : [front.value, new Deque(front.next, undefined, this.size - 1)]
  }

  popBack(): readonly [T, Deque<T>] | undefined {
    if (this.#back !== undefined) {
      return [this.#back.value, new Deque(this.#front, this.#back.next, this.size - 1)]
    }
    const back = reverseList(this.#front)
    return back === undefined
      ? undefined
      : [back.value, new Deque(undefined, back.next, this.size - 1)]
  }

  dropFront(): Deque<T> {
    return this.popFront()?.[1] ?? this
  }

  dropBack(): Deque<T> {
    return this.popBack()?.[1] ?? this
  }

  toArray(): T[] {
    return Array.from(this)
  }

  transient(): DequeBuilder<T> {
    return DequeBuilder.from(this)
  }

  static builder<T>(): DequeBuilder<T> {
    return new DequeBuilder()
  }

  *[Symbol.iterator](): IterableIterator<T> {
    yield* iterateList(this.#front)
    const back = Array.from(iterateList(this.#back))
    for (let index = back.length - 1; index >= 0; index -= 1) {
      yield back[index] as T
    }
  }
}

/** Mutable double-ended builder. `build()` permanently seals it. */
export class DequeBuilder<T> implements Iterable<T> {
  static from<T>(deque: Deque<T>): DequeBuilder<T> {
    return new DequeBuilder(deque)
  }

  readonly #values: T[]
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
    if (this.#sealed) throw new Error('DequeBuilder has already been sealed')
  }

  peekFront(): T | undefined {
    return this.#values[0]
  }

  peekBack(): T | undefined {
    return this.#values[this.#values.length - 1]
  }

  pushFront(value: T): this {
    this.#assertOpen()
    this.#values.unshift(value)
    return this
  }

  pushBack(value: T): this {
    this.#assertOpen()
    this.#values.push(value)
    return this
  }

  pushFrontAll(values: Iterable<T>): this {
    this.#assertOpen()
    for (const value of values) this.#values.unshift(value)
    return this
  }

  pushBackAll(values: Iterable<T>): this {
    this.#assertOpen()
    for (const value of values) this.#values.push(value)
    return this
  }

  popFront(): T | undefined {
    this.#assertOpen()
    return this.#values.shift()
  }

  popBack(): T | undefined {
    this.#assertOpen()
    return this.#values.pop()
  }

  clear(): this {
    this.#assertOpen()
    this.#values.length = 0
    return this
  }

  build(): Deque<T> {
    this.#assertOpen()
    this.#sealed = true
    return Deque.from(this.#values)
  }

  [Symbol.iterator](): IterableIterator<T> {
    return this.#values[Symbol.iterator]()
  }
}

export const deque = <T>(...values: readonly T[]): Deque<T> => Deque.from(values)
export const dequeBuilder = <T>(): DequeBuilder<T> => Deque.builder()
