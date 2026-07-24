export interface EqLike<A> {
  readonly equals: (left: A, right: A) => boolean
}

export interface HashLike<A> {
  readonly hash: (value: A) => number
}

export interface OrdLike<A> {
  readonly compare: (left: A, right: A) => number
}

export interface SemigroupLike<A> {
  readonly combine: (left: A, right: A) => A
}

export interface MonoidLike<A> extends SemigroupLike<A> {
  readonly empty: A
}

export interface GroupLike<A> extends MonoidLike<A> {
  readonly inverse: (value: A) => A
}

export interface LensLike<S, A> {
  readonly get: (source: S) => A
  readonly replace: (source: S, focus: A) => S
}

export interface IsoLike<S, A> {
  readonly to: (source: S) => A
  readonly from: (focus: A) => S
}

export interface LawViolation {
  readonly law: string
  readonly message: string
  readonly witnesses: readonly unknown[]
  readonly cause?: unknown
}

export interface LawReport {
  readonly passed: boolean
  readonly checks: number
  readonly violations: readonly LawViolation[]
}

export interface LawOptions {
  readonly maxChecks?: number
}

interface LawState {
  checks: number
  readonly maxChecks: number
  readonly violations: LawViolation[]
}

const limitOf = (options?: LawOptions): number => {
  const requested = options?.maxChecks ?? 10_000
  if (Number.isNaN(requested)) return 10_000
  if (requested === Number.POSITIVE_INFINITY) return requested
  return Math.max(1, Math.floor(requested))
}

const state = (options?: LawOptions): LawState => ({
  checks: 0,
  maxChecks: limitOf(options),
  violations: [],
})

const result = (current: LawState): LawReport => ({
  passed: current.violations.length === 0,
  checks: current.checks,
  violations: current.violations,
})

const check = (
  current: LawState,
  law: string,
  witnesses: readonly unknown[],
  predicate: () => boolean,
  message: string,
): boolean => {
  if (current.checks >= current.maxChecks) return false
  current.checks++
  try {
    if (!predicate()) current.violations.push({ law, message, witnesses })
  } catch (cause) {
    current.violations.push({
      law,
      message: `${message}; the law expression threw`,
      witnesses,
      cause,
    })
  }
  return current.checks < current.maxChecks
}

export const property = <A>(
  name: string,
  samples: Iterable<A>,
  predicate: (value: A) => boolean,
  options?: LawOptions,
): LawReport => {
  const current = state(options)
  for (const value of samples) {
    if (!check(current, name, [value], () => predicate(value), `Property "${name}" failed`)) break
  }
  return result(current)
}

export const checkEqLaws = <A>(
  eq: EqLike<A>,
  samples: readonly A[],
  options?: LawOptions,
): LawReport => {
  const current = state(options)

  for (const value of samples) {
    if (
      !check(
        current,
        'Eq.reflexivity',
        [value],
        () => eq.equals(value, value),
        'A value must equal itself',
      )
    )
      return result(current)
  }

  for (const left of samples) {
    for (const right of samples) {
      if (
        !check(
          current,
          'Eq.symmetry',
          [left, right],
          () => eq.equals(left, right) === eq.equals(right, left),
          'Equality must be symmetric',
        )
      )
        return result(current)
    }
  }

  for (const first of samples) {
    for (const second of samples) {
      for (const third of samples) {
        if (
          !check(
            current,
            'Eq.transitivity',
            [first, second, third],
            () =>
              !(eq.equals(first, second) && eq.equals(second, third)) || eq.equals(first, third),
            'Equality must be transitive',
          )
        )
          return result(current)
      }
    }
  }

  return result(current)
}

export const checkHashLaws = <A>(
  hash: HashLike<A>,
  eq: EqLike<A>,
  samples: readonly A[],
  options?: LawOptions,
): LawReport => {
  const current = state(options)
  for (const value of samples) {
    if (
      !check(
        current,
        'Hash.stability',
        [value],
        () => Object.is(hash.hash(value), hash.hash(value)),
        'Hashing the same value twice must return the same number',
      )
    )
      return result(current)
  }
  for (const left of samples) {
    for (const right of samples) {
      if (
        !check(
          current,
          'Hash.eq-consistency',
          [left, right],
          () => !eq.equals(left, right) || hash.hash(left) === hash.hash(right),
          'Equal values must have equal hashes',
        )
      )
        return result(current)
    }
  }
  return result(current)
}

const sign = (value: number): -1 | 0 | 1 => (value < 0 ? -1 : value > 0 ? 1 : 0)

export const checkOrdLaws = <A>(
  ord: OrdLike<A>,
  samples: readonly A[],
  options?: LawOptions,
): LawReport => {
  const current = state(options)
  for (const value of samples) {
    if (
      !check(
        current,
        'Ord.reflexivity',
        [value],
        () => ord.compare(value, value) === 0,
        'Comparing a value with itself must return zero',
      )
    )
      return result(current)
  }

  for (const left of samples) {
    for (const right of samples) {
      if (
        !check(
          current,
          'Ord.antisymmetry',
          [left, right],
          () => sign(ord.compare(left, right)) === -sign(ord.compare(right, left)),
          'Reversing operands must reverse ordering',
        )
      )
        return result(current)
    }
  }

  for (const first of samples) {
    for (const second of samples) {
      for (const third of samples) {
        if (
          !check(
            current,
            'Ord.transitivity',
            [first, second, third],
            () =>
              !(ord.compare(first, second) <= 0 && ord.compare(second, third) <= 0) ||
              ord.compare(first, third) <= 0,
            'Ordering must be transitive',
          )
        )
          return result(current)
      }
    }
  }
  return result(current)
}

export const checkSemigroupLaws = <A>(
  semigroup: SemigroupLike<A>,
  eq: EqLike<A>,
  samples: readonly A[],
  options?: LawOptions,
): LawReport => {
  const current = state(options)
  for (const first of samples) {
    for (const second of samples) {
      for (const third of samples) {
        if (
          !check(
            current,
            'Semigroup.associativity',
            [first, second, third],
            () =>
              eq.equals(
                semigroup.combine(semigroup.combine(first, second), third),
                semigroup.combine(first, semigroup.combine(second, third)),
              ),
            'Combination must be associative',
          )
        )
          return result(current)
      }
    }
  }
  return result(current)
}

export const checkMonoidLaws = <A>(
  monoid: MonoidLike<A>,
  eq: EqLike<A>,
  samples: readonly A[],
  options?: LawOptions,
): LawReport => {
  const maxChecks = limitOf(options)
  const semigroup = checkSemigroupLaws(monoid, eq, samples, {
    maxChecks,
  })
  if (semigroup.checks >= maxChecks) return semigroup
  const current = state({
    maxChecks: maxChecks - semigroup.checks,
  })
  for (const value of samples) {
    if (
      !check(
        current,
        'Monoid.left-identity',
        [value],
        () => eq.equals(monoid.combine(monoid.empty, value), value),
        'Combining empty on the left must preserve a value',
      )
    )
      break
    if (
      !check(
        current,
        'Monoid.right-identity',
        [value],
        () => eq.equals(monoid.combine(value, monoid.empty), value),
        'Combining empty on the right must preserve a value',
      )
    )
      break
  }
  return combineReports(semigroup, result(current))
}

export const checkGroupLaws = <A>(
  group: GroupLike<A>,
  eq: EqLike<A>,
  samples: readonly A[],
  options?: LawOptions,
): LawReport => {
  const maxChecks = limitOf(options)
  const monoid = checkMonoidLaws(group, eq, samples, { maxChecks })
  if (monoid.checks >= maxChecks) return monoid
  const current = state({ maxChecks: maxChecks - monoid.checks })

  for (const value of samples) {
    if (
      !check(
        current,
        'Group.left-inverse',
        [value],
        () => eq.equals(group.combine(group.inverse(value), value), group.empty),
        'Combining an inverse on the left must produce empty',
      )
    )
      break
    if (
      !check(
        current,
        'Group.right-inverse',
        [value],
        () => eq.equals(group.combine(value, group.inverse(value)), group.empty),
        'Combining an inverse on the right must produce empty',
      )
    )
      break
  }
  return combineReports(monoid, result(current))
}

export const checkLensLaws = <S, A>(
  lens: LensLike<S, A>,
  sourceEq: EqLike<S>,
  focusEq: EqLike<A>,
  sources: readonly S[],
  focuses: readonly A[],
  options?: LawOptions,
): LawReport => {
  const current = state(options)
  for (const source of sources) {
    if (
      !check(
        current,
        'Lens.get-put',
        [source],
        () => sourceEq.equals(lens.replace(source, lens.get(source)), source),
        'Replacing the current focus must preserve the source',
      )
    )
      return result(current)

    for (const focus of focuses) {
      if (
        !check(
          current,
          'Lens.put-get',
          [source, focus],
          () => focusEq.equals(lens.get(lens.replace(source, focus)), focus),
          'Getting a replaced focus must return that focus',
        )
      )
        return result(current)

      for (const nextFocus of focuses) {
        if (
          !check(
            current,
            'Lens.put-put',
            [source, focus, nextFocus],
            () =>
              sourceEq.equals(
                lens.replace(lens.replace(source, focus), nextFocus),
                lens.replace(source, nextFocus),
              ),
            'Only the final replacement may affect the source',
          )
        )
          return result(current)
      }
    }
  }
  return result(current)
}

export const checkIsoLaws = <S, A>(
  iso: IsoLike<S, A>,
  sourceEq: EqLike<S>,
  focusEq: EqLike<A>,
  sources: readonly S[],
  focuses: readonly A[],
  options?: LawOptions,
): LawReport => {
  const current = state(options)
  for (const source of sources) {
    if (
      !check(
        current,
        'Iso.source-round-trip',
        [source],
        () => sourceEq.equals(iso.from(iso.to(source)), source),
        'Converting to the focus and back must preserve the source',
      )
    )
      return result(current)
  }
  for (const focus of focuses) {
    if (
      !check(
        current,
        'Iso.focus-round-trip',
        [focus],
        () => focusEq.equals(iso.to(iso.from(focus)), focus),
        'Converting from the focus and back must preserve the focus',
      )
    )
      return result(current)
  }
  return result(current)
}

export const combineReports = (...reports: readonly LawReport[]): LawReport => ({
  passed: reports.every((report) => report.passed),
  checks: reports.reduce((total, report) => total + report.checks, 0),
  violations: reports.flatMap((report) => report.violations),
})

export class LawCheckError extends Error {
  readonly report: LawReport

  constructor(report: LawReport) {
    const details = report.violations
      .map((violation) => `${violation.law}: ${violation.message}`)
      .join('\n')
    super(`Functional law check failed (${report.violations.length} violation(s))\n${details}`)
    this.name = 'LawCheckError'
    this.report = report
  }
}

export const assertLaws = (report: LawReport): void => {
  if (!report.passed) throw new LawCheckError(report)
}
