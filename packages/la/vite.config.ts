import { defineConfig } from 'vite-plus'
import { libraryBuildTask, libraryPack } from '../../tooling/pack.config'

export default defineConfig({
  pack: libraryPack({
    index: 'src/index.ts',
    accel: 'src/accel.ts',
    fast: 'src/fast.ts',
    primitives: 'src/primitives.ts',
  }),
  run: {
    tasks: {
      build: libraryBuildTask(),
    },
  },
})
