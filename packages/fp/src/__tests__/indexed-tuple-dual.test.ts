import { describe, expect, it } from 'vite-plus/test'
import * as Indexed from '../indexed'
import { none, some } from '../option'
import * as Tuple from '../tuple'

const indexedDualOperations = [
  'atOrUndefined',
  'at',
  'slice',
  'copyInto',
  'map',
  'mapInto',
  'filter',
  'filterInto',
  'filterMap',
  'reduce',
  'reduceRight',
  'findOrUndefined',
  'find',
  'findIndexOrUndefined',
  'findIndex',
  'indexOfOrUndefined',
  'indexOf',
  'includes',
  'some',
  'every',
  'forEach',
  'equals',
] as const

const indexedExcludedOperations = [
  'length',
  'isEmpty',
  'headOrUndefined',
  'head',
  'lastOrUndefined',
  'last',
  'toArray',
] as const

const tupleDualOperations = [
  'at',
  'append',
  'prepend',
  'concat',
  'mapFirst',
  'mapSecond',
  'bimap',
  'map',
  'mapInto',
  'zip',
] as const

const tupleExcludedOperations = ['make', 'first', 'second', 'last', 'swap', 'reverse'] as const

type ParityCase = readonly [name: string, dataFirst: () => unknown, curried: () => unknown]

describe('Indexed and Tuple dual inventories', () => {
  it('classifies every public runtime export', () => {
    expect(Object.keys(Indexed).sort()).toEqual(
      [...indexedDualOperations, ...indexedExcludedOperations].sort(),
    )
    expect(Object.keys(Tuple).sort()).toEqual(
      [...tupleDualOperations, ...tupleExcludedOperations].sort(),
    )
  })
})

describe('Indexed data-first and curried shapes agree', () => {
  const values = [1, 2, 3]
  const cases: readonly ParityCase[] = [
    [
      'atOrUndefined',
      () => Indexed.atOrUndefined(values, 1),
      () => Indexed.atOrUndefined(1)(values),
    ],
    ['at', () => Indexed.at(values, 1), () => Indexed.at(1)(values)],
    ['slice/defaults', () => Indexed.slice(values), () => Indexed.slice()(values)],
    ['slice/range', () => Indexed.slice(values, 1, 3), () => Indexed.slice(1, 3)(values)],
    [
      'copyInto',
      () => Indexed.copyInto(values, new Array<number>(2), 0, 1, 3),
      () => Indexed.copyInto(new Array<number>(2), 0, 1, 3)(values),
    ],
    [
      'map',
      () => Indexed.map(values, (value) => value * 2),
      () => Indexed.map((value: number) => value * 2)(values),
    ],
    [
      'mapInto',
      () => Indexed.mapInto(values, new Array<number>(4), (value) => value * 2, 1),
      () => Indexed.mapInto(new Array<number>(4), (value: number) => value * 2, 1)(values),
    ],
    [
      'filter',
      () => Indexed.filter(values, (value) => value > 1),
      () => Indexed.filter((value: number) => value > 1)(values),
    ],
    [
      'filterInto',
      () => Indexed.filterInto(values, [] as number[], (value) => value > 1),
      () => Indexed.filterInto([] as number[], (value: number) => value > 1)(values),
    ],
    [
      'filterMap',
      () => Indexed.filterMap(values, (value) => (value > 1 ? some(value) : none)),
      () => Indexed.filterMap((value: number) => (value > 1 ? some(value) : none))(values),
    ],
    [
      'reduce',
      () => Indexed.reduce(values, (total, value) => total + value, 0),
      () => Indexed.reduce((total: number, value: number) => total + value, 0)(values),
    ],
    [
      'reduceRight',
      () => Indexed.reduceRight(values, (text, value) => text + value, ''),
      () => Indexed.reduceRight((text: string, value: number) => text + value, '')(values),
    ],
    [
      'findOrUndefined',
      () => Indexed.findOrUndefined(values, (value) => value > 1),
      () => Indexed.findOrUndefined((value: number) => value > 1)(values),
    ],
    [
      'find',
      () => Indexed.find(values, (value) => value > 1),
      () => Indexed.find((value: number) => value > 1)(values),
    ],
    [
      'findIndexOrUndefined',
      () => Indexed.findIndexOrUndefined(values, (value) => value > 1),
      () => Indexed.findIndexOrUndefined((value: number) => value > 1)(values),
    ],
    [
      'findIndex',
      () => Indexed.findIndex(values, (value) => value > 1),
      () => Indexed.findIndex((value: number) => value > 1)(values),
    ],
    [
      'indexOfOrUndefined',
      () => Indexed.indexOfOrUndefined(values, 2),
      () => Indexed.indexOfOrUndefined(2)(values),
    ],
    ['indexOf', () => Indexed.indexOf(values, 2), () => Indexed.indexOf(2)(values)],
    ['includes', () => Indexed.includes(values, 2), () => Indexed.includes(2)(values)],
    [
      'some',
      () => Indexed.some(values, (value) => value > 2),
      () => Indexed.some((value: number) => value > 2)(values),
    ],
    [
      'every',
      () => Indexed.every(values, (value) => value > 0),
      () => Indexed.every((value: number) => value > 0)(values),
    ],
    [
      'forEach',
      () => {
        const seen: number[] = []
        Indexed.forEach(values, (value) => seen.push(value))
        return seen
      },
      () => {
        const seen: number[] = []
        Indexed.forEach((value: number) => seen.push(value))(values)
        return seen
      },
    ],
    [
      'equals/default',
      () => Indexed.equals(values, [1, 2, 3]),
      () => Indexed.equals([1, 2, 3])(values),
    ],
    [
      'equals/custom',
      () => Indexed.equals(values, [1, 2, 3], Object.is),
      () => Indexed.equals([1, 2, 3], Object.is)(values),
    ],
  ]

  it.each(cases)('%s', (_name, dataFirst, curried) => {
    expect(dataFirst()).toEqual(curried())
  })

  it('preserves a matching undefined value in both find lanes', () => {
    const source = [undefined]
    expect(Indexed.find(source, () => true)).toEqual(some(undefined))
    expect(Indexed.find(() => true)(source)).toEqual(some(undefined))
  })
})

describe('Tuple data-first and curried shapes agree', () => {
  const tuple = [1, 'two'] as const
  const cases: readonly ParityCase[] = [
    ['at', () => Tuple.at(tuple, 1), () => Tuple.at(1)(tuple)],
    ['append', () => Tuple.append(tuple, true), () => Tuple.append(true)(tuple)],
    ['prepend', () => Tuple.prepend(tuple, true), () => Tuple.prepend(true)(tuple)],
    [
      'concat',
      () => Tuple.concat(tuple, [true] as const),
      () => Tuple.concat([true] as const)(tuple),
    ],
    ['mapFirst', () => Tuple.mapFirst(tuple, String), () => Tuple.mapFirst(String)(tuple)],
    [
      'mapSecond',
      () => Tuple.mapSecond(tuple, (value) => value.length),
      () => Tuple.mapSecond((value: string) => value.length)(tuple),
    ],
    [
      'bimap',
      () => Tuple.bimap(tuple, String, (value) => value.length),
      () => Tuple.bimap(String, (value: string) => value.length)(tuple),
    ],
    [
      'map',
      () => Tuple.map(tuple, (value) => String(value)),
      () => Tuple.map((value: string | number) => String(value))(tuple),
    ],
    [
      'mapInto',
      () => Tuple.mapInto(tuple, [] as string[], (value) => String(value)),
      () => Tuple.mapInto([] as string[], (value: string | number) => String(value))(tuple),
    ],
    ['zip', () => Tuple.zip(tuple, [true, false]), () => Tuple.zip([true, false])(tuple)],
  ]

  it.each(cases)('%s', (_name, dataFirst, curried) => {
    expect(dataFirst()).toEqual(curried())
  })
})
