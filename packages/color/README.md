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

[Documentation](https://stopcock.dev/libraries/color)
