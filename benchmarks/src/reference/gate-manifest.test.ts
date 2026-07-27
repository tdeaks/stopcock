import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vite-plus/test'
import { GATE_SCRIPTS, GATES, type GateGroup } from './gate-manifest'

const KNOWN_GROUPS: readonly GateGroup[] = Object.freeze([
  'size:engine',
  'size:consumer',
  'parity:compiler',
  'parity:iter',
  'allocation',
  'competitors',
  'hand-loop',
  'quality',
])

const referenceDir = dirname(fileURLToPath(import.meta.url))

/** A gate script is runnable when it invokes its own main. */
const isRunnable = (name: string): boolean => {
  const source = readFileSync(join(referenceDir, name), 'utf8')
  return source.includes('invokedPath === fileURLToPath') || source.includes('import.meta.main')
}

const runnableGateFiles = readdirSync(referenceDir)
  .filter((name) => name.endsWith('-gate.ts'))
  .filter((name) => isRunnable(name))
  .sort()

describe('gate manifest', () => {
  test('every runnable gate script is listed', () => {
    // The failure this prevents: adding a gate, never wiring it to a command,
    // and finding out months later that it stopped measuring.
    expect([...GATE_SCRIPTS].sort()).toEqual(runnableGateFiles)
  })

  test('every listed script exists and is runnable', () => {
    for (const script of GATE_SCRIPTS) {
      expect(runnableGateFiles).toContain(script)
    }
  })

  test('no duplicate entries', () => {
    expect(new Set(GATE_SCRIPTS).size).toBe(GATE_SCRIPTS.length)
  })

  test('every gate says what it checks and whether it needs a quiet machine', () => {
    for (const gate of GATES) {
      expect(gate.checks.length).toBeGreaterThan(0)
      expect(['deterministic', 'timing']).toContain(gate.kind)
    }
  })

  test('every gate is keyed by the invariant it guards, not a ledger stage', () => {
    for (const gate of GATES) {
      expect(KNOWN_GROUPS).toContain(gate.group)
    }
  })
})
