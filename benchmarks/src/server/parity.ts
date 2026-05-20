// @ts-nocheck
/**
 * Response parity check. Runs every scenario request against every framework
 * and asserts they return the same thing as the native baseline.
 *
 * The bench is meaningless if a framework returns a different (smaller) body —
 * we'd be measuring throughput of inequivalent work. Run this before
 * trusting any number printed by frameworks.ts.
 */

export type ParityRequest = {
  method: string
  path: string
  headers?: Record<string, string>
  body?: string
}

export type ParityRunner = {
  id: string
  name: string
  url: string
}

export type ParityResult = {
  baseline: string
  diffs: ParityDiff[]
}

export type ParityDiff = {
  framework: string
  request: string
  reason: string
  expected?: unknown
  actual?: unknown
}

const send = async (runner: ParityRunner, req: ParityRequest) => {
  const res = await fetch(`${runner.url}${req.path}`, {
    method: req.method,
    headers: req.headers,
    body: req.body,
  })
  const text = await res.text()
  let body: unknown = text
  try { body = text ? JSON.parse(text) : null } catch { /* keep raw text */ }
  return { status: res.status, body }
}

// Status differs => diff. 2xx => deep equal modulo missing/undefined keys.
// Non-2xx => status only (each framework ships its own error body shape).
export const compareResponses = (
  expected: { status: number; body: unknown },
  actual: { status: number; body: unknown },
): string | null => {
  if (expected.status !== actual.status) {
    return `status ${expected.status} vs ${actual.status}`
  }
  // For non-2xx, each framework ships its own error body shape by default.
  // Comparing those is noise for a throughput bench, so we stop at status.
  if (expected.status >= 400) return null
  // Strict structural equality after normalization: walk both sides, treat
  // `undefined` and missing keys as equal (neither survives JSON serialization),
  // and ignore object key order.
  const diff = walkDiff(expected.body, actual.body, '')
  return diff
}

const walkDiff = (e: unknown, a: unknown, path: string): string | null => {
  if (e === a) return null
  if (e == null || a == null) {
    if (e == null && a == null) return null
    return `${path || '<root>'}: ${JSON.stringify(e)} vs ${JSON.stringify(a)}`
  }
  if (Array.isArray(e) || Array.isArray(a)) {
    if (!Array.isArray(e) || !Array.isArray(a)) return `${path}: array vs non-array`
    if (e.length !== a.length) return `${path}.length: ${e.length} vs ${a.length}`
    for (let i = 0; i < e.length; i++) {
      const d = walkDiff(e[i], a[i], `${path}[${i}]`)
      if (d) return d
    }
    return null
  }
  if (typeof e === 'object' || typeof a === 'object') {
    if (typeof e !== 'object' || typeof a !== 'object') return `${path}: object vs ${typeof a}`
    const keys = new Set([...Object.keys(e as object), ...Object.keys(a as object)])
    for (const k of keys) {
      const ev = (e as Record<string, unknown>)[k]
      const av = (a as Record<string, unknown>)[k]
      if (ev === undefined && av === undefined) continue
      const d = walkDiff(ev, av, path ? `${path}.${k}` : k)
      if (d) return d
    }
    return null
  }
  return `${path || '<root>'}: ${JSON.stringify(e)} vs ${JSON.stringify(a)}`
}

const requestLabel = (req: ParityRequest) =>
  `${req.method} ${req.path}${req.body ? ' (body)' : ''}`

export const checkParity = async (
  baseline: ParityRunner,
  others: ParityRunner[],
  requests: ParityRequest[],
): Promise<ParityResult> => {
  const diffs: ParityDiff[] = []
  for (const req of requests) {
    const expected = await send(baseline, req)
    for (const other of others) {
      const actual = await send(other, req)
      const reason = compareResponses(expected, actual)
      if (reason) {
        diffs.push({
          framework: other.name,
          request: requestLabel(req),
          reason,
          expected,
          actual,
        })
      }
    }
  }
  return { baseline: baseline.name, diffs }
}
