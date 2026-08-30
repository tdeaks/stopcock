import assert from 'node:assert/strict'
import test from 'node:test'
import {
  COMPANION_DUAL_REFERENCE_MANIFEST,
  EXPECTED_COMPANION_DUAL_EXPORT_COUNT,
  findStaleCurrentVersionClaims,
  findStaleDualOnlyClaims,
  findUnicodeEmDashes,
  hasOperationReference,
  missingDualReferenceLanes,
  parseFpDualCatalogue,
} from './fp-docs-contract.mjs'

void test('finds explicit single-lane claims', () => {
  const source = [
    'This API is curried-only.',
    'This API is data-last only.',
    'This API is pipe-only.',
    'This API only supports the curried form.',
  ].join('\n')

  assert.deepEqual(
    findStaleDualOnlyClaims(source).map(({ line }) => line),
    [1, 2, 3, 4],
  )
})

void test('accepts a dual-call claim', () => {
  assert.deepEqual(
    findStaleDualOnlyClaims('Direct data-first and curried data-last calls use the same name.'),
    [],
  )
})

void test('finds stale current-version labels and preserves historical references', () => {
  assert.equal(
    findStaleCurrentVersionClaims(
      'apps/docs/src/content/docs/cookbook.mdx',
      'Practical @stopcock/fp 2.0 recipes',
    ).length,
    1,
  )
  assert.deepEqual(
    findStaleCurrentVersionClaims(
      'apps/docs/src/content/docs/api/dict.mdx',
      'Dict was replaced by Record in @stopcock/fp 2.0.',
    ),
    [],
  )
})

void test('requires both direct and curried reference lanes', () => {
  assert.deepEqual(
    missingDualReferenceLanes('Use a direct data-first call or pipe(value, operation(config)).'),
    [],
  )
  assert.deepEqual(missingDualReferenceLanes('Use a direct data-first call.'), ['data-last'])
  assert.deepEqual(missingDualReferenceLanes('Use pipe(value, operation(config)).'), ['data-first'])
})

void test('finds Unicode em dashes by line', () => {
  assert.deepEqual(
    findUnicodeEmDashes('ASCII - accepted\nUnicode \u2014 rejected').map(({ line }) => line),
    [2],
  )
})

void test('parses exact FP dual operation names by catalogue module', () => {
  const catalogue = [
    '### `@stopcock/fp/array` (2)',
    '| Operation | Data first | Data last |',
    '| --- | --- | --- |',
    '| `map` | `map(values, f)` | `map(f)(values)` |',
    '| `take` | `take(values, count)` | `take(count)(values)` |',
    '',
    '### `@stopcock/fp/result` (1)',
    '| Operation | Data first | Data last |',
    '| --- | --- | --- |',
    '| `match` | `match(value, handlers)` | `match(handlers)(value)` |',
  ].join('\n')

  assert.deepEqual(
    parseFpDualCatalogue(catalogue),
    new Map([
      ['./array', { expectedCount: 2, operations: ['map', 'take'] }],
      ['./result', { expectedCount: 1, operations: ['match'] }],
    ]),
  )
})

void test('matches exact qualified operation references', () => {
  const source = 'add(left, right)\nTz.add(timestamp, amount, unit, zone)'
  assert.equal(hasOperationReference(source, 'add'), true)
  assert.equal(hasOperationReference(source, 'Tz.add'), true)
  assert.equal(hasOperationReference('Tz.add(timestamp, amount, unit, zone)', 'add'), false)
})

void test('pins 148 unique companion operation names', () => {
  let count = 0
  for (const entry of Object.values(COMPANION_DUAL_REFERENCE_MANIFEST)) {
    assert.equal(new Set(entry.operations).size, entry.operations.length)
    count += entry.operations.length
  }
  assert.equal(count, EXPECTED_COMPANION_DUAL_EXPORT_COUNT)
})
