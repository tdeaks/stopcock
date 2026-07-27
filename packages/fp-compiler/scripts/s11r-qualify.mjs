#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const fail = (message) => {
  throw new Error(`S11R qualification: ${message}`)
}
const assert = (condition, message) => {
  if (!condition) fail(message)
}
const json = (value) => `${JSON.stringify(value, null, 2)}\n`
const sha256 = (bytes) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`

const parse = (argv) => {
  const values = new Map()
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index]
    const value = argv[index + 1]
    assert(
      (key === '--manifest' || key === '--out') && typeof value === 'string',
      'usage: --manifest <cohort-manifest.json> --out <combined-qualification.json>',
    )
    assert(!values.has(key), `duplicate ${key}`)
    values.set(key, value)
  }
  assert(values.size === 2, 'both --manifest and --out are required')
  return {
    manifest: resolve(values.get('--manifest')),
    out: resolve(values.get('--out')),
  }
}

const run = (script, manifest, out) => {
  const env = { ...process.env }
  delete env.NODE_PATH
  delete env.NODE_OPTIONS
  const result = spawnSync(process.execPath, [script, '--manifest', manifest, '--out', out], {
    encoding: 'utf8',
    env,
  })
  assert(
    result.status === 0,
    `${basename(script)} failed (${result.status ?? 'signal'}): ${(
      result.stderr ||
      result.stdout ||
      result.error?.message ||
      'no output'
    ).trim()}`,
  )
}

const main = () => {
  const { manifest, out } = parse(process.argv.slice(2))
  const scripts = dirname(fileURLToPath(import.meta.url))
  const extension = extname(out)
  const stem = extension.length === 0 ? out : out.slice(0, -extension.length)
  const hostsPath = `${stem}.hosts.json`
  const layoutsPath = `${stem}.layouts.json`
  mkdirSync(dirname(out), { recursive: true })

  run(join(scripts, 's11r-extracted-matrix.mjs'), manifest, hostsPath)
  run(join(scripts, 's11r-extracted-layouts.mjs'), manifest, layoutsPath)

  const hostsBytes = readFileSync(hostsPath)
  const layoutsBytes = readFileSync(layoutsPath)
  const hosts = JSON.parse(hostsBytes)
  const layouts = JSON.parse(layoutsBytes)
  assert(
    hosts.cohort?.contentHash === layouts.cohort?.contentHash,
    'host and layout evidence name different cohort content hashes',
  )
  assert(hosts.cohort?.target === layouts.cohort?.target, 'host and layout targets differ')
  const layoutTarballs = new Map((layouts.tarballs ?? []).map((entry) => [entry.name, entry]))
  for (const name of ['@stopcock/fp', '@stopcock/fp-compiler', '@stopcock/fp-optimizer']) {
    const hostArtifact = hosts.artifacts?.[name]
    const layoutArtifact = layoutTarballs.get(name)
    assert(
      hostArtifact !== undefined && layoutArtifact !== undefined,
      `${name} artifact binding is absent`,
    )
    assert(
      hostArtifact.sha256 === layoutArtifact.sha256 && hostArtifact.bytes === layoutArtifact.bytes,
      `${name} host/layout artifact identity differs`,
    )
  }
  const ordinary = layouts.layouts?.find((entry) => entry.layout === 'ordinary')?.primary
  assert(ordinary !== undefined, 'ordinary extracted layout identity is absent')
  assert(
    JSON.stringify(hosts.bindings?.fpAbi) === JSON.stringify(ordinary.fpIdentity),
    'host and layout FP ABI identities differ',
  )
  assert(
    JSON.stringify(hosts.bindings?.optimizerBank) ===
      JSON.stringify(ordinary.optimizerBankIdentity),
    'host and layout optimizer-bank identities differ',
  )
  const componentIdentities = {
    hosts: { file: basename(hostsPath), sha256: sha256(hostsBytes), bytes: hostsBytes.length },
    layouts: {
      file: basename(layoutsPath),
      sha256: sha256(layoutsBytes),
      bytes: layoutsBytes.length,
    },
  }
  const boundaryCore = {
    cohort: layouts.cohort,
    components: componentIdentities,
    artifacts: Object.fromEntries(
      [...layoutTarballs.entries()]
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([name, entry]) => [name, { sha256: entry.sha256, bytes: entry.bytes }]),
    ),
    fpAbi: ordinary.fpIdentity,
    optimizerBank: ordinary.optimizerBankIdentity,
  }
  writeFileSync(
    out,
    json({
      schemaVersion: 1,
      kind: 'stopcock-s11r-combined-qualification',
      boundaryHash: sha256(Buffer.from(JSON.stringify(boundaryCore))),
      ...boundaryCore,
    }),
  )
}

try {
  main()
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
}
