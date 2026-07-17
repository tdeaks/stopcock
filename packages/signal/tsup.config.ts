import { defineConfig } from 'tsup'

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/analysis.ts',
    'src/biquad.ts',
    'src/convolve.ts',
    'src/fft.ts',
    'src/fir.ts',
    'src/onepole.ts',
    'src/resample.ts',
    'src/types.ts',
    'src/window.ts',
  ],
  format: ['esm'],
  dts: true,
  clean: true,
  treeshake: true,
  minify: true,
})
