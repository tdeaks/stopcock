import { defineConfig } from 'vite-plus'
import { libraryBuildTask, libraryPack } from '../../tooling/pack.config'

export default defineConfig({
  pack: {
    ...libraryPack({
      index: 'src/index.ts',
      node: 'src/node.ts',
      cli: 'src/cli.ts',
    }),
    banner: ({ fileName }) => (fileName === 'cli.js' ? '#!/usr/bin/env node' : undefined),
  },
  run: {
    tasks: {
      build: libraryBuildTask(),
    },
  },
})
