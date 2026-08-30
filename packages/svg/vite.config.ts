import { defineConfig } from 'vite-plus'
import { libraryBuildTask, libraryPack } from '../../tooling/pack.config'

export default defineConfig({
  pack: libraryPack({
    index: 'src/index.ts',
    'la/index': 'src/la/index.ts',
  }),
  run: {
    tasks: {
      build: libraryBuildTask('@stopcock/color', '@stopcock/la'),
    },
  },
})
