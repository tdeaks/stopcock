import { readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { extname, resolve } from 'node:path'
import { transformSource } from './transform'
import type { MigrationDiagnostic, TransformOptions } from './types'

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs'])

const IGNORED_DIRECTORIES = new Set(['.git', 'coverage', 'dist', 'node_modules'])

export interface RunOptions extends TransformOptions {
  readonly write?: boolean
}

export interface FileMigrationResult {
  readonly file: string
  readonly changed: boolean
  readonly written: boolean
  readonly diagnostics: readonly MigrationDiagnostic[]
}

export interface MigrationSummary {
  readonly files: readonly FileMigrationResult[]
  readonly scannedFiles: number
  readonly changedFiles: number
  readonly writtenFiles: number
  readonly errorDiagnostics: number
}

const discover = async (path: string, output: string[]): Promise<void> => {
  const info = await stat(path)
  if (info.isFile()) {
    if (SOURCE_EXTENSIONS.has(extname(path))) output.push(path)
    return
  }
  if (!info.isDirectory()) return

  for (const entry of await readdir(path, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue
    if (entry.isDirectory() && IGNORED_DIRECTORIES.has(entry.name)) continue
    await discover(resolve(path, entry.name), output)
  }
}

export const discoverSourceFiles = async (paths: readonly string[]): Promise<readonly string[]> => {
  const output: string[] = []
  for (const path of paths) await discover(resolve(path), output)
  return [...new Set(output)].sort()
}

export const runCodemod = async (
  paths: readonly string[],
  options: RunOptions = {},
): Promise<MigrationSummary> => {
  const sourceFiles = await discoverSourceFiles(paths)
  const files: FileMigrationResult[] = []

  for (const file of sourceFiles) {
    const source = await readFile(file, 'utf8')
    const result = transformSource(source, file, options)
    if (result.changed && options.write === true) await writeFile(file, result.code)
    files.push({
      file,
      changed: result.changed,
      written: result.changed && options.write === true,
      diagnostics: result.diagnostics,
    })
  }

  return {
    files,
    scannedFiles: files.length,
    changedFiles: files.filter((file) => file.changed).length,
    writtenFiles: files.filter((file) => file.written).length,
    errorDiagnostics: files.reduce(
      (total, file) => total + file.diagnostics.filter((item) => item.severity === 'error').length,
      0,
    ),
  }
}
