import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  OPERATOR_MANIFEST_V1_HASH,
  formatGeneratedProtocolTypeScriptV1,
  generateProtocolViewsV1,
  writeOperatorEvidenceIndexV1,
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

generateProtocolViewsV1({ includeEvidence: false })
run('codegen/compact-facts.ts')
run('codegen/dual-inline.ts')
run('codegen/iter-kernels.ts')
run('scripts/sync-module-manifest.ts')
formatGeneratedProtocolTypeScriptV1()
formatGeneratedProtocolTypeScriptV1([
  'packages/fp/src/internal/compact/facts.generated.ts',
  'packages/fp/src/iter-kernels.ts',
])
writeOperatorEvidenceIndexV1()

console.log(`canonical codegen complete: ${OPERATOR_MANIFEST_V1_HASH}`)
