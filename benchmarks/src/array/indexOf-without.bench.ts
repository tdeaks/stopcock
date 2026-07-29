import { bench, describe } from 'vite-plus/test'
import * as A from '@stopcock/fp/array'
import * as _ from 'lodash-es'
import * as Ra from 'ramda'
import * as Rb from 'rambda'
import { getData } from '../setup'

describe.each([100, 1_000, 10_000])('indexOf — n=%i', (n) => {
  const data = getData<number>('numbers', n as any)
  const target = data[Math.floor(n / 2)]
  const stopcockIndexOf = A.indexOfOrUndefined(target) // hoisted: isolate execution cost, not closure construction

  bench('stopcock', () => stopcockIndexOf(data))
  bench('rambda', () => Rb.indexOf(target)(data))
  bench('ramda', () => Ra.indexOf(target, data))
})

describe.each([100, 1_000, 10_000])('without — n=%i', (n) => {
  const data = getData<number>('numbers', n as any)
  const remove = data.slice(0, 5)
  const stopcockWithout = A.without(remove) // hoisted: isolate execution cost, not closure construction

  bench('stopcock', () => stopcockWithout(data))
  bench('rambda', () => Rb.without(remove)(data))
  bench('ramda', () => Ra.without(remove, data))
  bench('lodash', () => _.without(data, ...remove))
})
