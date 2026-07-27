#!/usr/bin/env node

/**
 * Bind the S11R A/B qualification evidence to its cohort.
 *
 * The cohort content hash covers the packed manifest and tarballs only. It
 * makes no claim about qualification files written afterwards, so this manifest
 * is what gives the six A/B evidence files one immutable identity.
 */

import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const DOMAIN = 'stopcock-s11r-qualification-evidence-v1'

const fail = (message) => {
  throw new Error(`S11R evidence manifest: ${message}`)
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
      (key === '--cohort' || key === '--out') && typeof value === 'string',
      'usage: --cohort <cohort-directory> [--out <qualification-evidence.json>]',
    )
    assert(!values.has(key), `duplicate ${key}`)
    values.set(key, value)
  }
  assert(values.has('--cohort'), '--cohort is required')
  const cohort = resolve(values.get('--cohort'))
  return {
    cohort,
    out: resolve(values.get('--out') ?? join(cohort, 'qualification-evidence.json')),
  }
}

const fileRecord = (root, path) => {
  assert(existsSync(path), `missing evidence file: ${path}`)
  const bytes = readFileSync(path)
  return { path: relative(root, path).split('\\').join('/'), sha256: sha256(bytes), bytes: bytes.length }
}

const main = () => {
  const { cohort, out } = parse(process.argv.slice(2))
  const manifestPath = join(cohort, 'cohort-manifest.json')
  assert(existsSync(manifestPath), `missing cohort manifest: ${manifestPath}`)
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))

  const evidence = ['a', 'b'].flatMap((run) =>
    ['combined.json', 'combined.hosts.json', 'combined.layouts.json'].map((name) =>
      fileRecord(cohort, join(cohort, `qualification-${run}`, name)),
    ),
  )
  assert(evidence.length === 6, 'expected six A/B evidence files')

  // A and B must agree component by component; the manifest records that fact
  // rather than asserting it a second time in prose.
  for (let index = 0; index < 3; index++) {
    const [left, right] = [evidence[index], evidence[index + 3]]
    assert(
      left.sha256 === right.sha256 && left.bytes === right.bytes,
      `qualification A and B differ for ${basename(left.path)}`,
    )
  }

  const scripts = dirname(fileURLToPath(import.meta.url))
  const qualifier = ['s11r-qualify.mjs', 's11r-extracted-matrix.mjs', 's11r-extracted-layouts.mjs']
    .map((name) => fileRecord(scripts, join(scripts, name)))
    .sort((left, right) => left.path.localeCompare(right.path))

  const combined = JSON.parse(readFileSync(join(cohort, 'qualification-a', 'combined.json'), 'utf8'))
  const record = {
    schemaVersion: 1,
    kind: DOMAIN,
    cohort: {
      contentHash: manifest.cohortContentHash,
      target: manifest.target,
      mode: manifest.mode,
      publicCount: manifest.publicCount,
    },
    evidence,
    qualifier,
    tools: {
      node: process.version,
      qualification: combined.hosts?.qualificationTools ?? combined.qualificationTools ?? null,
    },
  }
  const identity = sha256(
    Buffer.concat([Buffer.from(`${DOMAIN}\0`, 'utf8'), Buffer.from(json(record), 'utf8')]),
  )
  const bytes = Buffer.from(json({ ...record, qualificationIdentity: identity }), 'utf8')

  if (existsSync(out)) {
    // Once checkpointed the identity is immutable. Reproducing it byte for byte
    // is fine; changing it is a new qualification and needs a new cohort.
    assert(
      readFileSync(out).equals(bytes),
      `refusing to overwrite an existing qualification evidence identity: ${out}`,
    )
    process.stdout.write(`${identity}\n`)
    return
  }
  writeFileSync(out, bytes)
  process.stdout.write(`${identity}\n`)
}

main()
