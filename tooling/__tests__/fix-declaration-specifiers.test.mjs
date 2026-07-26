import assert from 'node:assert/strict'
import test from 'node:test'
import { rewriteDeclarationSpecifiers } from '../fix-declaration-specifiers.mjs'

test('rewrites extensionless relative declaration specifiers, including dotted basenames', () => {
  const source = `export { plain } from './plain'
export { generated } from './facts.generated'
export type { Identity } from '../bank-identity.generated'
type Loaded = typeof import('./nested/schema.generated')
const required: typeof import('../runtime') = require('../runtime')
`

  const rewritten = rewriteDeclarationSpecifiers(source)

  assert.equal(
    rewritten,
    `export { plain } from './plain.js'
export { generated } from './facts.generated.js'
export type { Identity } from '../bank-identity.generated.js'
type Loaded = typeof import('./nested/schema.generated.js')
const required: typeof import('../runtime.js') = require('../runtime.js')
`,
  )
  assert.equal(rewriteDeclarationSpecifiers(rewritten), rewritten)
})

test('preserves explicit JavaScript and JSON declaration specifier extensions', () => {
  const source = `export { js } from './module.js'
export { mjs } from './module.mjs'
export { cjs } from './module.cjs'
export { json } from './manifest.json'
`

  assert.equal(rewriteDeclarationSpecifiers(source), source)
})
