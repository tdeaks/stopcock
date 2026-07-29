import { bench, describe } from 'vite-plus/test'
import * as A from '@stopcock/fp/array'
import * as R from 'remeda'
import * as _ from 'lodash-es'
import * as Ra from 'ramda'
import * as Rb from 'rambda'
import { A as TB } from '@mobily/ts-belt'
import { getData } from '../setup'

const fn = (x: { id: number; name: string; active: boolean }) => x.id % 100

describe.each([100, 1_000, 10_000])('uniqBy — n=%i', (n) => {
  const data = getData<{ id: number; name: string; active: boolean }>('objects', n as any)
  const stopcockUniqBy = A.uniqBy(fn) // hoisted: isolate execution cost, not closure construction

  bench('stopcock', () => stopcockUniqBy(data))
  bench('ts-belt', () => TB.uniqBy(data, fn))
  bench('remeda', () => R.uniqueBy(data, fn))
  bench('rambda', () => Rb.uniqBy(fn)(data))
  bench('ramda', () => Ra.uniqBy(fn, data))
  bench('lodash', () => _.uniqBy(data, fn))
})
