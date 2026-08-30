# @stopcock/color

Pure TypeScript colour algebra with CSS Color 4 conversions, perceptual OKLCh
operations, WCAG contrast, gamut mapping, CIEDE2000 distance, and
colour-vision-deficiency simulation.

```bash
bun add @stopcock/color
```

```ts
import { pipe } from '@stopcock/fp'
import {
  adjustHue,
  convertBuffer,
  desaturate,
  fromHex,
  lighten,
  simulateBuffer,
  toGamutBuffer,
  toHex,
} from '@stopcock/color'

const brand = fromHex('#2563eb')
const lighter = lighten(brand, 0.1) // direct, data-first

const accent = pipe(brand, lighten(0.1), desaturate(0.2), adjustHue(15), toHex)

const pixels = new Float64Array([1, 0, 0, 0, 1, 0])
const oklab = convertBuffer(pixels, 'srgb', 'oklab')
const oklabInPipe = pipe(pixels, convertBuffer('srgb', 'oklab'))

const simulated = simulateBuffer(pixels, 'srgb', 'deuteranopia', 0.75)
const simulatedInPipe = pipe(pixels, simulateBuffer('srgb', 'deuteranopia', 0.75))

const mapped = toGamutBuffer(pixels, 'p3', 'srgb')
const mappedInPipe = pipe(pixels, toGamutBuffer('p3', 'srgb'))
```

Color-value operations support direct data-first and curried data-last calls
under the same name, so the same API also composes with `pipe`. Hue interpolation
and typed-array batch operations follow the same convention; batch calls also
accept an optional caller-provided output buffer.

## Dual operation reference

```ts
convert(color, targetSpace)                         / convert(targetSpace)(color)
lighten(color, amount)                             / lighten(amount)(color)
darken(color, amount)                              / darken(amount)(color)
saturate(color, amount)                            / saturate(amount)(color)
desaturate(color, amount)                          / desaturate(amount)(color)
adjustHue(color, degrees)                          / adjustHue(degrees)(color)
adjustAlpha(color, alpha)                          / adjustAlpha(alpha)(color)

mix(a, b, t?)                                      / mix(b, t?)(a)
mixIn(a, b, space, t?)                             / mixIn(b, space, t?)(a)
hueInterpolate(h1, h2, t)                          / hueInterpolate(h2, t)(h1)

contrastRatio(a, b)                                / contrastRatio(b)(a)
meetsAA(a, b)                                      / meetsAA(b)(a)
meetsAAA(a, b)                                     / meetsAAA(b)(a)
meetsAALarge(a, b)                                 / meetsAALarge(b)(a)
deltaE(a, b)                                       / deltaE(b)(a)
deltaEOK(a, b)                                     / deltaEOK(b)(a)
inGamut(color, targetSpace)                        / inGamut(targetSpace)(color)
toGamut(color, targetSpace)                        / toGamut(targetSpace)(color)
analogous(color, count?, angle?)                   / analogous(count?, angle?)(color)
simulate(color, type, severity?)                   / simulate(type, severity?)(color)
minDistinguishableDistance(palette, type, severity?) / minDistinguishableDistance(type, severity?)(palette)

convertBuffer(source, sourceSpace, targetSpace, out?) / convertBuffer(sourceSpace, targetSpace, out?)(source)
simulateBuffer(source, sourceSpace, type, severity?, out?) / simulateBuffer(sourceSpace, type, severity?, out?)(source)
toGamutBuffer(source, sourceSpace, targetSpace, out?) / toGamutBuffer(sourceSpace, targetSpace, out?)(source)
```

[Documentation](https://stopcock.dev/libraries/color)
