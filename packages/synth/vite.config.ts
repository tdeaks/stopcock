import { defineConfig } from 'vite-plus'
import { libraryBuildTask, libraryPack } from '../../tooling/pack.config'

const synthBuild = libraryBuildTask('@stopcock/fp', '@stopcock/signal')

export default defineConfig({
  pack: libraryPack({
    index: 'src/index.ts',
    types: 'src/types.ts',
  }),
  run: {
    tasks: {
      build: {
        ...synthBuild,
        dependsOn: [...synthBuild.dependsOn, 'build:wasm'],
      },
    },
  },
})
