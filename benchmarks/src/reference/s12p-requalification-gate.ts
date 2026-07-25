/**
 * S12P: requalify the final package before S12 touches topology.
 *
 * S10's prototype pack answered one question — how big is the optimizer — and
 * did it from the packed artifact. This asks the rest: does what we are about
 * to freeze actually work when a consumer installs it?
 *
 * So it packs both packages the way npm would, installs them together into a
 * throwaway consumer, and imports and executes every public subpath from the
 * tarballs rather than from the workspace. Importing from source would prove
 * nothing about the export map, the packed file allowlist, or the declarations.
 *
 * The stable tarball ceiling is the one already recorded in the package
 * topology contract. This does not introduce a second budget, and a late waiver
 * is not one of its outcomes: over the ceiling means returning to the owning
 * slice, which is S12P's whole job.
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { FP_PACKAGE_STABLE_TARBALL_MAXIMUM_BYTES } from './fp-package-topology'

const localDirectory = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(localDirectory, '..', '..', '..')

export const STABLE_TARBALL_CEILING_BYTES = FP_PACKAGE_STABLE_TARBALL_MAXIMUM_BYTES

export interface PackedPackage {
  readonly name: string
  readonly tarballBytes: number
  readonly sha256: string
}

export interface SubpathResult {
  readonly specifier: string
  readonly ok: boolean
  readonly error?: string
}

export interface RequalificationReport {
  readonly packages: readonly PackedPackage[]
  readonly subpaths: readonly SubpathResult[]
  readonly fpTarballBytes: number
  readonly ceilingBytes: number
  readonly decision: 'under-ceiling' | 'over-ceiling'
  readonly failures: readonly string[]
}

const packageDirectories = [
  { name: '@stopcock/fp', dir: join(repoRoot, 'packages', 'fp') },
  { name: '@stopcock/fp-optimizer', dir: join(repoRoot, 'packages', 'fp-optimizer') },
]

/** Every public specifier a consumer may import, read from the export maps. */
const publicSpecifiers = (): string[] => {
  const out: string[] = []
  for (const { name, dir } of packageDirectories) {
    const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as {
      exports?: Record<string, unknown>
    }
    for (const key of Object.keys(manifest.exports ?? {})) {
      // `./package.json` is a legitimate export but needs an import attribute,
      // and importing it proves nothing about the runtime surface.
      if (key.includes('*') || key.endsWith('.json')) continue
      out.push(key === '.' ? name : `${name}/${key.replace(/^\.\//u, '')}`)
    }
  }
  return out
}

export const runRequalification = (): RequalificationReport => {
  const staging = mkdtempSync(join(repoRoot, 'node_modules', '.stopcock-s12p-'))
  const failures: string[] = []
  try {
    const packages: PackedPackage[] = []
    const tarballs: string[] = []
    for (const { name, dir } of packageDirectories) {
      const output = execFileSync('npm', ['pack', '--pack-destination', staging, '--silent'], {
        cwd: dir,
        encoding: 'utf8',
      })
        .trim()
        .split('\n')
      const tarball = join(staging, output[output.length - 1])
      tarballs.push(tarball)
      const contents = readFileSync(tarball)
      packages.push({
        name,
        tarballBytes: statSync(tarball).size,
        sha256: `sha256:${createHash('sha256').update(contents).digest('hex')}`,
      })
    }

    // A real install from the tarballs, so the export map and the packed file
    // allowlist are what gets exercised.
    const consumer = join(staging, 'consumer')
    execFileSync('mkdir', ['-p', consumer])
    writeFileSync(
      join(consumer, 'package.json'),
      JSON.stringify({ name: 's12p-consumer', private: true, type: 'module' }, null, 2),
    )
    execFileSync('npm', ['install', '--no-audit', '--no-fund', '--silent', ...tarballs], {
      cwd: consumer,
      encoding: 'utf8',
    })

    const specifiers = publicSpecifiers()
    const probe = join(consumer, 'probe.mjs')
    writeFileSync(
      probe,
      `${specifiers
        .map((specifier, index) => `import * as m${index} from ${JSON.stringify(specifier)}`)
        .join('\n')}
const mods = [${specifiers.map((_, index) => `m${index}`).join(', ')}]
const names = ${JSON.stringify(specifiers)}
const bad = []
for (let i = 0; i < mods.length; i++) {
  if (mods[i] === undefined || Object.keys(mods[i]).length === 0) bad.push(names[i])
}
// Behaviour, not just resolution: a subpath that imports but cannot run is not
// qualified.
import { pipe } from '@stopcock/fp'
import { map, filter } from '@stopcock/fp/array'
import { pipe as compactPipe } from '@stopcock/fp/fusion'
import { pipe as optimizedPipe } from '@stopcock/fp-optimizer'
const steps = [map((x) => x * 2), filter((x) => x > 2)]
const expected = JSON.stringify([4, 6])
for (const [label, run] of [['root', pipe], ['compact', compactPipe], ['optimized', optimizedPipe]]) {
  const got = JSON.stringify(run([1, 2, 3], ...steps))
  if (got !== expected) bad.push(label + ' produced ' + got)
}
console.log(JSON.stringify(bad))
`,
    )
    const probeOutput = execFileSync('node', [probe], { cwd: consumer, encoding: 'utf8' }).trim()
    const bad = JSON.parse(probeOutput) as string[]

    const subpaths: SubpathResult[] = specifiers.map((specifier) => ({
      specifier,
      ok: !bad.includes(specifier),
      error: bad.includes(specifier) ? 'imported empty or undefined' : undefined,
    }))
    for (const entry of bad) failures.push(`packed consumer failure: ${entry}`)

    const fp = packages.find((entry) => entry.name === '@stopcock/fp')
    const fpTarballBytes = fp?.tarballBytes ?? 0
    if (fpTarballBytes >= STABLE_TARBALL_CEILING_BYTES) {
      failures.push(
        `@stopcock/fp tarball is ${fpTarballBytes} B, at or over the ${STABLE_TARBALL_CEILING_BYTES} B stable ceiling`,
      )
    }

    return {
      packages,
      subpaths,
      fpTarballBytes,
      ceilingBytes: STABLE_TARBALL_CEILING_BYTES,
      decision: fpTarballBytes < STABLE_TARBALL_CEILING_BYTES ? 'under-ceiling' : 'over-ceiling',
      failures,
    }
  } finally {
    rmSync(staging, { recursive: true, force: true })
  }
}

const main = (): void => {
  const report = runRequalification()
  for (const entry of report.packages) {
    console.log(`${entry.name}\t${entry.tarballBytes} B tarball\t${entry.sha256}`)
  }
  console.log(`public subpaths\t${report.subpaths.filter((s) => s.ok).length}/${report.subpaths.length} import and run`)
  console.log(
    `@stopcock/fp tarball\t${report.fpTarballBytes} B\tceiling ${report.ceilingBytes} B\t${report.decision}`,
  )
  for (const failure of report.failures) console.error(`FAIL\t${failure}`)
  if (report.failures.length > 0) process.exitCode = 1
}

const invokedPath = process.argv[1] === undefined ? undefined : resolve(process.argv[1])
if (invokedPath === fileURLToPath(import.meta.url)) main()
