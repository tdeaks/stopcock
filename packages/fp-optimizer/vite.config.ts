import { defineConfig } from 'vite-plus'
import { libraryBuildTask, libraryPack } from '../../tooling/pack.config'

export default defineConfig({
  pack: {
    ...libraryPack({ index: 'src/abi-entry.ts' }),
    outputOptions: { entryFileNames: 'index.js' },
  },
  run: {
    tasks: {
      build: libraryBuildTask(),
    },
  },
})
