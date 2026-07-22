import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test'
import { execFileSync } from 'node:child_process'
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { checkPortableBoundary } from '../../scripts/check-portable-boundary'
import {
  compileJit,
  JitUnavailableError,
  __resetJitModuleCache,
  __getJitRunnerState,
} from '../compile'
import { __setProbeOverride } from '../jit-chunk'
import * as A from '../array'

const SRC_ROOT = join(import.meta.dirname, '..')

describe('portable module graph (static CI scan)', () => {
  it('the portable graph never reaches jit-chunk.ts, and the default graph reaches it only via dynamic import', () => {
    const report = checkPortableBoundary()
    expect(report.errors).toEqual([])
    expect(report.ok).toBe(true)
  })
})

describe('STOPCOCK_PORTABLE_ONLY env pin (subprocess: read once at module init)', () => {
  let scriptPath: string
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'stopcock-portable-env-'))
    scriptPath = join(dir, 'run.ts')
    writeFileSync(
      scriptPath,
      `
      import { pipe, explainSteps } from ${JSON.stringify(join(SRC_ROOT, 'index.ts'))}
      import * as A from ${JSON.stringify(join(SRC_ROOT, 'array.ts'))}

      const add1 = (x: number) => x + 1
      const positive = (x: number) => x > 0
      const nums = Array.from({ length: 32 }, (_, i) => i - 16)

      for (let i = 0; i < 20; i++) {
        pipe(nums, A.map(add1), A.filter(positive))
      }

      // Promotion settles once the dynamic chunk import resolves, which
      // needs the stack to yield past the synchronous hot loop above.
      await new Promise((r) => setTimeout(r, 50))
      // one more call so a just-promoted entry actually dispatches tier 1
      pipe(nums, A.map(add1), A.filter(positive))

      const info = explainSteps(A.map(add1), A.filter(positive))
      console.log(JSON.stringify(info))
      `,
    )
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('pins the shared entry at tier 0 with disabledReasons including portable-env, even past the promotion threshold', () => {
    const out = execFileSync('bun', ['run', scriptPath], {
      env: { ...process.env, STOPCOCK_PORTABLE_ONLY: '1' },
      encoding: 'utf8',
    })
    const info = JSON.parse(out.trim().split('\n').pop() as string)
    expect(info.tier).toBe(0)
    expect(info.disabledReasons).toContain('portable-env')
  })

  it('without the pin, the same hot pipeline promotes past tier 0', () => {
    const out = execFileSync('bun', ['run', scriptPath], {
      env: { ...process.env, STOPCOCK_PORTABLE_ONLY: '' },
      encoding: 'utf8',
    })
    const info = JSON.parse(out.trim().split('\n').pop() as string)
    expect(info.tier).toBeGreaterThanOrEqual(1)
    expect(info.disabledReasons).not.toContain('portable-env')
  })
})

describe('compileJit under the portable-env pin', () => {
  const dir2 = mkdtempSync(join(tmpdir(), 'stopcock-portable-env-jit-'))
  const scriptPath = join(dir2, 'run.ts')
  writeFileSync(
    scriptPath,
    `
    import { compileJit, JitUnavailableError } from ${JSON.stringify(join(SRC_ROOT, 'index.ts'))}
    import * as A from ${JSON.stringify(join(SRC_ROOT, 'array.ts'))}

    async function main() {
      const add1 = (x: number) => x + 1
      const positive = (x: number) => x > 0
      let threw = false
      try {
        await compileJit(A.map(add1), A.filter(positive))
      } catch (err) {
        threw = err instanceof JitUnavailableError
      }

      const fallback = await compileJit(
        { onUnavailable: 'fallback' },
        A.map(add1),
        A.filter(positive),
      )
      const result = fallback([1, -2, 3])

      console.log(JSON.stringify({ threw, result }))
    }

    main()
    `,
  )

  afterEach(() => {
    rmSync(dir2, { recursive: true, force: true })
  })

  it("rejects with JitUnavailableError under the default ('throw') contract, and falls back to a working portable runner under 'fallback'", () => {
    const out = execFileSync('bun', ['run', scriptPath], {
      env: { ...process.env, STOPCOCK_PORTABLE_ONLY: '1' },
      encoding: 'utf8',
    })
    const info = JSON.parse(out.trim().split('\n').pop() as string)
    expect(info.threw).toBe(true)
    expect(info.result).toEqual([2, 4])
  })
})

describe('compileJit contract unaffected outside the pin (regression guard)', () => {
  beforeEach(() => {
    __resetJitModuleCache()
    __setProbeOverride(undefined)
  })

  afterEach(() => {
    __setProbeOverride(undefined)
  })

  it('still promotes to tier 1 by call one when dynamic code is available', async () => {
    const runner = await compileJit(
      A.map((x: number) => x * 2),
      A.filter((x: number) => x > 0),
    )
    expect(runner([1, -2, 3])).toEqual([2, 6])
    const state = __getJitRunnerState(runner)
    expect(state?.promoted).toBe(true)
  })

  it('still rejects with JitUnavailableError when CSP blocks the probe', async () => {
    __setProbeOverride(false)
    await expect(
      compileJit(A.map((x: number) => x), A.filter((x: number) => x > 0)),
    ).rejects.toThrow(JitUnavailableError)
  })
})
