import { defineConfig } from 'vite-plus'
import { libraryBuildTask, libraryPack } from '../../tooling/pack.config'

export default defineConfig({
  pack: libraryPack({
    index: 'src/index.ts',
    scalar: 'src/scalar.ts',
    math: 'src/math.ts',
    vec: 'src/vec.ts',
    mat: 'src/mat.ts',
    tape: 'src/tape.ts',
  }),
  run: {
    tasks: {
      build: libraryBuildTask('@stopcock/fp', '@stopcock/la'),
    },
  },
})
