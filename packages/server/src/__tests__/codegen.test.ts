import { describe, it, expect } from 'vitest'
import { renderMatcherModule } from '../codegen/emit'

const sample = [
  { method: 'GET',  path: '/health',         paramNames: [],         pattern: /^\/health\/?$/ },
  { method: 'GET',  path: '/users/:id',      paramNames: ['id'],     pattern: /^\/users\/([^/]+)\/?$/ },
  { method: 'POST', path: '/users',          paramNames: [],         pattern: /^\/users\/?$/ },
  { method: 'GET',  path: '/posts/:id/raw',  paramNames: ['id'],     pattern: /^\/posts\/([^/]+)\/raw\/?$/ },
]

describe('codegen', () => {
  it('renders deterministic output for the same input', () => {
    const a = renderMatcherModule(sample)
    const b = renderMatcherModule(sample)
    expect(a).toBe(b)
  })

  it('output mentions every registered route in the table comment', () => {
    const source = renderMatcherModule(sample)
    for (const r of sample) expect(source).toContain(`${r.method.padEnd(6)} ${r.path}`)
  })

  it('output is self-contained TypeScript (no external imports)', () => {
    const source = renderMatcherModule(sample)
    expect(source).not.toMatch(/^import /m)
    expect(source).toContain('export const match')
  })
})
