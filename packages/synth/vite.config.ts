import { defineConfig } from 'vite-plus'
import { libraryBuildTask, libraryPack } from '../../tooling/pack.config'

export default defineConfig({
  pack: libraryPack({
    index: 'src/index.ts',
    types: 'src/types.ts',
  }),
  run: {
    tasks: {
      build: {
        ...libraryBuildTask(),
        dependsOn: ['build:wasm'],
      },
    },
  },
})
