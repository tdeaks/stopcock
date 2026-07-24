import { describe, expect, it } from 'vite-plus/test'
import fc from 'fast-check'
import * as Eq from '../eq'
import * as Group from '../group'
import * as Hash from '../hash'
import * as Monoid from '../monoid'
import * as Ord from '../ord'
import * as Semigroup from '../semigroup'

describe('Eq', () => {
  it('uses SameValueZero for the strict primitive instance', () => {
    expect(Eq.number.equals(Number.NaN, Number.NaN)).toBe(true)
    expect(Eq.number.equals(-0, 0)).toBe(true)
    expect(Eq.number.equals(1, 2)).toBe(false)
  })

  it('derives structural and contramapped instances', () => {
    const user = Eq.struct<{ readonly id: number; readonly name: string }>({
      id: Eq.number,
      name: Eq.string,
    })
    const byId = Eq.contramap((value: { readonly id: number }) => value.id)(Eq.number)

    expect(user.equals({ id: 1, name: 'Ada' }, { id: 1, name: 'Ada' })).toBe(true)
    expect(user.equals({ id: 1, name: 'Ada' }, { id: 1, name: 'Grace' })).toBe(false)
    expect(byId.equals({ id: 1 }, { id: 1 })).toBe(true)
  })

  it('compares sparse arrays with dense undefined semantics', () => {
    const sparse = new Array<number | undefined>(2)
    sparse[1] = 1
    const dense = [undefined, 1]
    expect(Eq.array(Eq.strict).equals(sparse, dense)).toBe(true)
  })

  it('supports lazy recursive instances', () => {
    interface Node {
      readonly value: number
      readonly children: readonly Node[]
    }
    const node: Eq.Eq<Node> = Eq.lazy(() =>
      Eq.struct<Node>({ value: Eq.number, children: Eq.array(node) }),
    )
    expect(node.equals({ value: 1, children: [] }, { value: 1, children: [] })).toBe(true)
    expect(
      node.equals(
        { value: 1, children: [{ value: 2, children: [] }] },
        { value: 1, children: [{ value: 3, children: [] }] },
      ),
    ).toBe(false)
  })

  it('satisfies reflexivity and symmetry for primitive values', () => {
    fc.assert(
      fc.property(
        fc.oneof(fc.integer(), fc.constant(Number.NaN), fc.constant(-0)),
        fc.oneof(fc.integer(), fc.constant(Number.NaN), fc.constant(-0)),
        (left, right) => {
          expect(Eq.number.equals(left, left)).toBe(true)
          expect(Eq.number.equals(left, right)).toBe(Eq.number.equals(right, left))
        },
      ),
    )
  })
})

describe('Hash', () => {
  it('aligns number hashing with SameValueZero', () => {
    expect(Hash.number.hash(Number.NaN)).toBe(Hash.number.hash(Number.NaN))
    expect(Hash.number.hash(-0)).toBe(Hash.number.hash(0))
    expect(Hash.number.hash(1)).not.toBe(Hash.number.hash(2))
  })

  it('derives array, tuple, and struct hashes', () => {
    const tuple = Hash.tuple<[number, string]>(Hash.number, Hash.string)
    const record = Hash.struct<{ readonly id: number; readonly name: string }>({
      id: Hash.number,
      name: Hash.string,
    })

    expect(tuple.hash([1, 'a'])).toBe(tuple.hash([1, 'a']))
    expect(record.hash({ id: 1, name: 'Ada' })).toBe(record.hash({ name: 'Ada', id: 1 }))
  })

  it('hashes object keys deterministically and terminates on cycles', () => {
    const left: { value: number; self?: unknown } = { value: 1 }
    left.self = left
    const right: { value: number; self?: unknown } = { value: 1 }
    right.self = right

    expect(Hash.hashUnknown({ b: 2, a: 1 })).toBe(Hash.hashUnknown({ a: 1, b: 2 }))
    expect(Hash.hashUnknown(left)).toBe(Hash.hashUnknown(right))
  })
})

describe('Ord', () => {
  it('provides total number ordering with NaN last', () => {
    expect(Ord.number.compare(1, 2)).toBe(-1)
    expect(Ord.number.compare(Number.NaN, 2)).toBe(1)
    expect(Ord.number.compare(Number.NaN, Number.NaN)).toBe(0)
  })

  it('combines and reverses orderings', () => {
    interface Person {
      readonly name: string
      readonly age: number
    }
    const byName = Ord.contramap((person: Person) => person.name)(Ord.string)
    const byAgeDescending = Ord.contramap((person: Person) => person.age)(
      Ord.reverse(Ord.number),
    )
    const people = [
      { name: 'Ada', age: 20 },
      { name: 'Grace', age: 30 },
      { name: 'Ada', age: 40 },
    ]

    expect(Ord.sort(Ord.combine(byName, byAgeDescending), people)).toEqual([
      { name: 'Ada', age: 40 },
      { name: 'Ada', age: 20 },
      { name: 'Grace', age: 30 },
    ])
  })

  it('sorts stably without mutating the input', () => {
    const values = [
      { rank: 1, id: 'a' },
      { rank: 1, id: 'b' },
      { rank: 0, id: 'c' },
    ] as const
    const sorted = Ord.sort(
      Ord.contramap((value: (typeof values)[number]) => value.rank)(Ord.number),
      values,
    )
    expect(sorted.map((value) => value.id)).toEqual(['c', 'a', 'b'])
    expect(values.map((value) => value.id)).toEqual(['a', 'b', 'c'])
  })
})

describe('Semigroup, Monoid, and Group', () => {
  it('combines associative values and inserts separators', () => {
    const separated = Semigroup.intercalate(',')(Semigroup.string)
    expect(separated.combineMany('a', ['b', 'c'])).toBe('a,b,c')
    expect(Semigroup.array<number>().combine([1], [2, 3])).toEqual([1, 2, 3])
  })

  it('combines tuple and null-prototype struct instances', () => {
    const pair = Monoid.tuple<[number, string]>(Monoid.numberSum, Monoid.string)
    const stats = Monoid.struct<{ readonly count: number; readonly labels: readonly string[] }>(
      {
        count: Monoid.numberSum,
        labels: Monoid.array<string>(),
      },
    )
    const combined = stats.combine(
      { count: 1, labels: ['a'] },
      { count: 2, labels: ['b'] },
    )

    expect(pair.combineAll([[1, 'a'], [2, 'b']])).toEqual([3, 'ab'])
    expect(combined).toEqual({ count: 3, labels: ['a', 'b'] })
    expect(Object.getPrototypeOf(combined)).toBeNull()
  })

  it('obeys identity and inverse laws', () => {
    const values = [-100, -1, 0, 1, 100]
    for (const value of values) {
      expect(Group.numberSum.combine(Group.numberSum.empty, value)).toBe(value)
      expect(Group.numberSum.combine(value, Group.numberSum.empty)).toBe(value)
      expect(Group.numberSum.combine(value, Group.numberSum.inverse(value))).toBe(0)
    }
  })

  it('satisfies associativity and group laws over bounded generated values', () => {
    fc.assert(
      fc.property(
        fc.string(),
        fc.string(),
        fc.string(),
        (first, second, third) => {
          expect(
            Semigroup.string.combine(Semigroup.string.combine(first, second), third),
          ).toBe(
            Semigroup.string.combine(first, Semigroup.string.combine(second, third)),
          )
        },
      ),
    )
    fc.assert(
      fc.property(fc.integer({ min: -1_000_000, max: 1_000_000 }), (value) => {
        expect(Group.numberSum.combine(Group.numberSum.empty, value)).toBe(value)
        expect(Group.numberSum.combine(value, Group.numberSum.inverse(value))).toBe(0)
      }),
    )
  })

  it('supports logarithmic positive and negative powers', () => {
    expect(Group.power(Group.numberSum, 3, 4n)).toBe(12)
    expect(Group.power(Group.numberSum, 3, -4n)).toBe(-12)
    expect(Group.power(Group.numberSum, 3, 0n)).toBe(0)
  })
})
