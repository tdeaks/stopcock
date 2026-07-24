import { defineConfig } from 'vite-plus'
import { libraryBuildTask, libraryPack } from '../../tooling/pack.config'
import { buildEntries } from './module-manifest'

export default defineConfig({
  pack: libraryPack(buildEntries()),
  run: {
    tasks: {
      build: libraryBuildTask(),
    },
  },
})
