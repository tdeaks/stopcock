# @stopcock/color

Pure TypeScript colour algebra with CSS Color 4 conversions, perceptual OKLCh
operations, WCAG contrast, gamut mapping, CIEDE2000 distance, and
colour-vision-deficiency simulation.

```bash
bun add @stopcock/color
```

```ts
import { pipe } from '@stopcock/fp'
import { adjustHue, desaturate, fromHex, lighten, toHex } from '@stopcock/color'

const accent = pipe(
  fromHex('#2563eb'),
  lighten(0.1),
  desaturate(0.2),
  adjustHue(15),
  toHex,
)
```

Every transformation is curried, data-last, so it composes with `pipe`.
Typed-array batch operations are available for image-sized workloads.

[Documentation](https://stopcock.dev/libraries/color)
