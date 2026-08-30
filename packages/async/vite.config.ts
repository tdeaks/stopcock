import { defineConfig } from 'vite-plus'
import { libraryBuildTask, libraryPack } from '../../tooling/pack.config'

export default defineConfig({
  pack: libraryPack({
    index: 'src/index.ts',
    'async-iter': 'src/async-iter.ts',
    task: 'src/task-namespace.ts',
  }),
  run: {
    tasks: {
      build: libraryBuildTask('@stopcock/fp'),
    },
  },
})
