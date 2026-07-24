import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PUBLIC_MODULES } from '../module-manifest'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const packagePath = resolve(root, 'package.json')
const packageJson = JSON.parse(readFileSync(packagePath, 'utf8')) as Record<string, unknown>

const exportsMap: Record<string, unknown> = {}
for (const { subpath } of PUBLIC_MODULES) {
  const output = subpath === '.' ? 'index' : subpath.slice(2)
  exportsMap[subpath] = {
    types: `./dist/${output}.d.ts`,
    import: `./dist/${output}.js`,
  }
}
exportsMap['./package.json'] = './package.json'

packageJson.exports = exportsMap
packageJson.engines = { node: '>=22' }
packageJson.files = ['dist', 'README.md', 'CHANGELOG.md', 'LICENSE']
delete packageJson.imports

const output = `${JSON.stringify(packageJson, null, 2)}\n`
const current = readFileSync(packagePath, 'utf8')
const checkOnly = process.argv.includes('--check')

if (current !== output) {
  if (checkOnly) {
    throw new Error('package.json is out of sync with module-manifest.ts')
  }
  writeFileSync(packagePath, output)
}
