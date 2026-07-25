#!/usr/bin/env node
// `stopcock check` reads receipts and explicitly supplied evidence manifests.
// It never compiles, profiles, or benchmarks user code, and it never imports a
// fusion runtime: the only inputs are JSON artifacts on disk.
import { realpathSync } from 'node:fs'
import { readdir, readFile, stat } from 'node:fs/promises'
import { join, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  canonicalJsonV1,
  collectRecordsV1,
  formatCheckReportTextV1,
  renderCheckReportV1,
  validateExpectationsV1,
  validateProjectPolicyV1,
  type BuiltinPolicyIdV1,
  type CheckExpectationsV1,
  type ProjectPolicyV1,
} from './receipt-report'

export interface CliResult {
  readonly stdout: string
  readonly stderr: string
  readonly exitCode: 0 | 1 | 2
}

const BUILTIN_POLICIES: readonly BuiltinPolicyIdV1[] = [
  'unsupported',
  'stale-evidence',
  'coverage-threshold',
]

const USAGE = `stopcock check — render compiler receipts and check evidence policies

usage: stopcock check [options]

  --receipts <path>      compiler receipt JSON file or directory (repeatable, required)
  --evidence <path>      evidence manifest file or directory (repeatable)
  --expectations <path>  check-expectations envelope used to detect stale hashes
  --policy <id>          ${BUILTIN_POLICIES.join(' | ')} (repeatable)
  --policy-file <path>   project policy document (repeatable)
  --coverage <n>/<d>     required transformed ratio for --policy coverage-threshold
  --json                 deterministic JSON on stdout, prose on stderr
  --help                 print this text

at least one policy is required; a missing policy is never an implicit pass.
exit 0 every requested policy passed, 1 a checked policy failed,
2 invalid arguments, schema, or artifacts.
`

interface Args {
  readonly receipts: string[]
  readonly evidence: string[]
  readonly expectations: string | undefined
  readonly policies: BuiltinPolicyIdV1[]
  readonly policyFiles: string[]
  readonly coverage: { numerator: number; denominator: number } | undefined
  readonly json: boolean
  readonly help: boolean
}

type ArgParse = { ok: true; args: Args } | { ok: false; errors: string[] }

function parseArgs(argv: readonly string[]): ArgParse {
  const errors: string[] = []
  const receipts: string[] = []
  const evidence: string[] = []
  const policies: BuiltinPolicyIdV1[] = []
  const policyFiles: string[] = []
  let expectations: string | undefined
  let coverage: { numerator: number; denominator: number } | undefined
  let json = false
  let help = false

  const [command, ...rest] = argv
  if (command === '--help' || command === '-h') return { ok: true, args: blank(true) }
  if (command === undefined)
    return { ok: false, errors: ['a subcommand is required; expected `check`'] }
  if (command !== 'check')
    return { ok: false, errors: [`unknown subcommand \`${command}\`; expected \`check\``] }

  for (let index = 0; index < rest.length; index += 1) {
    const flag = rest[index]
    const takesValue = [
      '--receipts',
      '--evidence',
      '--expectations',
      '--policy',
      '--policy-file',
      '--coverage',
    ].includes(flag as string)
    const value = takesValue ? rest[index + 1] : undefined
    if (takesValue) {
      if (value === undefined || value.startsWith('--')) {
        errors.push(`${flag} requires a value`)
        continue
      }
      index += 1
    }
    switch (flag) {
      case '--receipts':
        receipts.push(value as string)
        break
      case '--evidence':
        evidence.push(value as string)
        break
      case '--expectations':
        if (expectations !== undefined) errors.push('--expectations may only be given once')
        expectations = value
        break
      case '--policy':
        if (!BUILTIN_POLICIES.includes(value as BuiltinPolicyIdV1)) {
          errors.push(`unknown policy \`${value}\``)
          break
        }
        if (!policies.includes(value as BuiltinPolicyIdV1))
          policies.push(value as BuiltinPolicyIdV1)
        break
      case '--policy-file':
        policyFiles.push(value as string)
        break
      case '--coverage': {
        const match = /^(\d+)\/([1-9]\d*)$/u.exec(value as string)
        if (!match) {
          errors.push('--coverage must be given as <numerator>/<denominator>')
          break
        }
        coverage = { numerator: Number(match[1]), denominator: Number(match[2]) }
        break
      }
      case '--json':
        json = true
        break
      case '--help':
      case '-h':
        help = true
        break
      default:
        errors.push(`unknown option \`${flag}\``)
    }
  }

  if (help) return { ok: true, args: blank(true) }
  if (receipts.length === 0) errors.push('--receipts is required')
  if (policies.length === 0 && policyFiles.length === 0) {
    errors.push('at least one --policy or --policy-file is required')
  }
  if (policies.includes('coverage-threshold') && !coverage) {
    errors.push('--policy coverage-threshold requires --coverage <n>/<d>')
  }
  if (errors.length > 0) return { ok: false, errors }
  return {
    ok: true,
    args: { receipts, evidence, expectations, policies, policyFiles, coverage, json, help: false },
  }
}

const blank = (help: boolean): Args => ({
  receipts: [],
  evidence: [],
  expectations: undefined,
  policies: [],
  policyFiles: [],
  coverage: undefined,
  json: false,
  help,
})

async function expand(path: string): Promise<string[]> {
  const info = await stat(path)
  if (!info.isDirectory()) return [path]
  const entries = await readdir(path, { recursive: true })
  return entries
    .filter((entry) => entry.endsWith('.json'))
    .map((entry) => join(path, entry))
    .sort()
}

/** Paths are only ever reported repo-relative-ish so output never embeds a machine path. */
const label = (path: string): string => {
  const parts = path.split(sep)
  return parts.slice(Math.max(0, parts.length - 2)).join('/')
}

async function loadDocuments(
  paths: readonly string[],
  errors: string[],
): Promise<{ path: string; value: unknown }[]> {
  const documents: { path: string; value: unknown }[] = []
  for (const path of paths) {
    let files: string[]
    try {
      files = await expand(path)
    } catch {
      errors.push(`cannot read ${label(path)}`)
      continue
    }
    for (const file of files) {
      try {
        documents.push({ path: label(file), value: JSON.parse(await readFile(file, 'utf8')) })
      } catch (error) {
        errors.push(`cannot parse ${label(file)}: ${(error as Error).message}`)
      }
    }
  }
  return documents.sort((a, b) => (a.path < b.path ? -1 : 1))
}

export async function runCheck(argv: readonly string[]): Promise<CliResult> {
  const parsed = parseArgs(argv)
  if (!parsed.ok) {
    return {
      stdout: '',
      stderr: `${parsed.errors.map((line) => `error: ${line}`).join('\n')}\n\n${USAGE}`,
      exitCode: 2,
    }
  }
  if (parsed.args.help) return { stdout: USAGE, stderr: '', exitCode: 0 }
  const args = parsed.args

  const errors: string[] = []
  const documents = await loadDocuments([...args.receipts, ...args.evidence], errors)

  let expectations: CheckExpectationsV1 | undefined
  if (args.expectations !== undefined) {
    try {
      const value: unknown = JSON.parse(await readFile(args.expectations, 'utf8'))
      const expectationErrors = validateExpectationsV1(value)
      if (expectationErrors.length > 0) {
        errors.push(
          ...expectationErrors.map((error) => `${label(args.expectations as string)}: ${error}`),
        )
      } else {
        expectations = value as CheckExpectationsV1
      }
    } catch (error) {
      errors.push(`cannot read expectations: ${(error as Error).message}`)
    }
  }

  const projectPolicies: ProjectPolicyV1[] = []
  for (const path of args.policyFiles) {
    try {
      const value: unknown = JSON.parse(await readFile(path, 'utf8'))
      const policyErrors = validateProjectPolicyV1(value)
      if (policyErrors.length > 0) {
        errors.push(...policyErrors.map((error) => `${label(path)}: ${error}`))
      } else {
        projectPolicies.push(value as ProjectPolicyV1)
      }
    } catch (error) {
      errors.push(`cannot read policy ${label(path)}: ${(error as Error).message}`)
    }
  }

  const collected = collectRecordsV1(documents)
  if (!collected.ok) errors.push(...collected.errors)
  else if (collected.records.receipts.length === 0)
    errors.push('no compiler receipts were supplied')
  if (!collected.ok || errors.length > 0) {
    return {
      stdout: '',
      stderr: `${errors.map((line) => `error: ${line}`).join('\n')}\n`,
      exitCode: 2,
    }
  }

  const report = renderCheckReportV1({
    ...collected.records,
    expectations,
    policies: [...args.policies, ...projectPolicies],
    coverage: args.coverage,
  })
  const prose = formatCheckReportTextV1(report)
  const exitCode = report.status === 'passed' ? 0 : 1
  return args.json
    ? { stdout: canonicalJsonV1(report), stderr: prose, exitCode }
    : { stdout: prose, stderr: '', exitCode }
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
