import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

const repositoryRoot = resolve(import.meta.dirname, '..')
const packagesRoot = join(repositoryRoot, 'packages')
const configName = 'tsconfig.type-tests.json'

const packageDirectories = readdirSync(packagesRoot, {
  withFileTypes: true,
})
  .filter((entry) => entry.isDirectory())
  .map((entry) => join(packagesRoot, entry.name))
  .filter((directory) => existsSync(join(directory, configName)))
  .sort()

if (packageDirectories.length === 0) {
  throw new Error(`No package ${configName} files were found`)
}

for (const directory of packageDirectories) {
  const packageName = directory.slice(packagesRoot.length + 1)
  console.log(`Checking type contracts for ${packageName}`)
  const result = spawnSync('vp', ['exec', 'tsc', '-p', configName], {
    cwd: directory,
    stdio: 'inherit',
  })

  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
}

console.log(`Package type contracts passed for ${packageDirectories.length} packages`)
