import { defineConfig } from 'vite-plus'
import { libraryBuildTask, libraryPack } from '../../tooling/pack.config'

export default defineConfig({
  pack: libraryPack({ index: 'src/index.ts' }),
  run: {
    tasks: {
      build: libraryBuildTask('@stopcock/color', '@stopcock/la'),
    },
  },
})
