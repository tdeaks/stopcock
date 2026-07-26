import { execFileSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vite-plus/test'

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

test('declaration graph traversal covers all relative import forms and rejects escapes', () => {
  const output = execFileSync(
    'bun',
    ['run', 'scripts/check-package-contract.ts', '--self-test-declaration-graph'],
    {
      cwd: packageRoot,
      encoding: 'utf8',
    },
  )

  expect(output).toContain('Declaration graph scanner and resolved containment self-test passed')
})
