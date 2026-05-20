import {
  rgb, fromHex, fromCSS,
  convert, toSRGB, toOKLCh, toOKLab, toHSL, toLab, toP3,
  toHex, toCSS, toRGBString, toHSLString,
  mixIn,
  contrastRatio, meetsAA, meetsAAA, meetsAALarge,
  inGamut, toGamut,
  analogous, complementary, triadic, tetradic, splitComplementary,
  simulate, paletteContrastMatrix,
} from '@stopcock/color'
import type { Color, ColorSpace, CVDType } from '@stopcock/color'

// ──────────────────────────────────────────────────────────────────
// Tiny rendering helpers
// ──────────────────────────────────────────────────────────────────

const $ = (sel: string) => document.querySelector(sel) as HTMLElement
let _id = 0
const uid = (prefix: string) => `${prefix}-${++_id}`

const h = <T extends HTMLElement = HTMLElement>(tag: string, attrs: Record<string, any> = {}, ...children: (Node | string)[]): T => {
  const el = document.createElement(tag) as T
  for (const k in attrs) {
    if (attrs[k] === undefined || attrs[k] === null) continue
    if (k === 'style' && typeof attrs[k] === 'object') Object.assign(el.style, attrs[k])
    else if (k === 'className') el.className = attrs[k]
    else if (k.startsWith('on') && typeof attrs[k] === 'function') el.addEventListener(k.slice(2), attrs[k])
    else el.setAttribute(k, attrs[k])
  }
  for (const c of children) el.append(c)
  return el
}

// ──────────────────────────────────────────────────────────────────
// State: base color + CVD lens
// ──────────────────────────────────────────────────────────────────

let base: Color = fromHex('#2563eb')
let lens: CVDType | 'none' = 'none'
let lensSeverity = 1

// Apply the current lens to a color, for display
const viewed = (c: Color): Color => {
  if (lens === 'none') return c
  return simulate(c, lens, lensSeverity)
}
const bg = (c: Color): string => toHex(viewed(c))

const subscribers: Array<() => void> = []
const setBase = (c: Color) => { base = c; for (const s of subscribers) s() }
const setLens = (l: CVDType | 'none') => { lens = l; for (const s of subscribers) s() }
const onChange = (fn: () => void) => { subscribers.push(fn); fn() }

// ──────────────────────────────────────────────────────────────────
// Toast for copy confirmation
// ──────────────────────────────────────────────────────────────────

const toast = h('div', { className: 'toast', role: 'status', 'aria-live': 'polite' })
document.body.append(toast)
let toastTimer: number | undefined
const showToast = (msg: string) => {
  toast.textContent = msg
  toast.classList.add('visible')
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => toast.classList.remove('visible'), 1600) as unknown as number
}

const copyHex = async (hex: string) => {
  try {
    await navigator.clipboard.writeText(hex)
    showToast(`Copied ${hex}`)
  } catch {
    showToast(`Copy failed`)
  }
}

// ──────────────────────────────────────────────────────────────────
// Section 1 · Color input  (properly labelled)
// ──────────────────────────────────────────────────────────────────

const sectionInput = () => {
  const pickerId = uid('picker')
  const textId = uid('hex')

  const picker = h<HTMLInputElement>('input', { type: 'color', id: pickerId, value: '#2563eb', 'aria-label': 'Base color picker' })
  const text = h<HTMLInputElement>('input', {
    type: 'text',
    id: textId,
    value: '#2563eb',
    spellcheck: 'false',
    autocomplete: 'off',
    'aria-label': 'Base color as CSS string',
  })

  picker.addEventListener('input', () => {
    text.value = picker.value
    setBase(fromHex(picker.value))
  })
  text.addEventListener('change', () => {
    try {
      const c = text.value.startsWith('#') ? fromHex(text.value) : fromCSS(text.value)
      picker.value = toHex(c).slice(0, 7)
      setBase(c)
    } catch { /* ignore */ }
  })

  onChange(() => {
    const hex = toHex(base)
    if (text.value !== hex) text.value = hex
    if (picker.value !== hex.slice(0, 7)) picker.value = hex.slice(0, 7)
  })

  return h('section', { className: 'card', 'aria-labelledby': pickerId },
    h('div', { className: 'row' },
      h('div', { className: 'col' },
        h('label', { for: pickerId }, 'Pick'),
        picker,
      ),
      h('div', { className: 'col' },
        h('label', { for: textId }, 'CSS color string'),
        text,
      ),
    ),
  )
}

// ──────────────────────────────────────────────────────────────────
// CVD lens toggle
// ──────────────────────────────────────────────────────────────────

const sectionLens = () => {
  const groupId = uid('lens')
  const options: Array<{ label: string; value: CVDType | 'none' }> = [
    { label: 'Normal vision',  value: 'none' },
    { label: 'Protanopia',     value: 'protanopia' },
    { label: 'Deuteranopia',   value: 'deuteranopia' },
    { label: 'Tritanopia',     value: 'tritanopia' },
    { label: 'Achromatopsia',  value: 'achromatopsia' },
  ]

  const group = h('div', { className: 'radio-group', role: 'radiogroup', 'aria-label': 'Color vision deficiency lens' })
  for (const opt of options) {
    const id = uid('lens-opt')
    const input = h<HTMLInputElement>('input', {
      type: 'radio', name: groupId, id, value: opt.value, checked: opt.value === lens ? '' : undefined,
    })
    if (opt.value === lens) input.checked = true
    input.addEventListener('change', () => { if (input.checked) setLens(opt.value) })
    group.append(input, h('label', { className: 'radio-label', for: id }, opt.label))
  }

  return h('section', { className: 'card' },
    h('p', { className: 'palette-label', style: { marginTop: '0', marginBottom: '10px' } },
      'View every swatch below as it appears under the selected condition. This lens is for simulation only — your actual base color does not change.'),
    group,
    h('p', { className: 'lens-note' },
      'Roughly 8% of men and 0.5% of women have some form of color vision deficiency. Designs that rely on color alone fail for them.'),
  )
}

// ──────────────────────────────────────────────────────────────────
// Section · Space breakdown
// ──────────────────────────────────────────────────────────────────

const fmtFn = (name: string, c: Color, frac: number, close = ')') =>
  `${name}(${[...c.channels].map((x) => Number(x.toFixed(frac))).join(' ')}${close}`

const SPACES: { name: string; render: (c: Color) => string }[] = [
  { name: 'hex',         render: (c) => toHex(c) },
  { name: 'srgb',        render: (c) => toRGBString(c) },
  { name: 'hsl',         render: (c) => toHSLString(c) },
  { name: 'oklch',       render: (c) => toCSS(c) },
  { name: 'oklab',       render: (c) => fmtFn('oklab', toOKLab(c), 4) },
  { name: 'lab',         render: (c) => fmtFn('lab',   toLab(c),   2) },
  { name: 'p3',          render: (c) => fmtFn('color(display-p3', toP3(c), 4, ')') },
  { name: 'linear-srgb', render: (c) => fmtFn('color(srgb-linear', convert(c, 'linear-srgb'), 4, ')') },
]

const sectionSpaces = () => {
  const grid = h('div', { className: 'spaces', role: 'list', 'aria-live': 'polite' })
  const refresh = () => {
    grid.replaceChildren()
    for (const s of SPACES) {
      grid.append(
        h('div', { className: 'space-name', role: 'listitem' }, s.name),
        h('div', { className: 'space-value' }, s.render(base)),
        h('div', { className: 'swatch', 'aria-hidden': 'true', style: { background: bg(base) } }),
      )
    }
  }
  onChange(refresh)
  return h('section', { className: 'card' }, grid)
}

// ──────────────────────────────────────────────────────────────────
// Section · Lightness scale (OKLCh vs HSL)
// ──────────────────────────────────────────────────────────────────

const buildPill = (c: Color, ariaLabel?: string) => {
  const hex = toHex(c)
  return h<HTMLButtonElement>('button', {
    className: 'swatch-pill',
    type: 'button',
    style: { background: bg(c) },
    title: `${hex} — click to copy`,
    'aria-label': ariaLabel ?? `Color ${hex}, click to copy`,
    onclick: () => copyHex(hex),
  }, h('span', { className: 'hex', 'aria-hidden': 'true' }, hex))
}

const sectionLightnessScale = () => {
  const oklchRow = h('div', { className: 'swatches', role: 'list', 'aria-label': 'OKLCh lightness scale' })
  const hslRow = h('div', { className: 'swatches', role: 'list', 'aria-label': 'HSL lightness scale' })

  const refresh = () => {
    oklchRow.replaceChildren()
    hslRow.replaceChildren()
    const ok = toOKLCh(base)
    const hsl = toHSL(base)
    for (let i = 1; i <= 9; i++) {
      const t = i / 10
      const okStep: Color = { space: 'oklch', channels: new Float64Array([t, ok.channels[1], ok.channels[2]]), alpha: 1 }
      const hslStep: Color = { space: 'hsl', channels: new Float64Array([hsl.channels[0], hsl.channels[1], t]), alpha: 1 }
      oklchRow.append(buildPill(okStep, `OKLCh lightness ${(t * 100).toFixed(0)}%`))
      hslRow.append(buildPill(hslStep, `HSL lightness ${(t * 100).toFixed(0)}%`))
    }
  }
  onChange(refresh)

  return h('section', { className: 'card' },
    h('div', { className: 'palette' }, h('div', { className: 'palette-label' }, 'OKLCh L stepped'), oklchRow),
    h('div', { className: 'palette' }, h('div', { className: 'palette-label' }, 'HSL L stepped'), hslRow),
  )
}

// ──────────────────────────────────────────────────────────────────
// Section · Harmony palettes
// ──────────────────────────────────────────────────────────────────

const sectionPalettes = () => {
  const rows: Array<{ label: string; fn: (c: Color) => Color[] }> = [
    { label: 'Analogous (5)', fn: (c) => analogous(c, 5) },
    { label: 'Complementary', fn: (c) => [c, complementary(c)] },
    { label: 'Triadic',       fn: (c) => [...triadic(c)] },
    { label: 'Tetradic',      fn: (c) => [...tetradic(c)] },
    { label: 'Split-comp.',   fn: (c) => [...splitComplementary(c)] },
  ]

  const renderRow = (label: string, palette: Color[]) =>
    h('div', { className: 'palette' },
      h('div', { className: 'palette-label' }, label),
      h('div', { className: 'swatches', role: 'list', 'aria-label': label },
        ...palette.map((p) => buildPill(p)),
      ),
    )

  const container = h('section', { className: 'card' })
  onChange(() => {
    container.replaceChildren(...rows.map((r) => renderRow(r.label, r.fn(base))))
  })
  return container
}

// ──────────────────────────────────────────────────────────────────
// Section · Mix gradients
// ──────────────────────────────────────────────────────────────────

let mixTarget: Color = fromHex('#facc15')

const sectionMix = () => {
  const targetId = uid('mix-target')
  const targetPicker = h<HTMLInputElement>('input', { type: 'color', id: targetId, value: '#facc15', 'aria-label': 'Mix target color' })
  const STEPS = 13

  const buildGradient = (space: ColorSpace, ariaLabel: string) => {
    const row = h('div', { className: 'gradient', role: 'img', 'aria-label': ariaLabel })
    for (let i = 0; i < STEPS; i++) {
      const t = i / (STEPS - 1)
      const stop = mixIn(base, mixTarget, space, t)
      row.append(h('div', { 'aria-hidden': 'true', style: { background: bg(stop) } }))
    }
    return row
  }

  const container = h('section', { className: 'card' })
  const refresh = () => {
    container.replaceChildren(
      h('div', { className: 'row', style: { marginBottom: '16px' } },
        h('div', { className: 'col' },
          h('label', {}, 'A'),
          h('div', { className: 'swatch', 'aria-label': `Color A: ${toHex(base)}`, style: { background: bg(base), width: '56px', height: '56px', borderRadius: '10px' } })),
        h('span', { style: { color: 'var(--fg-muted)' }, 'aria-hidden': 'true' }, '→'),
        h('div', { className: 'col' }, h('label', { for: targetId }, 'B'), targetPicker),
      ),
      h('div', { className: 'gradient-row' }, h('label', {}, 'sRGB'),   buildGradient('srgb',  'Gradient mixed in sRGB')),
      h('div', { className: 'gradient-row' }, h('label', {}, 'HSL'),    buildGradient('hsl',   'Gradient mixed in HSL')),
      h('div', { className: 'gradient-row' }, h('label', {}, 'OKLab'),  buildGradient('oklab', 'Gradient mixed in OKLab')),
      h('div', { className: 'gradient-row' }, h('label', {}, 'OKLCh'),  buildGradient('oklch', 'Gradient mixed in OKLCh')),
    )
  }
  targetPicker.addEventListener('input', () => {
    mixTarget = fromHex(targetPicker.value)
    refresh()
  })
  onChange(refresh)
  return container
}

// ──────────────────────────────────────────────────────────────────
// Section · WCAG contrast checker
// ──────────────────────────────────────────────────────────────────

let contrastPartner: Color = fromHex('#ffffff')

const sectionContrast = () => {
  const partnerId = uid('contrast-bg')
  const partnerPicker = h<HTMLInputElement>('input', { type: 'color', id: partnerId, value: '#ffffff', 'aria-label': 'Background color' })
  const preview = h('div', { className: 'contrast-preview' })
  const badges = h('div', { className: 'badges', role: 'list', 'aria-label': 'WCAG contrast results' })

  const refresh = () => {
    // Important: we compute contrast on the *base* colors, not the lens-simulated views,
    // because WCAG conformance is about the actual delivered colors.
    const ratio = contrastRatio(base, contrastPartner)
    preview.style.background = bg(contrastPartner)
    preview.style.color = bg(base)
    preview.replaceChildren(
      h('div', {}, 'The quick brown fox'),
      h('div', { className: 'small' }, `contrast ratio: ${ratio.toFixed(2)} : 1`),
    )

    const checks: Array<[string, boolean]> = [
      ['AA',       meetsAA(base, contrastPartner)],
      ['AAA',      meetsAAA(base, contrastPartner)],
      ['AA Large', meetsAALarge(base, contrastPartner)],
    ]
    badges.replaceChildren(
      ...checks.map(([label, ok]) =>
        h('span', { className: `badge ${ok ? 'pass' : 'fail'}`, role: 'listitem' },
          `${ok ? '✓' : '✗'} ${label}`)),
    )
  }
  partnerPicker.addEventListener('input', () => { contrastPartner = fromHex(partnerPicker.value); refresh() })
  onChange(refresh)

  return h('section', { className: 'card' },
    h('div', { className: 'row', style: { marginBottom: '16px' } },
      h('div', { className: 'col' }, h('label', { for: partnerId }, 'Background'), partnerPicker),
      h('span', { style: { color: 'var(--fg-muted)' }, 'aria-hidden': 'true' }, '·'),
      h('div', { className: 'col' }, h('label', {}, 'Foreground = base color')),
    ),
    preview,
    badges,
  )
}

// ──────────────────────────────────────────────────────────────────
// Section · Palette contrast matrix
// ──────────────────────────────────────────────────────────────────

const sectionContrastMatrix = () => {
  const container = h('section', { className: 'card' })
  const refresh = () => {
    const palette = [base, ...analogous(base, 5).filter((c) => toHex(c) !== toHex(base))]
    const matrix = paletteContrastMatrix(palette)
    const n = palette.length
    const grid = h('div', { className: 'contrast-matrix', style: { gridTemplateColumns: `repeat(${n}, 1fr)` }, role: 'table', 'aria-label': 'Pairwise contrast matrix' })
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const cell = matrix[i][j]
        const fg = palette[i], bgC = palette[j]
        const cellEl = h('div', {
          className: 'cell',
          role: 'cell',
          style: { background: bg(bgC), color: bg(fg) },
          'aria-label': `${toHex(fg)} on ${toHex(bgC)}: ${cell.ratio.toFixed(1)} ratio${cell.aa ? ', passes AA' : cell.aaLarge ? ', passes AA Large only' : ', fails AA'}`,
          title: `${cell.ratio.toFixed(1)}:1 — AA ${cell.aa ? '✓' : '✗'}  AAA ${cell.aaa ? '✓' : '✗'}`,
        }, cell.ratio.toFixed(1))
        grid.append(cellEl)
      }
    }
    container.replaceChildren(
      h('p', { className: 'palette-label', style: { marginTop: 0 } },
        'Pairwise WCAG contrast ratios across the base + its analogous palette. Diagonal is always 1:1 (same color on itself).'),
      grid,
    )
  }
  onChange(refresh)
  return container
}

// ──────────────────────────────────────────────────────────────────
// Section · Gamut mapping
// ──────────────────────────────────────────────────────────────────

const sectionGamut = () => {
  const chromaId = uid('chroma')
  const chromaSlider = h<HTMLInputElement>('input', { type: 'range', id: chromaId, min: '0', max: '0.4', step: '0.005', value: '0.25', 'aria-label': 'OKLCh chroma' })
  const chromaValue = h('span', { className: 'space-name', 'aria-live': 'polite' }, '0.25')
  const cellNaive = h('div', { className: 'gamut-cell' })
  const cellMapped = h('div', { className: 'gamut-cell' })

  const refresh = () => {
    const ok = toOKLCh(base)
    const C = parseFloat(chromaSlider.value)
    chromaValue.textContent = C.toFixed(3)
    const wide: Color = { space: 'oklch', channels: new Float64Array([ok.channels[0], C, ok.channels[2]]), alpha: 1 }
    const naive = toSRGB(wide)
    const mapped = toGamut(wide, 'srgb')
    const within = inGamut(wide, 'srgb')

    cellNaive.style.background = bg(naive)
    cellNaive.replaceChildren(h('span', { className: 'label' }, `naive ${within ? '· in gamut' : '· clipped'}`))
    cellMapped.style.background = bg(mapped)
    cellMapped.replaceChildren(h('span', { className: 'label' }, `toGamut(srgb)`))
  }
  chromaSlider.addEventListener('input', refresh)
  onChange(refresh)

  return h('section', { className: 'card' },
    h('div', { className: 'row', style: { marginBottom: '16px' } },
      h('label', { for: chromaId }, 'OKLCh chroma:'), chromaSlider, chromaValue,
    ),
    h('div', { className: 'gamut-comparison' }, cellNaive, cellMapped),
  )
}

// ──────────────────────────────────────────────────────────────────
// Compose page
// ──────────────────────────────────────────────────────────────────

const app = $('#app')
app.append(
  h('h1', {}, h('span', { className: 'tag' }, '@stopcock/color'), ' · visual playground'),
  h('p', { className: 'subtitle' }, 'Every section reacts live to the base color. Use the CVD lens to preview how your palette appears to viewers with color vision differences.'),

  sectionInput(),

  h('h2', { id: 'h-lens' }, 'Accessibility lens'),
  sectionLens(),

  h('h2', { id: 'h-spaces' }, '1 · The same color in every space'),
  sectionSpaces(),

  h('h2', { id: 'h-scale' }, '2 · Lightness scale — OKLCh vs HSL'),
  sectionLightnessScale(),

  h('h2', { id: 'h-palettes' }, '3 · Harmony palettes'),
  sectionPalettes(),

  h('h2', { id: 'h-mix' }, '4 · Mix gradients across spaces'),
  sectionMix(),

  h('h2', { id: 'h-contrast' }, '5 · WCAG contrast checker'),
  sectionContrast(),

  h('h2', { id: 'h-matrix' }, '6 · Palette contrast matrix'),
  sectionContrastMatrix(),

  h('h2', { id: 'h-gamut' }, '7 · Gamut mapping'),
  sectionGamut(),

  h('footer', {}, '@stopcock/color — built per docs/color-plan.md · pure TypeScript · 0 deps beyond @stopcock/fp'),
)
