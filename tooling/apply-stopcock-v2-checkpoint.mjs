#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  existsSync,
  lstatSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { basename, dirname, isAbsolute, join, posix, resolve, sep } from 'node:path'

const RESULT_BASENAME = 'stopcock-v2-controller-result.json'
const LEDGER = 'STOPCOCK_V2_PROGRESS.md'
const LEDGER_TEMP = '.STOPCOCK_V2_PROGRESS.md.checkpoint.tmp'
const POLICY = '.codex/policies/stopcock-v2-stage-scopes.json'
const DYNAMIC_SCOPES = 'docs/superpowers/contracts/stopcock-v2-dynamic-scopes.json'
const MAX_COMMAND_OUTPUT = 16 * 1024 * 1024
const MAX_RESULT_BYTES = 2 * 1024 * 1024

const PROTECTED_EXACT_PATHS = new Set([
  '.gitignore',
  '.gitattributes',
  '.lfsconfig',
  'tooling/run-stopcock-v2-controller.sh',
  'tooling/apply-stopcock-v2-checkpoint.mjs',
  'tooling/__tests__/stopcock-v2-checkpoint.test.mjs',
  'docs/superpowers/plans/2026-07-24-stopcock-v2-performance-density-superplan.md',
  'docs/superpowers/plans/2026-07-24-stopcock-fp-performance-frontier-implementation.md',
  'docs/superpowers/plans/2026-07-24-fp-maximum-bundle-size-reduction.md',
])

const OPTIONAL_STOP_STAGES = new Set(['S10X'])
const TERMINAL_STAGE_STATUSES = new Set(['GATE_PASSED', 'STOPPED_BY_PLAN'])
const ALL_STAGE_STATUSES = new Set([
  'NOT_STARTED',
  'IN_PROGRESS',
  'CHECKPOINT_PENDING',
  'GATE_PASSED',
  'STOPPED_BY_PLAN',
  'BLOCKED',
])

class CheckpointError extends Error {}

function fail(message) {
  throw new CheckpointError(message)
}

let repositoryRoot = process.cwd()

function runGit(args, { allowFailure = false, input } = {}) {
  const result = spawnSync('git', args, {
    cwd: repositoryRoot,
    encoding: null,
    input,
    maxBuffer: MAX_COMMAND_OUTPUT,
  })
  if (result.error) fail(`git ${args[0]} failed to start: ${result.error.message}`)
  if (!allowFailure && result.status !== 0) {
    const output = Buffer.concat([
      result.stdout ?? Buffer.alloc(0),
      result.stderr ?? Buffer.alloc(0),
    ])
      .toString('utf8')
      .trim()
    fail(`git ${args.join(' ')} failed${output ? `: ${output}` : ''}`)
  }
  return result
}

function gitText(args) {
  return runGit(args).stdout.toString('utf8').trim()
}

function splitNul(buffer) {
  if (buffer.length === 0) return []
  const values = buffer.toString('utf8').split('\0')
  if (values.at(-1) === '') values.pop()
  return values
}

function sortedUnique(values) {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right, 'en'))
}

function arraysEqual(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

function assertSamePaths(actual, expected, label) {
  if (!arraysEqual(actual, expected)) {
    fail(`${label} mismatch; expected ${JSON.stringify(expected)}, found ${JSON.stringify(actual)}`)
  }
}

function assertExactKeys(value, keys, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    fail(`${label} must be an object`)
  }
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()
  if (!arraysEqual(actual, expected)) fail(`${label} has unexpected fields`)
}

function assertAllowedKeys(value, requiredKeys, optionalKeys, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    fail(`${label} must be an object`)
  }
  const allowed = new Set([...requiredKeys, ...optionalKeys])
  if (Object.keys(value).some((key) => !allowed.has(key))) {
    fail(`${label} has unexpected fields`)
  }
  if (requiredKeys.some((key) => !(key in value))) {
    fail(`${label} is missing required fields`)
  }
}

function parseArguments(argv) {
  if (arraysEqual(argv, ['--describe-dirty'])) return { mode: 'describe' }
  if (arraysEqual(argv, ['--check-workspace'])) return { mode: 'check' }
  if (argv[0] === '--check-scope' && argv.length >= 6) {
    return {
      mode: 'scope',
      stage: argv[1],
      scope: argv[2],
      scopeTarget: argv[3] === '-' ? '' : argv[3],
      startHead: argv[4],
      paths: argv.slice(5),
    }
  }

  const values = new Map()
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index]
    const value = argv[index + 1]
    if (!key?.startsWith('--') || value === undefined) {
      fail(
        'usage: apply-stopcock-v2-checkpoint.mjs --check-workspace | --describe-dirty | --check-scope <stage> <scope> <target-or-dash> <start-head> <path...> | --result <path> --start-head <sha> --start-branch <branch> | --recover-result <path> --start-branch <branch>',
      )
    }
    if (values.has(key)) fail(`duplicate argument: ${key}`)
    values.set(key, value)
  }

  const allowed = new Set(['--result', '--recover-result', '--start-head', '--start-branch'])
  for (const key of values.keys()) {
    if (!allowed.has(key)) fail(`unknown argument: ${key}`)
  }
  if (!values.has('--start-branch')) fail('missing argument: --start-branch')
  const hasResult = values.has('--result')
  const hasRecoveryResult = values.has('--recover-result')
  if (hasResult === hasRecoveryResult) {
    fail('provide exactly one of --result or --recover-result')
  }
  if (hasResult !== values.has('--start-head')) {
    fail('--result and --start-head must be provided together')
  }

  return {
    mode: hasRecoveryResult ? 'recover' : 'apply',
    resultPath: values.get(hasRecoveryResult ? '--recover-result' : '--result'),
    startHead: values.get('--start-head'),
    startBranch: values.get('--start-branch'),
  }
}

function validateResult(value) {
  assertExactKeys(value, ['version', 'outcome', 'summary', 'checkpoint'], 'controller result')
  if (value.version !== 1) fail('controller result version must be 1')
  if (value.outcome !== 'checkpoint_ready') fail('controller outcome must be checkpoint_ready')
  if (
    typeof value.summary !== 'string' ||
    value.summary.length === 0 ||
    value.summary.length > 4000
  ) {
    fail('controller summary must contain 1-4000 characters')
  }

  assertExactKeys(
    value.checkpoint,
    [
      'contentDigest',
      'expectedHead',
      'message',
      'nextSlice',
      'nextStage',
      'paths',
      'postProgrammeStatus',
      'postStageStatus',
      'scope',
      'scopeTarget',
      'stage',
    ],
    'checkpoint',
  )
  for (const key of [
    'contentDigest',
    'expectedHead',
    'message',
    'nextSlice',
    'nextStage',
    'postProgrammeStatus',
    'postStageStatus',
    'scope',
    'scopeTarget',
    'stage',
  ]) {
    if (typeof value.checkpoint[key] !== 'string') {
      fail(`checkpoint.${key} must be a string`)
    }
  }
  if (
    !Array.isArray(value.checkpoint.paths) ||
    value.checkpoint.paths.some((path) => typeof path !== 'string')
  ) {
    fail('checkpoint.paths must be an array of strings')
  }
  return value
}

function validatePath(path) {
  if (
    path.length === 0 ||
    path.length > 4096 ||
    isAbsolute(path) ||
    path.includes('\\') ||
    /[\0\r\n]/u.test(path) ||
    posix.normalize(path) !== path ||
    path === '.' ||
    path.startsWith('../') ||
    path.includes('/../')
  ) {
    fail(`unsafe checkpoint path: ${JSON.stringify(path)}`)
  }

  const segments = path.split('/')
  if (
    segments.some(
      (segment) =>
        segment === '.git' ||
        segment === '.codex' ||
        segment === '.agents' ||
        segment === 'AGENTS.md' ||
        segment === 'AGENTS.override.md' ||
        segment === '.gitattributes' ||
        segment === '.lfsconfig',
    )
  ) {
    fail(`checkpoint path targets protected instructions or metadata: ${path}`)
  }
  if (PROTECTED_EXACT_PATHS.has(path)) {
    fail(`checkpoint path targets the protected controller plane: ${path}`)
  }
  if (path.startsWith('docs/superpowers/plans/')) {
    fail(`checkpoint path targets protected planning authority: ${path}`)
  }

  const absolutePath = resolve(repositoryRoot, path)
  const rootPrefix = repositoryRoot.endsWith(sep) ? repositoryRoot : `${repositoryRoot}${sep}`
  if (!absolutePath.startsWith(rootPrefix)) fail(`checkpoint path escapes repository: ${path}`)
}

function stagedPaths() {
  return sortedUnique(
    splitNul(runGit(['diff', '--cached', '--name-only', '-z', '--no-renames']).stdout),
  )
}

function dirtyPaths() {
  const modified = splitNul(runGit(['diff', '--name-only', '-z', '--no-renames']).stdout)
  const untracked = splitNul(runGit(['ls-files', '--others', '--exclude-standard', '-z']).stdout)
  return sortedUnique([...modified, ...untracked])
}

function committedPaths(commitHash) {
  return sortedUnique(
    splitNul(
      runGit(['diff-tree', '--no-commit-id', '--name-only', '-r', '-z', '--no-renames', commitHash])
        .stdout,
    ),
  )
}

function isAllowedIgnoredOutput(path) {
  if (
    /^(?:node_modules|packages\/[^/]+\/node_modules|apps\/[^/]+\/node_modules|benchmarks\/node_modules)(?:\/|$)/u.test(
      path,
    )
  ) {
    return true
  }
  if (/^(?:dist|lib|coverage|target|playground)(?:\/|$)/u.test(path)) return true
  if (
    /^(?:packages|apps)\/[^/]+\/(?:dist|lib|coverage|target|playground|\.astro)(?:\/|$)/u.test(path)
  ) {
    return true
  }
  if (/^benchmarks\/(?:dist|coverage|target|playground|\.astro)(?:\/|$)/u.test(path)) return true
  if (/^[^/]+\.log$/u.test(path)) return true
  return path.endsWith('.tsbuildinfo') && !path.includes('/src/') && !path.includes('/__tests__/')
}

function assertSafeIgnoredState() {
  const ignored = splitNul(
    runGit(['ls-files', '--others', '--ignored', '--exclude-standard', '-z']).stdout,
  )
  const unexpected = ignored.filter((path) => !isAllowedIgnoredOutput(path))
  if (unexpected.length !== 0) {
    fail(
      `unexpected ignored workspace state: ${JSON.stringify(unexpected.slice(0, 20))}${
        unexpected.length > 20 ? ` and ${unexpected.length - 20} more` : ''
      }`,
    )
  }
}

function assertNoGitOperation() {
  const operationPaths = [
    'MERGE_HEAD',
    'CHERRY_PICK_HEAD',
    'REVERT_HEAD',
    'REBASE_HEAD',
    'BISECT_LOG',
    'index.lock',
    'rebase-merge',
    'rebase-apply',
    'sequencer',
  ]
  for (const name of operationPaths) {
    const path = gitText(['rev-parse', '--git-path', name])
    if (existsSync(path)) fail(`Git operation state is present: ${name}`)
  }
}

function appendDigestField(hash, label, value) {
  const labelBuffer = Buffer.from(label, 'utf8')
  const valueBuffer = Buffer.isBuffer(value) ? value : Buffer.from(value, 'utf8')
  const length = Buffer.allocUnsafe(8)
  length.writeBigUInt64BE(BigInt(valueBuffer.length))
  hash.update(labelBuffer)
  hash.update(Buffer.from([0]))
  hash.update(length)
  hash.update(valueBuffer)
}

function appendDigestEntry(hash, path, mode, kind, content) {
  appendDigestField(hash, 'path', path)
  appendDigestField(hash, 'mode', mode)
  appendDigestField(hash, 'kind', kind)
  if (content !== undefined) appendDigestField(hash, 'content', content)
}

function contentDigest(paths) {
  const hash = createHash('sha256')
  hash.update('stopcock-v2-checkpoint-content-v2\0')
  for (const path of paths) {
    validatePath(path)
    const absolutePath = join(repositoryRoot, path)
    let stats
    try {
      stats = lstatSync(absolutePath)
    } catch (error) {
      if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') throw error
      appendDigestEntry(hash, path, '', 'deleted')
      continue
    }

    if (stats.isSymbolicLink()) {
      appendDigestEntry(hash, path, '120000', 'symlink', readlinkSync(absolutePath))
    } else if (stats.isFile()) {
      const mode = (stats.mode & 0o111) === 0 ? '100644' : '100755'
      appendDigestEntry(hash, path, mode, 'file', readFileSync(absolutePath))
    } else {
      fail(`checkpoint path is not a regular file, symlink, or deletion: ${path}`)
    }
  }
  return `sha256:${hash.digest('hex')}`
}

function treeEntry(treeish, path) {
  const result = runGit(['--literal-pathspecs', 'ls-tree', '-z', treeish, '--', path])
  if (result.stdout.length === 0) return undefined
  const records = splitNul(result.stdout)
  if (records.length !== 1) fail(`tree ${treeish} has an ambiguous entry for ${path}`)
  const tab = records[0].indexOf('\t')
  if (tab === -1 || records[0].slice(tab + 1) !== path) {
    fail(`tree ${treeish} returned an unexpected entry for ${path}`)
  }
  const [mode, type, object, ...extra] = records[0].slice(0, tab).split(' ')
  if (extra.length !== 0 || type !== 'blob' || !/^[0-9a-f]{40,64}$/u.test(object)) {
    fail(`tree ${treeish} entry for ${path} is not a blob`)
  }
  if (!['100644', '100755', '120000'].includes(mode)) {
    fail(`tree ${treeish} entry for ${path} has unsupported mode ${mode}`)
  }
  return { mode, object }
}

function contentDigestAtTree(paths, treeish) {
  const hash = createHash('sha256')
  hash.update('stopcock-v2-checkpoint-content-v2\0')
  for (const path of paths) {
    validatePath(path)
    const entry = treeEntry(treeish, path)
    if (entry === undefined) {
      appendDigestEntry(hash, path, '', 'deleted')
      continue
    }
    const content = runGit(['cat-file', 'blob', entry.object]).stdout
    appendDigestEntry(hash, path, entry.mode, entry.mode === '120000' ? 'symlink' : 'file', content)
  }
  return `sha256:${hash.digest('hex')}`
}

function stageExactPaths(paths) {
  const pathspecInput = Buffer.from(`${paths.join('\0')}\0`, 'utf8')
  runGit(['--literal-pathspecs', 'add', '--all', '--pathspec-from-file=-', '--pathspec-file-nul'], {
    input: pathspecInput,
  })
}

function replaceExactlyOnce(contents, current, replacement) {
  const first = contents.indexOf(current)
  if (first === -1 || contents.indexOf(current, first + current.length) !== -1) {
    fail(`ledger must contain exactly one ${JSON.stringify(current)}`)
  }
  return `${contents.slice(0, first)}${replacement}${contents.slice(first + current.length)}`
}

function ledgerValue(contents, label) {
  const prefix = `${label}: `
  const matches = contents
    .split('\n')
    .filter((line) => line.startsWith(prefix))
    .map((line) => line.slice(prefix.length))
  if (matches.length !== 1 || matches[0].length === 0) {
    fail(`ledger must contain exactly one non-empty ${label} field`)
  }
  return matches[0]
}

function ledgerSection(contents, heading, nextHeading) {
  const startMarker = `## ${heading}\n`
  const start = contents.indexOf(startMarker)
  if (start === -1 || contents.indexOf(startMarker, start + startMarker.length) !== -1) {
    fail(`ledger must contain exactly one ${heading} section`)
  }
  const bodyStart = start + startMarker.length
  const end = nextHeading ? contents.indexOf(`## ${nextHeading}\n`, bodyStart) : contents.length
  if (end === -1) fail(`ledger ${heading} section must precede ${nextHeading}`)
  return contents.slice(bodyStart, end).trimEnd()
}

function parseStageTable(contents, expectedStages) {
  const section = ledgerSection(contents, 'Canonical stage status', 'Progress')
  const stages = new Map()
  for (const line of section.split('\n')) {
    const match = /^\|\s*([A-Z0-9]+)\s*\|\s*([A-Z_]+)\s*\|/u.exec(line)
    if (!match || match[1] === 'Stage') continue
    const [, stage, status] = match
    if (stages.has(stage)) fail(`ledger stage table repeats ${stage}`)
    if (!ALL_STAGE_STATUSES.has(status)) fail(`ledger stage ${stage} has invalid status ${status}`)
    stages.set(stage, status)
  }
  const actual = [...stages.keys()].sort()
  const expected = [...expectedStages].sort()
  if (!arraysEqual(actual, expected)) {
    fail(
      `ledger stage table mismatch; expected ${JSON.stringify(expected)}, found ${JSON.stringify(actual)}`,
    )
  }
  return stages
}

function parseStageEvidence(contents) {
  const section = ledgerSection(contents, 'Canonical stage status', 'Progress')
  const evidence = new Map()
  for (const line of section.split('\n')) {
    const cells = line
      .split('|')
      .slice(1, -1)
      .map((cell) => cell.trim())
    if (cells.length < 3 || !/^[A-Z0-9]+$/u.test(cells[0])) continue
    evidence.set(cells[0], cells.slice(2).join('|').trim())
  }
  return evidence
}

function completedProgressLines(contents) {
  const section = ledgerSection(contents, 'Progress', 'Evidence log')
  const retained = []
  let retainItem = false
  for (const line of section.split('\n')) {
    if (/^- \[[ x]\]/u.test(line)) retainItem = line.startsWith('- [x]')
    if (retainItem && line.length !== 0) retained.push(line)
  }
  return retained
}

function assertOrderedSubsequence(expected, actual, label) {
  let index = 0
  for (const line of actual) {
    if (line === expected[index]) index += 1
    if (index === expected.length) return
  }
  if (expected.length !== 0) fail(`${label} removed or rewrote previously verified history`)
}

function assertAppendOnlySection(baseline, pending, heading, nextHeading) {
  const baselineBody = ledgerSection(baseline, heading, nextHeading)
  const pendingBody = ledgerSection(pending, heading, nextHeading)
  if (pendingBody !== baselineBody && !pendingBody.startsWith(`${baselineBody}\n`)) {
    fail(`ledger ${heading} history must be append-only`)
  }
}

function loadPolicy(commitHash = gitText(['rev-parse', 'HEAD'])) {
  let value
  try {
    value = JSON.parse(runGit(['show', `${commitHash}:${POLICY}`]).stdout.toString('utf8'))
  } catch (error) {
    if (error instanceof CheckpointError) throw error
    fail(`invalid stage policy at ${commitHash}`)
  }
  assertExactKeys(
    value,
    ['$schema', 'version', 'dependencies', 'terminalDependencies', 'scopes'],
    'stage policy',
  )
  if (value.version !== 1) fail('stage policy version must be 1')
  if (
    value.dependencies === null ||
    typeof value.dependencies !== 'object' ||
    Array.isArray(value.dependencies)
  ) {
    fail('stage policy dependencies must be an object')
  }
  if (value.scopes === null || typeof value.scopes !== 'object' || Array.isArray(value.scopes)) {
    fail('stage policy scopes must be an object')
  }
  if (
    value.terminalDependencies === null ||
    typeof value.terminalDependencies !== 'object' ||
    Array.isArray(value.terminalDependencies)
  ) {
    fail('stage policy terminalDependencies must be an object')
  }

  const stages = new Set(Object.keys(value.dependencies))
  for (const [stage, dependencies] of Object.entries(value.dependencies)) {
    if (
      !/^[A-Z0-9]+$/u.test(stage) ||
      !Array.isArray(dependencies) ||
      dependencies.some(
        (dependency) => typeof dependency !== 'string' || !stages.has(dependency),
      ) ||
      new Set(dependencies).size !== dependencies.length ||
      dependencies.includes(stage)
    ) {
      fail(`stage policy has invalid dependencies for ${stage}`)
    }
  }
  for (const [stage, dependencies] of Object.entries(value.terminalDependencies)) {
    if (
      !stages.has(stage) ||
      !Array.isArray(dependencies) ||
      dependencies.some((dependency) => !value.dependencies[stage].includes(dependency)) ||
      new Set(dependencies).size !== dependencies.length
    ) {
      fail(`stage policy has invalid terminal dependencies for ${stage}`)
    }
  }

  const coveredStages = new Set()
  for (const [scopeName, scope] of Object.entries(value.scopes)) {
    assertAllowedKeys(
      scope,
      ['stage', 'dynamicRule', 'patterns'],
      ['forbiddenPatterns'],
      `scope ${scopeName}`,
    )
    if (!stages.has(scope.stage)) fail(`scope ${scopeName} names unknown stage ${scope.stage}`)
    if (typeof scope.dynamicRule !== 'string') {
      fail(`scope ${scopeName} has an invalid dynamic rule`)
    }
    if (
      !Array.isArray(scope.patterns) ||
      scope.patterns.length === 0 ||
      scope.patterns.some((pattern) => typeof pattern !== 'string' || pattern.length === 0)
    ) {
      fail(`scope ${scopeName} has invalid patterns`)
    }
    for (const pattern of scope.patterns) globRegex(pattern)
    if (
      scope.forbiddenPatterns !== undefined &&
      (!Array.isArray(scope.forbiddenPatterns) ||
        scope.forbiddenPatterns.some(
          (pattern) => typeof pattern !== 'string' || pattern.length === 0,
        ))
    ) {
      fail(`scope ${scopeName} has invalid forbiddenPatterns`)
    }
    for (const pattern of scope.forbiddenPatterns ?? []) globRegex(pattern)
    coveredStages.add(scope.stage)
  }
  const uncoveredStages = [...stages].filter((stage) => !coveredStages.has(stage))
  if (uncoveredStages.length !== 0) {
    fail(`stage policy has no scope for: ${uncoveredStages.join(', ')}`)
  }

  const visited = new Set()
  const visiting = new Set()
  function visit(stage) {
    if (visiting.has(stage)) fail(`stage policy dependency cycle includes ${stage}`)
    if (visited.has(stage)) return
    visiting.add(stage)
    for (const dependency of value.dependencies[stage]) visit(dependency)
    visiting.delete(stage)
    visited.add(stage)
  }
  for (const stage of stages) visit(stage)
  return value
}

function globRegex(pattern) {
  let source = '^'
  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index]
    if (character === '*') {
      if (pattern[index + 1] === '*') {
        index += 1
        if (pattern[index + 1] === '/') {
          index += 1
          source += '(?:.*/)?'
        } else {
          source += '.*'
        }
      } else {
        source += '[^/]*'
      }
    } else {
      source += character.replace(/[\\^$.*+?()[\]{}|]/gu, '\\$&')
    }
  }
  return new RegExp(`${source}$`, 'u')
}

function validateDynamicShape(stage, paths) {
  if (stage === 'S0R') {
    const packageNames = new Set(
      paths
        .map((path) => /^packages\/([^/]+)\//u.exec(path)?.[1])
        .filter((name) => name !== undefined),
    )
    if (packageNames.size > 1) {
      fail(`S0R checkpoint spans more than one blocked package: ${[...packageNames].join(', ')}`)
    }
    return
  }
  if (stage === 'P3B') {
    const modules = paths.filter(
      (path) =>
        /^packages\/fp\/src\/[^/]+\.ts$/u.test(path) &&
        !path.includes('cardinality') &&
        !path.includes('manifest'),
    )
    if (modules.length > 1) {
      fail(`P3B checkpoint spans more than one production target: ${modules.join(', ')}`)
    }
    return
  }
  if (stage === 'P4') {
    const families = new Set()
    for (const path of paths.filter(
      (candidate) =>
        (candidate.startsWith('packages/fp/src/') ||
          candidate.startsWith('packages/fp/codegen/')) &&
        !candidate.includes('/__tests__/'),
    )) {
      for (const family of ['object', 'record', 'map']) {
        if (path.toLowerCase().includes(family)) families.add(family)
      }
    }
    if (families.size > 1) {
      fail(`P4 checkpoint spans more than one specialist family: ${[...families].join(', ')}`)
    }
    return
  }
}

function validateDynamicTargetDefinition(stage, target) {
  const broadPatterns = new Set([
    '*',
    '**',
    '.changeset/**',
    'artifacts/v2/**',
    'docs/superpowers/**',
    'packages/*/**',
    'packages/fp/**',
    'packages/fp/src/**/*.ts',
    'tooling/**',
  ])
  for (const pattern of target.allowedPatterns) {
    if (
      broadPatterns.has(pattern) ||
      pattern.startsWith('*') ||
      pattern.startsWith('docs/superpowers/plans/')
    ) {
      fail(`${stage} dynamic target ${target.id} uses an overbroad pattern: ${pattern}`)
    }
  }

  const isNoOp = target.id === 'no-op' || target.id.startsWith('no-op-')
  if (stage === 'S0R') {
    const packageNames = new Set()
    for (const pattern of target.allowedPatterns) {
      if (pattern.startsWith('packages/*/')) {
        fail(`S0R dynamic target ${target.id} must name one literal package`)
      }
      const match = /^packages\/([^*?[\]{}\/]+)\//u.exec(pattern)
      if (match) packageNames.add(match[1])
    }
    if ((!isNoOp && packageNames.size !== 1) || packageNames.size > 1) {
      fail(`S0R dynamic target ${target.id} must bind exactly one blocked package`)
    }
    return
  }

  if (stage === 'P3B') {
    const modules = target.allowedPatterns.filter((pattern) =>
      /^packages\/fp\/src\/[^/*?[\]{}]+\.ts$/u.test(pattern),
    )
    if ((!isNoOp && modules.length !== 1) || modules.length > 1) {
      fail(`P3B dynamic target ${target.id} must bind exactly one production module`)
    }
    return
  }

  if (stage === 'P4') {
    const modules = target.allowedPatterns.filter((pattern) =>
      /^packages\/fp\/src\/(?:object|record|map)\.ts$/u.test(pattern),
    )
    if ((!isNoOp && modules.length !== 1) || modules.length > 1) {
      fail(`P4 dynamic target ${target.id} must bind exactly one specialist family`)
    }
    if (modules.length === 1) {
      const family = basename(modules[0], '.ts')
      const mixedProductionPattern = target.allowedPatterns.find(
        (pattern) =>
          (pattern.startsWith('packages/fp/src/') || pattern.startsWith('packages/fp/codegen/')) &&
          !pattern.includes('/__tests__/') &&
          ['object', 'record', 'map'].some(
            (candidate) => candidate !== family && pattern.toLowerCase().includes(candidate),
          ),
      )
      if (mixedProductionPattern !== undefined) {
        fail(
          `P4 dynamic target ${target.id} mixes ${family} with another specialist family: ${mixedProductionPattern}`,
        )
      }
    }
  }
}

function parseDynamicScopeContract(contents) {
  const value = JSON.parse(contents)
  assertExactKeys(value, ['schemaVersion', 'stages'], 'dynamic scope contract')
  if (value.schemaVersion !== 1) fail('dynamic scope contract schemaVersion must be 1')
  if (value.stages === null || typeof value.stages !== 'object' || Array.isArray(value.stages)) {
    fail('dynamic scope contract stages must be an object')
  }

  const parsed = new Map()
  for (const [stage, targets] of Object.entries(value.stages)) {
    if (!['S0R', 'P3B', 'P4'].includes(stage) || !Array.isArray(targets)) {
      fail(`dynamic scope contract has invalid stage ${stage}`)
    }
    const stageTargets = new Map()
    for (const target of targets) {
      assertExactKeys(target, ['id', 'allowedPatterns'], `${stage} dynamic target`)
      if (
        typeof target.id !== 'string' ||
        !/^[a-z0-9][a-z0-9._-]{0,79}$/u.test(target.id) ||
        stageTargets.has(target.id)
      ) {
        fail(`${stage} dynamic target has an invalid or duplicate id`)
      }
      if (
        !Array.isArray(target.allowedPatterns) ||
        target.allowedPatterns.length === 0 ||
        target.allowedPatterns.some(
          (pattern) =>
            typeof pattern !== 'string' ||
            pattern.length === 0 ||
            pattern.length > 4096 ||
            isAbsolute(pattern) ||
            pattern.includes('\\') ||
            pattern.includes('..') ||
            /[\0\r\n]/u.test(pattern),
        )
      ) {
        fail(`${stage} dynamic target ${target.id} has invalid allowedPatterns`)
      }
      for (const pattern of target.allowedPatterns) globRegex(pattern)
      validateDynamicTargetDefinition(stage, target)
      stageTargets.set(target.id, target.allowedPatterns)
    }
    parsed.set(stage, stageTargets)
  }
  return parsed
}

function dynamicScopeContractAt(commitHash) {
  const result = runGit(['show', `${commitHash}:${DYNAMIC_SCOPES}`], {
    allowFailure: true,
  })
  if (result.status !== 0) {
    fail(`missing dynamic scope contract at ${commitHash}: ${DYNAMIC_SCOPES}`)
  }
  return parseDynamicScopeContract(result.stdout.toString('utf8'))
}

function validateStageScope(policy, scopeName, scopeTarget, stage, paths, startHead) {
  const scope = policy.scopes[scopeName]
  if (scope === undefined) fail(`unknown checkpoint scope: ${scopeName}`)
  assertAllowedKeys(
    scope,
    ['stage', 'dynamicRule', 'patterns'],
    ['forbiddenPatterns'],
    `scope ${scopeName}`,
  )
  if (scope.stage !== stage) fail(`checkpoint scope ${scopeName} does not belong to stage ${stage}`)
  if (
    !Array.isArray(scope.patterns) ||
    scope.patterns.length === 0 ||
    scope.patterns.some((pattern) => typeof pattern !== 'string' || pattern.length === 0)
  ) {
    fail(`scope ${scopeName} has invalid patterns`)
  }
  const matchers = scope.patterns.map(globRegex)
  const forbiddenMatchers = (scope.forbiddenPatterns ?? []).map(globRegex)
  const scopedPaths = paths.filter((path) => path !== LEDGER)
  const disallowed = scopedPaths.filter((path) => !matchers.some((matcher) => matcher.test(path)))
  if (disallowed.length !== 0) {
    fail(`checkpoint paths exceed canonical ${scopeName} scope: ${JSON.stringify(disallowed)}`)
  }
  const forbidden = scopedPaths.filter((path) =>
    forbiddenMatchers.some((matcher) => matcher.test(path)),
  )
  if (forbidden.length !== 0) {
    fail(`checkpoint paths hit canonical ${scopeName} exclusions: ${JSON.stringify(forbidden)}`)
  }
  if (scope.dynamicRule === 'none') {
    if (scopeTarget !== '') fail(`static checkpoint scope ${scopeName} must not name a scopeTarget`)
    return
  }
  if (scope.dynamicRule !== 'recorded-target') {
    fail(`unknown dynamic stage-scope rule: ${scope.dynamicRule}`)
  }
  if (scopedPaths.includes(DYNAMIC_SCOPES)) {
    fail(`${stage} may not rewrite its own dynamic scope contract`)
  }
  if (!/^[a-z0-9][a-z0-9._-]{0,79}$/u.test(scopeTarget)) {
    fail(`dynamic checkpoint scope ${scopeName} requires a valid scopeTarget`)
  }
  const targetPatterns = dynamicScopeContractAt(startHead).get(stage)?.get(scopeTarget)
  if (targetPatterns === undefined) {
    fail(`dynamic target ${scopeTarget} is not recorded for ${stage} at the start HEAD`)
  }
  const targetMatchers = targetPatterns.map(globRegex)
  const outsideTarget = scopedPaths.filter(
    (path) => !targetMatchers.some((matcher) => matcher.test(path)),
  )
  if (outsideTarget.length !== 0) {
    fail(
      `checkpoint paths exceed recorded ${stage}/${scopeTarget} target: ${JSON.stringify(
        outsideTarget,
      )}`,
    )
  }
  validateDynamicShape(stage, scopedPaths)
}

function jsonAtCommit(commitHash, path, { optional = false } = {}) {
  const result = runGit(['show', `${commitHash}:${path}`], { allowFailure: true })
  if (result.status !== 0) {
    if (optional) return undefined
    fail(`missing JSON file ${path} at ${commitHash}`)
  }
  try {
    return JSON.parse(result.stdout.toString('utf8'))
  } catch {
    fail(`invalid JSON file ${path} at ${commitHash}`)
  }
}

function liveJson(path) {
  try {
    return JSON.parse(readFileSync(join(repositoryRoot, path), 'utf8'))
  } catch {
    fail(`invalid live JSON file: ${path}`)
  }
}

function packageManifestPathsAt(commitHash) {
  return splitNul(
    runGit(['ls-tree', '-r', '--name-only', '-z', commitHash, '--', 'packages']).stdout,
  ).filter((path) => /^packages\/[^/]+\/package\.json$/u.test(path))
}

function currentJson(path, treeish) {
  if (treeish !== undefined) return jsonAtCommit(treeish, path, { optional: true })
  if (!existsSync(join(repositoryRoot, path))) return undefined
  return liveJson(path)
}

function validatePackageManifestChanges(stage, startHead, paths, currentTreeish) {
  const manifestPaths = paths.filter(
    (path) => path === 'package.json' || /^packages\/[^/]+\/package\.json$/u.test(path),
  )
  if (manifestPaths.length === 0) return

  const versionOwningStages = new Set(['S0B', 'S13', 'S14'])
  let changedVersion = false
  for (const path of manifestPaths) {
    const current = currentJson(path, currentTreeish)
    if (current === undefined) fail(`checkpoint deletes package manifest: ${path}`)
    const baseline = jsonAtCommit(startHead, path, { optional: true })
    if (baseline === undefined) {
      if (stage !== 'S10X' || path !== 'packages/fp-optimizer/package.json') {
        fail(`checkpoint creates an unexpected package manifest during ${stage}: ${path}`)
      }
      if (current.name !== '@stopcock/fp-optimizer') {
        fail('S10X optimizer manifest has the wrong package name')
      }
    } else {
      if (current.name !== baseline.name || current.private !== baseline.private) {
        fail(`checkpoint changes immutable package identity fields: ${path}`)
      }
      if (current.version !== baseline.version) {
        changedVersion = true
        if (!versionOwningStages.has(stage)) {
          fail(`${stage} is not allowed to change package versions: ${path}`)
        }
      }
    }
    if (current.name === '@stopcock/synth' && current.private !== true) {
      fail('@stopcock/synth must remain private')
    }
  }

  if (stage === 'S10X') {
    const optimizerPath = 'packages/fp-optimizer/package.json'
    if (manifestPaths.includes(optimizerPath)) {
      const optimizer = currentJson(optimizerPath, currentTreeish)
      const fp = currentJson('packages/fp/package.json', currentTreeish)
      if (optimizer === undefined || fp === undefined) {
        fail('S10X optimizer and FP manifests must both exist')
      }
      if (optimizer.version !== fp.version) {
        fail('S10X optimizer must join the current FP cohort version')
      }
    }
  }

  if (!changedVersion) return
  const expectedVersion =
    stage === 'S0B'
      ? /^2\.0\.0-next\.0$/u
      : stage === 'S13'
        ? /^2\.0\.0-next\.[1-9]\d*$/u
        : /^2\.0\.0$/u
  const cohortPaths = packageManifestPathsAt(startHead)
  for (const path of cohortPaths) {
    const baseline = jsonAtCommit(startHead, path)
    if (baseline.private !== true || baseline.name === '@stopcock/synth') {
      const current = currentJson(path, currentTreeish)
      if (current === undefined) fail(`checkpoint deletes cohort manifest ${path}`)
      if (!expectedVersion.test(current.version)) {
        fail(`${stage} leaves ${path} outside the coordinated cohort target`)
      }
      if (!manifestPaths.includes(path)) {
        fail(`${stage} version checkpoint omits cohort manifest ${path}`)
      }
      if (baseline.name === '@stopcock/synth' && current.private !== true) {
        fail('@stopcock/synth must remain private during cohort alignment')
      }
    }
  }
}

function validateTransition(
  policy,
  baselineStages,
  activeStage,
  nextStage,
  postProgrammeStatus,
  postStageStatus,
) {
  if (!['IN_PROGRESS', 'BLOCKED', 'PROGRAMME_COMPLETE'].includes(postProgrammeStatus)) {
    fail(`invalid post-programme status: ${postProgrammeStatus}`)
  }
  if (!['IN_PROGRESS', 'GATE_PASSED', 'STOPPED_BY_PLAN', 'BLOCKED'].includes(postStageStatus)) {
    fail(`invalid post-stage status: ${postStageStatus}`)
  }
  if (postStageStatus === 'STOPPED_BY_PLAN' && !OPTIONAL_STOP_STAGES.has(activeStage)) {
    fail(`${activeStage} is not an optional stop stage`)
  }

  if (postStageStatus === 'IN_PROGRESS') {
    if (postProgrammeStatus !== 'IN_PROGRESS' || nextStage !== activeStage) {
      fail('an in-progress slice must keep both the programme and active stage in progress')
    }
    return
  }
  if (postStageStatus === 'BLOCKED') {
    if (postProgrammeStatus !== 'BLOCKED' || nextStage !== activeStage) {
      fail('a blocked checkpoint must keep the current stage and mark the programme blocked')
    }
    return
  }

  if (postProgrammeStatus === 'PROGRAMME_COMPLETE') {
    if (activeStage !== 'S14' || postStageStatus !== 'GATE_PASSED' || nextStage !== '') {
      fail('programme completion is valid only after the S14 gate passes with no next stage')
    }
    const completedStages = new Map(baselineStages)
    completedStages.set(activeStage, postStageStatus)
    const incomplete = [...completedStages.entries()]
      .filter(([, status]) => !TERMINAL_STAGE_STATUSES.has(status))
      .map(([stage]) => stage)
    if (incomplete.length !== 0) {
      fail(`programme completion has unfinished stages: ${incomplete.join(', ')}`)
    }
    return
  }

  if (postProgrammeStatus !== 'IN_PROGRESS') {
    fail('a passed or stopped optional stage must leave the programme in progress')
  }
  if (nextStage === '' || nextStage === activeStage) {
    fail('a completed stage must select a different eligible next stage')
  }
  if (!(nextStage in policy.dependencies)) fail(`unknown next stage: ${nextStage}`)
  if (baselineStages.get(nextStage) !== 'NOT_STARTED') {
    fail(`next stage ${nextStage} is not NOT_STARTED`)
  }

  const effectiveStages = new Map(baselineStages)
  effectiveStages.set(activeStage, postStageStatus)
  const terminalDependencies = new Set(policy.terminalDependencies[nextStage] ?? [])
  const unmet = policy.dependencies[nextStage].filter((dependency) => {
    const status = effectiveStages.get(dependency)
    return terminalDependencies.has(dependency)
      ? !TERMINAL_STAGE_STATUSES.has(status)
      : status !== 'GATE_PASSED'
  })
  if (unmet.length !== 0) {
    fail(`next stage ${nextStage} has unmet dependencies: ${unmet.join(', ')}`)
  }
}

function textAtTree(treeish, path, { optional = false } = {}) {
  const result = runGit(['show', `${treeish}:${path}`], { allowFailure: true })
  if (result.status !== 0) {
    if (optional) return undefined
    fail(`missing file ${path} at ${treeish}`)
  }
  return result.stdout.toString('utf8')
}

function validatePendingLedger(result, startHead, startBranch, policy, pendingTreeish) {
  const pendingPath = join(repositoryRoot, LEDGER)
  if (pendingTreeish === undefined && !existsSync(pendingPath)) fail(`missing ledger: ${LEDGER}`)
  const pending =
    pendingTreeish === undefined
      ? readFileSync(pendingPath, 'utf8')
      : textAtTree(pendingTreeish, LEDGER)
  const baseline = textAtTree(startHead, LEDGER)

  for (const label of [
    'Execution authorization',
    'External mutation authorization',
    'External authorized action',
    'External authorized artifact',
    'Base release ref',
    'Execution branch',
    'Execution worktree',
  ]) {
    if (ledgerValue(pending, label) !== ledgerValue(baseline, label)) {
      fail(`ledger ${label} changed during controller run`)
    }
  }
  if (ledgerValue(pending, 'Execution authorization') !== 'AUTHORIZED') {
    fail('ledger execution authorization is not AUTHORIZED')
  }
  if (ledgerValue(pending, 'Execution branch') !== startBranch) {
    fail('ledger execution branch does not match the controller branch')
  }
  if (realpathSync(ledgerValue(pending, 'Execution worktree')) !== repositoryRoot) {
    fail('ledger execution worktree does not match this checkout')
  }
  const baseRef = ledgerValue(pending, 'Base release ref')
  const baseCheck = runGit(['merge-base', '--is-ancestor', baseRef, startHead], {
    allowFailure: true,
  })
  if (baseCheck.status !== 0) fail(`ledger base ${baseRef} is not an ancestor of ${startHead}`)

  if (ledgerValue(pending, 'Programme status') !== 'CHECKPOINT_PENDING') {
    fail('pending ledger Programme status must be CHECKPOINT_PENDING')
  }
  if (ledgerValue(baseline, 'Programme status') !== 'IN_PROGRESS') {
    fail('baseline ledger Programme status must be IN_PROGRESS')
  }
  if (ledgerValue(pending, 'Last verified commit') !== 'CHECKPOINT_PENDING') {
    fail('pending ledger Last verified commit must be CHECKPOINT_PENDING')
  }
  if (ledgerValue(pending, 'Current canonical stage') !== result.checkpoint.stage) {
    fail('pending ledger must retain the active canonical stage')
  }
  if (ledgerValue(pending, 'Current slice') !== 'CHECKPOINT_PENDING') {
    fail('pending ledger Current slice must be CHECKPOINT_PENDING')
  }
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(ledgerValue(pending, 'Last controller run'))) {
    fail('pending ledger Last controller run must be an ISO calendar date')
  }

  const expectedStages = Object.keys(policy.dependencies)
  const baselineStages = parseStageTable(baseline, expectedStages)
  const pendingStages = parseStageTable(pending, expectedStages)
  const baselineEvidence = parseStageEvidence(baseline)
  const pendingEvidence = parseStageEvidence(pending)
  const activeStage = ledgerValue(baseline, 'Current canonical stage')
  const baselineActiveStages = [...baselineStages.entries()]
    .filter(([, status]) => status === 'IN_PROGRESS')
    .map(([stage]) => stage)
  if (!arraysEqual(baselineActiveStages, [activeStage])) {
    fail(
      `baseline ledger must have exactly one IN_PROGRESS row for ${activeStage}; found ${JSON.stringify(
        baselineActiveStages,
      )}`,
    )
  }
  const invalidBaselineRows = [...baselineStages.entries()]
    .filter(([, status]) => status === 'CHECKPOINT_PENDING' || status === 'BLOCKED')
    .map(([stage]) => stage)
  if (invalidBaselineRows.length !== 0) {
    fail(`baseline ledger has unresolved rows: ${invalidBaselineRows.join(', ')}`)
  }
  const invalidStoppedRows = [...baselineStages.entries()]
    .filter(([stage, status]) => status === 'STOPPED_BY_PLAN' && !OPTIONAL_STOP_STAGES.has(stage))
    .map(([stage]) => stage)
  if (invalidStoppedRows.length !== 0) {
    fail(`baseline ledger has non-optional stopped rows: ${invalidStoppedRows.join(', ')}`)
  }
  const activeTerminalDependencies = new Set(policy.terminalDependencies[activeStage] ?? [])
  const unmetActiveDependencies = policy.dependencies[activeStage].filter((dependency) => {
    const status = baselineStages.get(dependency)
    return activeTerminalDependencies.has(dependency)
      ? !TERMINAL_STAGE_STATUSES.has(status)
      : status !== 'GATE_PASSED'
  })
  if (unmetActiveDependencies.length !== 0) {
    fail(
      `active stage ${activeStage} has unmet baseline dependencies: ${unmetActiveDependencies.join(', ')}`,
    )
  }
  const lastVerifiedCommit = ledgerValue(baseline, 'Last verified commit')
  if (!/^[0-9a-f]{40}$/u.test(lastVerifiedCommit)) {
    fail('baseline ledger Last verified commit must be a 40-character commit SHA')
  }
  if (
    runGit(['merge-base', '--is-ancestor', lastVerifiedCommit, startHead], {
      allowFailure: true,
    }).status !== 0
  ) {
    fail(`baseline ledger Last verified commit ${lastVerifiedCommit} is not an ancestor of HEAD`)
  }
  if (ledgerValue(baseline, 'Current slice') === 'CHECKPOINT_PENDING') {
    fail('baseline ledger Current slice cannot be CHECKPOINT_PENDING')
  }
  if (result.checkpoint.stage !== activeStage) {
    fail(`checkpoint stage ${result.checkpoint.stage} does not match active stage ${activeStage}`)
  }
  if (baselineStages.get(activeStage) !== 'IN_PROGRESS') {
    fail(`active stage ${activeStage} must start IN_PROGRESS`)
  }
  for (const stage of expectedStages) {
    const expected = stage === activeStage ? 'CHECKPOINT_PENDING' : baselineStages.get(stage)
    if (pendingStages.get(stage) !== expected) {
      fail(`pending ledger changed non-active stage ${stage}`)
    }
    if (stage !== activeStage && pendingEvidence.get(stage) !== baselineEvidence.get(stage)) {
      fail(`pending ledger rewrote non-active stage evidence for ${stage}`)
    }
  }
  const retainedActiveEvidence = baselineEvidence.get(activeStage)
  if (
    retainedActiveEvidence !== '—' &&
    !pendingEvidence.get(activeStage)?.includes(retainedActiveEvidence)
  ) {
    fail(`pending ledger removed prior evidence from active stage ${activeStage}`)
  }

  if (
    ledgerSection(pending, 'Start gate', 'Canonical stage status') !==
    ledgerSection(baseline, 'Start gate', 'Canonical stage status')
  ) {
    fail('ledger start gate changed during controller run')
  }
  assertOrderedSubsequence(
    completedProgressLines(baseline),
    completedProgressLines(pending),
    'ledger progress',
  )
  assertAppendOnlySection(baseline, pending, 'Evidence log', 'Surprises and discoveries')
  assertAppendOnlySection(baseline, pending, 'Surprises and discoveries', 'Decision log')
  assertAppendOnlySection(baseline, pending, 'Decision log', 'Current blockers')

  validateTransition(
    policy,
    baselineStages,
    activeStage,
    result.checkpoint.nextStage,
    result.checkpoint.postProgrammeStatus,
    result.checkpoint.postStageStatus,
  )
  if (activeStage === 'S13' && result.checkpoint.postStageStatus === 'GATE_PASSED') {
    if (
      ledgerValue(baseline, 'External mutation authorization') !== 'COMPLETED' ||
      ledgerValue(baseline, 'External authorized action') !== 'RC_PUBLISH' ||
      !/^sha256:[0-9a-f]{64}$/u.test(ledgerValue(baseline, 'External authorized artifact'))
    ) {
      fail(
        'S13 cannot pass before the exact RC publication is externally authorized and reconciled',
      )
    }
  }
  if (result.checkpoint.postProgrammeStatus === 'PROGRAMME_COMPLETE') {
    if (
      ledgerValue(baseline, 'External mutation authorization') !== 'COMPLETED' ||
      ledgerValue(baseline, 'External authorized action') !== 'STABLE_PUBLISH' ||
      !/^sha256:[0-9a-f]{64}$/u.test(ledgerValue(baseline, 'External authorized artifact'))
    ) {
      fail(
        'S14 cannot complete before the exact stable publication is externally authorized and reconciled',
      )
    }
  }
  if (
    result.checkpoint.nextStage !== activeStage &&
    ['S0R', 'P3B', 'P4'].includes(result.checkpoint.nextStage)
  ) {
    const contractContents =
      pendingTreeish === undefined
        ? existsSync(join(repositoryRoot, DYNAMIC_SCOPES))
          ? readFileSync(join(repositoryRoot, DYNAMIC_SCOPES), 'utf8')
          : undefined
        : textAtTree(pendingTreeish, DYNAMIC_SCOPES, { optional: true })
    if (contractContents === undefined) {
      fail(`transition to ${result.checkpoint.nextStage} requires ${DYNAMIC_SCOPES}`)
    }
    const targets = parseDynamicScopeContract(contractContents).get(result.checkpoint.nextStage)
    if (targets === undefined || targets.size === 0) {
      fail(`transition to ${result.checkpoint.nextStage} requires at least one recorded target`)
    }
  }
}

function commit(message, expectedParent, expectedPaths) {
  const expectedTree = gitText(['write-tree'])
  const result = runGit([
    '-c',
    'core.hooksPath=/dev/null',
    '-c',
    'commit.gpgsign=false',
    'commit',
    '-m',
    message,
  ])
  const output = Buffer.concat([result.stdout, result.stderr]).toString('utf8').trim()
  if (output) process.stderr.write(`${output}\n`)

  const commitHash = gitText(['rev-parse', 'HEAD'])
  const ancestry = gitText(['rev-list', '--parents', '-n', '1', commitHash]).split(' ')
  if (ancestry.length !== 2 || ancestry[1] !== expectedParent) {
    fail(`commit ${commitHash} does not have exactly the expected parent ${expectedParent}`)
  }
  const committedTree = gitText(['show', '-s', '--format=%T', commitHash])
  if (committedTree !== expectedTree) {
    fail(`commit tree ${committedTree} does not match staged tree ${expectedTree}`)
  }
  assertSamePaths(committedPaths(commitHash), expectedPaths, 'committed path set')
  return commitHash
}

function ensureRepositoryState(startHead, startBranch) {
  const liveHead = gitText(['rev-parse', 'HEAD'])
  const liveBranch = gitText(['branch', '--show-current'])
  if (liveHead !== startHead) {
    fail(`HEAD changed during controller run: ${startHead} -> ${liveHead}`)
  }
  if (liveBranch !== startBranch) {
    fail(`branch changed during controller run: ${startBranch} -> ${liveBranch}`)
  }
  if (stagedPaths().length !== 0) fail('controller left staged changes')
  if (splitNul(runGit(['diff', '--name-only', '--diff-filter=U', '-z']).stdout).length !== 0) {
    fail('controller left unresolved merge conflicts')
  }
  assertNoGitOperation()
  assertSafeIgnoredState()
}

function replaceStageStatus(contents, stage, current, replacement) {
  const expression = new RegExp(`^(\\|\\s*${stage}\\s*\\|\\s*)${current}(\\s*\\|)`, 'mu')
  const matches = contents.match(new RegExp(expression.source, 'gmu')) ?? []
  if (matches.length !== 1) {
    fail(`ledger must contain exactly one ${stage} row with status ${current}`)
  }
  return contents.replace(expression, `$1${replacement}$2`)
}

function finalizedLedgerContents(pendingContents, result, sliceCommit) {
  const { nextSlice, nextStage, postProgrammeStatus, postStageStatus, stage } = result.checkpoint
  const finalizedStage = nextStage === '' ? stage : nextStage
  const finalizedSlice = nextStage === '' ? 'PROGRAMME_COMPLETE' : nextSlice
  let contents = pendingContents
  contents = replaceExactlyOnce(
    contents,
    'Programme status: CHECKPOINT_PENDING',
    `Programme status: ${postProgrammeStatus}`,
  )
  contents = replaceExactlyOnce(
    contents,
    'Last verified commit: CHECKPOINT_PENDING',
    `Last verified commit: ${sliceCommit}`,
  )
  contents = replaceExactlyOnce(
    contents,
    `Current canonical stage: ${stage}`,
    `Current canonical stage: ${finalizedStage}`,
  )
  contents = replaceExactlyOnce(
    contents,
    'Current slice: CHECKPOINT_PENDING',
    `Current slice: ${finalizedSlice}`,
  )
  contents = replaceStageStatus(contents, stage, 'CHECKPOINT_PENDING', postStageStatus)
  if (nextStage !== '' && nextStage !== stage) {
    contents = replaceStageStatus(contents, nextStage, 'NOT_STARTED', 'IN_PROGRESS')
  }
  return contents
}

function finalizeLedger(result, sliceCommit) {
  const ledgerPath = join(repositoryRoot, LEDGER)
  const temporaryPath = join(repositoryRoot, LEDGER_TEMP)
  if (!existsSync(ledgerPath)) fail(`missing ledger: ${LEDGER}`)
  if (existsSync(temporaryPath)) fail(`stale ledger temporary file: ${temporaryPath}`)

  const contents = finalizedLedgerContents(readFileSync(ledgerPath, 'utf8'), result, sliceCommit)

  writeFileSync(temporaryPath, contents, {
    encoding: 'utf8',
    mode: statSync(ledgerPath).mode,
  })
  renameSync(temporaryPath, ledgerPath)

  assertSamePaths(dirtyPaths(), [LEDGER], 'ledger-finalization dirty set')
  stageExactPaths([LEDGER])
  assertSamePaths(stagedPaths(), [LEDGER], 'ledger-finalization staged set')
  runGit(['diff', '--cached', '--check'])
  if (dirtyPaths().length !== 0) fail('ledger changed after finalization staging')

  const ledgerCommit = commit(
    `chore(v2): record ${sliceCommit.slice(0, 12)} checkpoint`,
    sliceCommit,
    [LEDGER],
  )
  if (dirtyPaths().length !== 0 || stagedPaths().length !== 0) {
    fail('ledger checkpoint left the worktree dirty')
  }
  return ledgerCommit
}

function validateCheckpointRequest(
  result,
  startHead,
  startBranch,
  policy,
  { pendingTreeish, currentTreeish } = {},
) {
  const {
    contentDigest: requestedDigest,
    expectedHead,
    message,
    paths,
    scope,
    scopeTarget,
    stage,
  } = result.checkpoint
  if (!/^[0-9a-f]{40}$/u.test(expectedHead) || expectedHead !== startHead) {
    fail('checkpoint.expectedHead must equal the unchanged 40-character start HEAD')
  }
  if (
    message.length === 0 ||
    message.length > 120 ||
    /[\0\r\n]/u.test(message) ||
    message.trim() !== message ||
    message.startsWith('-')
  ) {
    fail('checkpoint.message must be a safe non-empty single line of at most 120 characters')
  }
  if (paths.length === 0 || paths.length > 5000) {
    fail('checkpoint.paths must contain 1-5000 paths')
  }
  if (!/^sha256:[0-9a-f]{64}$/u.test(requestedDigest)) {
    fail('checkpoint.contentDigest must be a lowercase SHA-256 digest')
  }
  if (!/^[A-Z0-9_]+$/u.test(stage) || !/^[A-Z0-9_]+$/u.test(scope)) {
    fail('checkpoint stage and scope must be canonical identifiers')
  }
  if (
    result.checkpoint.nextStage.length > 16 ||
    (result.checkpoint.nextStage !== '' && !/^[A-Z0-9]+$/u.test(result.checkpoint.nextStage))
  ) {
    fail('checkpoint.nextStage is invalid')
  }
  if (result.checkpoint.postProgrammeStatus === 'PROGRAMME_COMPLETE') {
    if (result.checkpoint.nextSlice !== '') {
      fail('a programme-complete checkpoint must have an empty nextSlice')
    }
  } else if (
    result.checkpoint.nextSlice.length === 0 ||
    result.checkpoint.nextSlice.length > 160 ||
    /[\0\r\n]/u.test(result.checkpoint.nextSlice)
  ) {
    fail('checkpoint.nextSlice must be a non-empty single line of at most 160 characters')
  }

  for (const path of paths) validatePath(path)
  const requestedPaths = sortedUnique(paths)
  if (requestedPaths.length !== paths.length) fail('checkpoint.paths must be sorted and unique')
  if (!requestedPaths.includes(LEDGER)) fail(`checkpoint.paths must include ${LEDGER}`)
  for (const path of requestedPaths) {
    if (currentTreeish === undefined) {
      const absolutePath = join(repositoryRoot, path)
      if (existsSync(absolutePath) && lstatSync(absolutePath).isSymbolicLink()) {
        fail(`checkpoint paths may not introduce or modify symlinks: ${path}`)
      }
    } else if (treeEntry(currentTreeish, path)?.mode === '120000') {
      fail(`checkpoint tree may not introduce or modify symlinks: ${path}`)
    }
  }

  validatePendingLedger(result, startHead, startBranch, policy, pendingTreeish)
  validateStageScope(policy, scope, scopeTarget, stage, requestedPaths, startHead)
  validatePackageManifestChanges(stage, startHead, requestedPaths, currentTreeish)
  return requestedPaths
}

function checkpointAction(result) {
  if (result.checkpoint.postProgrammeStatus === 'BLOCKED') return 'BLOCKED'
  if (result.checkpoint.postProgrammeStatus === 'PROGRAMME_COMPLETE') return 'COMPLETE'
  return 'CONTINUE'
}

function writeCheckpointAction(result) {
  process.stdout.write(`${checkpointAction(result)}\n`)
}

function applyCheckpoint(result, startHead, startBranch, policy) {
  const requestedPaths = validateCheckpointRequest(result, startHead, startBranch, policy)
  const requestedDigest = result.checkpoint.contentDigest

  const actualDirtyPaths = dirtyPaths()
  assertSamePaths(actualDirtyPaths, requestedPaths, 'checkpoint dirty set')
  const actualDigest = contentDigest(requestedPaths)
  if (actualDigest !== requestedDigest) {
    fail(
      `checkpoint content changed after validation: expected ${requestedDigest}, found ${actualDigest}`,
    )
  }

  runGit(['diff', '--check'])
  stageExactPaths(requestedPaths)
  assertSamePaths(stagedPaths(), requestedPaths, 'checkpoint staged set')
  runGit(['diff', '--cached', '--check'])
  if (contentDigest(requestedPaths) !== requestedDigest) {
    fail('checkpoint content changed while staging')
  }
  if (dirtyPaths().length !== 0) fail('checkpoint changed after staging')
  const stagedTree = gitText(['write-tree'])
  if (contentDigestAtTree(requestedPaths, stagedTree) !== requestedDigest) {
    fail('checkpoint staged tree does not match the requested content digest')
  }

  const sliceCommit = commit(result.checkpoint.message, startHead, requestedPaths)
  if (dirtyPaths().length !== 0 || stagedPaths().length !== 0) {
    fail('slice checkpoint left the worktree dirty')
  }

  const ledgerCommit = finalizeLedger(result, sliceCommit)
  assertSafeIgnoredState()
  process.stderr.write(
    `Applied Stopcock 2.0 slice checkpoint ${sliceCommit} and ledger checkpoint ${ledgerCommit}.\n`,
  )
  writeCheckpointAction(result)
}

function commitParents(commitHash) {
  const values = gitText(['rev-list', '--parents', '-n', '1', commitHash]).split(' ')
  if (values[0] !== commitHash) fail(`could not inspect commit ancestry for ${commitHash}`)
  return values.slice(1)
}

function assertExactSliceCommit(result, startHead, startBranch, policy, sliceCommit) {
  const parents = commitParents(sliceCommit)
  if (!arraysEqual(parents, [startHead])) {
    fail(`recovery slice ${sliceCommit} does not have exactly the expected parent ${startHead}`)
  }
  if (gitText(['show', '-s', '--format=%B', sliceCommit]) !== result.checkpoint.message) {
    fail(`recovery slice ${sliceCommit} has an unexpected commit message`)
  }
  const requestedPaths = validateCheckpointRequest(result, startHead, startBranch, policy, {
    pendingTreeish: sliceCommit,
    currentTreeish: sliceCommit,
  })
  assertSamePaths(committedPaths(sliceCommit), requestedPaths, 'recovery slice path set')
  if (contentDigestAtTree(requestedPaths, sliceCommit) !== result.checkpoint.contentDigest) {
    fail(`recovery slice ${sliceCommit} does not match the requested content digest`)
  }
  runGit(['diff-tree', '--check', startHead, sliceCommit])
  return requestedPaths
}

function indexText(path) {
  const result = runGit(['show', `:${path}`], { allowFailure: true })
  if (result.status !== 0) fail(`index is missing required recovery path ${path}`)
  return result.stdout.toString('utf8')
}

function normalizeLedgerRecoveryState(result, sliceCommit) {
  const pending = textAtTree(sliceCommit, LEDGER)
  const finalized = finalizedLedgerContents(pending, result, sliceCommit)
  const ledgerPath = join(repositoryRoot, LEDGER)
  if (!existsSync(ledgerPath) || !lstatSync(ledgerPath).isFile()) {
    fail('recovery requires the ledger to remain a regular file')
  }
  const worktree = readFileSync(ledgerPath, 'utf8')
  const indexed = indexText(LEDGER)
  const validState =
    (indexed === pending && worktree === pending) ||
    (indexed === pending && worktree === finalized) ||
    (indexed === finalized && worktree === finalized)
  if (!validState) {
    fail('ledger recovery state is not a recognized pending/finalized checkpoint boundary')
  }

  const dirty = dirtyPaths()
  const staged = stagedPaths()
  const unexpectedDirty = dirty.filter((path) => path !== LEDGER && path !== LEDGER_TEMP)
  if (unexpectedDirty.length !== 0) {
    fail(`slice recovery has unexpected dirty paths: ${JSON.stringify(unexpectedDirty)}`)
  }
  const unexpectedStaged = staged.filter((path) => path !== LEDGER)
  if (unexpectedStaged.length !== 0) {
    fail(`slice recovery has unexpected staged paths: ${JSON.stringify(unexpectedStaged)}`)
  }

  const temporaryPath = join(repositoryRoot, LEDGER_TEMP)
  if (existsSync(temporaryPath)) {
    const temporaryStats = lstatSync(temporaryPath)
    if (!temporaryStats.isFile()) fail('ledger recovery temporary path is not a regular file')
    const temporary = readFileSync(temporaryPath)
    const expected = Buffer.from(finalized, 'utf8')
    if (
      temporary.length > expected.length ||
      !temporary.equals(expected.subarray(0, temporary.length))
    ) {
      fail('ledger recovery temporary file is not a valid finalized-ledger prefix')
    }
    unlinkSync(temporaryPath)
  }

  runGit(['restore', `--source=${sliceCommit}`, '--staged', '--worktree', '--', LEDGER])
  if (dirtyPaths().length !== 0 || stagedPaths().length !== 0) {
    fail('failed to normalize the pending ledger before recovery finalization')
  }
}

function assertExactLedgerCommit(result, sliceCommit, ledgerCommit) {
  const parents = commitParents(ledgerCommit)
  if (!arraysEqual(parents, [sliceCommit])) {
    fail(`recovery ledger ${ledgerCommit} does not have exactly the expected slice parent`)
  }
  assertSamePaths(committedPaths(ledgerCommit), [LEDGER], 'recovery ledger path set')
  const expectedMessage = `chore(v2): record ${sliceCommit.slice(0, 12)} checkpoint`
  if (gitText(['show', '-s', '--format=%B', ledgerCommit]) !== expectedMessage) {
    fail(`recovery ledger ${ledgerCommit} has an unexpected commit message`)
  }
  const pending = textAtTree(sliceCommit, LEDGER)
  const expected = finalizedLedgerContents(pending, result, sliceCommit)
  if (textAtTree(ledgerCommit, LEDGER) !== expected) {
    fail(`recovery ledger ${ledgerCommit} does not contain the deterministic final ledger`)
  }
  runGit(['diff-tree', '--check', sliceCommit, ledgerCommit])
}

function assertRecoveryEnvelope(startBranch) {
  const liveBranch = gitText(['branch', '--show-current'])
  if (liveBranch !== startBranch) {
    fail(`branch changed since controller result: ${startBranch} -> ${liveBranch}`)
  }
  if (splitNul(runGit(['diff', '--name-only', '--diff-filter=U', '-z']).stdout).length !== 0) {
    fail('recovery found unresolved merge conflicts')
  }
  assertNoGitOperation()
  assertSafeIgnoredState()
}

function recoverCheckpoint(result, startBranch) {
  assertRecoveryEnvelope(startBranch)
  if (result.outcome !== 'checkpoint_ready') {
    if (stagedPaths().length !== 0 || existsSync(join(repositoryRoot, LEDGER_TEMP))) {
      fail(`${result.outcome} recovery requires a clean index and no ledger temporary file`)
    }
    stopWithoutCheckpoint(result, loadPolicy())
    return
  }

  const startHead = result.checkpoint.expectedHead
  if (!/^[0-9a-f]{40}$/u.test(startHead)) {
    fail('checkpoint.expectedHead must be a 40-character commit SHA')
  }
  const policy = loadPolicy(startHead)
  const liveHead = gitText(['rev-parse', 'HEAD'])
  if (liveHead === startHead) {
    const requestedPaths = sortedUnique(result.checkpoint.paths)
    const dirty = dirtyPaths()
    const staged = stagedPaths()
    if (staged.length === 0 && arraysEqual(dirty, requestedPaths)) {
      applyCheckpoint(result, startHead, startBranch, policy)
      return
    }
    if (dirty.length === 0 && arraysEqual(staged, requestedPaths)) {
      const stagedTree = gitText(['write-tree'])
      validateCheckpointRequest(result, startHead, startBranch, policy, {
        pendingTreeish: stagedTree,
        currentTreeish: stagedTree,
      })
      runGit(['diff', '--cached', '--check'])
      if (contentDigestAtTree(requestedPaths, stagedTree) !== result.checkpoint.contentDigest) {
        fail('staged recovery tree does not match the requested content digest')
      }
      const sliceCommit = commit(result.checkpoint.message, startHead, requestedPaths)
      const ledgerCommit = finalizeLedger(result, sliceCommit)
      process.stderr.write(
        `Recovered staged Stopcock 2.0 slice ${sliceCommit} and ledger checkpoint ${ledgerCommit}.\n`,
      )
      writeCheckpointAction(result)
      return
    }
    fail('preserved result does not match an exact dirty or exact staged pre-commit state')
  }

  const liveParents = commitParents(liveHead)
  if (arraysEqual(liveParents, [startHead])) {
    assertExactSliceCommit(result, startHead, startBranch, policy, liveHead)
    normalizeLedgerRecoveryState(result, liveHead)
    const ledgerCommit = finalizeLedger(result, liveHead)
    process.stderr.write(
      `Recovered Stopcock 2.0 ledger checkpoint ${ledgerCommit} after slice ${liveHead}.\n`,
    )
    writeCheckpointAction(result)
    return
  }

  if (liveParents.length === 1 && arraysEqual(commitParents(liveParents[0]), [startHead])) {
    if (
      dirtyPaths().length !== 0 ||
      stagedPaths().length !== 0 ||
      existsSync(join(repositoryRoot, LEDGER_TEMP))
    ) {
      fail('completed-checkpoint recovery requires a clean worktree and index')
    }
    const sliceCommit = liveParents[0]
    assertExactSliceCommit(result, startHead, startBranch, policy, sliceCommit)
    assertExactLedgerCommit(result, sliceCommit, liveHead)
    process.stderr.write(
      `Verified already-complete Stopcock 2.0 checkpoint ${sliceCommit} / ${liveHead}.\n`,
    )
    writeCheckpointAction(result)
    return
  }

  fail(`preserved result does not describe HEAD ${liveHead} or its exact checkpoint ancestry`)
}

function validateCompletedProgramme(contents, policy) {
  if (ledgerValue(contents, 'Programme status') !== 'PROGRAMME_COMPLETE') {
    fail('programme_complete requires a durably completed ledger')
  }
  const stages = parseStageTable(contents, Object.keys(policy.dependencies))
  const incomplete = [...stages.entries()]
    .filter(([, status]) => !TERMINAL_STAGE_STATUSES.has(status))
    .map(([stage]) => stage)
  if (incomplete.length !== 0) {
    fail(`programme_complete ledger has unfinished stages: ${incomplete.join(', ')}`)
  }
}

function stopWithoutCheckpoint(result, policy) {
  if (result.outcome === 'blocked') {
    fail(
      'blocked outcomes must use a durable checkpoint_ready ledger checkpoint with BLOCKED statuses',
    )
  }
  const checkpoint = result.checkpoint
  for (const [key, value] of Object.entries(checkpoint)) {
    if (key === 'paths') {
      if (value.length !== 0) fail(`${result.outcome} must return an empty checkpoint path list`)
    } else if (value !== '') {
      fail(`${result.outcome} must return empty checkpoint fields`)
    }
  }

  process.stderr.write(`Controller ${result.outcome}: ${result.summary}\n`)
  const dirty = dirtyPaths()
  if (dirty.length !== 0) {
    fail(`${result.outcome} must return from a clean worktree`)
  }
  if (result.outcome === 'programme_complete') {
    validateCompletedProgramme(readFileSync(join(repositoryRoot, LEDGER), 'utf8'), policy)
  }
  process.stdout.write(result.outcome === 'programme_complete' ? 'COMPLETE\n' : 'STOP\n')
}

function describeDirty() {
  if (stagedPaths().length !== 0) fail('cannot describe a checkpoint with staged changes')
  assertNoGitOperation()
  assertSafeIgnoredState()
  const paths = dirtyPaths()
  if (paths.length === 0) fail('cannot describe an empty checkpoint')
  process.stdout.write(`${JSON.stringify({ paths, contentDigest: contentDigest(paths) })}\n`)
}

function checkWorkspace() {
  if (stagedPaths().length !== 0) fail('workspace contains staged changes')
  assertNoGitOperation()
  assertSafeIgnoredState()
  loadPolicy()
  process.stdout.write('OK\n')
}

function checkScope(argumentsValue) {
  for (const path of argumentsValue.paths) validatePath(path)
  validateStageScope(
    loadPolicy(gitText(['rev-parse', argumentsValue.startHead])),
    argumentsValue.scope,
    argumentsValue.scopeTarget,
    argumentsValue.stage,
    sortedUnique(argumentsValue.paths),
    gitText(['rev-parse', argumentsValue.startHead]),
  )
  process.stdout.write('OK\n')
}

function readControllerResult(resultPath) {
  const gitDirectory = realpathSync(gitText(['rev-parse', '--absolute-git-dir']))
  const absoluteResultPath = resolve(resultPath)
  if (
    basename(absoluteResultPath) !== RESULT_BASENAME ||
    realpathSync(dirname(absoluteResultPath)) !== gitDirectory
  ) {
    fail(`controller result must be ${join(gitDirectory, RESULT_BASENAME)}`)
  }
  if (!existsSync(absoluteResultPath) || !lstatSync(absoluteResultPath).isFile()) {
    fail(`missing regular controller result: ${absoluteResultPath}`)
  }
  if (statSync(absoluteResultPath).size > MAX_RESULT_BYTES) {
    fail('controller result exceeds the maximum allowed size')
  }
  try {
    return validateResult(JSON.parse(readFileSync(absoluteResultPath, 'utf8')))
  } catch (error) {
    if (error instanceof CheckpointError) throw error
    fail(`invalid controller result JSON: ${absoluteResultPath}`)
  }
}

try {
  const argumentsValue = parseArguments(process.argv.slice(2))
  repositoryRoot = realpathSync(gitText(['rev-parse', '--show-toplevel']))
  if (realpathSync(process.cwd()) !== repositoryRoot) {
    fail(`run checkpoint helper from repository root: ${repositoryRoot}`)
  }

  if (argumentsValue.mode === 'describe') {
    describeDirty()
  } else if (argumentsValue.mode === 'check') {
    checkWorkspace()
  } else if (argumentsValue.mode === 'scope') {
    checkScope(argumentsValue)
  } else {
    const { resultPath, startHead, startBranch } = argumentsValue
    if (startBranch.length === 0 || /[\0\r\n]/u.test(startBranch)) {
      fail('--start-branch must be a non-empty single line')
    }
    const result = readControllerResult(resultPath)
    if (argumentsValue.mode === 'recover') {
      recoverCheckpoint(result, startBranch)
    } else {
      if (!/^[0-9a-f]{40}$/u.test(startHead)) {
        fail('--start-head must be a 40-character commit SHA')
      }
      ensureRepositoryState(startHead, startBranch)
      const policy = loadPolicy(startHead)
      if (result.outcome === 'checkpoint_ready') {
        applyCheckpoint(result, startHead, startBranch, policy)
      } else {
        stopWithoutCheckpoint(result, policy)
      }
    }
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  process.stderr.write(`Stopcock 2.0 checkpoint failed closed: ${message}\n`)
  process.exitCode = 1
}
