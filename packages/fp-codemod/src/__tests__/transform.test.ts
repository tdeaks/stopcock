import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vite-plus/test'
import { transformSource } from '../index'
import { runCodemod } from '../node'

const scratch: string[] = []

afterEach(async () => {
  await Promise.all(scratch.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})

describe('transformSource', () => {
  it('rewrites legacy subpaths and reports semantic review points', () => {
    const result = transformSource("import * as Stream from '@stopcock/fp/stream'\n", 'fixture.ts')
    expect(result.code).toBe("import * as Stream from '@stopcock/fp/iter'\n")
    expect(result.changed).toBe(true)
    expect(result.diagnostics[0]?.code).toBe('semantic-migration')
  })

  it('does not guess at incompatible lens migrations', () => {
    const source = "import { lens } from '@stopcock/fp/lens'\n"
    const result = transformSource(source, 'fixture.ts')
    expect(result.code).toBe(source)
    expect(result.changed).toBe(false)
    expect(result.diagnostics[0]?.code).toBe('manual-optics-migration')
    expect(result.diagnostics[0]?.severity).toBe('error')
  })

  it('preserves an imported export named type', () => {
    const source = "import { type as kind } from '@stopcock/fp'\n"
    const result = transformSource(source, 'fixture.ts')
    expect(result.code).toBe(source)
    expect(result.changed).toBe(false)
    expect(result.diagnostics[0]?.code).toBe('unmapped-root-export')
  })

  it('splits safe root imports and leaves unsafe JIT imports for manual review', () => {
    const result = transformSource(
      "import { pipe, A, O, mapOption as mapO, compileJit } from '@stopcock/fp'\n",
      'fixture.ts',
    )
    expect(result.code).toContain("import { pipe, compileJit } from '@stopcock/fp'")
    expect(result.code).toContain("import * as A from '@stopcock/fp/array'")
    expect(result.code).toContain("import * as O from '@stopcock/fp/option'")
    expect(result.code).toContain("import { map as mapO } from '@stopcock/fp/option'")
    expect(result.diagnostics.some((item) => item.code === 'runtime-jit-removed')).toBe(true)
  })

  it('renames diagnostics and moves compiler telemetry to its subpath', () => {
    const result = transformSource(
      "import { explainPipeline as explainLegacy, getOptimizerStats, type OptimizerStats } from '@stopcock/fp';\n",
      'fixture.ts',
    )
    expect(result.code).toContain("import { explain as explainLegacy } from '@stopcock/fp';")
    expect(result.code).toContain(
      "import { getOptimizerStats, type OptimizerStats } from '@stopcock/fp/compile';",
    )
    expect(result.diagnostics.some((item) => item.code === 'root-export-renamed')).toBe(true)
  })

  it('rewrites positional Option and Result match handlers', () => {
    const result = transformSource(
      [
        "import { O as Opt, matchResult as fold } from '@stopcock/fp'",
        'const option = Opt.match(onNone, (value) => value)(input)',
        'const result = fold(onErr, onOk)(input)',
      ].join('\n'),
      'fixture.ts',
    )
    expect(result.code).toContain('Opt.match({ none: onNone, some: (value) => value })(input)')
    expect(result.code).toContain('fold({ err: onErr, ok: onOk })(input)')
    expect(
      result.diagnostics.filter((item) => item.code === 'match-handlers-migrated'),
    ).toHaveLength(2)
  })

  it('requires manual migration for removed async Result and Logic APIs', () => {
    const source = [
      "import { Logic, R, tryCatchAsync } from '@stopcock/fp'",
      'R.tryCatchAsync(load)',
      'tryCatchAsync(load)',
    ].join('\n')
    const result = transformSource(source, 'fixture.ts')
    expect(result.code).toContain("import { Logic, tryCatchAsync } from '@stopcock/fp'")
    expect(result.code).toContain("import * as R from '@stopcock/fp/result'")
    expect(result.diagnostics.some((item) => item.code === 'manual-module-migration')).toBe(true)
    expect(
      result.diagnostics.filter((item) => item.code === 'async-result-removed').length,
    ).toBeGreaterThanOrEqual(2)
  })

  it('renames safe Option and Result subpath aliases in place', () => {
    const result = transformSource(
      [
        "import { orElseWith } from '@stopcock/fp/option'",
        "import { orElseWith as recover } from '@stopcock/fp/result'",
      ].join('\n'),
      'fixture.ts',
    )
    expect(result.code).toContain("import { orElse as orElseWith } from '@stopcock/fp/option'")
    expect(result.code).toContain("import { orElse as recover } from '@stopcock/fp/result'")
  })

  it('flags the removed Logic subpath without guessing', () => {
    const source = "import * as Logic from '@stopcock/fp/logic'\n"
    const result = transformSource(source, 'fixture.ts')
    expect(result.code).toBe(source)
    expect(result.changed).toBe(false)
    expect(result.diagnostics[0]?.code).toBe('manual-module-migration')
  })

  it('leaves commented root imports intact', () => {
    const source = [
      'import {',
      '  // Keep this migration note.',
      '  A,',
      "} from '@stopcock/fp'",
    ].join('\n')
    const result = transformSource(source, 'fixture.ts')
    expect(result.code).toBe(source)
    expect(result.changed).toBe(false)
    expect(result.diagnostics[0]?.code).toBe('commented-root-import')
  })

  it('is idempotent after safe migrations', () => {
    const first = transformSource("import * as A from '@stopcock/fp/array'\n")
    expect(first.changed).toBe(false)
    expect(transformSource(first.code).code).toBe(first.code)
  })

  it('can skip root and match-handler rewrites', () => {
    const source = ["import { O } from '@stopcock/fp'", 'O.match(onNone, onSome)(value)'].join('\n')
    const result = transformSource(source, 'fixture.ts', {
      rewriteRootImports: false,
    })
    expect(result.code).toBe(source)
    expect(result.changed).toBe(false)
  })
})

describe('runCodemod', () => {
  it('supports dry-run and explicit writes', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'stopcock-fp-codemod-'))
    scratch.push(directory)
    const file = join(directory, 'fixture.ts')
    const source = "export * from '@stopcock/fp/dict'\n"
    await writeFile(file, source)

    const dryRun = await runCodemod([directory])
    expect(dryRun.changedFiles).toBe(1)
    expect(await readFile(file, 'utf8')).toBe(source)

    const written = await runCodemod([directory], { write: true })
    expect(written.writtenFiles).toBe(1)
    expect(await readFile(file, 'utf8')).toContain('@stopcock/fp/record')
  })

  it('does not follow directory symlinks', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'stopcock-fp-codemod-'))
    scratch.push(directory)
    await writeFile(join(directory, 'fixture.ts'), "import * as A from '@stopcock/fp/array'\n")
    await symlink(directory, join(directory, 'cycle'))

    const result = await runCodemod([directory])
    expect(result.scannedFiles).toBe(1)
  })
})
