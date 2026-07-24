import { readdir, readFile, writeFile } from 'node:fs/promises'
import { extname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const declarationExtension = /\.d\.(?:c|m)?ts$/u

const withJavaScriptExtension = (specifier) => {
  if (!specifier.startsWith('./') && !specifier.startsWith('../')) {
    return specifier
  }

  return extname(specifier) === '' ? `${specifier}.js` : specifier
}

export const rewriteDeclarationSpecifiers = (source) =>
  source
    .replace(
      /(\bfrom\s*["'])(\.\.?\/[^"']+)(["'])/gu,
      (_, prefix, specifier, suffix) => `${prefix}${withJavaScriptExtension(specifier)}${suffix}`,
    )
    .replace(
      /(\bimport\s*(?:\(\s*)?["'])(\.\.?\/[^"']+)(["']\s*\)?)/gu,
      (_, prefix, specifier, suffix) => `${prefix}${withJavaScriptExtension(specifier)}${suffix}`,
    )
    .replace(
      /(\brequire\s*\(\s*["'])(\.\.?\/[^"']+)(["']\s*\))/gu,
      (_, prefix, specifier, suffix) => `${prefix}${withJavaScriptExtension(specifier)}${suffix}`,
    )

const declarationFiles = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await declarationFiles(path)))
    } else if (declarationExtension.test(entry.name)) {
      files.push(path)
    }
  }

  return files
}

export const fixDeclarationSpecifiers = async (directory) => {
  const files = await declarationFiles(directory)
  let changed = 0

  for (const file of files) {
    const source = await readFile(file, 'utf8')
    const rewritten = rewriteDeclarationSpecifiers(source)
    if (rewritten !== source) {
      await writeFile(file, rewritten)
      changed += 1
    }
  }

  return { changed, files: files.length }
}

const invokedPath = process.argv[1]
if (invokedPath !== undefined && pathToFileURL(resolve(invokedPath)).href === import.meta.url) {
  const directory = resolve(process.argv[2] ?? 'dist')
  const result = await fixDeclarationSpecifiers(directory)
  console.log(`Declaration specifiers fixed in ${result.changed}/${result.files} files`)
}
