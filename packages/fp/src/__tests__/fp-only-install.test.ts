import { describe, expect, it } from 'vite-plus/test'
import { readFileSync } from 'node:fs'
import * as A from '../array'
import { compile } from '../compile'
import { pipe as compactPipe } from '../fusion'
import { pipe, flow } from '../index'
import manifest from '../../package.json'

/**
 * S10X: installing `@stopcock/fp` alone must give a complete product.
 *
 * The optimizer is opt-in by construction. If FP ever grew a dependency,
 * optional peer, or hidden forwarder to it, the optimizer would become a
 * silent required install cost, which is the outcome the extraction exists to
 * avoid.
 */
describe('an FP-only install', () => {
  it('declares no dependency or peer on the optimizer', () => {
    const fields = ['dependencies', 'peerDependencies', 'optionalDependencies', 'devDependencies']
    for (const field of fields) {
      const entry = (manifest as Record<string, Record<string, string> | undefined>)[field]
      expect(Object.keys(entry ?? {})).not.toContain('@stopcock/fp-optimizer')
    }
  })

  it('never imports the optimizer from source', () => {
    // A forwarder would satisfy the manifest check above and still break an
    // FP-only install at runtime.
    //
    // Matches import and require specifiers only. Naming the package in prose
    // is expected -- `abi.ts` documents the boundary and names it in the
    // incompatible-install error -- and an earlier substring check flagged
    // exactly that.
    const specifier = /(?:from\s*|import\s*\(\s*|require\(\s*)['"]@stopcock\/fp-optimizer/u
    const files = import.meta.glob('../**/*.ts', { query: '?raw', eager: true, import: 'default' })
    for (const [path, source] of Object.entries(files as Record<string, string>)) {
      if (path.includes('__tests__') || path.endsWith('.test.ts')) continue
      expect(source).not.toMatch(specifier)
    }
  })

  it('would catch a forwarder if one were added', () => {
    // Guards the regex above: it has to actually match an import.
    const specifier = /(?:from\s*|import\s*\(\s*|require\(\s*)['"]@stopcock\/fp-optimizer/u
    expect("import { pipe } from '@stopcock/fp-optimizer'").toMatch(specifier)
    expect("await import('@stopcock/fp-optimizer')").toMatch(specifier)
    expect('// see @stopcock/fp-optimizer for the fast tier').not.toMatch(specifier)
  })

  it('runs every tier it still ships', () => {
    const steps = [A.map((x: number) => x * 2), A.filter((x: number) => x > 2)] as const
    const expected = [4, 6]
    expect(pipe([1, 2, 3], ...steps)).toEqual(expected)
    expect(flow(...steps)([1, 2, 3])).toEqual(expected)
    expect(compactPipe([1, 2, 3], ...steps)).toEqual(expected)
    expect(compile(...steps)([1, 2, 3])).toEqual(expected)
  })

  it('keeps the deprecated compile subpath working without the optimizer', () => {
    expect(compile(A.map((x: number) => x + 1))([1, 2])).toEqual([2, 3])
  })
})
