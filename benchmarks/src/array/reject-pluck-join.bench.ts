import { bench, describe } from 'vite-plus/test'
import * as A from '@stopcock/fp/array'
import * as _ from 'lodash-es'
import * as Ra from 'ramda'
import * as Rb from 'rambda'
import { getData } from '../setup'

const pred = (x: { id: number; name: string; active: boolean }) => x.active

describe.each([100, 1_000, 10_000])('reject — n=%i', (n) => {
  const data = getData<{ id: number; name: string; active: boolean }>('objects', n as any)
  const stopcockReject = A.reject(pred) // hoisted: isolate execution cost, not closure construction

  bench('stopcock', () => stopcockReject(data))
  bench('rambda', () => Rb.reject(pred)(data))
  bench('ramda', () => Ra.reject(pred, data))
  bench('lodash', () => _.reject(data, pred))
})

describe.each([100, 1_000, 10_000])('pluck — n=%i', (n) => {
  const data = getData<{ id: number; name: string; active: boolean }>('objects', n as any)
  const stopcockPluck = A.pluck('name') // hoisted: isolate execution cost, not closure construction

  bench('stopcock', () => stopcockPluck(data))
  bench('rambda', () => Rb.pluck('name')(data))
  bench('ramda', () => Ra.pluck('name', data))
  bench('lodash', () => _.map(data, 'name'))
})

describe.each([100, 1_000, 10_000])('join — n=%i', (n) => {
  const data = getData<string>('strings', n as any)
  const stopcockJoin = A.join(',') // hoisted: isolate execution cost, not closure construction

  bench('stopcock', () => stopcockJoin(data))
  bench('rambda', () => Rb.join(',')(data))
  bench('ramda', () => Ra.join(',', data))
})
