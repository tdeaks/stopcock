import { defineConfig } from 'vite-plus'
import { libraryBuildTask, libraryPack } from '../../tooling/pack.config'

export default defineConfig({
  pack: libraryPack({
    index: 'src/index.ts',
    vite: 'src/vite.ts',
    rollup: 'src/rollup.ts',
    esbuild: 'src/esbuild.ts',
    webpack: 'src/webpack.ts',
  }),
  run: {
    tasks: {
      build: libraryBuildTask(),
    },
  },
})
