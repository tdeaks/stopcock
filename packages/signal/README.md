# @stopcock/signal

Deterministic typed-array DSP kernels for FFTs, windows, filters, convolution,
resampling, and spectral analysis.

```bash
bun add @stopcock/signal
```

```ts
import { analysis, biquad } from '@stopcock/signal'

const input = new Float32Array(128)
const output = new Float32Array(input.length)
const coefficients = biquad.design({
  kind: 'lowpass',
  freq: 1800,
  q: 0.9,
  sampleRate: 44_100,
})

biquad.process(input, coefficients, biquad.state(), output)
const level = analysis.rms(output)
```

Hot-path APIs accept caller-owned output buffers, state, and reusable plans so
allocation is explicit.

[Documentation](https://stopcock.dev/libraries/signal)
