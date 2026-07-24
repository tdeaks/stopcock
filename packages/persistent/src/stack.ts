import { iterateList, prepend, type ListNode } from './internal/list'

/** An immutable singly linked LIFO stack. */
export class Stack<T> implements Iterable<T> {
  static empty<T>(): Stack<T> {
    return new Stack(undefined, 0)
  }

  /**
   * Pushes iterable values in encounter order. The final iterable value becomes
   * the top of the stack.
   */
  static from<T>(values: Iterable<T>): Stack<T> {
    let stack = Stack.empty<T>()
    for (const value of values) stack = stack.push(value)
    return stack
  }

  readonly #head: ListNode<T> | undefined
  readonly size: number

  private constructor(head: ListNode<T> | undefined, size: number) {
    this.#head = head
    this.size = size
  }

  get isEmpty(): boolean {
    return this.size === 0
  }

  peek(): T | undefined {
    return this.#head?.value
  }

  push(value: T): Stack<T> {
    return new Stack(prepend(value, this.#head), this.size + 1)
  }

  pushAll(values: Iterable<T>): Stack<T> {
    let output: Stack<T> | undefined
    for (const value of values) output = (output ?? this).push(value)
    return output ?? this
  }

  pop(): readonly [T, Stack<T>] | undefined {
    return this.#head === undefined
      ? undefined
      : [this.#head.value, new Stack(this.#head.next, this.size - 1)]
  }

  drop(): Stack<T> {
    return this.#head === undefined ? this : new Stack(this.#head.next, this.size - 1)
  }

  map<U>(transform: (value: T, index: number) => U): Stack<U> {
    const values: U[] = []
    let index = 0
    for (const value of this) {
      values.push(transform(value, index))
      index += 1
    }
    let output = Stack.empty<U>()
    for (let item = values.length - 1; item >= 0; item -= 1) {
      output = output.push(values[item] as U)
    }
    return output
  }

  toArray(): T[] {
    return Array.from(this)
  }

  transient(): StackBuilder<T> {
    return StackBuilder.from(this)
  }

  static builder<T>(): StackBuilder<T> {
    return new StackBuilder()
  }

  [Symbol.iterator](): IterableIterator<T> {
    return iterateList(this.#head)
  }
}

/** Mutable stack builder. `build()` permanently seals it. */
export class StackBuilder<T> implements Iterable<T> {
  static from<T>(stack: Stack<T>): StackBuilder<T> {
    const values = stack.toArray()
    values.reverse()
    return new StackBuilder(values)
  }

  readonly #values: T[]
  #sealed = false

  constructor(pushOrder: Iterable<T> = []) {
    this.#values = Array.from(pushOrder)
  }

  get size(): number {
    return this.#values.length
  }

  get isSealed(): boolean {
    return this.#sealed
  }

  #assertOpen(): void {
    if (this.#sealed) throw new Error('StackBuilder has already been sealed')
  }

  peek(): T | undefined {
    return this.#values[this.#values.length - 1]
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

  build(): Stack<T> {
    this.#assertOpen()
    this.#sealed = true
    return Stack.from(this.#values)
  }

  *[Symbol.iterator](): IterableIterator<T> {
    for (let index = this.#values.length - 1; index >= 0; index -= 1) {
      yield this.#values[index] as T
    }
  }
}

export const stack = <T>(...pushOrder: readonly T[]): Stack<T> => Stack.from(pushOrder)
export const stackBuilder = <T>(): StackBuilder<T> => Stack.builder()
