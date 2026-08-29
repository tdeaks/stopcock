import { describe, expect, it } from 'vite-plus/test'
import * as Eq from '../eq'
import * as Monoid from '../monoid'
import * as NEA from '../non-empty-array'
import { none, some } from '../option'
import * as Ord from '../ord'
import * as Reader from '../reader'
import * as Semigroup from '../semigroup'
import * as State from '../state-fn'
import * as These from '../these'
import * as Writer from '../writer'

type ParityCase = readonly [name: string, dataFirst: () => unknown, curried: () => unknown]

const nonEmptyValues: NEA.NonEmptyArray<number> = [3, 1, 1, 2]
const nonEmptyThat: NEA.NonEmptyArray<string> = ['a', 'b']

const nonEmptyArrayCases: readonly ParityCase[] = [
  ['prepend', () => NEA.prepend(nonEmptyValues, 'x'), () => NEA.prepend('x')(nonEmptyValues)],
  ['append', () => NEA.append(nonEmptyValues, 'x'), () => NEA.append('x')(nonEmptyValues)],
  [
    'concat',
    () => NEA.concat(nonEmptyValues, nonEmptyThat),
    () => NEA.concat(nonEmptyThat)(nonEmptyValues),
  ],
  [
    'concatReadonlyArray',
    () => NEA.concatReadonlyArray(nonEmptyValues, ['x']),
    () => NEA.concatReadonlyArray(['x'])(nonEmptyValues),
  ],
  [
    'map',
    () => NEA.map(nonEmptyValues, (value) => value * 2),
    () => NEA.map((value: number) => value * 2)(nonEmptyValues),
  ],
  [
    'flatMap',
    () => NEA.flatMap(nonEmptyValues, (value) => [value, -value]),
    () =>
      NEA.flatMap((value: number): NEA.NonEmptyArray<number> => [value, -value])(nonEmptyValues),
  ],
  [
    'filter',
    () => NEA.filter(nonEmptyValues, (value) => value > 1),
    () => NEA.filter((value: number) => value > 1)(nonEmptyValues),
  ],
  [
    'filterMap',
    () => NEA.filterMap(nonEmptyValues, (value) => (value % 2 === 0 ? some(value) : none)),
    () => NEA.filterMap((value: number) => (value % 2 === 0 ? some(value) : none))(nonEmptyValues),
  ],
  [
    'reduce',
    () => NEA.reduce(nonEmptyValues, (left, right) => left + right),
    () => NEA.reduce((left: number, right) => left + right)(nonEmptyValues),
  ],
  [
    'reduceWith',
    () => NEA.reduceWith(nonEmptyValues, '', (text, value) => text + value),
    () => NEA.reduceWith('', (text: string, value: number) => text + value)(nonEmptyValues),
  ],
  [
    'intersperse',
    () => NEA.intersperse(nonEmptyValues, 'x'),
    () => NEA.intersperse('x')(nonEmptyValues),
  ],
  [
    'zipWith',
    () => NEA.zipWith(nonEmptyValues, nonEmptyThat, (left, right) => `${left}:${right}`),
    () => NEA.zipWith(nonEmptyThat, (left: number, right) => `${left}:${right}`)(nonEmptyValues),
  ],
  ['zip', () => NEA.zip(nonEmptyValues, nonEmptyThat), () => NEA.zip(nonEmptyThat)(nonEmptyValues)],
  ['sort', () => NEA.sort(nonEmptyValues, Ord.number), () => NEA.sort(Ord.number)(nonEmptyValues)],
  ['min', () => NEA.min(nonEmptyValues, Ord.number), () => NEA.min(Ord.number)(nonEmptyValues)],
  ['max', () => NEA.max(nonEmptyValues, Ord.number), () => NEA.max(Ord.number)(nonEmptyValues)],
  ['uniq', () => NEA.uniq(nonEmptyValues, Eq.number), () => NEA.uniq(Eq.number)(nonEmptyValues)],
  [
    'groupAdjacent',
    () => NEA.groupAdjacent(nonEmptyValues, Eq.number),
    () => NEA.groupAdjacent(Eq.number)(nonEmptyValues),
  ],
  ['chunksOf', () => NEA.chunksOf(nonEmptyValues, 2), () => NEA.chunksOf(2)(nonEmptyValues)],
]

interface ReaderEnvironment {
  readonly n: number
  readonly offset: number
  readonly text: string
}

const numberReader: Reader.Reader<ReaderEnvironment, number> = (environment) => environment.n
const offsetReader: Reader.Reader<ReaderEnvironment, number> = (environment) => environment.offset
const readerEnvironment: ReaderEnvironment = { n: 2, offset: 3, text: 'stopcock' }

const readerCases: readonly ParityCase[] = [
  [
    'map',
    () => Reader.map(numberReader, (value) => value * 2)(readerEnvironment),
    () => Reader.map((value: number) => value * 2)(numberReader)(readerEnvironment),
  ],
  [
    'flatMap',
    () =>
      Reader.flatMap(
        numberReader,
        (value) => (environment: ReaderEnvironment) => value + environment.offset,
      )(readerEnvironment),
    () =>
      Reader.flatMap(
        (value: number) => (environment: ReaderEnvironment) => value + environment.offset,
      )(numberReader)(readerEnvironment),
  ],
  [
    'zipWith',
    () =>
      Reader.zipWith(numberReader, offsetReader, (left, right) => left + right)(readerEnvironment),
    () =>
      Reader.zipWith(offsetReader, (left: number, right) => left + right)(numberReader)(
        readerEnvironment,
      ),
  ],
  [
    'zip',
    () => Reader.zip(numberReader, offsetReader)(readerEnvironment),
    () => Reader.zip(offsetReader)(numberReader)(readerEnvironment),
  ],
  [
    'ap',
    () =>
      Reader.ap(
        (environment: ReaderEnvironment) => (value: number) => environment.n + value,
        offsetReader,
      )(readerEnvironment),
    () =>
      Reader.ap(offsetReader)(
        (environment: ReaderEnvironment) => (value: number) => environment.n + value,
      )(readerEnvironment),
  ],
  [
    'tap',
    () => Reader.tap(numberReader, (value) => () => value + 1)(readerEnvironment),
    () => Reader.tap((value: number) => () => value + 1)(numberReader)(readerEnvironment),
  ],
  [
    'local',
    () =>
      Reader.local(
        (value: string) => value.length,
        (input: { readonly text: string }) => input.text,
      )({ text: 'abc' }),
    () =>
      Reader.local((input: { readonly text: string }) => input.text)(
        (value: string) => value.length,
      )({ text: 'abc' }),
  ],
  [
    'provide',
    () => Reader.provide(numberReader, readerEnvironment),
    () => Reader.provide(readerEnvironment)(numberReader),
  ],
  [
    'compose',
    () =>
      Reader.compose(
        (value: string) => value.length,
        (input: { readonly text: string }) => input.text,
      )({ text: 'abc' }),
    () =>
      Reader.compose((input: { readonly text: string }) => input.text)(
        (value: string) => value.length,
      )({ text: 'abc' }),
  ],
  [
    'traverseReadonlyArray',
    () => Reader.traverseReadonlyArray([1, 2], (value) => (offset: number) => value + offset)(3),
    () =>
      Reader.traverseReadonlyArray((value: number) => (offset: number) => value + offset)([1, 2])(
        3,
      ),
  ],
]

const numberState: State.State<number, number> = (state) => [state * 2, state + 1]
const offsetState: State.State<number, number> = (state) => [state + 3, state + 1]

const stateCases: readonly ParityCase[] = [
  [
    'map',
    () => State.map(numberState, (value) => value + 1)(2),
    () => State.map((value: number) => value + 1)(numberState)(2),
  ],
  [
    'flatMap',
    () => State.flatMap(numberState, (value) => (state: number) => [value + state, state + 1])(2),
    () =>
      State.flatMap((value: number) => (state: number) => [value + state, state + 1] as const)(
        numberState,
      )(2),
  ],
  [
    'zipWith',
    () => State.zipWith(numberState, offsetState, (left, right) => left + right)(2),
    () => State.zipWith(offsetState, (left: number, right) => left + right)(numberState)(2),
  ],
  [
    'zip',
    () => State.zip(numberState, offsetState)(2),
    () => State.zip(offsetState)(numberState)(2),
  ],
  [
    'ap',
    () =>
      State.ap((state: number) => [(value: number) => state + value, state + 1], offsetState)(2),
    () =>
      State.ap(offsetState)(
        (state: number) => [(value: number) => state + value, state + 1] as const,
      )(2),
  ],
  [
    'tap',
    () => State.tap(numberState, (value) => (state: number) => [value, state + 1])(2),
    () =>
      State.tap((value: number) => (state: number) => [value, state + 1] as const)(numberState)(2),
  ],
  ['run', () => State.run(numberState, 2), () => State.run(2)(numberState)],
  ['evaluate', () => State.evaluate(numberState, 2), () => State.evaluate(2)(numberState)],
  ['execute', () => State.execute(numberState, 2), () => State.execute(2)(numberState)],
  [
    'traverseReadonlyArray',
    () =>
      State.traverseReadonlyArray([1, 2], (value) => (state: number) => [value + state, state + 1])(
        3,
      ),
    () =>
      State.traverseReadonlyArray(
        (value: number) => (state: number) => [value + state, state + 1] as const,
      )([1, 2])(3),
  ],
]

const output = Monoid.string
const writerValue = Writer.writer(2, 'a')
const writerThat = Writer.writer(3, 'b')

const writerCases: readonly ParityCase[] = [
  ['of', () => Writer.of(2, output), () => Writer.of(output)(2)],
  [
    'map',
    () => Writer.map(writerValue, (value) => value + 1),
    () => Writer.map((value: number) => value + 1)(writerValue),
  ],
  [
    'mapWritten',
    () => Writer.mapWritten(writerValue, (written) => written.length),
    () => Writer.mapWritten((written: string) => written.length)(writerValue),
  ],
  [
    'bimap',
    () =>
      Writer.bimap(
        writerValue,
        (written) => written.length,
        (value) => String(value),
      ),
    () =>
      Writer.bimap(
        (written: string) => written.length,
        (value: number) => String(value),
      )(writerValue),
  ],
  [
    'flatMap',
    () => Writer.flatMap(writerValue, output, (value) => Writer.writer(value + 1, 'b')),
    () => Writer.flatMap(output)((value: number) => Writer.writer(value + 1, 'b'))(writerValue),
  ],
  [
    'flatten',
    () => Writer.flatten(Writer.writer(Writer.writer(2, 'b'), 'a'), output),
    () => Writer.flatten(output)(Writer.writer(Writer.writer(2, 'b'), 'a')),
  ],
  [
    'zipWith',
    () => Writer.zipWith(writerValue, output, writerThat, (left, right) => left + right),
    () => Writer.zipWith(output)(writerThat, (left: number, right) => left + right)(writerValue),
  ],
  [
    'zip',
    () => Writer.zip(writerValue, output, writerThat),
    () => Writer.zip(output)(writerThat)(writerValue),
  ],
  [
    'listens',
    () => Writer.listens(writerValue, (written) => written.length),
    () => Writer.listens((written: string) => written.length)(writerValue),
  ],
  [
    'censor',
    () => Writer.censor(writerValue, (written) => written.toUpperCase()),
    () => Writer.censor((written: string) => written.toUpperCase())(writerValue),
  ],
  [
    'traverseReadonlyArray',
    () =>
      Writer.traverseReadonlyArray([1, 2], output, (value, index) =>
        Writer.writer(value * 2, String(index)),
      ),
    () =>
      Writer.traverseReadonlyArray(output)((value: number, index) =>
        Writer.writer(value * 2, String(index)),
      )([1, 2]),
  ],
  [
    'sequenceReadonlyArray',
    () => Writer.sequenceReadonlyArray([writerValue, writerThat], output),
    () => Writer.sequenceReadonlyArray(output)([writerValue, writerThat]),
  ],
]

const errors = Semigroup.string
const theseValue: These.These<string, number> = These.both('a', 2)
const theseThat: These.These<string, number> = These.both('b', 3)

const theseCases: readonly ParityCase[] = [
  [
    'match',
    () =>
      These.match(
        theseValue,
        (value) => value,
        (value) => String(value),
        (left, right) => `${left}:${right}`,
      ),
    () =>
      These.match(
        (value: string) => value,
        (value: number) => String(value),
        (left: string, right: number) => `${left}:${right}`,
      )(theseValue),
  ],
  [
    'map',
    () => These.map(theseValue, (value) => value + 1),
    () => These.map((value: number) => value + 1)(theseValue),
  ],
  [
    'mapLeft',
    () => These.mapLeft(theseValue, (value) => value.length),
    () => These.mapLeft((value: string) => value.length)(theseValue),
  ],
  [
    'bimap',
    () =>
      These.bimap(
        theseValue,
        (value) => value.length,
        (value) => String(value),
      ),
    () =>
      These.bimap(
        (value: string) => value.length,
        (value: number) => String(value),
      )(theseValue),
  ],
  [
    'flatMap',
    () => These.flatMap(theseValue, errors, (value) => These.both('b', value + 1)),
    () => These.flatMap(errors)((value: number) => These.both('b', value + 1))(theseValue),
  ],
  [
    'zipWith',
    () => These.zipWith(theseValue, errors, theseThat, (left, right) => left + right),
    () => These.zipWith(errors)(theseThat, (left: number, right) => left + right)(theseValue),
  ],
]

describe.each([
  ['NonEmptyArray', nonEmptyArrayCases],
  ['Reader', readerCases],
  ['State', stateCases],
  ['Writer', writerCases],
  ['These', theseCases],
] as const)('%s dual operations', (_module, cases) => {
  for (const [name, dataFirst, curried] of cases) {
    it(`${name}: data-first matches curried`, () => {
      expect(dataFirst()).toEqual(curried())
    })
  }
})
