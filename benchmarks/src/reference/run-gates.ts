/**
 * Runs every gate in the manifest and reports which ones failed.
 *
 * The gates are the only thing standing between a refactor and a silent
 * regression, and until now nothing executed them together. Use
 * `--deterministic` on a busy machine: the timing gates need a quiet one and
 * will report noise as failure otherwise, which is correct behaviour but not
 * useful mid-session.
 */
import { spawnSync } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { GATES, type GateEntry } from './gate-manifest'

const referenceDir = dirname(fileURLToPath(import.meta.url))

export interface GateOutcome {
  readonly script: string
  readonly kind: GateEntry['kind']
  readonly group: GateEntry['group']
  readonly status: number | null
  readonly passed: boolean
  readonly failureLines: readonly string[]
  readonly durationMs: number
}

const runGate = (gate: GateEntry, runtime: string): GateOutcome => {
  const started = Date.now()
  const argv =
    runtime === 'node'
      ? ['--expose-gc', '--import=tsx', join(referenceDir, gate.script)]
      : [join(referenceDir, gate.script)]
  const child = spawnSync(runtime === 'node' ? process.execPath : 'bun', argv, {
    encoding: 'utf8',
    cwd: resolve(referenceDir, '..', '..'),
  })
  const output = `${child.stdout ?? ''}\n${child.stderr ?? ''}`
  const matchedLines = output
    .split('\n')
    .filter((line) => line.startsWith('FAIL') || line.includes('Error:'))
    .slice(0, 5)
  // A failed gate whose output matched nothing was previously reported as a
  // bare FAIL with no detail -- an 11ms silent crash on 2026-08-24 (cause
  // never identified; suspected toolchain binary swap mid-run) was
  // undiagnosable for exactly this reason. Surface the spawn error, signal,
  // exit status, and the output tail so the next one names itself.
  const failureLines =
    child.status === 0 || matchedLines.length > 0
      ? matchedLines
      : [
          child.error !== undefined
            ? `spawn failed: ${child.error.message}`
            : `exited status=${child.status} signal=${child.signal ?? 'none'} with no FAIL/Error line`,
          ...output.split('\n').filter((line) => line.trim().length > 0).slice(-4),
        ].slice(0, 5)
  return {
    script: gate.script,
    kind: gate.kind,
    group: gate.group,
    status: child.status,
    // A gate that crashes fails even if it printed no FAIL line.
    passed: child.status === 0,
    failureLines,
    durationMs: Date.now() - started,
  }
}

const main = (): void => {
  const deterministicOnly = process.argv.includes('--deterministic')
  const runtime = process.argv.includes('--node') ? 'node' : 'bun'
  const selected = GATES.filter((gate) => !deterministicOnly || gate.kind === 'deterministic')

  const outcomes: GateOutcome[] = []
  for (const gate of selected) {
    const outcome = runGate(gate, runtime)
    outcomes.push(outcome)
    const mark = outcome.passed ? 'ok  ' : 'FAIL'
    console.log(
      `${mark}\t${outcome.script}\t${outcome.group}\t${outcome.kind}\t${outcome.durationMs} ms`,
    )
    for (const line of outcome.failureLines) console.log(`      ${line}`)
  }

  const failed = outcomes.filter((outcome) => !outcome.passed)
  console.log(`\n${outcomes.length - failed.length}/${outcomes.length} gates passed on ${runtime}`)
  if (failed.length > 0) {
    console.error(`failing gates: ${failed.map((outcome) => outcome.script).join(', ')}`)
    process.exitCode = 1
  }
}

const invokedPath = process.argv[1] === undefined ? undefined : resolve(process.argv[1])
if (invokedPath === fileURLToPath(import.meta.url)) main()
