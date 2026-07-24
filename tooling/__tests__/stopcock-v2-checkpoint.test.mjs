import { spawnSync } from 'node:child_process'
import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import assert from 'node:assert/strict'

const helperSource = fileURLToPath(new URL('../apply-stopcock-v2-checkpoint.mjs', import.meta.url))
const policySource = fileURLToPath(
  new URL('../../.codex/policies/stopcock-v2-stage-scopes.json', import.meta.url),
)

function run(command, argumentsValue, cwd, { allowFailure = false } = {}) {
  const result = spawnSync(command, argumentsValue, {
    cwd,
    encoding: 'utf8',
  })
  if (result.error) throw result.error
  if (!allowFailure && result.status !== 0) {
    throw new Error(`${command} ${argumentsValue.join(' ')} failed:\n${result.stderr}`)
  }
  return result
}

function write(path, contents) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, contents)
}

function stageTable(status = 'IN_PROGRESS') {
  const policy = JSON.parse(readFileSync(policySource, 'utf8'))
  return Object.keys(policy.dependencies)
    .map((stage) => `| ${stage} | ${stage === 'S0' ? status : 'NOT_STARTED'} | — |`)
    .join('\n')
}

function ledger(stageStatus = 'IN_PROGRESS') {
  return `# Stopcock 2.0 execution ledger

Execution authorization: AUTHORIZED
External mutation authorization: NONE
External authorized action: NONE
External authorized artifact: NONE
Programme status: ${stageStatus === 'CHECKPOINT_PENDING' ? 'CHECKPOINT_PENDING' : 'IN_PROGRESS'}
Base release ref: BASE_REF
Execution branch: codex/test
Execution worktree: WORKTREE
Current canonical stage: S0
Current slice: ${stageStatus === 'CHECKPOINT_PENDING' ? 'CHECKPOINT_PENDING' : 'PACKAGE_COHORT_READINESS'}
Last verified commit: ${stageStatus === 'CHECKPOINT_PENDING' ? 'CHECKPOINT_PENDING' : 'BASE_REF'}
Last controller run: 2026-07-24

## Start gate

- [x] Synthetic gate is complete.

## Canonical stage status

| Stage | Status | Verified commit or evidence |
| --- | --- | --- |
${stageTable(stageStatus)}

## Progress

- [x] Synthetic baseline created.
${stageStatus === 'CHECKPOINT_PENDING' ? '- [x] Synthetic slice validated.' : '- [ ] Run a synthetic slice.'}

## Evidence log

- Baseline evidence.
${stageStatus === 'CHECKPOINT_PENDING' ? '- Slice evidence.' : ''}

## Surprises and discoveries

- Baseline discovery.

## Decision log

- Baseline decision.

## Current blockers

None.

## Exact next action

Continue the synthetic stage.

## Outcomes and retrospective

Synthetic fixture.
`
}

function createRepository(t) {
  const root = mkdtempSync(join(tmpdir(), 'stopcock-v2-checkpoint-test-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  run('git', ['init', '-b', 'codex/test'], root)
  run('git', ['config', 'user.name', 'Stopcock Test'], root)
  run('git', ['config', 'user.email', 'stopcock-test@example.invalid'], root)

  write(join(root, '.gitignore'), '.env\nnode_modules/\ndist/\n')
  write(
    join(root, 'packages/fp/package.json'),
    `${JSON.stringify({ name: '@stopcock/fp', version: '1.0.0', type: 'module' }, null, 2)}\n`,
  )
  write(
    join(root, 'packages/synth/package.json'),
    `${JSON.stringify(
      { name: '@stopcock/synth', version: '1.0.0', private: true, type: 'module' },
      null,
      2,
    )}\n`,
  )
  write(join(root, 'tooling/apply-stopcock-v2-checkpoint.mjs'), readFileSync(helperSource))
  chmodSync(join(root, 'tooling/apply-stopcock-v2-checkpoint.mjs'), 0o755)
  write(join(root, '.codex/policies/stopcock-v2-stage-scopes.json'), readFileSync(policySource))
  write(
    join(root, 'docs/superpowers/contracts/stopcock-v2-dynamic-scopes.json'),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        stages: {
          S0R: [
            {
              id: 'fp-readiness',
              allowedPatterns: [
                'packages/fp/package.json',
                'tooling/fp-readiness.mjs',
                'docs/superpowers/contracts/fp-readiness.json',
              ],
            },
            {
              id: 'no-op',
              allowedPatterns: ['docs/superpowers/contracts/s0r-no-op.json'],
            },
          ],
          P3B: [
            {
              id: 'array-cardinality',
              allowedPatterns: [
                'packages/fp/src/array.ts',
                'packages/fp/src/internal/**/*cardinality*',
                'packages/fp/src/__tests__/p3b-array-*',
                'benchmarks/**/*allocation*',
                'packages/fp/README.md',
              ],
            },
          ],
          P4: [
            {
              id: 'object-family',
              allowedPatterns: [
                'packages/fp/src/object.ts',
                'packages/fp/codegen/**/*object*',
                'packages/fp/src/__tests__/p4-object-*',
                'benchmarks/**/*object*',
                'packages/fp/README.md',
              ],
            },
          ],
        },
      },
      null,
      2,
    )}\n`,
  )
  run('git', ['add', '--all'], root)
  run('git', ['commit', '-m', 'frozen base'], root)

  const base = run('git', ['rev-parse', 'HEAD'], root).stdout.trim()
  const ledgerPath = join(root, 'STOPCOCK_V2_PROGRESS.md')
  writeFileSync(
    ledgerPath,
    ledger()
      .replaceAll('BASE_REF', base)
      .replace('Execution worktree: WORKTREE', `Execution worktree: ${root}`),
  )
  run('git', ['add', 'STOPCOCK_V2_PROGRESS.md'], root)
  run('git', ['commit', '-m', 'controller baseline'], root)

  const startHead = run('git', ['rev-parse', 'HEAD'], root).stdout.trim()
  const pendingLedger = ledger('CHECKPOINT_PENDING')
    .replaceAll('BASE_REF', base)
    .replace('Execution worktree: WORKTREE', `Execution worktree: ${root}`)
  writeFileSync(ledgerPath, pendingLedger)
  return { root, startHead }
}

function activateStage(
  root,
  activeStage,
  { externalAction = 'NONE', externalArtifact = 'NONE', externalAuthorization = 'NONE' } = {},
) {
  run(
    'git',
    ['restore', '--source=HEAD', '--staged', '--worktree', '--', 'STOPCOCK_V2_PROGRESS.md'],
    root,
  )
  const policy = JSON.parse(readFileSync(policySource, 'utf8'))
  const ancestors = new Set()
  function visit(stage) {
    for (const dependency of policy.dependencies[stage]) {
      if (!ancestors.has(dependency)) {
        ancestors.add(dependency)
        visit(dependency)
      }
    }
  }
  visit(activeStage)

  const ledgerPath = join(root, 'STOPCOCK_V2_PROGRESS.md')
  let baseline = readFileSync(ledgerPath, 'utf8')
    .replace(/^Current canonical stage: .*$/mu, `Current canonical stage: ${activeStage}`)
    .replace(/^Current slice: .*$/mu, `Current slice: SYNTHETIC_${activeStage}_SLICE`)
    .replace(
      /^External mutation authorization: .*$/mu,
      `External mutation authorization: ${externalAuthorization}`,
    )
    .replace(/^External authorized action: .*$/mu, `External authorized action: ${externalAction}`)
    .replace(
      /^External authorized artifact: .*$/mu,
      `External authorized artifact: ${externalArtifact}`,
    )
  for (const stage of Object.keys(policy.dependencies)) {
    const status =
      stage === activeStage ? 'IN_PROGRESS' : ancestors.has(stage) ? 'GATE_PASSED' : 'NOT_STARTED'
    baseline = baseline.replace(
      new RegExp(`^(\\|\\s*${stage}\\s*\\|\\s*)[A-Z_]+(\\s*\\|)`, 'mu'),
      `$1${status}$2`,
    )
  }
  writeFileSync(ledgerPath, baseline)
  run('git', ['add', 'STOPCOCK_V2_PROGRESS.md'], root)
  run('git', ['commit', '-m', `activate ${activeStage}`], root)

  const startHead = run('git', ['rev-parse', 'HEAD'], root).stdout.trim()
  const pending = baseline
    .replace('Programme status: IN_PROGRESS', 'Programme status: CHECKPOINT_PENDING')
    .replace(/^Current slice: .*$/mu, 'Current slice: CHECKPOINT_PENDING')
    .replace(/^Last verified commit: .*$/mu, 'Last verified commit: CHECKPOINT_PENDING')
    .replace(
      new RegExp(`^(\\|\\s*${activeStage}\\s*\\|\\s*)IN_PROGRESS(\\s*\\|)`, 'mu'),
      '$1CHECKPOINT_PENDING$2',
    )
  writeFileSync(ledgerPath, pending)
  return startHead
}

function describe(root) {
  const result = run('node', ['tooling/apply-stopcock-v2-checkpoint.mjs', '--describe-dirty'], root)
  return JSON.parse(result.stdout)
}

function writeResult(root, startHead, description) {
  const resultPath = join(root, '.git/stopcock-v2-controller-result.json')
  writeFileSync(
    resultPath,
    JSON.stringify({
      version: 1,
      outcome: 'checkpoint_ready',
      summary: 'Synthetic S0 slice is ready.',
      checkpoint: {
        expectedHead: startHead,
        message: 'test(v2): checkpoint literal paths',
        stage: 'S0',
        scope: 'S0',
        scopeTarget: '',
        nextStage: 'S0',
        nextSlice: 'PACKAGE_COHORT_READINESS',
        postProgrammeStatus: 'IN_PROGRESS',
        postStageStatus: 'IN_PROGRESS',
        contentDigest: description.contentDigest,
        paths: description.paths,
      },
    }),
  )
  return resultPath
}

function runCheckpoint(
  root,
  startHead,
  resultPath,
  { recover = false, allowFailure = false } = {},
) {
  return run(
    'node',
    [
      'tooling/apply-stopcock-v2-checkpoint.mjs',
      recover ? '--recover-result' : '--result',
      resultPath,
      ...(recover ? [] : ['--start-head', startHead]),
      '--start-branch',
      'codex/test',
    ],
    root,
    { allowFailure },
  )
}

function updateResult(resultPath, update) {
  const value = JSON.parse(readFileSync(resultPath, 'utf8'))
  update(value)
  writeFileSync(resultPath, JSON.stringify(value))
}

test('commits one digest-bound scoped slice and a separate ledger finalization', (t) => {
  const { root, startHead } = createRepository(t)
  const literalPath = 'docs/superpowers/contracts/literal:[*]?.md'
  write(join(root, literalPath), 'validated bytes\n')

  const hook = join(root, '.git/hooks/pre-commit')
  write(hook, '#!/usr/bin/env sh\nexit 99\n')
  chmodSync(hook, 0o755)

  const description = describe(root)
  const expectedPaths = ['STOPCOCK_V2_PROGRESS.md', literalPath].sort((left, right) =>
    left.localeCompare(right, 'en'),
  )
  assert.deepEqual(description.paths, expectedPaths)
  const resultPath = writeResult(root, startHead, description)
  const applied = run(
    'node',
    [
      'tooling/apply-stopcock-v2-checkpoint.mjs',
      '--result',
      resultPath,
      '--start-head',
      startHead,
      '--start-branch',
      'codex/test',
    ],
    root,
  )

  assert.equal(applied.stdout.trim(), 'CONTINUE')
  assert.equal(run('git', ['status', '--porcelain'], root).stdout, '')
  assert.equal(run('git', ['rev-list', '--count', 'HEAD'], root).stdout.trim(), '4')

  const sliceCommit = run('git', ['rev-parse', 'HEAD^'], root).stdout.trim()
  const slicePaths = run(
    'git',
    ['diff-tree', '--no-commit-id', '--name-only', '-r', sliceCommit],
    root,
  )
    .stdout.trim()
    .split('\n')
    .sort((left, right) => left.localeCompare(right, 'en'))
  assert.deepEqual(slicePaths, expectedPaths)

  const finalizedLedger = readFileSync(join(root, 'STOPCOCK_V2_PROGRESS.md'), 'utf8')
  assert.match(finalizedLedger, /^Programme status: IN_PROGRESS$/mu)
  assert.match(finalizedLedger, /^Current canonical stage: S0$/mu)
  assert.match(finalizedLedger, /^Current slice: PACKAGE_COHORT_READINESS$/mu)
  assert.match(finalizedLedger, new RegExp(`^Last verified commit: ${sliceCommit}$`, 'mu'))
  assert.match(finalizedLedger, /^\| S0 \| IN_PROGRESS \|/mu)
})

test('rejects byte drift after the controller computes its digest', (t) => {
  const { root, startHead } = createRepository(t)
  const slicePath = 'docs/superpowers/contracts/drift.md'
  write(join(root, slicePath), 'validated bytes\n')
  const description = describe(root)
  const resultPath = writeResult(root, startHead, description)
  write(join(root, slicePath), 'different bytes\n')

  const applied = run(
    'node',
    [
      'tooling/apply-stopcock-v2-checkpoint.mjs',
      '--result',
      resultPath,
      '--start-head',
      startHead,
      '--start-branch',
      'codex/test',
    ],
    root,
    { allowFailure: true },
  )

  assert.notEqual(applied.status, 0)
  assert.match(applied.stderr, /checkpoint content changed after validation/u)
  assert.equal(run('git', ['rev-parse', 'HEAD'], root).stdout.trim(), startHead)
  assert.equal(run('git', ['diff', '--cached', '--name-only'], root).stdout, '')
})

test('refuses instruction-plane paths before a digest can be issued', (t) => {
  const { root } = createRepository(t)
  write(join(root, 'nested/AGENTS.override.md'), 'hostile override\n')
  const described = run(
    'node',
    ['tooling/apply-stopcock-v2-checkpoint.mjs', '--describe-dirty'],
    root,
    { allowFailure: true },
  )

  assert.notEqual(described.status, 0)
  assert.match(described.stderr, /protected instructions or metadata/u)
})

test('rejects production runtime changes outside the active S0 scope', (t) => {
  const { root, startHead } = createRepository(t)
  write(join(root, 'packages/fp/src/array.ts'), 'export const changedAtTheWrongStage = true\n')
  const description = describe(root)
  const resultPath = writeResult(root, startHead, description)
  const applied = run(
    'node',
    [
      'tooling/apply-stopcock-v2-checkpoint.mjs',
      '--result',
      resultPath,
      '--start-head',
      startHead,
      '--start-branch',
      'codex/test',
    ],
    root,
    { allowFailure: true },
  )

  assert.notEqual(applied.status, 0)
  assert.match(applied.stderr, /paths exceed canonical S0 scope/u)
  assert.equal(run('git', ['rev-parse', 'HEAD'], root).stdout.trim(), startHead)
})

test('rejects rewritten ledger evidence history', (t) => {
  const { root, startHead } = createRepository(t)
  const ledgerPath = join(root, 'STOPCOCK_V2_PROGRESS.md')
  writeFileSync(
    ledgerPath,
    readFileSync(ledgerPath, 'utf8').replace('- Baseline evidence.', '- Rewritten evidence.'),
  )
  const description = describe(root)
  const resultPath = writeResult(root, startHead, description)
  const applied = run(
    'node',
    [
      'tooling/apply-stopcock-v2-checkpoint.mjs',
      '--result',
      resultPath,
      '--start-head',
      startHead,
      '--start-branch',
      'codex/test',
    ],
    root,
    { allowFailure: true },
  )

  assert.notEqual(applied.status, 0)
  assert.match(applied.stderr, /Evidence log history must be append-only/u)
  assert.equal(run('git', ['rev-parse', 'HEAD'], root).stdout.trim(), startHead)
})

test('recovers an exact staged checkpoint and finalizes its ledger', (t) => {
  const { root, startHead } = createRepository(t)
  write(join(root, 'docs/superpowers/contracts/staged-recovery.md'), 'staged recovery\n')
  const description = describe(root)
  const resultPath = writeResult(root, startHead, description)
  run('git', ['add', '--all'], root)

  const recovered = runCheckpoint(root, startHead, resultPath, { recover: true })

  assert.equal(recovered.stdout.trim(), 'CONTINUE')
  assert.equal(run('git', ['status', '--porcelain'], root).stdout, '')
  assert.equal(run('git', ['rev-list', '--count', 'HEAD'], root).stdout.trim(), '4')
})

test('recovers after the slice commit but before ledger finalization', (t) => {
  const { root, startHead } = createRepository(t)
  write(join(root, 'docs/superpowers/contracts/slice-recovery.md'), 'slice recovery\n')
  const description = describe(root)
  const resultPath = writeResult(root, startHead, description)
  run('git', ['add', '--all'], root)
  run(
    'git',
    [
      '-c',
      'core.hooksPath=/dev/null',
      '-c',
      'commit.gpgsign=false',
      'commit',
      '-m',
      'test(v2): checkpoint literal paths',
    ],
    root,
  )

  const recovered = runCheckpoint(root, startHead, resultPath, { recover: true })

  assert.equal(recovered.stdout.trim(), 'CONTINUE')
  assert.equal(run('git', ['status', '--porcelain'], root).stdout, '')
  assert.equal(run('git', ['rev-list', '--count', 'HEAD'], root).stdout.trim(), '4')
})

test('recovers an exactly staged deterministic ledger finalization', (t) => {
  const { root, startHead } = createRepository(t)
  write(join(root, 'docs/superpowers/contracts/ledger-recovery.md'), 'ledger recovery\n')
  const description = describe(root)
  const resultPath = writeResult(root, startHead, description)
  run('git', ['add', '--all'], root)
  run(
    'git',
    [
      '-c',
      'core.hooksPath=/dev/null',
      '-c',
      'commit.gpgsign=false',
      'commit',
      '-m',
      'test(v2): checkpoint literal paths',
    ],
    root,
  )
  const sliceCommit = run('git', ['rev-parse', 'HEAD'], root).stdout.trim()
  const ledgerPath = join(root, 'STOPCOCK_V2_PROGRESS.md')
  const finalized = readFileSync(ledgerPath, 'utf8')
    .replace('Programme status: CHECKPOINT_PENDING', 'Programme status: IN_PROGRESS')
    .replace('Last verified commit: CHECKPOINT_PENDING', `Last verified commit: ${sliceCommit}`)
    .replace('Current slice: CHECKPOINT_PENDING', 'Current slice: PACKAGE_COHORT_READINESS')
    .replace('| S0 | CHECKPOINT_PENDING |', '| S0 | IN_PROGRESS |')
  writeFileSync(ledgerPath, finalized)
  run('git', ['add', 'STOPCOCK_V2_PROGRESS.md'], root)

  const recovered = runCheckpoint(root, startHead, resultPath, { recover: true })

  assert.equal(recovered.stdout.trim(), 'CONTINUE')
  assert.equal(run('git', ['status', '--porcelain'], root).stdout, '')
  assert.equal(run('git', ['rev-list', '--count', 'HEAD'], root).stdout.trim(), '4')
})

test('replays an already-complete two-commit checkpoint without another commit', (t) => {
  const { root, startHead } = createRepository(t)
  write(join(root, 'docs/superpowers/contracts/replayed-recovery.md'), 'replayed recovery\n')
  const description = describe(root)
  const resultPath = writeResult(root, startHead, description)
  runCheckpoint(root, startHead, resultPath)
  const completedHead = run('git', ['rev-parse', 'HEAD'], root).stdout.trim()

  const recovered = runCheckpoint(root, startHead, resultPath, { recover: true })

  assert.equal(recovered.stdout.trim(), 'CONTINUE')
  assert.equal(run('git', ['rev-parse', 'HEAD'], root).stdout.trim(), completedHead)
  assert.equal(run('git', ['status', '--porcelain'], root).stdout, '')
})

test('records a blocker as a durable ledger-only checkpoint', (t) => {
  const { root, startHead } = createRepository(t)
  const description = describe(root)
  const resultPath = writeResult(root, startHead, description)
  updateResult(resultPath, (value) => {
    value.summary = 'Synthetic blocker is durable.'
    value.checkpoint.message = 'chore(v2): record synthetic blocker'
    value.checkpoint.nextSlice = 'WAIT_FOR_SYNTHETIC_AUTHORITY'
    value.checkpoint.postProgrammeStatus = 'BLOCKED'
    value.checkpoint.postStageStatus = 'BLOCKED'
  })

  const applied = runCheckpoint(root, startHead, resultPath)
  const finalizedLedger = readFileSync(join(root, 'STOPCOCK_V2_PROGRESS.md'), 'utf8')

  assert.equal(applied.stdout.trim(), 'BLOCKED')
  assert.match(finalizedLedger, /^Programme status: BLOCKED$/mu)
  assert.match(finalizedLedger, /^\| S0 \| BLOCKED \|/mu)
  assert.equal(run('git', ['status', '--porcelain'], root).stdout, '')
})

test('a trusted committed helper rejects replacement of the worktree helper', (t) => {
  const { root, startHead } = createRepository(t)
  write(join(root, 'docs/superpowers/contracts/trusted-helper.md'), 'trusted helper\n')
  const description = describe(root)
  const resultPath = writeResult(root, startHead, description)
  const trustedHelper = join(root, '.git/trusted-checkpoint-helper.mjs')
  copyFileSync(join(root, 'tooling/apply-stopcock-v2-checkpoint.mjs'), trustedHelper)
  write(
    join(root, 'tooling/apply-stopcock-v2-checkpoint.mjs'),
    "import { writeFileSync } from 'node:fs'; writeFileSync('untrusted-helper-ran', 'yes');\n",
  )

  const applied = run(
    'node',
    [
      trustedHelper,
      '--result',
      resultPath,
      '--start-head',
      startHead,
      '--start-branch',
      'codex/test',
    ],
    root,
    { allowFailure: true },
  )

  assert.notEqual(applied.status, 0)
  assert.match(applied.stderr, /checkpoint dirty set mismatch/u)
  assert.equal(run('git', ['rev-parse', 'HEAD'], root).stdout.trim(), startHead)
  assert.equal(
    run('git', ['status', '--porcelain'], root).stdout.includes('untrusted-helper-ran'),
    false,
  )
})

test('rejects unexpected ignored source state', (t) => {
  const { root } = createRepository(t)
  write(join(root, '.env'), 'DO_NOT_ACCEPT=1\n')

  const checked = run(
    'node',
    ['tooling/apply-stopcock-v2-checkpoint.mjs', '--check-workspace'],
    root,
    { allowFailure: true },
  )

  assert.notEqual(checked.status, 0)
  assert.match(checked.stderr, /unexpected ignored workspace state/u)
})

test('accepts one positive path and rejects an unrelated path for every static scope', (t) => {
  const { root, startHead } = createRepository(t)
  const positives = [
    ['S0', 'S0', 'docs/superpowers/contracts/s0.json'],
    ['S0B', 'S0B', 'tooling/v2-cohort.mjs'],
    ['S1A', 'S1A', 'benchmarks/src/reference/fp-package-size-gate.ts'],
    ['S1B', 'S1B', 'benchmarks/PERF_PROFILE.md'],
    ['S1C', 'S1C', 'benchmarks/src/reference/perf-runner.ts'],
    ['S2', 'S2', 'packages/fp/codegen/parse.ts'],
    ['S3A', 'S3A', 'packages/fp/src/option.ts'],
    ['S3B', 'S3B', 'packages/fp/src/dual-internal.ts'],
    ['S4', 'S4', 'benchmarks/src/reference/array-dispatch-baseline.ts'],
    ['S5A', 'S5A', 'packages/fp/src/registry.ts'],
    ['S5B', 'S5B', 'packages/fp/codegen/defs/array.ts'],
    ['S6', 'S6', 'packages/fp/module-manifest.ts'],
    ['S7', 'S7', 'packages/fp-compiler/src/transform.ts'],
    ['S8', 'S8', 'packages/fp-compiler/src/transform.ts'],
    ['S9', 'S9', 'packages/fp/src/fusion/compact/index.ts'],
    ['S10', 'S10', 'packages/fp/codegen/portable-templates.ts'],
    ['S10X', 'S10X_EXTRACT', 'packages/fp-optimizer/src/index.ts'],
    ['S10X', 'S10X_STOP', 'packages/fp/src/fusion/optimized/selected-manifest.ts'],
    ['S10J', 'S10J', 'artifacts/v2/optimizer-topology-decision.json'],
    ['S11', 'S11', 'packages/fp-compiler/src/transform.ts'],
    ['P1A', 'P1A', 'packages/fp/src/iter.ts'],
    ['P1B', 'P1B', 'packages/fp/src/internal/iter/typed-array.ts'],
    ['P2', 'P2', 'packages/fp/src/typed-array.ts'],
    ['P3A', 'P3A', 'benchmarks/src/reference/allocation-perf-worker.ts'],
    ['DISP', 'DISP', 'artifacts/v2/optional-disposition.json'],
    ['S12P', 'S12P', 'artifacts/v2/prototype-requalification.json'],
    ['S12', 'S12', 'tooling/pack.config.ts'],
    ['S13', 'S13', '.github/workflows/publish.yml'],
    ['S14', 'S14', 'tooling/v2-accept-cohort.mjs'],
  ]

  for (const [stage, scope, positive] of positives) {
    const accepted = run(
      'node',
      [
        'tooling/apply-stopcock-v2-checkpoint.mjs',
        '--check-scope',
        stage,
        scope,
        '-',
        startHead,
        positive,
      ],
      root,
    )
    assert.equal(accepted.stdout.trim(), 'OK', `${scope} should accept ${positive}`)

    const rejected = run(
      'node',
      [
        'tooling/apply-stopcock-v2-checkpoint.mjs',
        '--check-scope',
        stage,
        scope,
        '-',
        startHead,
        'packages/not-owned/src/unrelated.ts',
      ],
      root,
      { allowFailure: true },
    )
    assert.notEqual(rejected.status, 0, `${scope} accepted an unrelated package path`)
  }
})

test('dynamic scopes are bound to recorded literal targets', (t) => {
  const { root, startHead } = createRepository(t)
  const cases = [
    ['S0R', 'S0R', 'fp-readiness', 'packages/fp/package.json', 'packages/http/package.json'],
    ['P3B', 'P3B', 'array-cardinality', 'packages/fp/src/array.ts', 'packages/fp/src/map.ts'],
    ['P4', 'P4', 'object-family', 'packages/fp/src/object.ts', 'packages/fp/src/map.ts'],
  ]

  for (const [stage, scope, target, positive, negative] of cases) {
    const accepted = run(
      'node',
      [
        'tooling/apply-stopcock-v2-checkpoint.mjs',
        '--check-scope',
        stage,
        scope,
        target,
        startHead,
        positive,
      ],
      root,
    )
    assert.equal(accepted.stdout.trim(), 'OK')

    const rejected = run(
      'node',
      [
        'tooling/apply-stopcock-v2-checkpoint.mjs',
        '--check-scope',
        stage,
        scope,
        target,
        startHead,
        negative,
      ],
      root,
      { allowFailure: true },
    )
    assert.notEqual(rejected.status, 0)
    assert.match(rejected.stderr, /exceed recorded/u)
  }
})

test('canonical forbidden exemplars stay outside their stage scopes', (t) => {
  const { root, startHead } = createRepository(t)
  const cases = [
    ['S2', 'S2', 'packages/fp/src/internal/runtime-cache.ts'],
    ['S5A', 'S5A', 'packages/fp/codegen/operator-cache.ts'],
    ['S9', 'S9', 'packages/fp/src/fusion/optimized/index.ts'],
    ['S10', 'S10', 'packages/fp/codegen/defs/array.ts'],
    ['P1B', 'P1B', 'packages/fp/src/typed-array.ts'],
    ['P2', 'P2', 'packages/fp/src/internal/provenance.ts'],
    ['S13', 'S13', '.github/workflows/deploy-docs.yml'],
    ['S14', 'S14', '.github/workflows/deploy-docs.yml'],
  ]

  for (const [stage, scope, path] of cases) {
    const rejected = run(
      'node',
      [
        'tooling/apply-stopcock-v2-checkpoint.mjs',
        '--check-scope',
        stage,
        scope,
        '-',
        startHead,
        path,
      ],
      root,
      { allowFailure: true },
    )
    assert.notEqual(rejected.status, 0, `${scope} accepted forbidden path ${path}`)
  }
})

test('S10X may stop by plan and still unlock the S10J terminal join', (t) => {
  const { root } = createRepository(t)
  const startHead = activateStage(root, 'S10X')
  const description = describe(root)
  const resultPath = writeResult(root, startHead, description)
  updateResult(resultPath, (value) => {
    value.summary = 'Synthetic optimizer extraction stop is ready.'
    value.checkpoint.message = 'chore(v2): stop synthetic optimizer extraction'
    value.checkpoint.stage = 'S10X'
    value.checkpoint.scope = 'S10X_STOP'
    value.checkpoint.nextStage = 'S10J'
    value.checkpoint.nextSlice = 'FREEZE_OPTIMIZER_TOPOLOGY'
    value.checkpoint.postStageStatus = 'STOPPED_BY_PLAN'
  })

  const applied = runCheckpoint(root, startHead, resultPath)
  const finalizedLedger = readFileSync(join(root, 'STOPCOCK_V2_PROGRESS.md'), 'utf8')

  assert.equal(applied.stdout.trim(), 'CONTINUE')
  assert.match(finalizedLedger, /^\| S10X \| STOPPED_BY_PLAN \|/mu)
  assert.match(finalizedLedger, /^\| S10J \| IN_PROGRESS \|/mu)
})

test('non-optional stages cannot use whole-stage STOPPED_BY_PLAN', (t) => {
  const { root } = createRepository(t)
  const startHead = activateStage(root, 'P1A')
  const description = describe(root)
  const resultPath = writeResult(root, startHead, description)
  updateResult(resultPath, (value) => {
    value.checkpoint.stage = 'P1A'
    value.checkpoint.scope = 'P1A'
    value.checkpoint.nextStage = 'P1B'
    value.checkpoint.nextSlice = 'TYPED_ARRAY_ITER_ADMISSION'
    value.checkpoint.postStageStatus = 'STOPPED_BY_PLAN'
  })

  const applied = runCheckpoint(root, startHead, resultPath, { allowFailure: true })

  assert.notEqual(applied.status, 0)
  assert.match(applied.stderr, /P1A is not an optional stop stage/u)
})

test('S14 completes only with empty continuation fields and reconciled stable evidence', (t) => {
  const { root } = createRepository(t)
  const externalArtifact = `sha256:${'a'.repeat(64)}`
  const startHead = activateStage(root, 'S14', {
    externalAction: 'STABLE_PUBLISH',
    externalArtifact,
    externalAuthorization: 'COMPLETED',
  })
  const description = describe(root)
  const resultPath = writeResult(root, startHead, description)
  updateResult(resultPath, (value) => {
    value.summary = 'Synthetic stable programme is complete.'
    value.checkpoint.message = 'chore(v2): complete synthetic stable release'
    value.checkpoint.stage = 'S14'
    value.checkpoint.scope = 'S14'
    value.checkpoint.nextStage = ''
    value.checkpoint.nextSlice = ''
    value.checkpoint.postProgrammeStatus = 'PROGRAMME_COMPLETE'
    value.checkpoint.postStageStatus = 'GATE_PASSED'
  })

  const applied = runCheckpoint(root, startHead, resultPath)
  const finalizedLedger = readFileSync(join(root, 'STOPCOCK_V2_PROGRESS.md'), 'utf8')

  assert.equal(applied.stdout.trim(), 'COMPLETE')
  assert.match(finalizedLedger, /^Programme status: PROGRAMME_COMPLETE$/mu)
  assert.match(finalizedLedger, /^\| S14 \| GATE_PASSED \|/mu)
  assert.match(finalizedLedger, /^Current slice: PROGRAMME_COMPLETE$/mu)
})

test('S13 rejects the reserved next.0 development cohort as an RC', (t) => {
  const { root } = createRepository(t)
  const startHead = activateStage(root, 'S13')
  write(
    join(root, 'packages/fp/package.json'),
    `${JSON.stringify({ name: '@stopcock/fp', version: '2.0.0-next.0', type: 'module' }, null, 2)}\n`,
  )
  write(
    join(root, 'packages/synth/package.json'),
    `${JSON.stringify(
      { name: '@stopcock/synth', version: '2.0.0-next.0', private: true, type: 'module' },
      null,
      2,
    )}\n`,
  )
  const description = describe(root)
  const resultPath = writeResult(root, startHead, description)
  updateResult(resultPath, (value) => {
    value.checkpoint.stage = 'S13'
    value.checkpoint.scope = 'S13'
    value.checkpoint.nextStage = 'S13'
    value.checkpoint.nextSlice = 'BUILD_RELEASE_CANDIDATE'
  })

  const applied = runCheckpoint(root, startHead, resultPath, { allowFailure: true })

  assert.notEqual(applied.status, 0)
  assert.match(applied.stderr, /outside the coordinated cohort target/u)
})
