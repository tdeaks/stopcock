import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  formatGeneratedProtocolTypeScriptV1,
  generateProtocolViewsV1,
} from './protocol/generate-protocol'

const FP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function run(relativeScript: string): void {
  const result = spawnSync('bun', ['run', relativeScript], {
    cwd: FP_ROOT,
    encoding: 'utf8',
  })
  if (result.stdout) process.stdout.write(result.stdout)
  if (result.stderr) process.stderr.write(result.stderr)
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(`codegen failed: ${relativeScript}`)
  }
}

generateProtocolViewsV1()
run('codegen/dual-inline.ts')
run('scripts/sync-module-manifest.ts')
formatGeneratedProtocolTypeScriptV1()

console.log('canonical codegen complete')
