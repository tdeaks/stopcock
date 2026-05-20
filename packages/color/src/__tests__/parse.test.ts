import { describe, it, expect } from 'vitest'
import { fromCSS } from '../parse'

describe('fromCSS', () => {
  it('parses #hex', () => {
    const c = fromCSS('#ff0000')
    expect(c.space).toBe('srgb')
    expect(c.channels[0]).toBe(1)
  })

  it('parses legacy rgb()', () => {
    const c = fromCSS('rgb(255, 128, 0)')
    expect(c.channels[0]).toBe(1)
    expect(c.channels[1]).toBeCloseTo(128 / 255)
  })

  it('parses modern rgb() with %', () => {
    const c = fromCSS('rgb(100% 50% 0%)')
    expect(c.channels[0]).toBe(1)
    expect(c.channels[1]).toBe(0.5)
  })

  it('parses hsl()', () => {
    const c = fromCSS('hsl(120 100% 50%)')
    expect(c.space).toBe('hsl')
    expect(c.channels[0]).toBe(120)
    expect(c.channels[1]).toBe(1)
    expect(c.channels[2]).toBe(0.5)
  })

  it('parses oklch()', () => {
    const c = fromCSS('oklch(0.7 0.15 250)')
    expect(c.space).toBe('oklch')
    expect(c.channels[0]).toBe(0.7)
    expect(c.channels[1]).toBe(0.15)
    expect(c.channels[2]).toBe(250)
  })

  it('parses oklch() with alpha', () => {
    const c = fromCSS('oklch(0.7 0.15 250 / 0.5)')
    expect(c.alpha).toBe(0.5)
  })

  it('parses color(srgb ...)', () => {
    const c = fromCSS('color(srgb 0.5 0.25 0.75)')
    expect(c.channels[0]).toBe(0.5)
  })

  it('parses color(display-p3 ...)', () => {
    const c = fromCSS('color(display-p3 1 0 0)')
    expect(c.space).toBe('p3')
  })

  it('treats none as 0', () => {
    expect(fromCSS('oklch(0.5 none 0)').channels[1]).toBe(0)
  })
})
