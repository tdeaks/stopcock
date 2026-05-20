/**
 * Single-key query lookup that skips `new URLSearchParams()` construction.
 *
 * Conservative ASCII fast path. Walks the query string left-to-right, only
 * checking for `name` at boundary positions (right after `?` or `&`). When
 * the value contains `%` (percent-encoding) or `+` (encoded space), falls
 * back to the caller-supplied URLSearchParams.get so decoding stays correct.
 *
 * Matches URLSearchParams.get behaviour: bare keys (no `=`) return `""`,
 * absent keys return `null`, repeated keys return the first occurrence.
 *
 * Trade-off: name itself must be the literal URL-encoded form. Callers
 * passing names containing `%` or `+` get undefined behaviour.
 */
export const queryGetFast = (
  qs: string,
  name: string,
  fallback: () => string | null,
): string | null => {
  if (qs.length === 0) return null
  let pos = 0
  while (pos < qs.length) {
    if (qs.startsWith(name, pos)) {
      const after = pos + name.length
      if (after >= qs.length) return ''
      const c = qs.charCodeAt(after)
      if (c === 38) return ''       // '&' : bare key
      if (c === 61) {                // '=' : key=value
        const valStart = after + 1
        const ampIdx = qs.indexOf('&', valStart)
        const valEnd = ampIdx === -1 ? qs.length : ampIdx
        const value = qs.slice(valStart, valEnd)
        for (let i = 0; i < value.length; i++) {
          const ch = value.charCodeAt(i)
          if (ch === 37 || ch === 43) return fallback()  // '%' or '+'
        }
        return value
      }
    }
    const ampIdx = qs.indexOf('&', pos)
    if (ampIdx === -1) return null
    pos = ampIdx + 1
  }
  return null
}
