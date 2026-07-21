import { defineConfig } from 'vite-plus'
import { libraryBuildTask, libraryPack } from '../../tooling/pack.config'

export default defineConfig({
  pack: libraryPack({
    index: 'src/index.ts',
    async: 'src/async.ts',
    react: 'src/react.ts',
    svelte: 'src/svelte.ts',
    vue: 'src/vue.ts',
    persist: 'src/persist.ts',
  }),
  run: {
    tasks: {
      build: libraryBuildTask(),
    },
  },
})
