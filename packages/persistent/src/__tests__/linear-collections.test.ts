import { describe, expect, it } from 'vite-plus/test'
import { Deque } from '../deque'
import { Queue } from '../queue'
import { Stack } from '../stack'

describe('Stack', () => {
  it('is immutable, LIFO, iterable top-first, and safe when empty', () => {
    const empty = Stack.empty<number>()
    const stack = empty.push(1).push(2).push(3)
    const popped = stack.pop()

    expect(empty.peek()).toBeUndefined()
    expect(empty.pop()).toBeUndefined()
    expect(empty.drop()).toBe(empty)
    expect([...stack]).toEqual([3, 2, 1])
    expect(popped?.[0]).toBe(3)
    expect(popped?.[1].toArray()).toEqual([2, 1])
    expect(stack.toArray()).toEqual([3, 2, 1])
    expect(stack.map((value) => String(value)).toArray()).toEqual(['3', '2', '1'])
  })

  it('builds in push order and seals', () => {
    const builder = Stack.builder<number>()
    builder.pushAll([1, 2, 3])
    expect(builder.pop()).toBe(3)
    builder.push(4)
    const stack = builder.build()
    expect([...stack]).toEqual([4, 2, 1])
    expect(() => builder.push(5)).toThrow(/sealed/)
    expect(() => builder.pop()).toThrow(/sealed/)
  })
})

describe('Queue', () => {
  it('is immutable, FIFO, and rebalances repeatedly', () => {
    let queue = Queue.empty<number>()
    for (let value = 0; value < 100; value += 1) queue = queue.enqueue(value)
    const original = queue

    for (let value = 0; value < 50; value += 1) {
      const result = queue.dequeue()
      expect(result?.[0]).toBe(value)
      queue = result?.[1] as Queue<number>
    }
    queue = queue.enqueueAll(Array.from({ length: 50 }, (_, index) => index + 100))

    expect(original.size).toBe(100)
    expect(original.peek()).toBe(0)
    expect([...queue]).toEqual(Array.from({ length: 100 }, (_, index) => index + 50))
    expect(Queue.empty<number>().dequeue()).toBeUndefined()
    expect(Queue.empty<number>().drop().isEmpty).toBe(true)
  })

  it('retains an enqueued undefined value and has a sealed builder', () => {
    const withUndefined = Queue.from<number | undefined>([undefined, 1])
    expect(withUndefined.size).toBe(2)
    expect(withUndefined.dequeue()).toEqual([undefined, Queue.from([1])])

    const builder = Queue.builder<number>()
    builder.enqueueAll([1, 2, 3])
    expect(builder.dequeue()).toBe(1)
    builder.enqueue(4)
    const queue = builder.build()
    expect([...queue]).toEqual([2, 3, 4])
    expect(() => builder.enqueue(5)).toThrow(/sealed/)
    expect(() => builder.dequeue()).toThrow(/sealed/)
  })
})

describe('Deque', () => {
  it('supports both ends without mutating prior versions', () => {
    const original = Deque.from([2, 3])
    const expanded = original.pushFront(1).pushBack(4)
    const front = expanded.popFront()
    const back = front?.[1].popBack()

    expect([...original]).toEqual([2, 3])
    expect([...expanded]).toEqual([1, 2, 3, 4])
    expect(expanded.peekFront()).toBe(1)
    expect(expanded.peekBack()).toBe(4)
    expect(front?.[0]).toBe(1)
    expect(back?.[0]).toBe(4)
    expect(back?.[1].toArray()).toEqual([2, 3])
  })

  it('rebalances either side and handles empty and undefined values', () => {
    let deque = Deque.from<number | undefined>([undefined, 1, 2, 3])
    expect(deque.peekFront()).toBeUndefined()
    expect(deque.popFront()?.[0]).toBeUndefined()
    expect(deque.popBack()?.[0]).toBe(3)

    deque = deque.popFront()?.[1] as Deque<number | undefined>
    deque = deque.popBack()?.[1] as Deque<number | undefined>
    expect([...deque]).toEqual([1, 2])
    expect(Deque.empty<number>().popFront()).toBeUndefined()
    expect(Deque.empty<number>().popBack()).toBeUndefined()
    expect(Deque.empty<number>().dropFront().isEmpty).toBe(true)
    expect(Deque.empty<number>().dropBack().isEmpty).toBe(true)
  })

  it('has a sealed double-ended builder', () => {
    const builder = Deque.builder<number>()
    builder.pushBackAll([2, 3]).pushFront(1).pushBack(4)
    expect(builder.popFront()).toBe(1)
    expect(builder.popBack()).toBe(4)
    const deque = builder.build()
    expect([...deque]).toEqual([2, 3])
    expect(() => builder.pushBack(5)).toThrow(/sealed/)
    expect(() => builder.popFront()).toThrow(/sealed/)
  })
})
