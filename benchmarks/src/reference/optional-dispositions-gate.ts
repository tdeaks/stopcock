/**
 * DISP: every optional candidate is shipped or stopped, exactly once.
 *
 * The point of this gate is that it is not possible to be vague. A slice that
 * raised a candidate and never decided it cannot quietly leave it out; the
 * candidate has to be here, and `deferred` is not an allowed status. A
 * candidate nobody decided is a candidate nobody measured, and that is a
 * release blocker rather than a footnote.
 *
 * `unresolved` exists only so a candidate blocked on something outside its own
 * slice can be named honestly. It fails the gate. It is not a resting state.
 */
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const localDirectory = dirname(fileURLToPath(import.meta.url))

export const DISPOSITION_MANIFEST_PATH = join(
  localDirectory,
  'manifests',
  'fp-v2-optional-dispositions.json',
)

export type DispositionStatus = 'shipped' | 'stopped' | 'unresolved'

export interface DispositionCandidate {
  readonly candidateId: string
  readonly ownerSlice: string
  readonly status: DispositionStatus
  readonly surface: 'public' | 'internal'
  readonly reason?: string
  readonly evidence?: string
  readonly fallback?: string
  readonly absenceAssertion?: string
  readonly changeset?: string
  readonly exception?: string
  readonly blockedOn?: string
}

export interface DispositionManifest {
  readonly protocol: string
  readonly protocolVersion: number
  readonly candidates: readonly DispositionCandidate[]
}

/** Slices required to have produced at least one candidate record. */
export const EXPECTED_OWNER_SLICES: readonly string[] = Object.freeze([
  'S5B',
  'P1A',
  'P1B',
  'P2',
  'P3B',
  'P4',
])

export const loadDispositions = (): DispositionManifest =>
  JSON.parse(readFileSync(DISPOSITION_MANIFEST_PATH, 'utf8')) as DispositionManifest

export const evaluateDispositions = (manifest: DispositionManifest): string[] => {
  const failures: string[] = []
  const seen = new Set<string>()

  for (const candidate of manifest.candidates) {
    if (seen.has(candidate.candidateId)) {
      failures.push(`duplicate candidate: ${candidate.candidateId}`)
    }
    seen.add(candidate.candidateId)

    if (candidate.status === 'unresolved') {
      failures.push(
        `${candidate.candidateId} is unresolved${candidate.blockedOn ? ` (blocked on ${candidate.blockedOn})` : ''}`,
      )
    }

    // A stop is only a stop if it says why. "We didn't get to it" is not a
    // reason, and this is the field where that would have to be written down.
    if (candidate.status === 'stopped' && (candidate.reason ?? '').length < 20) {
      failures.push(`${candidate.candidateId} is stopped without a recorded reason`)
    }
    if (candidate.status === 'shipped' && (candidate.evidence ?? '').length < 20) {
      failures.push(`${candidate.candidateId} is shipped without recorded evidence`)
    }
    // A stopped public candidate has to assert its own absence, or nothing
    // stops a half-removed export from lingering.
    if (
      candidate.status === 'stopped' &&
      candidate.surface === 'public' &&
      (candidate.absenceAssertion ?? '').length === 0
    ) {
      failures.push(`${candidate.candidateId} is a stopped public candidate with no absence assertion`)
    }
  }

  for (const slice of EXPECTED_OWNER_SLICES) {
    if (!manifest.candidates.some((candidate) => candidate.ownerSlice === slice)) {
      failures.push(`no candidate record for owner slice ${slice}`)
    }
  }

  return failures
}

const main = (): void => {
  const manifest = loadDispositions()
  const byStatus = (status: DispositionStatus): number =>
    manifest.candidates.filter((candidate) => candidate.status === status).length
  console.log(
    `candidates ${manifest.candidates.length}\tshipped ${byStatus('shipped')}\tstopped ${byStatus('stopped')}\tunresolved ${byStatus('unresolved')}`,
  )
  const failures = evaluateDispositions(manifest)
  for (const failure of failures) console.error(`FAIL\t${failure}`)
  if (failures.length > 0) process.exitCode = 1
}

const invokedPath = process.argv[1] === undefined ? undefined : resolve(process.argv[1])
if (invokedPath === fileURLToPath(import.meta.url)) main()
