import { bench, describe } from 'vitest'
import { A } from '@stopcock/fp'
import * as Ra from 'ramda'
import * as _ from 'lodash-es'
import { getData } from '../setup'

describe.each([100, 1_000, 10_000, 100_000])('tail — n=%i', (n) => {
  const data = getData<number>('numbers', n as any)

  bench('stopcock', () => A.tail(data))
  bench('ramda', () => Ra.tail(data))
  bench('lodash', () => _.tail(data))
})

describe.each([100, 1_000, 10_000, 100_000])('init — n=%i', (n) => {
  const data = getData<number>('numbers', n as any)

  bench('stopcock', () => A.init(data))
  bench('ramda', () => Ra.init(data))
  bench('lodash', () => _.initial(data))
})
