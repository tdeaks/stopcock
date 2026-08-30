import { defineConfig } from 'vite-plus'
import { libraryBuildTask, libraryPack } from '../../tooling/pack.config'

export default defineConfig({
  pack: libraryPack({
    index: 'src/index.ts',
    core: 'src/core.ts',
    combinators: 'src/combinators.ts',
    primitives: 'src/primitives.ts',
  }),
  run: {
    tasks: {
      build: libraryBuildTask('@stopcock/fp'),
    },
  },
})
