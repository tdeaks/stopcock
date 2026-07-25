import { spawnSync } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  evaluateFpConsumerSizeS3aReport,
  type FpConsumerSizeS3aReport,
} from './fp-consumer-size-s3a-contract'

const benchmarkRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const gatePath = join(benchmarkRoot, 'src', 'reference', 'fp-consumer-size-s3a-gate.ts')
const reportName = 'fp-consumer-size-s3a-gate.json'

async function runGate(artifactDirectory: string): Promise<FpConsumerSizeS3aReport> {
  const result = spawnSync(process.execPath, ['run', gatePath], {
    cwd: benchmarkRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      PERF_ARTIFACT_DIR: artifactDirectory,
      STOPCOCK_S3A_KEEP_WORKDIR: '0',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  if (result.error) throw result.error
  if (result.status !== 0 || result.signal !== null) {
    throw new Error(
      `S3A reproducibility run failed: ${result.stderr.trim() || result.stdout.trim()}`,
    )
  }
  const report = JSON.parse(
    await readFile(join(artifactDirectory, reportName), 'utf8'),
  ) as FpConsumerSizeS3aReport
  evaluateFpConsumerSizeS3aReport(report)
  return report
}

const scratch = await mkdtemp(join(tmpdir(), 'stopcock-fp-s3a-repro-'))
try {
  const first = await runGate(join(scratch, 'run-1'))
  const second = await runGate(join(scratch, 'run-2'))
  if (first.sourceCommit !== second.sourceCommit) {
    throw new Error(
      `S3A source commit changed between runs: ${first.sourceCommit} != ${second.sourceCommit}`,
    )
  }
  if (first.evidenceSha256 !== second.evidenceSha256) {
    throw new Error(
      `S3A evidence is not reproducible: ${first.evidenceSha256} != ${second.evidenceSha256}`,
    )
  }
  console.log(`S3A evidence reproducible across two fresh runs: ${first.evidenceSha256}`)
} finally {
  await rm(scratch, { recursive: true, force: true })
}
