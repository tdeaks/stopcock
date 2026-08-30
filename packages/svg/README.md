# @stopcock/svg

Typed procedural SVG nodes, paths, transforms, paint, filters, definition
hoisting, and rendering.

```bash
bun add @stopcock/svg
```

```ts
import { pipe } from '@stopcock/fp'
import { rgb } from '@stopcock/color'
import { circle, fill, render, translate, viewBox } from '@stopcock/svg'

const base = circle(32)
const moved = translate(base, 50, 50)
const painted = fill(moved, rgb(1, 0, 0))
const directBadge = viewBox(painted, 0, 0, 100, 100)

const pipedBadge = pipe(base, translate(50, 50), fill(rgb(1, 0, 0)), viewBox(0, 0, 100, 100))

const markup = render(directBadge)
const sameMarkup = pipe(pipedBadge, render())
```

Data-taking operators support direct data-first and curried data-last calls
under the same name. XML escaping, generated identifiers, and shared `<defs>`
are owned by the renderer.

[Documentation](https://stopcock.dev/libraries/svg)
