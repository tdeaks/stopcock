#!/usr/bin/env node
// `stopcock check` dry-runs the transform over the project's source files and
// reports which pipeline sites compiled and which bailed. It never writes
// transformed code back to disk.
import { readFileSync, realpathSync } from 'node:fs'
import { readdir } from 'node:fs/promises'
import { join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { transformStopcockPipelines } from './transform'
import type { DiagnosticSite } from './types'

const INCLUDE = /\.(?:[cm]?[jt]s|[jt]sx)$/
const EXCLUDE = /(?:^|[/\\])(?:node_modules|dist)(?:[/\\]|$)/

export interface CliResult {
  readonly stdout: string
  readonly stderr: string
  readonly exitCode: 0 | 1 | 2
}

const USAGE = `stopcock check: dry-run the compiler and report compiled/bailed pipeline sites

usage: stopcock check [--strict] [directory]

  --strict   exit 1 when any site bailed
  --help     print this text
`

async function projectFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { recursive: true })
  return entries
    .map((entry) => join(root, entry))
    .filter((path) => INCLUDE.test(path) && !EXCLUDE.test(path))
}

function row(root: string, file: string, site: DiagnosticSite): string {
  const path = relative(root, file)
  const kind = site.transformed ? 'compiled' : 'bailed'
  const op = (site.opNames ?? []).join(' -> ') || '-'
  const reason = site.transformed ? '' : ` ${site.reason ?? ''}`
  return `${path}:${site.line}:${site.column}  ${kind.padEnd(8)} ${op}${reason}`
}

export async function runCheck(argv: readonly string[]): Promise<CliResult> {
  if (argv[0] === '--help' || argv[0] === '-h') return { stdout: USAGE, stderr: '', exitCode: 0 }
  if (argv[0] !== 'check') {
    return { stdout: '', stderr: `error: expected \`check\`\n\n${USAGE}`, exitCode: 2 }
  }
  const rest = argv.slice(1)
  if (rest.includes('--help')) return { stdout: USAGE, stderr: '', exitCode: 0 }
  const strict = rest.includes('--strict')
  const directory = rest.find((arg) => !arg.startsWith('--'))
  const root = resolve(directory ?? process.cwd())

  const files = await projectFiles(root)
  const rows: string[] = []
  let compiled = 0
  let bailed = 0
  for (const file of files) {
    const code = readFileSync(file, 'utf8')
    const result = transformStopcockPipelines(code, file, { diagnostics: 'verbose' })
    for (const site of result.diagnostics) {
      rows.push(row(root, file, site))
      site.transformed ? compiled++ : bailed++
    }
  }

  const table = rows.length === 0 ? 'no pipeline sites found\n' : `${rows.join('\n')}\n`
  const summary = `${compiled} sites compiled, ${bailed} bailed\n`
  return {
    stdout: `${table}\n${summary}`,
    stderr: '',
    exitCode: strict && bailed > 0 ? 1 : 0,
  }
}

const entryUrl = (): string => {
  const main = process.argv[1]
  if (main === undefined) return ''
  try {
    return pathToFileURL(realpathSync(main)).href
  } catch {
    return ''
  }
}

if (entryUrl() === import.meta.url) {
  const result = await runCheck(process.argv.slice(2))
  if (result.stdout) process.stdout.write(result.stdout)
  if (result.stderr) process.stderr.write(result.stderr)
  process.exit(result.exitCode)
}
