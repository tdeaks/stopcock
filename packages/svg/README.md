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

## Dual operation reference

```ts
toClip(node)                         / toClip()(node)
toMask(node)                         / toMask()(node)
fill(node, paint)                    / fill(paint)(node)
stroke(node, paint, width, options?) / stroke(paint, width, options?)(node)
opacity(node, alpha)                 / opacity(alpha)(node)
translate(node, dx, dy)              / translate(dx, dy)(node)
rotate(node, degrees, cx?, cy?)      / rotate(degrees, cx?, cy?)(node)
scale(node, sx, sy?)                 / scale(sx, sy?)(node)
skewX(node, degrees)                 / skewX(degrees)(node)
skewY(node, degrees)                 / skewY(degrees)(node)
clip(node, clipPath)                 / clip(clipPath)(node)
mask(node, maskValue)                / mask(maskValue)(node)
filter(node, filterValue)            / filter(filterValue)(node)
viewBox(node, x, y, width, height)   / viewBox(x, y, width, height)(node)

path.lineTo(pathValue, x, y)                         / path.lineTo(x, y)(pathValue)
path.curveTo(pathValue, x1, y1, x2, y2, x, y)       / path.curveTo(x1, y1, x2, y2, x, y)(pathValue)
path.quadTo(pathValue, x1, y1, x, y)                 / path.quadTo(x1, y1, x, y)(pathValue)
path.arcTo(pathValue, rx, ry, large, sweep, x, y)    / path.arcTo(rx, ry, large, sweep, x, y)(pathValue)
path.close(pathValue)                                / path.close()(pathValue)
path.toNode(pathValue)                               / path.toNode()(pathValue)

mul(a, b)                            / mul(b)(a)
render(node, options?)               / render(options?)(node)

lerpTransform(a, b, t)               / lerpTransform(b, t)(a)
toQuad(node, corners)                / toQuad(corners)(node)
hitTest(root, point)                 / hitTest(point)(root)
fitBezier(points, options?)          / fitBezier(options?)(points)
alignToPrincipalAxis(node, points)   / alignToPrincipalAxis(points)(node)
symmetry(node, count, step)          / symmetry(count, step)(node)
```

[Documentation](https://stopcock.dev/libraries/svg)
