// Records the engine actually executing the bench workers, so generate-report.ts
// can assert the requested lane (bun/node/deno) matches reality instead of trusting
// a free-text CLI label. Runs inside each forked worker process via vitest setupFiles.
import { writeFileSync } from 'node:fs'

const versions = process.versions as NodeJS.ProcessVersions & { bun?: string }
const deno = (globalThis as Record<string, unknown>).Deno as
  | { version?: { deno?: string } }
  | undefined
const bunGlobal = (globalThis as Record<string, unknown>).Bun as { version?: string } | undefined

const runtime = versions.bun ? 'bun' : deno?.version ? 'deno' : versions.node ? 'node' : 'unknown'

const identity = {
  runtime,
  versions: {
    bun: versions.bun ?? bunGlobal?.version,
    node: versions.node,
    deno: deno?.version?.deno,
  },
  execPath: process.execPath,
  recordedAt: new Date().toISOString(),
}

const outFile = process.env.BENCH_IDENTITY_FILE
if (outFile) {
  writeFileSync(outFile, `${JSON.stringify(identity, null, 2)}\n`)
}
