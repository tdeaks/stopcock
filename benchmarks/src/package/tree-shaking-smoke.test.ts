import { afterEach, describe, expect, it } from 'vitest'
import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '../../..')
const tempDirs: string[] = []
const execFileAsync = promisify(execFile)

async function makeEntry(name: string, source: string) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'stopcock-fp-bundle-'))
  tempDirs.push(dir)

  const entry = path.join(dir, name)
  await writeFile(entry, source)
  return entry
}

async function bundle(entrypoint: string) {
  const outfile = path.join(path.dirname(entrypoint), 'bundle.js')

  await execFileAsync('bun', [
    'build',
    entrypoint,
    '--target=browser',
    '--format=esm',
    '--outfile',
    outfile,
  ])

  const text = await readFile(outfile, 'utf8')
  return {
    bytes: Buffer.byteLength(text, 'utf8'),
    text,
  }
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe('source-equivalent FP subpath tree-shaking smoke', () => {
  it('bundles a focused array import without pulling the root namespace shape', async () => {
    const arraySource = path.join(repoRoot, 'packages/fp/src/array.ts')
    const rootSource = path.join(repoRoot, 'packages/fp/src/index.ts')

    // This is a source-equivalent smoke because dist may not exist in local dev.
    // It checks the focused array entry stays tiny relative to a root namespace import.
    const focusedEntry = await makeEntry('focused-array-entry.ts', `
      import { filter, map, take } from ${JSON.stringify(arraySource)}

      const data = [1, 2, 3, 4]
      console.log(take(map(filter(data, (x) => x > 1), (x) => x * 2), 2))
    `)

    const rootNamespaceEntry = await makeEntry('root-namespace-entry.ts', `
      import { A } from ${JSON.stringify(rootSource)}

      const data = [1, 2, 3, 4]
      console.log(A.take(A.map(A.filter(data, (x) => x > 1), (x) => x * 2), 2))
    `)

    const focused = await bundle(focusedEntry)
    const rootNamespace = await bundle(rootNamespaceEntry)

    expect(focused.bytes).toBeLessThan(10_000)
    expect(rootNamespace.bytes).toBeGreaterThan(focused.bytes * 12)
    expect(focused.text).not.toContain('chunk: size must be >= 1')
  })
})
