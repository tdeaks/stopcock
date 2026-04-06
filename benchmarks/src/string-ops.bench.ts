import { bench, describe } from 'vitest'
import { S } from '@stopcock/fp'
import * as Ra from 'ramda'
import * as Rb from 'rambda'
import * as _ from 'lodash-es'

const str = 'The quick brown fox jumps over the lazy dog'
const long = str.repeat(100)

describe('trim', () => {
  const padded = '   ' + str + '   '
  bench('stopcock', () => S.trim(padded))
  bench('rambda', () => Rb.trim(padded))
  bench('ramda', () => Ra.trim(padded))
  bench('lodash', () => _.trim(padded))
})

describe('split', () => {
  bench('stopcock', () => S.split(str, ' '))
  bench('rambda', () => Rb.split(' ')(str))
  bench('ramda', () => Ra.split(' ', str))
  bench('lodash', () => _.split(str, ' '))
})

describe('includes (string)', () => {
  bench('stopcock', () => S.includes(long, 'lazy'))
  bench('rambda', () => Rb.includes('lazy')(long))
  bench('ramda', () => Ra.includes('lazy', long))
  bench('lodash', () => _.includes(long, 'lazy'))
})

describe('startsWith', () => {
  bench('stopcock', () => S.startsWith(str, 'The'))
  bench('rambda', () => Rb.startsWith('The')(str))
  bench('ramda', () => Ra.startsWith('The', str))
  bench('lodash', () => _.startsWith(str, 'The'))
})

describe('endsWith', () => {
  bench('stopcock', () => S.endsWith(str, 'dog'))
  bench('rambda', () => Rb.endsWith('dog')(str))
  bench('ramda', () => Ra.endsWith('dog', str))
  bench('lodash', () => _.endsWith(str, 'dog'))
})

describe('toLowerCase', () => {
  bench('stopcock', () => S.toLowerCase(str))
  bench('ramda', () => Ra.toLower(str))
  bench('lodash', () => _.toLower(str))
})

describe('toUpperCase', () => {
  bench('stopcock', () => S.toUpperCase(str))
  bench('ramda', () => Ra.toUpper(str))
  bench('lodash', () => _.toUpper(str))
})

describe('replaceAll', () => {
  bench('stopcock', () => S.replaceAll(str, ' ', '-'))
  bench('rambda', () => Rb.replaceAll(' ', '-')(str))
})

describe('repeat (string)', () => {
  bench('stopcock', () => S.repeat(str, 100))
  bench('rambda', () => Rb.repeat(str)(100))
  bench('ramda', () => Ra.repeat(str, 100))
})

describe('slice (string)', () => {
  bench('stopcock', () => S.slice(long, 100, 200))
  bench('rambda', () => Rb.slice(100, 200)(long))
  bench('ramda', () => Ra.slice(100, 200, long))
})
