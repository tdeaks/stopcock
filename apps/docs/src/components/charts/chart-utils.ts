export const COLORS = {
  accent: '#00e5a0',
  accentGlow: 'rgba(0, 229, 160, 0.15)',
  accentDim: 'rgba(0, 229, 160, 0.6)',
  grid: '#1e1e2e',
  axisText: '#a0a0b0',
  labelText: '#c8c8d8',
  barDefault: '#3a3a50',
  bg: 'transparent',

  libraries: new Map<string, string>([
    ['stopcock', '#00e5a0'],
    ['native Set', '#6e6e82'],
    ['native reduce', '#6e6e82'],
    ['native filter', '#6e6e82'],
    ['manual for', '#6e6e82'],
    ['lodash', '#5c6bc0'],
    ['ramda', '#7e57c2'],
    ['remeda', '#42a5f5'],
    ['rambda', '#66bb6a'],
    ['ts-belt', '#ef5350'],
  ]),
} as const

export function libraryColor(name: string): string {
  return COLORS.libraries.get(name) ?? COLORS.barDefault
}

export function formatOps(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K'
  return n.toFixed(0)
}

export function formatOpsLong(n: number): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: 0 })
}
