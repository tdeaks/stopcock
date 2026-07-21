import { defineConfig } from 'vite-plus'
import { libraryBuildTask, libraryPack } from '../../tooling/pack.config'

export default defineConfig({
  pack: libraryPack({
    index: 'src/index.ts',
    analysis: 'src/analysis.ts',
    biquad: 'src/biquad.ts',
    convolve: 'src/convolve.ts',
    fft: 'src/fft.ts',
    fir: 'src/fir.ts',
    onepole: 'src/onepole.ts',
    resample: 'src/resample.ts',
    types: 'src/types.ts',
    window: 'src/window.ts',
  }),
  run: {
    tasks: {
      build: libraryBuildTask(),
    },
  },
})
