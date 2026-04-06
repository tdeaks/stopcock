# @stopcock/img

Image processing. Filters, convolutions, transforms, edge detection.

```bash
bun add @stopcock/img
```

```ts
import { create, grayscale, gaussianBlur, edgeDetect, resize } from '@stopcock/img'
import { pipe } from '@stopcock/fp'

const processed = pipe(
  create(width, height, pixels),
  grayscale,
  gaussianBlur(2),
  edgeDetect,
  resize(320, 240),
)
```

## What's in the box

- **Color** — `rgbToHsl`, `hslToRgb`, `rgbToGray`
- **Adjustments** — `brightness`, `contrast`, `invert`, `threshold`, `sepia`, `saturate`
- **Convolutions** — `blur`, `gaussianBlur`, `sharpen`, `edgeDetect`, `convolve`
- **Transforms** — `resize`, `crop`, `flipH`, `flipV`, `rotate90`
- **Analysis** — `histogram`, `equalize`, `houghLines`, `connectedComponents`

Works with raw RGBA buffers. Use `fromRGBA` to bridge canvas `ImageData`.

[Docs](https://stopcock.dev/libraries/img)
