import { defineConfig } from 'vite-plus'
import { libraryBuildTask, libraryPack } from '../../tooling/pack.config'

export default defineConfig({
  pack: libraryPack({
    index: 'src/index.ts',
    'option-like': 'src/option-like.ts',
    'either-like': 'src/either-like.ts',
    boundary: 'src/boundary.ts',
    'standard-schema': 'src/standard-schema.ts',
    wire: 'src/wire.ts',
    node: 'src/node.ts',
  }),
  run: {
    tasks: {
      build: libraryBuildTask('@stopcock/fp'),
    },
  },
})
