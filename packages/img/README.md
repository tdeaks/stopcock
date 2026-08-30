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

## Dual operation reference

```ts
brightness(image, amount)                         / brightness(amount)(image)
contrast(image, amount)                           / contrast(amount)(image)
threshold(image, value)                           / threshold(value)(image)
saturate(image, factor)                           / saturate(factor)(image)
colorize(image, target)                           / colorize(target)(image)
duotone(image, dark, light)                       / duotone(dark, light)(image)
simulateCVD(image, type, severity?)               / simulateCVD(type, severity?)(image)
tonemapToGamut(image, sourceSpace, targetSpace)   / tonemapToGamut(sourceSpace, targetSpace)(image)

convolve(image, kernel, divisor?)                 / convolve(kernel, divisor?)(image)
blur(image, radius)                               / blur(radius)(image)
gaussianBlur(image, radius, sigma?)               / gaussianBlur(radius, sigma?)(image)
sharpen(image, amount?)                           / sharpen(amount)(image)

resize(image, width, height)                      / resize(width, height)(image)
crop(image, x, y, width, height)                  / crop(x, y, width, height)(image)
houghLines(image, options?)                       / houghLines(options)(image)
```

## What's in the box

- **Color**: `rgbToHsl`, `hslToRgb`, `rgbToGray`
- **Adjustments**: `brightness`, `contrast`, `invert`, `threshold`, `sepia`, `saturate`
- **Convolutions**: `blur`, `gaussianBlur`, `sharpen`, `edgeDetect`, `convolve`
- **Transforms**: `resize`, `crop`, `flipH`, `flipV`, `rotate90`
- **Analysis**: `histogram`, `equalize`, `houghLines`, `connectedComponents`

Works with raw RGBA buffers. Use `fromRGBA` to bridge canvas `ImageData`.

[Docs](https://stopcock.dev/libraries/img)
