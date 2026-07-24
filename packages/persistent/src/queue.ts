import { iterateList, listFromArray, prepend, reverseList, type ListNode } from './internal/list'

/**
 * An immutable FIFO queue backed by two persistent linked lists.
 *
 * Enqueue and dequeue are amortized O(1); rebalancing occurs only when the
 * front spine is empty.
 */
export class Queue<T> implements Iterable<T> {
  static empty<T>(): Queue<T> {
    return new Queue(undefined, undefined, 0)
  }

  static from<T>(values: Iterable<T>): Queue<T> {
    const array = Array.from(values)
    return new Queue(listFromArray(array), undefined, array.length)
  }

  static #create<T>(
    front: ListNode<T> | undefined,
    back: ListNode<T> | undefined,
    size: number,
  ): Queue<T> {
    return front === undefined && back !== undefined
      ? new Queue(reverseList(back), undefined, size)
      : new Queue(front, back, size)
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

  peek(): T | undefined {
    return this.#front?.value
  }

  enqueue(value: T): Queue<T> {
    return Queue.#create(this.#front, prepend(value, this.#back), this.size + 1)
  }

  enqueueAll(values: Iterable<T>): Queue<T> {
    let output: Queue<T> | undefined
    for (const value of values) output = (output ?? this).enqueue(value)
    return output ?? this
  }

  dequeue(): readonly [T, Queue<T>] | undefined {
    return this.#front === undefined
      ? undefined
      : [this.#front.value, Queue.#create(this.#front.next, this.#back, this.size - 1)]
  }

  drop(): Queue<T> {
    return this.dequeue()?.[1] ?? this
  }

  map<U>(transform: (value: T, index: number) => U): Queue<U> {
    const builder = Queue.builder<U>()
    let index = 0
    for (const value of this) {
      builder.enqueue(transform(value, index))
      index += 1
    }
    return builder.build()
  }

  toArray(): T[] {
    return Array.from(this)
  }

  transient(): QueueBuilder<T> {
    return QueueBuilder.from(this)
  }

  static builder<T>(): QueueBuilder<T> {
    return new QueueBuilder()
  }

  *[Symbol.iterator](): IterableIterator<T> {
    yield* iterateList(this.#front)
    const reversedBack = Array.from(iterateList(this.#back))
    for (let index = reversedBack.length - 1; index >= 0; index -= 1) {
      yield reversedBack[index] as T
    }
  }
}

/** Mutable FIFO builder. `build()` permanently seals it. */
export class QueueBuilder<T> implements Iterable<T> {
  static from<T>(queue: Queue<T>): QueueBuilder<T> {
    return new QueueBuilder(queue)
  }

  readonly #values: T[]
  #offset = 0
  #sealed = false

  constructor(values: Iterable<T> = []) {
    this.#values = Array.from(values)
  }

  get size(): number {
    return this.#values.length - this.#offset
  }

  get isSealed(): boolean {
    return this.#sealed
  }

  #assertOpen(): void {
    if (this.#sealed) throw new Error('QueueBuilder has already been sealed')
  }

  peek(): T | undefined {
    return this.#values[this.#offset]
  }

  enqueue(value: T): this {
    this.#assertOpen()
    this.#values.push(value)
    return this
  }

  enqueueAll(values: Iterable<T>): this {
    this.#assertOpen()
    for (const value of values) this.#values.push(value)
    return this
  }

  dequeue(): T | undefined {
    this.#assertOpen()
    if (this.#offset >= this.#values.length) return undefined
    const value = this.#values[this.#offset]
    this.#offset += 1
    if (this.#offset > 64 && this.#offset * 2 > this.#values.length) {
      this.#values.splice(0, this.#offset)
      this.#offset = 0
    }
    return value
  }

  clear(): this {
    this.#assertOpen()
    this.#values.length = 0
    this.#offset = 0
    return this
  }

  build(): Queue<T> {
    this.#assertOpen()
    this.#sealed = true
    return Queue.from(this)
  }

  *[Symbol.iterator](): IterableIterator<T> {
    for (let index = this.#offset; index < this.#values.length; index += 1) {
      yield this.#values[index] as T
    }
  }
}

export const queue = <T>(...values: readonly T[]): Queue<T> => Queue.from(values)
export const queueBuilder = <T>(): QueueBuilder<T> => Queue.builder()
