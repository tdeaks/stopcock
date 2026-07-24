# @stopcock/persistent

Immutable persistent collections for TypeScript, with structural sharing for
ordinary updates and explicitly named transient builders for bulk work.

```sh
bun add @stopcock/persistent
```

```ts
import { HashMap, Vector } from '@stopcock/persistent'

const original = Vector.of(1, 2, 3)
const updated = original.set(1, 20).push(4)

original.toArray() // [1, 2, 3]
updated.toArray() // [1, 20, 3, 4]

const users = HashMap.empty<string, { name: string }>()
  .set('ada', { name: 'Ada' })
  .set('grace', { name: 'Grace' })
```

Every collection is also available from a focused subpath, such as
`@stopcock/persistent/vector` or `@stopcock/persistent/hash-map`.

## Collections

| Collection         | Representation                       | Main operation costs                                   |
| ------------------ | ------------------------------------ | ------------------------------------------------------ |
| `Vector<T>`        | 32-way bitmapped trie with fast tail | get/set/push/pop O(log32 n), slice O(k log32 k)        |
| `HashMap<K, V>`    | hash-array mapped trie               | get/set/remove expected O(log32 n)                     |
| `HashSet<T>`       | HAMT-backed set                      | has/add/remove expected O(log32 n)                     |
| `OrderedMap<K, V>` | HAMT index plus chunked key order    | lookup expected O(log32 n), ordered iteration O(n)     |
| `OrderedSet<T>`    | ordered map-backed set               | membership expected O(log32 n), ordered iteration O(n) |
| `Queue<T>`         | two persistent linked spines         | enqueue/dequeue amortized O(1)                         |
| `Deque<T>`         | two persistent linked spines         | end operations O(1), occasional O(n) rebalance         |
| `Stack<T>`         | persistent linked spine              | push/pop/peek O(1)                                     |

All collections implement `Iterable`. Maps iterate `[key, value]` entries,
ordered collections preserve insertion order, queues and deques iterate
front-to-back, and stacks iterate top-to-bottom.

## Builders and transients

Ordinary APIs never mutate an existing collection. Use a clearly named builder
when constructing many values:

```ts
const builder = Vector.builder<number>()
for (let index = 0; index < 100_000; index += 1) {
  builder.push(index)
}

const vector = builder.build()
// builder.push(100_000) throws: build() permanently seals the builder
```

Every collection exposes both a static `builder()` and an instance
`transient()` method. Builders mutate private working storage, `build()` returns
an immutable value, and every later mutation or second build is rejected.

## Hashing and equality

`HashMap` and the collections built on it use JavaScript `Map` key semantics by
default:

- `NaN` equals `NaN`;
- `-0` and `0` are the same key;
- primitives compare by value;
- objects, functions, and symbols compare by identity.

Domain equality is opt-in through a coherent `HashEq`:

```ts
import { HashMap, makeHashEq } from '@stopcock/persistent'

type UserId = { readonly value: string }

const userIdHashEq = makeHashEq<UserId>(
  ({ value }) => {
    let hash = 0
    for (const character of value) hash = Math.imul(hash, 31) + character.charCodeAt(0)
    return hash
  },
  (left, right) => left.value === right.value,
)

const users = HashMap.empty<UserId, string>(userIdHashEq).set({ value: '42' }, 'Ada')

users.get({ value: '42' }) // 'Ada'
```

The required law is: whenever `equals(a, b)` is true, `hash(a)` and `hash(b)`
must be equal. Deliberate hash collisions remain correct because leaf buckets
always check equality.

## Missing values and empty operations

Maps support stored `undefined` values. Use `has()` or `getEntry()` when absence
must be distinguished from a present `undefined`.

`Vector.pop()` and `drop()` methods on queue/deque/stack return the unchanged
empty collection. Value-returning operations (`unappend`, `dequeue`,
`popFront`, `popBack`, and `Stack.pop`) return `undefined` when empty.
