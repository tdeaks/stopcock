import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { validateReadinessInventoryData } from '../check-stopcock-v2-package-cohort-readiness.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const inventoryPath = join(
  root,
  'docs/superpowers/contracts/stopcock-v2-package-cohort-readiness.json',
)
const dynamicScopesPath = join(root, 'docs/superpowers/contracts/stopcock-v2-dynamic-scopes.json')

const loadFixture = () => ({
  inventory: JSON.parse(readFileSync(inventoryPath, 'utf8')),
  dynamicScopes: JSON.parse(readFileSync(dynamicScopesPath, 'utf8')),
})

const validate = (fixture, requireReady = false) =>
  validateReadinessInventoryData({
    root,
    ...fixture,
    requireReady,
  })

test('accepts the complete live S0 package-cohort readiness inventory', () => {
  const result = validate(loadFixture())
  assert.equal(result.total, 21)
  assert.equal(result.public, 20)
  assert.equal(result.ready, 19)
  assert.deepEqual(result.blocked, ['@stopcock/date', '@stopcock/diff'])
})

test('rejects an omitted package', () => {
  const fixture = loadFixture()
  fixture.inventory.packages.splice(3, 1)
  assert.throws(() => validate(fixture), /packages\/\* inventory/u)
})

test('rejects a duplicated package', () => {
  const fixture = loadFixture()
  fixture.inventory.packages.splice(4, 0, structuredClone(fixture.inventory.packages[3]))
  assert.throws(() => validate(fixture), /packages\/\* inventory|duplicates/u)
})

test('rejects an unexpected or renamed cohort package', () => {
  const fixture = loadFixture()
  fixture.inventory.cohort.public[0] = '@stopcock/not-the-async-package'
  assert.throws(() => validate(fixture), /public cohort/u)
})

test('rejects a non-explicit 0.0.0 disposition', () => {
  const fixture = loadFixture()
  const record = fixture.inventory.packages.find((entry) => entry.name === '@stopcock/fp-testing')
  record.disposition.status = 'deferred'
  assert.throws(() => validate(fixture), /ready or blocked/u)
})

test('rejects drift in the deliberate FP 1.x versus 2.x peer mismatch', () => {
  const fixture = loadFixture()
  const assertion = fixture.inventory.currentState.assertions.find(
    (entry) => entry.package === '@stopcock/fp-compiler',
  )
  assertion.actual = '^1.0.0'
  assert.throws(() => validate(fixture), /assertion drifted/u)
})

test('rejects manifest-set identity drift', () => {
  const fixture = loadFixture()
  fixture.inventory.manifestSetSha256 = `sha256:${'0'.repeat(64)}`
  assert.throws(() => validate(fixture), /manifest-set SHA-256/u)
})

test('rejects a remaining blocker without a predecessor-recorded dynamic target', () => {
  const fixture = loadFixture()
  fixture.dynamicScopes.stages.S0R = fixture.dynamicScopes.stages.S0R.filter(
    (target) => target.id !== 'date-source-types',
  )
  assert.throws(() => validate(fixture), /no start-HEAD S0R target/u)
})

test('require-ready fails closed on the exact blocked public packages', () => {
  assert.throws(() => validate(loadFixture(), true), /@stopcock\/date, @stopcock\/diff/u)
})
