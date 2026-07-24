import { expectTypeOf, test } from 'vite-plus/test'
import {
  Deque,
  HashMap,
  HashSet,
  OrderedMap,
  OrderedSet,
  Queue,
  Stack,
  Vector,
  makeHashEq,
} from '..'

test('Vector preserves element and transform types', () => {
  const vector = Vector.of(1, 2, 3)
  expectTypeOf(vector).toEqualTypeOf<Vector<number>>()
  expectTypeOf(vector.get(0)).toEqualTypeOf<number | undefined>()
  expectTypeOf(vector.getOrThrow(0)).toEqualTypeOf<number>()
  expectTypeOf(vector.map(String)).toEqualTypeOf<Vector<string>>()
  expectTypeOf(vector.unappend()).toEqualTypeOf<readonly [Vector<number>, number] | undefined>()
  // @ts-expect-error a number vector rejects string point updates.
  vector.set(0, 'wrong')
})

test('hash collections infer keys and values including undefined', () => {
  const map = HashMap.from([
    ['one', 1],
    ['two', undefined],
  ] as const)
  expectTypeOf(map).toMatchTypeOf<HashMap<'one' | 'two', 1 | undefined>>()
  expectTypeOf(map.get('one')).toEqualTypeOf<1 | undefined>()
  expectTypeOf(map.getEntry('one').found).toEqualTypeOf<boolean>()
  expectTypeOf(map.mapValues(String)).toEqualTypeOf<HashMap<'one' | 'two', string>>()

  const set = HashSet.from([1, 2, 3])
  expectTypeOf(set).toEqualTypeOf<HashSet<number>>()
  expectTypeOf(set.has(1)).toEqualTypeOf<boolean>()
})

test('custom HashEq constrains key types', () => {
  type Id = { readonly value: string }
  const ids = makeHashEq<Id>(
    ({ value }) => value.length,
    (left, right) => left.value === right.value,
  )
  const map = HashMap.empty<Id, number>(ids)
  expectTypeOf(map.set({ value: 'one' }, 1)).toEqualTypeOf<HashMap<Id, number>>()
  // @ts-expect-error key type is fixed by the custom strategy.
  map.set('one', 1)
})

test('ordered collections retain generic types', () => {
  const map = OrderedMap.empty<string, number>().set('one', 1)
  expectTypeOf(map).toEqualTypeOf<OrderedMap<string, number>>()
  expectTypeOf(map.getEntry('one').value).toEqualTypeOf<number | undefined>()

  const set = OrderedSet.from(['one', 'two'])
  expectTypeOf(set).toEqualTypeOf<OrderedSet<string>>()
})

test('linear collections type their safe empty operations', () => {
  const queue = Queue.from([1, 2])
  const deque = Deque.from([1, 2])
  const stack = Stack.from([1, 2])

  expectTypeOf(queue.dequeue()).toEqualTypeOf<readonly [number, Queue<number>] | undefined>()
  expectTypeOf(deque.popFront()).toEqualTypeOf<readonly [number, Deque<number>] | undefined>()
  expectTypeOf(deque.popBack()).toEqualTypeOf<readonly [number, Deque<number>] | undefined>()
  expectTypeOf(stack.pop()).toEqualTypeOf<readonly [number, Stack<number>] | undefined>()
})

test('builders remain typed and return their immutable counterpart', () => {
  expectTypeOf(Vector.builder<number>().push(1).build()).toEqualTypeOf<Vector<number>>()
  expectTypeOf(HashMap.builder<string, number>().set('one', 1).build()).toEqualTypeOf<
    HashMap<string, number>
  >()
  expectTypeOf(OrderedSet.builder<number>().add(1).build()).toEqualTypeOf<OrderedSet<number>>()
  expectTypeOf(Queue.builder<number>().enqueue(1).build()).toEqualTypeOf<Queue<number>>()
})
