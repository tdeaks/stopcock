import { defineConfig } from 'vite-plus'
import { libraryBuildTask, libraryPack } from '../../tooling/pack.config'

export default defineConfig({
  pack: libraryPack({
    index: 'src/index.ts',
    rules: 'src/rules.ts',
  }),
  run: {
    tasks: {
      build: libraryBuildTask(),
    },
  },
})
