#!/usr/bin/env node

import { runCodemod } from './node'

const HELP = `
stopcock-fp-codemod [options] <file-or-directory...>

Migrate Stopcock FP 1 imports to the FP 2 package surface.

Options:
  --write             Apply reported mechanical transformations.
  --check             Exit non-zero when files need migration.
  --json              Print the machine-readable migration summary.
  --no-root-imports   Skip root-import and match-handler rewrites.
  -h, --help          Show this help.
`.trim()

interface CliOptions {
  readonly paths: readonly string[]
  readonly write: boolean
  readonly check: boolean
  readonly json: boolean
  readonly rewriteRootImports: boolean
  readonly help: boolean
}

const parse = (args: readonly string[]): CliOptions => {
  const paths: string[] = []
  let write = false
  let check = false
  let json = false
  let rewriteRootImports = true
  let help = false

  for (const argument of args) {
    if (argument === '--write') write = true
    else if (argument === '--check') check = true
    else if (argument === '--json') json = true
    else if (argument === '--no-root-imports') rewriteRootImports = false
    else if (argument === '--help' || argument === '-h') help = true
    else if (argument.startsWith('-')) throw new Error(`Unknown option: ${argument}`)
    else paths.push(argument)
  }
  if (write && check) throw new Error('--write and --check are mutually exclusive')
  return { paths, write, check, json, rewriteRootImports, help }
}

export const runCli = async (): Promise<void> => {
  const options = parse(process.argv.slice(2))
  if (options.help) {
    console.log(HELP)
    return
  }
  if (options.paths.length === 0) {
    console.error(HELP)
    process.exitCode = 2
    return
  }

  const summary = await runCodemod(options.paths, {
    write: options.write,
    rewriteRootImports: options.rewriteRootImports,
  })
  if (options.json) {
    console.log(JSON.stringify(summary, null, 2))
  } else {
    for (const file of summary.files) {
      if (!file.changed && file.diagnostics.length === 0) continue
      const action = file.written ? 'updated' : file.changed ? 'would update' : 'review'
      console.log(`${action}: ${file.file}`)
      for (const item of file.diagnostics) {
        console.log(`  ${item.severity} ${item.code}: ${item.message}`)
      }
    }
    console.log(
      `Scanned ${summary.scannedFiles}; changed ${summary.changedFiles}; errors ${summary.errorDiagnostics}.`,
    )
  }

  if (options.check && summary.changedFiles > 0) process.exitCode = 1
  if (summary.errorDiagnostics > 0) process.exitCode = 2
}

runCli().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 2
})
