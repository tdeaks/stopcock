# @stopcock/svg

Typed procedural SVG nodes, paths, transforms, paint, filters, definition
hoisting, and rendering.

```bash
bun add @stopcock/svg
```

```ts
import { rgb } from '@stopcock/color'
import { circle, fill, render, translate, viewBox } from '@stopcock/svg'

const badge = viewBox(0, 0, 100, 100)(
  fill(rgb(1, 0, 0))(translate(50, 50)(circle(32))),
)

const markup = render(badge)
```

Operators return immutable node transformations and compose naturally with
`pipe`. XML escaping, generated identifiers, and shared `<defs>` are owned by
the renderer.

[Documentation](https://stopcock.dev/libraries/svg)
