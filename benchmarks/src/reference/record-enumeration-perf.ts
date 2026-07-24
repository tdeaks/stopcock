// Non-gating paired characterization for Record's large-key enumeration path.
// Run with Bun directly. For Node/V8, import this file from a temporary Vitest
// test so Vite resolves the source imports exactly as the package does.
import * as RecordOps from '../../../packages/fp/src/record'
import { runPaired } from './perf-runner'

type NumberRecord = Record<PropertyKey, number>

const ROUNDS = 40
const sink = new Array<unknown>(8)
let sinkIndex = 0

const consume = (value: unknown): void => {
  sink[sinkIndex++ & 7] = value
}

const oldEnumerableKeys = (source: object): PropertyKey[] =>
  Reflect.ownKeys(source).filter((key) => Object.prototype.propertyIsEnumerable.call(source, key))

const oldMapInto = (
  source: NumberRecord,
  target: NumberRecord,
  f: (value: number, key: PropertyKey) => number,
): NumberRecord => {
  for (const key of oldEnumerableKeys(source)) target[key] = f(source[key], key)
  return target
}

const oldMap = (
  source: NumberRecord,
  f: (value: number, key: PropertyKey) => number,
): NumberRecord => oldMapInto(source, Object.create(null) as NumberRecord, f)

const oldFilterInto = (
  source: NumberRecord,
  target: NumberRecord,
  predicate: (value: number, key: PropertyKey) => boolean,
): NumberRecord => {
  for (const key of oldEnumerableKeys(source)) {
    const value = source[key]
    if (predicate(value, key)) target[key] = value
  }
  return target
}

const oldFilter = (
  source: NumberRecord,
  predicate: (value: number, key: PropertyKey) => boolean,
): NumberRecord => oldFilterInto(source, Object.create(null) as NumberRecord, predicate)

const mapValue = (value: number): number => value * 2
const keepEven = (value: number): boolean => (value & 1) === 0

const repeated = (count: number, fn: () => unknown): (() => void) => () => {
  for (let index = 0; index < count; index++) consume(fn())
}

const report = (name: string, current: () => void, before: () => void): void => {
  const result = runPaired(current, before, { rounds: ROUNDS })
  console.log(
    `${name}: ${result.medianRatio.toFixed(3)} [${result.ciLow.toFixed(3)}, ${result.ciHigh.toFixed(3)}]`,
  )
}

console.log('current/pre-change; >1 means current is faster')
for (const size of [100, 1_000]) {
  const batch = size === 100 ? 256 : 32
  const source = Object.fromEntries(
    Array.from({ length: size }, (_, index) => [`key${index}`, index]),
  ) as NumberRecord

  report(
    `Record.keys n=${size}`,
    repeated(batch, () => RecordOps.keys(source)),
    repeated(batch, () => oldEnumerableKeys(source)),
  )
  report(
    `Record.map n=${size}`,
    repeated(batch, () => RecordOps.map(source, mapValue)),
    repeated(batch, () => oldMap(source, mapValue)),
  )
  report(
    `Record.filter n=${size}`,
    repeated(batch, () => RecordOps.filter(source, keepEven)),
    repeated(batch, () => oldFilter(source, keepEven)),
  )
}

let sinkToken = 0
for (const value of sink) {
  if (Array.isArray(value)) sinkToken += value.length
  else if (value && typeof value === 'object') sinkToken += Reflect.ownKeys(value).length
}
console.log(`sink token: ${sinkToken}`)
