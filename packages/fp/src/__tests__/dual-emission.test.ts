/**
 * Runtime contract for the dual emission
 * (2026-08-24-dual-performance-first.md, Phase 1).
 *
 * Two guards. The parity table proves both call shapes of every sampled op
 * agree, which is the whole feature. The closure pins are invariant 1's
 * tripwire: the curried branch must keep returning the exact closure the
 * single-form emission shipped, because every pipe-row performance figure
 * rests on that closure's code. A pin failing means the codegen template
 * changed the hot path; re-measure before re-pinning, never re-pin blind.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vite-plus/test'
import * as A from '../array'
import * as AX from '../array-extra'
import * as B from '../boolean'
import * as G from '../guard'
import * as I from '../iter'
import * as M from '../math'
import * as MapOps from '../map'
import * as Match from '../match'
import * as NEA from '../non-empty-array'
import * as N from '../number'
import * as Nullable from '../nullable'
import * as O from '../object'
import * as Optic from '../optic'
import * as Option from '../option'
import * as Reader from '../reader'
import * as RecordOps from '../record'
import * as Result from '../result'
import * as Schema from '../schema'
import * as SetOps from '../set'
import * as State from '../state-fn'
import * as S from '../string'
import * as These from '../these'
import * as TypedArray from '../typed-array'
import * as Validation from '../validation'
import * as Writer from '../writer'

const numbers = [3, 1, 4, 1, 5, 9, 2, 6]

describe('data-first and curried shapes agree', () => {
  const double = (x: number) => x * 2
  const isBig = (x: number) => x > 3
  const sum = (acc: number, x: number) => acc + x
  const objectValue: {
    a: number
    b?: number
    nested: { value: number }
  } = { a: 1, b: 2, nested: { value: 3 } }
  const numbersRight = [2, 4, 6, 8, 10, 12, 14, 16]
  const parsed = '{"value":1}'
  const mapValue = new Map([['one', 1]])
  const recordValue = { one: 1, two: 2 }
  const setValue = new Set([1, 2, 3])
  const optionValue = Option.some({ count: 2 })
  const resultValue = Result.ok({ count: 2 })
  const valueLens = Optic.prop<{ value: number }, 'value'>('value')
  const positiveSchema = Schema.fromPredicate<number>((value) => value > 0)
  const readerValue: Reader.Reader<{ readonly value: number }, number> = (environment) =>
    environment.value
  const stateValue: State.State<number, number> = (state) => [state * 2, state + 1]
  const writerValue = Writer.writer(2, 'written')
  const theseValue: These.These<string, number> = These.both('left', 2)
  const valueCases = {
    one: () => 1,
    two: () => 2,
  } as const

  const cases: readonly [string, unknown, unknown][] = [
    ['map', A.map(numbers, double), A.map(double)(numbers)],
    ['filter', A.filter(numbers, isBig), A.filter(isBig)(numbers)],
    ['take', A.take(numbers, 3), A.take(3)(numbers)],
    ['drop', A.drop(numbers, 3), A.drop(3)(numbers)],
    ['reduce', A.reduce(numbers, sum, 0), A.reduce(sum, 0)(numbers)],
    ['flatMap', A.flatMap(numbers, (x) => [x, x]), A.flatMap((x: number) => [x, x])(numbers)],
    ['xprod', A.xprod([1, 2], ['a']), A.xprod(['a'])([1, 2])],
    ['repeat', A.repeat('x', 3), A.repeat(3)('x')],
    ['chunk', A.chunk(numbers, 3), A.chunk(3)(numbers)],
    ['includes', A.includes(numbers, 4), A.includes(4)(numbers)],
    ['add', M.add(5, 3), M.add(3)(5)],
    ['subtract', M.subtract(5, 3), M.subtract(3)(5)],
    ['modulo', M.modulo(17, 5), M.modulo(5)(17)],
    ['and_', B.and_(true, false), B.and_(false)(true)],
    ['string.startsWith', S.startsWith('stopcock', 'stop'), S.startsWith('stop')('stopcock')],
    ['string.endsWith', S.endsWith('stopcock', 'cock'), S.endsWith('cock')('stopcock')],
    ['string.includes', S.includes('stopcock', 'op'), S.includes('op')('stopcock')],
    ['string.split', S.split('a,b', ','), S.split(',')('a,b')],
    ['string.repeat', S.repeat('ab', 2), S.repeat(2)('ab')],
    ['string.slice', S.slice('stopcock', 1), S.slice(1)('stopcock')],
    ['string.padStart', S.padStart('7', 3, '0'), S.padStart(3, '0')('7')],
    ['string.padEnd', S.padEnd('7', 3, '0'), S.padEnd(3, '0')('7')],
    ['string.stripPrefix', S.stripPrefix('stopcock', 'stop'), S.stripPrefix('stop')('stopcock')],
    ['string.stripSuffix', S.stripSuffix('stopcock', 'cock'), S.stripSuffix('cock')('stopcock')],
    [
      'string.replace',
      S.replace('stopcock', 'stop', 'start'),
      S.replace('stop', 'start')('stopcock'),
    ],
    ['string.replaceAll', S.replaceAll('a-b-a', /a/gu, 'x'), S.replaceAll(/a/gu, 'x')('a-b-a')],
    ['string.test', S.test('stopcock', /cock/gu), S.test(/cock/gu)('stopcock')],
    ['string.match', S.match('stopcock', /cock/gu), S.match(/cock/gu)('stopcock')],
    ['string.truncate', S.truncate('stopcock', 5), S.truncate(5)('stopcock')],
    ['string.normalize', S.normalize('e\u0301', 'NFC'), S.normalize('NFC')('e\u0301')],
    ['string.graphemes', S.graphemes('á', 'en'), S.graphemes('en')('á')],
    ['string.graphemeLength', S.graphemeLength('á', 'en'), S.graphemeLength('en')('á')],
    ['string.parseJson', S.parseJson(parsed), S.parseJson()(parsed)],
    ['object.pick', O.pick(objectValue, ['a']), O.pick(['a'])(objectValue)],
    ['object.omit', O.omit(objectValue, ['b']), O.omit(['b'])(objectValue)],
    ['object.assoc', O.assoc(objectValue, 'c', 4), O.assoc('c', 4)(objectValue)],
    ['object.dissoc', O.dissoc(objectValue, 'a'), O.dissoc('a')(objectValue)],
    [
      'object.mapValues',
      O.mapValues(objectValue, (value) => String(value)),
      O.mapValues((value: unknown) => String(value))(objectValue),
    ],
    [
      'object.mapKeys',
      O.mapKeys(objectValue, (key) => `key:${String(key)}`),
      O.mapKeys((key: keyof typeof objectValue) => `key:${String(key)}`)(objectValue),
    ],
    [
      'object.pickBy',
      O.pickBy(objectValue, (value) => typeof value === 'number'),
      O.pickBy((value: unknown) => typeof value === 'number')(objectValue),
    ],
    [
      'object.omitBy',
      O.omitBy(objectValue, (value) => typeof value === 'number'),
      O.omitBy((value: unknown) => typeof value === 'number')(objectValue),
    ],
    [
      'object.mergeWith',
      O.mergeWith({ a: 1 }, { a: 2 }, (left, right) => Number(left) + Number(right)),
      O.mergeWith({ a: 2 }, (left, right) => Number(left) + Number(right))({ a: 1 }),
    ],
    [
      'object.mergeDeep',
      O.mergeDeep({ a: { left: 1 } }, { a: { right: 2 } }, undefined),
      O.mergeDeep({ a: { right: 2 } })({ a: { left: 1 } }),
    ],
    [
      'object.getPathOrUndefined',
      O.getPathOrUndefined(objectValue, ['nested', 'value']),
      O.getPathOrUndefined(['nested', 'value'])(objectValue),
    ],
    [
      'object.getPath',
      O.getPath(objectValue, ['nested', 'value']),
      O.getPath(['nested', 'value'])(objectValue),
    ],
    [
      'object.hasPath',
      O.hasPath(objectValue, ['nested', 'value']),
      O.hasPath(['nested', 'value'])(objectValue),
    ],
    ['object.setPath', O.setPath(objectValue, ['a'], 2), O.setPath(['a'], 2)(objectValue)],
    [
      'object.modifyPath',
      O.modifyPath(objectValue, ['a'], (value) => value + 1),
      O.modifyPath(['a'], (value: number) => value + 1)(objectValue),
    ],
    ['object.removePath', O.removePath(objectValue, ['b']), O.removePath(['b'])(objectValue)],
    [
      'object.evolve',
      O.evolve(objectValue, { a: (value) => value + 1 }),
      O.evolve({ a: (value: number) => value + 1 })(objectValue),
    ],
    ['number.clamp', N.clamp(12, 0, 10), N.clamp(0, 10)(12)],
    ['number.between', N.between(5, 0, 10), N.between(0, 10)(5)],
    [
      'number.weightedMeanOrUndefined',
      N.weightedMeanOrUndefined(numbers, numbersRight),
      N.weightedMeanOrUndefined(numbersRight)(numbers),
    ],
    [
      'number.weightedMean',
      N.weightedMean(numbers, numbersRight),
      N.weightedMean(numbersRight)(numbers),
    ],
    [
      'number.quantileOrUndefined',
      N.quantileOrUndefined(numbers, 0.5),
      N.quantileOrUndefined(0.5)(numbers),
    ],
    ['number.quantile', N.quantile(numbers, 0.5), N.quantile(0.5)(numbers)],
    [
      'number.quantileNonEmpty',
      N.quantileNonEmpty(numbers as [number, ...number[]], 0.5),
      N.quantileNonEmpty(0.5)(numbers as [number, ...number[]]),
    ],
    [
      'number.percentileOrUndefined',
      N.percentileOrUndefined(numbers, 50),
      N.percentileOrUndefined(50)(numbers),
    ],
    ['number.percentile', N.percentile(numbers, 50), N.percentile(50)(numbers)],
    [
      'number.percentileNonEmpty',
      N.percentileNonEmpty(numbers as [number, ...number[]], 50),
      N.percentileNonEmpty(50)(numbers as [number, ...number[]]),
    ],
    ['number.dotProduct', N.dotProduct(numbers, numbersRight), N.dotProduct(numbersRight)(numbers)],
    [
      'number.dotProductTruncate',
      N.dotProductTruncate(numbers, [1, 2]),
      N.dotProductTruncate([1, 2])(numbers),
    ],
    ['number.gcd', N.gcd(12, 8), N.gcd(8)(12)],
    ['number.lcm', N.lcm(12, 8), N.lcm(8)(12)],
    ['number.parseInteger', N.parseInteger('ff', 16), N.parseInteger(16)('ff')],
    ['number.roundTo', N.roundTo(1.234, 2), N.roundTo(2)(1.234)],
    ['number.roundTo mode', N.roundTo(1.234, 2, 'floor'), N.roundTo(2, 'floor')(1.234)],
    [
      'map.map',
      MapOps.map(mapValue, (value) => value + 1),
      MapOps.map((value: number) => value + 1)(mapValue),
    ],
    [
      'record.map',
      RecordOps.map(recordValue, (value) => value + 1),
      RecordOps.map((value: number) => value + 1)(recordValue),
    ],
    [
      'set.map',
      SetOps.map(setValue, (value) => value + 1),
      SetOps.map((value: number) => value + 1)(setValue),
    ],
    ['iter.map', I.toArray(I.map(numbers, double)), I.toArray(I.map(double)(numbers))],
    [
      'array-extra.scan1',
      AX.scan1([1, 2, 3], (left, right) => left + right),
      AX.scan1((left: number, right) => left + right)([1, 2, 3]),
    ],
    [
      'typed-array.slice',
      TypedArray.slice(new Uint8Array([1, 2, 3]), 1),
      TypedArray.slice(1)(new Uint8Array([1, 2, 3])),
    ],
    ['optic.view', Optic.view(valueLens, { value: 2 }), Optic.view(valueLens)({ value: 2 })],
    ['guard.isDeepEqual', G.isDeepEqual({ a: 1 }, { a: 1 }), G.isDeepEqual({ a: 1 })({ a: 1 })],
    ['nullable.map', Nullable.map(2, double), Nullable.map(double)(2)],
    ['match.value', Match.value('one', valueCases), Match.value(valueCases)('one')],
    [
      'schema.validateSync',
      Schema.validateSync(2, positiveSchema),
      Schema.validateSync(positiveSchema)(2),
    ],
    [
      'schema.map',
      Schema.validateSync(Schema.map(positiveSchema, double))(2),
      Schema.validateSync(Schema.map(double)(positiveSchema))(2),
    ],
    [
      'validation.fromPredicate',
      Validation.fromPredicate(
        2,
        (value) => value > 0,
        () => 'negative',
      ),
      Validation.fromPredicate(
        (value: number) => value > 0,
        () => 'negative',
      )(2),
    ],
    [
      'option.map',
      Option.map(optionValue, ({ count }) => count + 1),
      Option.map(({ count }) => count + 1)(optionValue),
    ],
    [
      'option.bindTo',
      Option.bindTo(Option.some(2), 'value'),
      Option.bindTo('value')(Option.some(2)),
    ],
    [
      'option.containsWith',
      Option.containsWith(Option.some(2), 2, Object.is),
      Option.containsWith(Object.is)(2)(Option.some(2)),
    ],
    [
      'option.lift2',
      Option.lift2(Option.some(2), Option.some(3), (left, right) => left + right),
      Option.lift2((left: number, right: number) => left + right)(Option.some(2), Option.some(3)),
    ],
    [
      'result.map',
      Result.map(resultValue, ({ count }) => count + 1),
      Result.map(({ count }) => count + 1)(resultValue),
    ],
    [
      'result.fromNullable',
      Result.fromNullable(2, () => 'missing'),
      Result.fromNullable(() => 'missing')(2),
    ],
    ['result.bindTo', Result.bindTo(Result.ok(2), 'value'), Result.bindTo('value')(Result.ok(2))],
    [
      'result.lift2',
      Result.lift2(Result.ok(2), Result.ok(3), (left, right) => left + right),
      Result.lift2((left: number, right: number) => left + right)(Result.ok(2), Result.ok(3)),
    ],
    [
      'result.allValidation',
      Result.allValidation([Result.err('a'), Result.err('b')], (left, right) => left + right),
      Result.allValidation((left: string, right) => left + right)([
        Result.err('a'),
        Result.err('b'),
      ]),
    ],
    ['non-empty-array.map', NEA.map([1, 2], double), NEA.map(double)([1, 2])],
    [
      'reader.provide',
      Reader.provide(readerValue, { value: 2 }),
      Reader.provide({ value: 2 })(readerValue),
    ],
    ['state.evaluate', State.evaluate(stateValue, 2), State.evaluate(2)(stateValue)],
    ['writer.map', Writer.map(writerValue, double), Writer.map(double)(writerValue)],
    ['these.map', These.map(theseValue, double), These.map(double)(theseValue)],
  ]

  for (const [name, dataFirst, curried] of cases) {
    test(name, () => {
      expect(dataFirst).toEqual(curried)
    })
  }
})

test('string.split keeps its established reflection contract', () => {
  expect(S.split.name).toBe('split')
  expect(S.split.length).toBe(1)
  expect(Object.prototype.hasOwnProperty.call(S.split, 'prototype')).toBe(false)
})

describe('the curried closure is the single-form closure, byte for byte', () => {
  // Pinned against the generated FILE text (runtime toString goes through
  // the test transform and is not the shipped code). codegen:check keeps
  // file and generator in lockstep; these pins keep the generator honest
  // about the hot path itself.
  const closureOf = (module: string, op: string): string => {
    const src = readFileSync(join(import.meta.dirname, '..', `${module}.ts`), 'utf8')
    const block = src.split(new RegExp(`^export const ${op}:`, 'm'))[1]?.split('\n} as any')[0]
    const idx = block?.lastIndexOf('return function (') ?? -1
    if (block === undefined || idx === -1) throw new Error(`${module}.${op}: closure not found`)
    return block.slice(idx)
  }

  test('map (delegate policy)', () => {
    expect(closureOf('array', 'map')).toBe(`return function (arr: any) {
    const len = arr.length,
      out = new Array(len)
    for (let i = 0; i < len; i++) out[i] = f(arr[i])
    return out
  }`)
  })

  test('add (inline policy)', () => {
    expect(closureOf('math', 'add')).toBe(`return function (a: any) {
    return a + b;
  }`)
  })

  test('all promoted closures match the frozen pre-Phase-2 source', () => {
    // Extracted from e2c2a4f, the branch tip immediately before Phase 2.
    // This is deliberately independent of both the defs and generated output.
    const fixture = JSON.parse(
      readFileSync(
        join(import.meta.dirname, 'fixtures', 'dual-single-form-closures.json'),
        'utf8',
      ),
    ) as Readonly<Record<string, string>>
    expect(Object.keys(fixture)).toHaveLength(48)
    for (const [qualifiedName, closure] of Object.entries(fixture)) {
      const [module, op] = qualifiedName.split('.') as [string, string]
      const source = readFileSync(join(import.meta.dirname, '..', `${module}.ts`), 'utf8')
      const start = source.indexOf(`export const ${op}:`)
      const end = source.indexOf('\nexport ', start + 1)
      const declaration = source.slice(start, end === -1 ? undefined : end)
      expect(declaration, qualifiedName).toContain(closure)
    }
  })
})
