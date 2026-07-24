import { defineConfig } from 'vite-plus'
import { libraryBuildTask, libraryPack } from '../../tooling/pack.config'

export default defineConfig({
  pack: libraryPack({
    index: 'src/index.ts',
    laws: 'src/laws.ts',
    data: 'src/data.ts',
    iterable: 'src/iterable.ts',
  }),
  run: {
    tasks: {
      build: libraryBuildTask(),
    },
  },
})
